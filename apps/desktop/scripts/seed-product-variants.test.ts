import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const seedScript = readFileSync(join(process.cwd(), "scripts", "seed-product-variants.mjs"), "utf8");

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

describe("product variants seed script", () => {
  it("contains the 35 operational variants from the safe catalog", () => {
    expect(expectedVariantCodes).toHaveLength(35);

    for (const code of expectedVariantCodes) {
      expect(seedScript).toContain(code);
    }
  });

  it("keeps the seed idempotent and avoids overwriting local variant edits", () => {
    expect(seedScript).toContain("existingCodes.has(variant.variantCode)");
    expect(seedScript).toContain("skipped.push(variant.variantCode)");
    expect(seedScript).not.toMatch(/\bUPDATE\s+product_variants\b/i);
    expect(seedScript).not.toMatch(/\bDELETE\s+FROM\s+product_variants\b/i);
  });

  it("keeps Clash CV11 unit cost at R$2.33", () => {
    expect(seedScript).toContain(
      '["COC-CV11-3BUILDERS", "[GLOBAL] Clash of Clans CV11 | 3 Construtores | Não Vinculada", 14.9, 2.33]'
    );
  });
});
