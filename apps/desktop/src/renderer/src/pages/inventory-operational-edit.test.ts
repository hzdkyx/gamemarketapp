import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const currentDir = dirname(fileURLToPath(import.meta.url));

describe("inventory operational stock editing", () => {
  it("edits variation rows in product_variants and parent rows in products without redirecting to Produtos", () => {
    const source = readFileSync(join(currentDir, "inventory.tsx"), "utf8");

    expect(source).toContain("Editar estoque operacional");
    expect(source).toContain('operationalItem.scope === "variant"');
    expect(source).toContain("api.productVariants.update");
    expect(source).toContain("api.products.update");
    expect(source).toContain("productVariantId ?? operationalItem.id");
    expect(source).toContain("createPortal(");
    expect(source).toContain("document.body");
    expect(source).toContain("firstInputRef.current?.focus()");
    expect(source).toContain("operationalEditTriggerRef");
    expect(source).not.toContain('title="Abrir produtos"');
    expect(source).not.toContain("<Link to=\"/products\"");
  });
});
