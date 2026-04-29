import { z } from "zod";

const paginationSchema = z
  .object({
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative()
  })
  .passthrough();

const successSchema = z.literal(true);

export const gamemarketProductStatusSchema = z.enum([
  "ativo",
  "desativado",
  "em_analise",
  "rejeitado"
]);

export const gamemarketProductListItemSchema = z
  .object({
    id: z.number().int().nonnegative(),
    title: z.string(),
    description: z.string().optional().nullable(),
    price: z.number().int().nonnegative(),
    game: z.string(),
    category: z.string(),
    featured: z.boolean().optional(),
    warrantyPeriod: z.number().int().optional(),
    listingType: z.string().optional(),
    isAutoDelivery: z.boolean().optional(),
    isApproved: z.boolean().optional(),
    needsApproval: z.boolean().optional(),
    isActive: z.boolean().optional(),
    rejectionReason: z.string().nullable().optional(),
    status: gamemarketProductStatusSchema.or(z.string()),
    createdAt: z.string()
  })
  .passthrough();

export const gamemarketProductListResponseSchema = z
  .object({
    success: successSchema,
    data: z.array(gamemarketProductListItemSchema),
    pagination: paginationSchema,
    statusOptions: z.record(z.string(), z.string()).optional()
  })
  .passthrough();

export const gamemarketOrderListItemSchema = z
  .object({
    id: z.number().int().nonnegative(),
    productId: z.number().int().nonnegative(),
    buyerName: z.string().nullable().optional(),
    sellerName: z.string().nullable().optional(),
    price: z.number().int().nonnegative(),
    quantity: z.number().int().positive(),
    status: z.string(),
    createdAt: z.string(),
    updatedAt: z.string().optional()
  })
  .passthrough();

export const gamemarketOrderListResponseSchema = z
  .object({
    success: successSchema,
    data: z.array(gamemarketOrderListItemSchema),
    pagination: paginationSchema
  })
  .passthrough();

export const gamemarketGameSchema = z
  .object({
    name: z.string(),
    slug: z.string(),
    isActive: z.boolean()
  })
  .passthrough();

export const gamemarketGamesResponseSchema = z
  .object({
    success: successSchema,
    data: z.array(gamemarketGameSchema)
  })
  .passthrough();

export type GameMarketProductListItem = z.infer<typeof gamemarketProductListItemSchema>;
export type GameMarketProductListResponse = z.infer<typeof gamemarketProductListResponseSchema>;
export type GameMarketOrderListItem = z.infer<typeof gamemarketOrderListItemSchema>;
export type GameMarketOrderListResponse = z.infer<typeof gamemarketOrderListResponseSchema>;
export type GameMarketGamesResponse = z.infer<typeof gamemarketGamesResponseSchema>;

export const documentedReadEndpoints = [
  "GET /api/v1/products",
  "GET /api/v1/products/:id",
  "GET /api/v1/orders",
  "GET /api/v1/orders/:id",
  "GET /api/v1/balance",
  "GET /api/v1/stats",
  "GET /api/v1/games"
] as const;

export const implementedReadEndpoints = [
  "GET /api/v1/games",
  "GET /api/v1/products",
  "GET /api/v1/orders"
] as const;
