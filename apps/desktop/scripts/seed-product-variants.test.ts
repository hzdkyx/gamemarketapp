import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const seedScript = readFileSync(join(process.cwd(), "scripts", "seed-product-variants.mjs"), "utf8");

const {
  canAssignVariantToProduct,
  catalog,
  findProductMatch,
  planLolSmurfVariantRepair,
  productMatchesGroup,
  variantAllowedForGroup
} = await import("./product-variant-catalog.mjs");

const expectedVariantCodes = [
  "MEL-ESSENTIAL-001",
  "LOL-BR-BASE-20-29",
  "LOL-BR-GRAVES-VERAO",
  "LOL-BR-LEBLANC-SABUGUEIRO",
  "LOL-BR-MF-WATERLOO",
  "LOL-BR-LUCIAN-PALADINO",
  "LOL-BR-ASHE-SHERWOOD",
  "LOL-BR-SSW-TALON",
  "LOL-BR-JINX-ZOMBIE",
  "LOL-BR-GRAVES-PORCELANA",
  "LOL-BR-GALIO-DRAGOES",
  "LOL-BR-3SKINS",
  "LOL-BR-ARCANE-4SKINS",
  "WR-BR-PREMIUM-LV8",
  "MLBB-32K-WR100",
  "MLBB-76K-PREMIUM",
  "COC-CV11-3BUILDERS",
  "COC-CV12-3BUILDERS",
  "COC-CV13-4BUILDERS",
  "COC-CV14-5BUILDERS",
  "COC-CV15-SUPER-TROOPS",
  "COC-CV18-3000-GEMS",
  "CS2-PRIME-NO-PREMIER",
  "CS2-PRIME-PREMIER",
  "DBD-STEAM-0H",
  "DBD-EPIC-20GAMES",
  "DBD-EPIC-ARK",
  "DBD-EPIC-ALL-DLC",
  "GENSHIN-REROLL-AR55-AMERICA",
  "TFT-FERRO-BRONZE",
  "TFT-BRONZE-PRATA",
  "TFT-PRATA-OURO",
  "TFT-OURO-PLATINA",
  "TFT-PLATINA-ESMERALDA",
  "SITE-PROFISSIONAL-BASE"
];

const tftProduct = {
  id: "product-tft",
  external_product_id: "GMK-PRD-1702",
  name: "TFT ELOJOB | FERRO AO ESMERALDA | PLANOS POR ELO | ORÇAMENTO NO CHAT",
  category: "League of Legends",
  game: "League of Legends",
  status: "active"
};

const lolProduct = {
  id: "product-lol",
  external_product_id: "GMK-PRD-1594",
  name: "CONTA SMURF LOL LEVEL 15-30 | FULL ACESSO | SERVIDOR BR",
  category: "League of Legends",
  game: "League of Legends",
  status: "active"
};

