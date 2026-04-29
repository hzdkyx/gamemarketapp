export interface RuntimeMigration {
  id: string;
  sql: string;
}

export const runtimeMigrations: RuntimeMigration[] = [
  {
    id: "0000_initial_schema",
    sql: `
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        external_id TEXT,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        sale_price_cents INTEGER NOT NULL,
        unit_cost_cents INTEGER NOT NULL,
        gamemarket_fee_rate REAL NOT NULL DEFAULT 0.13,
        stock_current INTEGER NOT NULL DEFAULT 0,
        stock_minimum INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'out_of_stock', 'on_demand')),
        listing_url TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS suppliers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        contact TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS inventory_items (
        id TEXT PRIMARY KEY,
        product_id TEXT REFERENCES products(id),
        supplier_id TEXT REFERENCES suppliers(id),
        supplier_name TEXT,
        cost_cents INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('available', 'reserved', 'sold', 'delivered', 'problem')),
        encrypted_access_data TEXT,
        purchased_at TEXT,
        sold_at TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        external_order_id TEXT,
        product_id TEXT REFERENCES products(id),
        buyer_alias TEXT,
        gross_amount_cents INTEGER NOT NULL,
        status TEXT NOT NULL,
        ordered_at TEXT NOT NULL,
        source TEXT NOT NULL,
        action_required TEXT,
        gamemarket_url TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        external_event_id TEXT,
        order_id TEXT REFERENCES orders(id),
        event_type TEXT NOT NULL,
        raw_event_type TEXT,
        source TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'success', 'warning', 'critical')),
        payload_json TEXT,
        occurred_at TEXT NOT NULL,
        read_at TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        is_secret INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS notification_rules (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        channel TEXT NOT NULL CHECK (channel IN ('desktop', 'sound', 'email', 'telegram', 'whatsapp', 'discord')),
        enabled INTEGER NOT NULL DEFAULT 1,
        play_sound INTEGER NOT NULL DEFAULT 0,
        highlight INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
      CREATE INDEX IF NOT EXISTS idx_inventory_product_status ON inventory_items(product_id, status);
      CREATE INDEX IF NOT EXISTS idx_orders_status_date ON orders(status, ordered_at);
      CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);
      CREATE INDEX IF NOT EXISTS idx_events_read ON events(read_at);
      CREATE INDEX IF NOT EXISTS idx_notification_rules_event ON notification_rules(event_type);
    `
  },
  {
    id: "0001_phase2_products_inventory",
    sql: `
      PRAGMA foreign_keys = OFF;

      CREATE TABLE products_new (
        id TEXT PRIMARY KEY,
        internal_code TEXT NOT NULL UNIQUE,
        external_id TEXT,
        name TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'Geral',
        game TEXT,
        platform TEXT,
        listing_url TEXT,
        sale_price_cents INTEGER NOT NULL DEFAULT 0,
        unit_cost_cents INTEGER NOT NULL DEFAULT 0,
        fee_percent REAL NOT NULL DEFAULT 13,
        net_value_cents INTEGER NOT NULL DEFAULT 0,
        estimated_profit_cents INTEGER NOT NULL DEFAULT 0,
        margin_percent REAL NOT NULL DEFAULT 0,
        stock_current INTEGER NOT NULL DEFAULT 0,
        stock_min INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'out_of_stock', 'on_demand', 'archived')),
        delivery_type TEXT NOT NULL DEFAULT 'manual' CHECK (delivery_type IN ('manual', 'automatic', 'on_demand', 'service')),
        supplier_id TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      INSERT INTO products_new (
        id,
        internal_code,
        external_id,
        name,
        category,
        game,
        platform,
        listing_url,
        sale_price_cents,
        unit_cost_cents,
        fee_percent,
        net_value_cents,
        estimated_profit_cents,
        margin_percent,
        stock_current,
        stock_min,
        status,
        delivery_type,
        supplier_id,
        notes,
        created_at,
        updated_at
      )
      SELECT
        id,
        COALESCE(NULLIF(external_id, ''), id),
        external_id,
        name,
        COALESCE(NULLIF(category, ''), 'Geral'),
        category,
        NULL,
        listing_url,
        sale_price_cents,
        unit_cost_cents,
        ROUND(gamemarket_fee_rate * 100, 4),
        CAST(ROUND(sale_price_cents * (1 - gamemarket_fee_rate)) AS INTEGER),
        CAST(ROUND((sale_price_cents * (1 - gamemarket_fee_rate)) - unit_cost_cents) AS INTEGER),
        CASE
          WHEN sale_price_cents = 0 THEN 0
          ELSE ((sale_price_cents * (1 - gamemarket_fee_rate)) - unit_cost_cents) * 1.0 / sale_price_cents
        END,
        stock_current,
        stock_minimum,
        status,
        CASE WHEN status = 'on_demand' THEN 'on_demand' ELSE 'manual' END,
        NULL,
        notes,
        created_at,
        updated_at
      FROM products;

      CREATE TABLE inventory_items_new (
        id TEXT PRIMARY KEY,
        inventory_code TEXT NOT NULL UNIQUE,
        product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
        supplier_id TEXT,
        purchase_cost_cents INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL CHECK (status IN ('available', 'reserved', 'sold', 'delivered', 'problem', 'refunded', 'archived')),
        account_login_encrypted TEXT,
        account_password_encrypted TEXT,
        account_email_encrypted TEXT,
        account_email_password_encrypted TEXT,
        access_notes_encrypted TEXT,
        public_notes TEXT,
        bought_at TEXT,
        sold_at TEXT,
        delivered_at TEXT,
        order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      INSERT INTO inventory_items_new (
        id,
        inventory_code,
        product_id,
        supplier_id,
        purchase_cost_cents,
        status,
        access_notes_encrypted,
        public_notes,
        bought_at,
        sold_at,
        created_at,
        updated_at
      )
      SELECT
        id,
        id,
        product_id,
        COALESCE(supplier_id, supplier_name),
        cost_cents,
        status,
        encrypted_access_data,
        notes,
        purchased_at,
        sold_at,
        created_at,
        updated_at
      FROM inventory_items;

      DROP TABLE inventory_items;
      DROP TABLE products;
      ALTER TABLE products_new RENAME TO products;
      ALTER TABLE inventory_items_new RENAME TO inventory_items;

      CREATE INDEX IF NOT EXISTS idx_products_internal_code ON products(internal_code);
      CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
      CREATE INDEX IF NOT EXISTS idx_products_game ON products(game);
      CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
      CREATE INDEX IF NOT EXISTS idx_inventory_product_status ON inventory_items(product_id, status);
      CREATE INDEX IF NOT EXISTS idx_inventory_supplier ON inventory_items(supplier_id);
      CREATE INDEX IF NOT EXISTS idx_inventory_status ON inventory_items(status);

      PRAGMA foreign_keys = ON;
    `
  },
  {
    id: "0002_phase3_orders_events",
    sql: `
      PRAGMA foreign_keys = OFF;

      CREATE TABLE orders_new (
        id TEXT PRIMARY KEY,
        order_code TEXT NOT NULL UNIQUE,
        external_order_id TEXT,
        marketplace TEXT NOT NULL DEFAULT 'gamemarket' CHECK (marketplace IN ('gamemarket')),
        product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
        inventory_item_id TEXT REFERENCES inventory_items(id) ON DELETE SET NULL,
        buyer_name TEXT,
        buyer_contact TEXT,
        product_name_snapshot TEXT NOT NULL,
        category_snapshot TEXT NOT NULL,
        sale_price_cents INTEGER NOT NULL DEFAULT 0,
        unit_cost_cents INTEGER NOT NULL DEFAULT 0,
        fee_percent REAL NOT NULL DEFAULT 13,
        net_value_cents INTEGER NOT NULL DEFAULT 0,
        profit_cents INTEGER NOT NULL DEFAULT 0,
        margin_percent REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL CHECK (status IN (
          'draft',
          'pending_payment',
          'payment_confirmed',
          'awaiting_delivery',
          'delivered',
          'completed',
          'cancelled',
          'refunded',
          'mediation',
          'problem',
          'archived'
        )),
        action_required INTEGER NOT NULL DEFAULT 0,
        marketplace_url TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        confirmed_at TEXT,
        delivered_at TEXT,
        completed_at TEXT,
        cancelled_at TEXT,
        refunded_at TEXT
      );

      INSERT INTO orders_new (
        id,
        order_code,
        external_order_id,
        marketplace,
        product_id,
        buyer_name,
        product_name_snapshot,
        category_snapshot,
        sale_price_cents,
        unit_cost_cents,
        fee_percent,
        net_value_cents,
        profit_cents,
        margin_percent,
        status,
        action_required,
        marketplace_url,
        created_at,
        updated_at,
        confirmed_at,
        delivered_at,
        completed_at,
        cancelled_at,
        refunded_at
      )
      SELECT
        orders.id,
        COALESCE(NULLIF(orders.external_order_id, ''), orders.id),
        orders.external_order_id,
        'gamemarket',
        orders.product_id,
        orders.buyer_alias,
        COALESCE(products.name, 'Produto removido'),
        COALESCE(products.category, 'Geral'),
        orders.gross_amount_cents,
        COALESCE(products.unit_cost_cents, 0),
        COALESCE(products.fee_percent, 13),
        CAST(ROUND(orders.gross_amount_cents * (1 - (COALESCE(products.fee_percent, 13) / 100.0))) AS INTEGER),
        CAST(ROUND((orders.gross_amount_cents * (1 - (COALESCE(products.fee_percent, 13) / 100.0))) - COALESCE(products.unit_cost_cents, 0)) AS INTEGER),
        CASE
          WHEN orders.gross_amount_cents = 0 THEN 0
          ELSE ((orders.gross_amount_cents * (1 - (COALESCE(products.fee_percent, 13) / 100.0))) - COALESCE(products.unit_cost_cents, 0)) * 1.0 / orders.gross_amount_cents
        END,
        CASE
          WHEN orders.status IN (
            'draft',
            'pending_payment',
            'payment_confirmed',
            'awaiting_delivery',
            'delivered',
            'completed',
            'cancelled',
            'refunded',
            'mediation',
            'problem',
            'archived'
          ) THEN orders.status
          WHEN LOWER(orders.status) IN ('confirmado', 'confirmed') THEN 'payment_confirmed'
          WHEN LOWER(orders.status) IN ('pendente', 'pending') THEN 'pending_payment'
          WHEN LOWER(orders.status) IN ('entregue') THEN 'delivered'
          WHEN LOWER(orders.status) IN ('concluido', 'concluído') THEN 'completed'
          WHEN LOWER(orders.status) IN ('cancelado') THEN 'cancelled'
          ELSE 'draft'
        END,
        CASE
          WHEN LOWER(COALESCE(orders.action_required, '')) IN ('1', 'true', 'sim', 'yes') THEN 1
          WHEN orders.status IN ('payment_confirmed', 'awaiting_delivery', 'mediation', 'problem') THEN 1
          ELSE 0
        END,
        orders.gamemarket_url,
        orders.created_at,
        orders.updated_at,
        CASE WHEN orders.status = 'payment_confirmed' THEN orders.updated_at ELSE NULL END,
        CASE WHEN orders.status = 'delivered' THEN orders.updated_at ELSE NULL END,
        CASE WHEN orders.status = 'completed' THEN orders.updated_at ELSE NULL END,
        CASE WHEN orders.status = 'cancelled' THEN orders.updated_at ELSE NULL END,
        CASE WHEN orders.status = 'refunded' THEN orders.updated_at ELSE NULL END
      FROM orders
      LEFT JOIN products ON products.id = orders.product_id;

      CREATE TABLE events_new (
        id TEXT PRIMARY KEY,
        event_code TEXT NOT NULL UNIQUE,
        source TEXT NOT NULL CHECK (source IN ('manual', 'system', 'gamemarket_future', 'webhook_future')),
        type TEXT NOT NULL CHECK (type IN (
          'order.created',
          'order.payment_confirmed',
          'order.awaiting_delivery',
          'order.delivered',
          'order.completed',
          'order.cancelled',
          'order.refunded',
          'order.mediation',
          'order.problem',
          'inventory.reserved',
          'inventory.released',
          'inventory.sold',
          'inventory.delivered',
          'inventory.problem',
          'product.low_stock',
          'product.out_of_stock',
          'system.notification_test'
        )),
        severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'success', 'warning', 'critical')),
        title TEXT NOT NULL,
        message TEXT,
        order_id TEXT REFERENCES orders_new(id) ON DELETE SET NULL,
        product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
        inventory_item_id TEXT REFERENCES inventory_items(id) ON DELETE SET NULL,
        read_at TEXT,
        raw_payload TEXT,
        created_at TEXT NOT NULL
      );

      INSERT INTO events_new (
        id,
        event_code,
        source,
        type,
        severity,
        title,
        message,
        order_id,
        product_id,
        read_at,
        raw_payload,
        created_at
      )
      SELECT
        events.id,
        COALESCE(NULLIF(events.external_event_id, ''), events.id),
        CASE
          WHEN events.source IN ('manual', 'system', 'gamemarket_future', 'webhook_future') THEN events.source
          ELSE 'system'
        END,
        CASE
          WHEN events.event_type IN (
            'order.created',
            'order.payment_confirmed',
            'order.awaiting_delivery',
            'order.delivered',
            'order.completed',
            'order.cancelled',
            'order.refunded',
            'order.mediation',
            'order.problem',
            'inventory.reserved',
            'inventory.released',
            'inventory.sold',
            'inventory.delivered',
            'inventory.problem',
            'product.low_stock',
            'product.out_of_stock',
            'system.notification_test'
          ) THEN events.event_type
          ELSE 'order.created'
        END,
        events.severity,
        COALESCE(events.raw_event_type, events.event_type, 'Evento interno'),
        'Evento migrado do schema inicial.',
        events.order_id,
        orders_new.product_id,
        events.read_at,
        events.payload_json,
        COALESCE(events.occurred_at, events.created_at)
      FROM events
      LEFT JOIN orders_new ON orders_new.id = events.order_id;

      DROP TABLE events;
      DROP TABLE orders;
      ALTER TABLE orders_new RENAME TO orders;
      ALTER TABLE events_new RENAME TO events;

      CREATE INDEX IF NOT EXISTS idx_orders_status_date ON orders(status, created_at);
      CREATE INDEX IF NOT EXISTS idx_orders_product ON orders(product_id);
      CREATE INDEX IF NOT EXISTS idx_orders_inventory_item ON orders(inventory_item_id);
      CREATE INDEX IF NOT EXISTS idx_orders_action_required ON orders(action_required);
      CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);
      CREATE INDEX IF NOT EXISTS idx_events_read ON events(read_at);
      CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
      CREATE INDEX IF NOT EXISTS idx_events_order ON events(order_id);
      CREATE INDEX IF NOT EXISTS idx_events_product ON events(product_id);
      CREATE INDEX IF NOT EXISTS idx_events_inventory_item ON events(inventory_item_id);

      PRAGMA foreign_keys = ON;
    `
  },
  {
    id: "0003_phase35_auth_users_audit",
    sql: `
      PRAGMA foreign_keys = OFF;

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin', 'operator', 'viewer')),
        status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
        last_login_at TEXT,
        failed_login_attempts INTEGER NOT NULL DEFAULT 0,
        locked_until TEXT,
        must_change_password INTEGER NOT NULL DEFAULT 0,
        allow_reveal_secrets INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      ALTER TABLE products ADD COLUMN created_by_user_id TEXT REFERENCES users(id);
      ALTER TABLE products ADD COLUMN updated_by_user_id TEXT REFERENCES users(id);
      ALTER TABLE inventory_items ADD COLUMN created_by_user_id TEXT REFERENCES users(id);
      ALTER TABLE inventory_items ADD COLUMN updated_by_user_id TEXT REFERENCES users(id);
      ALTER TABLE orders ADD COLUMN created_by_user_id TEXT REFERENCES users(id);
      ALTER TABLE orders ADD COLUMN updated_by_user_id TEXT REFERENCES users(id);

      CREATE TABLE events_new (
        id TEXT PRIMARY KEY,
        event_code TEXT NOT NULL UNIQUE,
        source TEXT NOT NULL CHECK (source IN ('manual', 'system', 'gamemarket_future', 'webhook_future')),
        type TEXT NOT NULL CHECK (type IN (
          'order.created',
          'order.payment_confirmed',
          'order.awaiting_delivery',
          'order.delivered',
          'order.completed',
          'order.cancelled',
          'order.refunded',
          'order.mediation',
          'order.problem',
          'inventory.reserved',
          'inventory.released',
          'inventory.sold',
          'inventory.delivered',
          'inventory.problem',
          'product.low_stock',
          'product.out_of_stock',
          'security.secret_revealed',
          'system.notification_test'
        )),
        severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'success', 'warning', 'critical')),
        title TEXT NOT NULL,
        message TEXT,
        order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
        product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
        inventory_item_id TEXT REFERENCES inventory_items(id) ON DELETE SET NULL,
        actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        read_at TEXT,
        raw_payload TEXT,
        created_at TEXT NOT NULL
      );

      INSERT INTO events_new (
        id,
        event_code,
        source,
        type,
        severity,
        title,
        message,
        order_id,
        product_id,
        inventory_item_id,
        read_at,
        raw_payload,
        created_at
      )
      SELECT
        id,
        event_code,
        source,
        type,
        severity,
        title,
        message,
        order_id,
        product_id,
        inventory_item_id,
        read_at,
        raw_payload,
        created_at
      FROM events;

      DROP TABLE events;
      ALTER TABLE events_new RENAME TO events;

      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
      CREATE INDEX IF NOT EXISTS idx_users_role_status ON users(role, status);
      CREATE INDEX IF NOT EXISTS idx_products_created_by ON products(created_by_user_id);
      CREATE INDEX IF NOT EXISTS idx_inventory_created_by ON inventory_items(created_by_user_id);
      CREATE INDEX IF NOT EXISTS idx_orders_created_by ON orders(created_by_user_id);
      CREATE INDEX IF NOT EXISTS idx_events_actor ON events(actor_user_id);
      CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);
      CREATE INDEX IF NOT EXISTS idx_events_read ON events(read_at);
      CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
      CREATE INDEX IF NOT EXISTS idx_events_order ON events(order_id);
      CREATE INDEX IF NOT EXISTS idx_events_product ON events(product_id);
      CREATE INDEX IF NOT EXISTS idx_events_inventory_item ON events(inventory_item_id);

      PRAGMA foreign_keys = ON;
    `
  },
  {
    id: "0004_phase4_gamemarket_api",
    sql: `
      PRAGMA foreign_keys = OFF;

      ALTER TABLE products ADD COLUMN external_marketplace TEXT CHECK (external_marketplace IN ('gamemarket'));
      ALTER TABLE products ADD COLUMN external_product_id TEXT;
      ALTER TABLE products ADD COLUMN external_status TEXT;
      ALTER TABLE products ADD COLUMN external_payload_hash TEXT;
      ALTER TABLE products ADD COLUMN last_synced_at TEXT;

      ALTER TABLE orders ADD COLUMN external_marketplace TEXT CHECK (external_marketplace IN ('gamemarket'));
      ALTER TABLE orders ADD COLUMN external_status TEXT;
      ALTER TABLE orders ADD COLUMN external_payload_hash TEXT;
      ALTER TABLE orders ADD COLUMN last_synced_at TEXT;

      CREATE TABLE events_new (
        id TEXT PRIMARY KEY,
        event_code TEXT NOT NULL UNIQUE,
        source TEXT NOT NULL CHECK (source IN ('manual', 'system', 'gamemarket_api', 'gamemarket_future', 'webhook_future')),
        type TEXT NOT NULL CHECK (type IN (
          'order.created',
          'order.payment_confirmed',
          'order.awaiting_delivery',
          'order.delivered',
          'order.completed',
          'order.cancelled',
          'order.refunded',
          'order.mediation',
          'order.problem',
          'inventory.reserved',
          'inventory.released',
          'inventory.sold',
          'inventory.delivered',
          'inventory.problem',
          'product.low_stock',
          'product.out_of_stock',
          'security.secret_revealed',
          'integration.gamemarket.settings_updated',
          'integration.gamemarket.connection_tested',
          'integration.gamemarket.connection_failed',
          'integration.gamemarket.token_revealed',
          'integration.gamemarket.sync_started',
          'integration.gamemarket.sync_completed',
          'integration.gamemarket.sync_failed',
          'integration.gamemarket.order_imported',
          'integration.gamemarket.order_updated',
          'integration.gamemarket.product_imported',
          'integration.gamemarket.product_updated',
          'system.notification_test'
        )),
        severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'success', 'warning', 'critical')),
        title TEXT NOT NULL,
        message TEXT,
        order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
        product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
        inventory_item_id TEXT REFERENCES inventory_items(id) ON DELETE SET NULL,
        actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        read_at TEXT,
        raw_payload TEXT,
        created_at TEXT NOT NULL
      );

      INSERT INTO events_new (
        id,
        event_code,
        source,
        type,
        severity,
        title,
        message,
        order_id,
        product_id,
        inventory_item_id,
        actor_user_id,
        read_at,
        raw_payload,
        created_at
      )
      SELECT
        id,
        event_code,
        source,
        type,
        severity,
        title,
        message,
        order_id,
        product_id,
        inventory_item_id,
        actor_user_id,
        read_at,
        raw_payload,
        created_at
      FROM events;

      DROP TABLE events;
      ALTER TABLE events_new RENAME TO events;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_products_external_marketplace_id
        ON products(external_marketplace, external_product_id)
        WHERE external_marketplace IS NOT NULL AND external_product_id IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_external_marketplace_id
        ON orders(external_marketplace, external_order_id)
        WHERE external_marketplace IS NOT NULL AND external_order_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_products_last_synced ON products(last_synced_at);
      CREATE INDEX IF NOT EXISTS idx_orders_last_synced ON orders(last_synced_at);
      CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);
      CREATE INDEX IF NOT EXISTS idx_events_read ON events(read_at);
      CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
      CREATE INDEX IF NOT EXISTS idx_events_order ON events(order_id);
      CREATE INDEX IF NOT EXISTS idx_events_product ON events(product_id);
      CREATE INDEX IF NOT EXISTS idx_events_inventory_item ON events(inventory_item_id);
      CREATE INDEX IF NOT EXISTS idx_events_actor ON events(actor_user_id);

      PRAGMA foreign_keys = ON;
    `
  },
  {
    id: "0005_phase5_webhook_server",
    sql: `
      PRAGMA foreign_keys = OFF;

      CREATE TABLE events_new (
        id TEXT PRIMARY KEY,
        event_code TEXT NOT NULL UNIQUE,
        source TEXT NOT NULL CHECK (source IN ('manual', 'system', 'gamemarket_api', 'gamemarket_future', 'webhook_future', 'webhook_server')),
        type TEXT NOT NULL CHECK (type IN (
          'order.created',
          'order.payment_confirmed',
          'order.awaiting_delivery',
          'order.delivered',
          'order.completed',
          'order.cancelled',
          'order.refunded',
          'order.mediation',
          'order.problem',
          'inventory.reserved',
          'inventory.released',
          'inventory.sold',
          'inventory.delivered',
          'inventory.problem',
          'product.low_stock',
          'product.out_of_stock',
          'security.secret_revealed',
          'integration.gamemarket.settings_updated',
          'integration.gamemarket.connection_tested',
          'integration.gamemarket.connection_failed',
          'integration.gamemarket.token_revealed',
          'integration.gamemarket.sync_started',
          'integration.gamemarket.sync_completed',
          'integration.gamemarket.sync_failed',
          'integration.gamemarket.order_imported',
          'integration.gamemarket.order_updated',
          'integration.gamemarket.product_imported',
          'integration.gamemarket.product_updated',
          'integration.webhook_server.settings_updated',
          'integration.webhook_server.connection_tested',
          'integration.webhook_server.connection_failed',
          'integration.webhook_server.token_revealed',
          'integration.webhook_server.sync_started',
          'integration.webhook_server.sync_completed',
          'integration.webhook_server.sync_failed',
          'integration.webhook_server.test_event_sent',
          'integration.webhook_server.event_imported',
          'integration.webhook_server.review_received',
          'integration.webhook_server.variant_sold_out',
          'integration.webhook_server.unknown_event',
          'system.notification_test'
        )),
        severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'success', 'warning', 'critical')),
        title TEXT NOT NULL,
        message TEXT,
        order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
        product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
        inventory_item_id TEXT REFERENCES inventory_items(id) ON DELETE SET NULL,
        actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        read_at TEXT,
        raw_payload TEXT,
        created_at TEXT NOT NULL
      );

      INSERT INTO events_new (
        id,
        event_code,
        source,
        type,
        severity,
        title,
        message,
        order_id,
        product_id,
        inventory_item_id,
        actor_user_id,
        read_at,
        raw_payload,
        created_at
      )
      SELECT
        id,
        event_code,
        source,
        type,
        severity,
        title,
        message,
        order_id,
        product_id,
        inventory_item_id,
        actor_user_id,
        read_at,
        raw_payload,
        created_at
      FROM events;

      DROP TABLE events;
      ALTER TABLE events_new RENAME TO events;

      CREATE TABLE IF NOT EXISTS webhook_server_event_imports (
        dedupe_key TEXT PRIMARY KEY,
        remote_event_id TEXT NOT NULL,
        external_event_id TEXT,
        payload_hash TEXT NOT NULL,
        event_type TEXT NOT NULL,
        imported_event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
        imported_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);
      CREATE INDEX IF NOT EXISTS idx_events_read ON events(read_at);
      CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
      CREATE INDEX IF NOT EXISTS idx_events_order ON events(order_id);
      CREATE INDEX IF NOT EXISTS idx_events_product ON events(product_id);
      CREATE INDEX IF NOT EXISTS idx_events_inventory_item ON events(inventory_item_id);
      CREATE INDEX IF NOT EXISTS idx_events_actor ON events(actor_user_id);
      CREATE INDEX IF NOT EXISTS idx_webhook_server_imports_remote_event ON webhook_server_event_imports(remote_event_id);
      CREATE INDEX IF NOT EXISTS idx_webhook_server_imports_payload_hash ON webhook_server_event_imports(payload_hash);

      PRAGMA foreign_keys = ON;
    `
  },
  {
    id: "0006_product_variants",
    sql: `
      PRAGMA foreign_keys = OFF;

      CREATE TABLE IF NOT EXISTS product_variants (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        variant_code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        description TEXT,
        sale_price_cents INTEGER NOT NULL DEFAULT 0,
        unit_cost_cents INTEGER NOT NULL DEFAULT 0,
        fee_percent REAL NOT NULL DEFAULT 13,
        net_value_cents INTEGER NOT NULL DEFAULT 0,
        estimated_profit_cents INTEGER NOT NULL DEFAULT 0,
        margin_percent REAL NOT NULL DEFAULT 0,
        stock_current INTEGER NOT NULL DEFAULT 0,
        stock_min INTEGER NOT NULL DEFAULT 0,
        supplier_name TEXT,
        supplier_url TEXT,
        delivery_type TEXT NOT NULL DEFAULT 'manual' CHECK (delivery_type IN ('manual', 'automatic', 'on_demand', 'service')),
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'out_of_stock', 'archived')),
        notes TEXT,
        source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'seeded_from_conversation', 'gamemarket_sync', 'imported')),
        needs_review INTEGER NOT NULL DEFAULT 0,
        manually_edited_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      ALTER TABLE inventory_items ADD COLUMN product_variant_id TEXT REFERENCES product_variants(id) ON DELETE SET NULL;
      ALTER TABLE orders ADD COLUMN product_variant_id TEXT REFERENCES product_variants(id) ON DELETE SET NULL;

      CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants(product_id);
      CREATE INDEX IF NOT EXISTS idx_product_variants_status ON product_variants(status);
      CREATE INDEX IF NOT EXISTS idx_product_variants_delivery_type ON product_variants(delivery_type);
      CREATE INDEX IF NOT EXISTS idx_inventory_product_variant ON inventory_items(product_variant_id);
      CREATE INDEX IF NOT EXISTS idx_orders_product_variant ON orders(product_variant_id);

      PRAGMA foreign_keys = ON;
    `
  }
];