describe("product variants seed script", () => {
  it("contains the 35 operational variants from the safe catalog", () => {
    expect(expectedVariantCodes).toHaveLength(35);

    const actualCodes = catalog.flatMap((group) => group.variants.map((variant) => variant.variantCode));
    expect(actualCodes.sort()).toEqual([...expectedVariantCodes].sort());
  });

  it("keeps the seed idempotent and avoids overwriting local variant edits", () => {
    expect(seedScript).toContain("existingCodes.has(variant.variantCode)");
    expect(seedScript).toContain("skipped.push(variant.variantCode)");
    expect(seedScript).not.toMatch(/\bUPDATE\s+product_variants\b/i);
    expect(seedScript).not.toMatch(/\bDELETE\s+FROM\s+product_variants\b/i);
  });

  it("keeps Clash CV11 unit cost at R$2.33", () => {
    const clash = catalog.find((group) => group.key === "clash-of-clans");
    expect(clash?.variants.find((variant) => variant.variantCode === "COC-CV11-3BUILDERS")?.unitCost).toBe(2.33);
  });

  it("does not match LoL Smurf variants to the TFT product", () => {
    expect(productMatchesGroup(tftProduct, "lol-smurf")).toBe(false);
    expect(canAssignVariantToProduct(tftProduct, { variantCode: "LOL-BR-BASE-20-29", name: "[BR] Level 20-29" }, "lol-smurf")).toBe(false);
    expect(productMatchesGroup(lolProduct, "lol-smurf")).toBe(true);
  });

  it("does not allow TFT seed variants to use a LOL-* code", () => {
    expect(variantAllowedForGroup({ variantCode: "LOL-BR-BASE-20-29", name: "[BR] Level 20-29" }, "tft-elojob")).toBe(false);
    expect(variantAllowedForGroup({ variantCode: "TFT-FERRO-BRONZE", name: "[ELOJOB TFT] Ferro -> Bronze" }, "tft-elojob")).toBe(true);
  });

  it("does not fall back to broad category or game matches", () => {
    const lolGroup = catalog.find((group) => group.key === "lol-smurf");
    expect(lolGroup).toBeTruthy();

    const match = findProductMatch([tftProduct], lolGroup);
    expect(match.product).toBeNull();
    expect(match.reason).toBe("not_found");
  });

  it("reports missing products when the parent match is not unequivocal", () => {
    const tftGroup = catalog.find((group) => group.key === "tft-elojob");
    expect(tftGroup).toBeTruthy();

    const match = findProductMatch(
      [
        tftProduct,
        {
          ...tftProduct,
          id: "product-tft-copy",
          name: "TFT ELOJOB | FERRO AO ESMERALDA | CÓPIA"
        }
      ],
      tftGroup
    );

    expect(match.product).toBeNull();
    expect(match.reason).toBe("ambiguous");
    expect(match.candidates).toHaveLength(2);
  });

  it("plans moving LOL-* variants from TFT to the LoL Smurf product", () => {
    const plan = planLolSmurfVariantRepair({
      products: [tftProduct, lolProduct],
      variants: [
        {
          id: "variant-lol",
          product_id: tftProduct.id,
          variant_code: "LOL-BR-BASE-20-29",
          name: "[BR] Level 20-29 | 10-30 Campeões | Full Acesso",
          sale_price_cents: 1500,
          unit_cost_cents: 750,
          stock_current: 0,
          stock_min: 1,
          supplier_name: "Fornecedor editado",
          delivery_type: "manual",
          notes: "não sobrescrever",
          needs_review: 1,
          manually_edited_at: "2026-04-29T10:00:00.000Z"
        },
        {
          id: "variant-tft",
          product_id: tftProduct.id,
          variant_code: "TFT-FERRO-BRONZE",
          name: "[ELOJOB TFT] Ferro -> Bronze"
        }
      ]
    });

    expect(plan.errors).toEqual([]);
    expect(plan.actions).toEqual([
      expect.objectContaining({
        type: "move",
        variantId: "variant-lol",
        variantCode: "LOL-BR-BASE-20-29",
        fromProductId: tftProduct.id,
        toProductId: lolProduct.id
      })
    ]);
  });

  it("plans an idempotent repair when there are no LOL variants on TFT", () => {
    const plan = planLolSmurfVariantRepair({
      products: [tftProduct, lolProduct],
      variants: [
        {
          id: "variant-lol",
          product_id: lolProduct.id,
          variant_code: "LOL-BR-BASE-20-29",
          name: "[BR] Level 20-29 | 10-30 Campeões | Full Acesso"
        }
      ]
    });

    expect(plan.errors).toEqual([]);
    expect(plan.actions).toEqual([]);
  });

  it("preserves the more complete manually edited duplicate in repair planning", () => {
    const plan = planLolSmurfVariantRepair({
      products: [tftProduct, lolProduct],
      variants: [
        {
          id: "variant-wrong",
          product_id: tftProduct.id,
          variant_code: "LOL-BR-3SKINS-COPY",
          name: "[BR] LVL 16 | 16 Camp | 3 Skins | Full Acesso",
          sale_price_cents: 2990,
          unit_cost_cents: 750,
          stock_current: 0,
          stock_min: 0,
          supplier_name: null,
          delivery_type: "manual",
          notes: null,
          needs_review: 0,
          manually_edited_at: null,
          source: "seeded_from_conversation"
        },
        {
          id: "variant-manual",
          product_id: lolProduct.id,
          variant_code: "LOL-BR-3SKINS",
          name: "[BR] LVL 16 | 16 Camp | 3 Skins | Full Acesso",
          sale_price_cents: 3490,
          unit_cost_cents: 900,
          stock_current: 2,
          stock_min: 1,
          supplier_name: "Fornecedor manual",
          delivery_type: "manual",
          notes: "editado manualmente",
          needs_review: 1,
          manually_edited_at: "2026-04-29T10:00:00.000Z",
          source: "manual"
        }
      ]
    });

    expect(plan.actions).toEqual([
      expect.objectContaining({
        type: "merge_into_existing",
        variantId: "variant-wrong",
        preservedVariantId: "variant-manual",
        duplicateVariantId: "variant-wrong"
      })
    ]);
  });
});
