export const feePercent = 13;
export const netRate = 0.87;

export const LOL_SMURF_EXTERNAL_PRODUCT_ID = "GMK-PRD-1594";
export const TFT_ELOJOB_EXTERNAL_PRODUCT_ID = "GMK-PRD-1702";

export const normalize = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();

const normalizedIncludesPhrase = (haystack, phrase) => {
  const normalizedHaystack = normalize(haystack);
  const tokens = normalize(phrase).split(" ").filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => normalizedHaystack.includes(token));
};

const hasAnyPhrase = (value, phrases) => phrases.some((phrase) => normalizedIncludesPhrase(value, phrase));
const hasAllPhrases = (value, phrases) => phrases.every((phrase) => normalizedIncludesPhrase(value, phrase));

export const moneyToCents = (value) => Math.round((value + Number.EPSILON) * 100);

export const financials = (salePrice, unitCost) => {
  const salePriceCents = moneyToCents(salePrice);
  const unitCostCents = moneyToCents(unitCost);
  const netValueCents = Math.round(salePriceCents * netRate);
  const estimatedProfitCents = netValueCents - unitCostCents;

  return {
    salePriceCents,
    unitCostCents,
    netValueCents,
    estimatedProfitCents,
    marginPercent: salePriceCents === 0 ? 0 : estimatedProfitCents / salePriceCents
  };
};

const productParentRules = {
  melodyne: {
    requiredAny: ["CELEMONY MELODYNE", "MELODYNE 5 ESSENTIAL"]
  },
  "lol-smurf": {
    requiredAny: ["CONTA SMURF LOL", "SMURF LOL LEVEL", "SERVIDOR BR"],
    forbiddenAny: ["TFT", "ELOJOB", "FERRO", "ESMERALDA", "PLANOS POR ELO"]
  },
  "wild-rift": {
    requiredAny: ["WILD RIFT"]
  },
  "mobile-legends": {
    requiredAny: ["MOBILE LEGENDS", "MOONTON"]
  },
  "clash-of-clans": {
    requiredAny: ["CLASH OF CLANS"]
  },
  cs2: {
    requiredAll: ["CS2", "PRIME"]
  },
  "dead-by-daylight": {
    requiredAny: ["DEAD BY DAYLIGHT"]
  },
  genshin: {
    requiredAny: ["GENSHIN"]
  },
  "tft-elojob": {
    requiredAny: ["TFT", "ELOJOB", "FERRO AO ESMERALDA"]
  },
  "site-profissional": {
    requiredAny: ["CRIAÇÃO DE SITE", "SITE PROFISSIONAL"]
  }
};

export const productMatchesGroup = (product, groupKey) => {
  const rule = productParentRules[groupKey];
  if (!rule) {
    return false;
  }

  if (product.status === "archived") {
    return false;
  }

  const name = product.name ?? "";

  if (rule.requiredAny && !hasAnyPhrase(name, rule.requiredAny)) {
    return false;
  }

  if (rule.requiredAll && !hasAllPhrases(name, rule.requiredAll)) {
    return false;
  }

  if (rule.forbiddenAny && hasAnyPhrase(name, rule.forbiddenAny)) {
    return false;
  }

  return true;
};

const getVariantCode = (variant) => String(variant.variantCode ?? variant.variant_code ?? "").toUpperCase();

export const isLolSmurfVariant = (variant) => {
  const code = getVariantCode(variant);
  if (code.startsWith("LOL-")) {
    return true;
  }

  const haystack = `${code} ${variant.name ?? ""}`;
  return hasAnyPhrase(haystack, ["[BR] LVL", "[BR] Level", "Camp", "Campeões", "Full Acesso"]);
};

export const variantAllowedForGroup = (variant, groupKey) => {
  const code = getVariantCode(variant);

  if (groupKey === "lol-smurf") {
    return isLolSmurfVariant(variant);
  }

  if (groupKey === "tft-elojob") {
    return !code.startsWith("LOL-") && code.startsWith("TFT-");
  }

  return true;
};

export const canAssignVariantToProduct = (product, variant, groupKey) =>
  productMatchesGroup(product, groupKey) && variantAllowedForGroup(variant, groupKey);

export const findProductMatch = (products, group) => {
  const candidates = products.filter((product) => productMatchesGroup(product, group.key));

  if (candidates.length === 1) {
    return {
      product: candidates[0],
      reason: "matched",
      candidates
    };
  }

  return {
    product: null,
    reason: candidates.length === 0 ? "not_found" : "ambiguous",
    candidates
  };
};

export const catalog = [
  {
    key: "melodyne",
    variants: [
      {
        variantCode: "MEL-ESSENTIAL-001",
        name: "Melodyne 5 Essential Vitalício | Licença Original",
        salePrice: 100,
        unitCost: 0,
        stockCurrent: 1,
        stockMin: 0,
        supplierName: "Licença própria",
        deliveryType: "manual",
        needsReview: true,
        notes:
          "Custo real da licença deve ser preenchido manualmente se quiser lucro real. Licença não ativada, entrega manual da serial key."
      }
    ]
  },
  {
    key: "lol-smurf",
    variants: [
      {
        variantCode: "LOL-BR-BASE-20-29",
        name: "[BR] Level 20-29 | 10-30 Campeões | Full Acesso",
        salePrice: 15,
        unitCost: 7.5,
        stockCurrent: 0,
        stockMin: 1,
        supplierName: "Fornecedor LoL / a definir",
        deliveryType: "manual",
        needsReview: false
      },
      {
        variantCode: "LOL-BR-GRAVES-VERAO",
        name: "[BR] LVL 20 | 20 Camp | Graves Curtindo Verão | Full Acesso",
        salePrice: 25,
        unitCost: 7.5,
        stockCurrent: 0,
        stockMin: 0,
        deliveryType: "manual",
        needsReview: false
      },
      {
        variantCode: "LOL-BR-LEBLANC-SABUGUEIRO",
        name: "[BR] LVL 21 | 21 Camp | LeBlanc Sabugueiro | Full Acesso",
        salePrice: 25,
        unitCost: 7.5,
        stockCurrent: 0,
        stockMin: 0,
        deliveryType: "manual",
        needsReview: false
      },
      {
        variantCode: "LOL-BR-MF-WATERLOO",
        name: "[BR] LVL 20 | 21 Camp | Miss Fortune Waterloo | Full Acesso",
        salePrice: 25,
        unitCost: 7.5,
        stockCurrent: 0,
        stockMin: 0,
        deliveryType: "manual",
        needsReview: false
      },
      {
        variantCode: "LOL-BR-LUCIAN-PALADINO",
        name: "[BR] LVL 24 | 21 Camp | Lucian Paladino de Ataque | Full Acesso",
        salePrice: 25,
        unitCost: 7.5,
        stockCurrent: 0,
        stockMin: 0,
        deliveryType: "manual",
        needsReview: false
      },
      {
        variantCode: "LOL-BR-ASHE-SHERWOOD",
        name: "[BR] LVL 21 | 22 Camp | Ashe Floresta Sherwood | Full Acesso",
        salePrice: 25,
        unitCost: 7.5,
        stockCurrent: 0,
        stockMin: 0,
        deliveryType: "manual",
        needsReview: false
      },
      {
        variantCode: "LOL-BR-SSW-TALON",
        name: "[BR] LVL 22 | 27 Camp | SSW Talon | Full Acesso",
        salePrice: 25,
        unitCost: 7.5,
        stockCurrent: 0,
        stockMin: 0,
        deliveryType: "manual",
        needsReview: false
      },
      {
        variantCode: "LOL-BR-JINX-ZOMBIE",
        name: "[BR] LVL 22 | 26 Camp | Jinx Zombie | Full Acesso",
        salePrice: 25,
        unitCost: 7.5,
        stockCurrent: 0,
        stockMin: 0,
        deliveryType: "manual",
        needsReview: false
      },
      {
        variantCode: "LOL-BR-GRAVES-PORCELANA",
        name: "[BR] LVL 16 | 26 Camp | Graves Porcelana | Full Acesso",
        salePrice: 25,
        unitCost: 7.5,
        stockCurrent: 0,
        stockMin: 0,
        deliveryType: "manual",
        needsReview: false
      },
      {
        variantCode: "LOL-BR-GALIO-DRAGOES",
        name: "[BR] LVL 17 | 19 Camp | Galio Guardião dos Dragões | Full Acesso",
        salePrice: 25,
        unitCost: 7.5,
        stockCurrent: 0,
        stockMin: 0,
        deliveryType: "manual",
        needsReview: false
      },
      {
        variantCode: "LOL-BR-3SKINS",
        name: "[BR] LVL 16 | 16 Camp | 3 Skins | Full Acesso",
        salePrice: 29.9,
        unitCost: 7.5,
        stockCurrent: 0,
        stockMin: 0,
        deliveryType: "manual",
        needsReview: false
      },
      {
        variantCode: "LOL-BR-ARCANE-4SKINS",
        name: "[BR] LVL 21 | 4 Camp | 4 Skins Arcane | Full Acesso",
        salePrice: 29.9,
        unitCost: 7.5,
        stockCurrent: 0,
        stockMin: 0,
        deliveryType: "manual",
        needsReview: false
      }
    ]
  },
  {
    key: "wild-rift",
    variants: [
      {
        variantCode: "WR-BR-PREMIUM-LV8",
        name: "[BR] Conta Premium LVL 8+ | Ranked disponível | 31K ciscos azuis",
        salePrice: 24.9,
        unitCost: 9,
        stockCurrent: 0,
        stockMin: 1,
        supplierName: "Fornecedor Wild Rift / a definir",
        deliveryType: "manual",
        needsReview: false
      }
    ]
  },
  {
    key: "mobile-legends",
    variants: [
      {
        variantCode: "MLBB-32K-WR100",
        name: "[Moonton] MLBB Smurf | 32K BP | WR 100% | LVL 7+ | Rank Warrior",
        salePrice: 24.9,
        unitCost: 7,
        stockCurrent: 0,
        stockMin: 1,
        supplierName: "Fornecedor Mobile Legends / a definir",
        deliveryType: "manual",
        needsReview: false
      },
      {
        variantCode: "MLBB-76K-PREMIUM",
        name: "[Moonton] MLBB Premium | 76K BP | WR 100% | LVL 8+ | Rank Disponível",
        salePrice: 34.9,
        unitCost: 15,
        stockCurrent: 0,
        stockMin: 1,
        supplierName: "Fornecedor Mobile Legends / a definir",
        deliveryType: "manual",
        needsReview: false
      }
    ]
  },
  {
    key: "clash-of-clans",
    variants: [
      ["COC-CV11-3BUILDERS", "[GLOBAL] Clash of Clans CV11 | 3 Construtores | Não Vinculada", 14.9, 2.33],
      ["COC-CV12-3BUILDERS", "[GLOBAL] Clash of Clans CV12 | 3 Construtores | Não Vinculada", 19.9, 3],
      ["COC-CV13-4BUILDERS", "[GLOBAL] Clash of Clans CV13 | 4 Construtores | Não Vinculada", 29.9, 4],
      ["COC-CV14-5BUILDERS", "[GLOBAL] Clash of Clans CV14 | 5 Construtores | Não Vinculada", 39.9, 4.5],
      ["COC-CV15-SUPER-TROOPS", "[GLOBAL] Clash of Clans CV15 | 5 Construtores | Super Tropas", 59.9, 6],
      ["COC-CV18-3000-GEMS", "[GLOBAL] Clash of Clans CV18 | 5 Construtores | 3000+ Gemas", 149.9, 42]
    ].map(([variantCode, name, salePrice, unitCost], index) => ({
      variantCode,
      name,
      salePrice,
      unitCost,
      stockCurrent: 0,
      stockMin: 1,
      supplierName: "Fornecedor Clash of Clans / a definir",
      deliveryType: "manual",
      needsReview: false,
      preserveStockOnExisting: index === 0
    }))
  },
  {
    key: "cs2",
    variants: [
      {
        variantCode: "CS2-PRIME-NO-PREMIER",
        name: "CS2 Prime | Sem Premier Ativo | Full Acesso",
        salePrice: 109.9,
        unitCost: 77,
        stockCurrent: 0,
        stockMin: 0,
        supplierName: "Fornecedor CS2 / a definir",
        deliveryType: "on_demand",
        needsReview: false
      },
      {
        variantCode: "CS2-PRIME-PREMIER",
        name: "CS2 Prime | Premier Ativo | Full Acesso",
        salePrice: 129.9,
        unitCost: 87.26,
        stockCurrent: 0,
        stockMin: 0,
        supplierName: "Fornecedor CS2 / a definir",
        deliveryType: "on_demand",
        needsReview: true,
        notes: "Preço de venda sugerido. Revisar conforme estratégia atual."
      }
    ]
  },
  {
    key: "dead-by-daylight",
    variants: [
      {
        variantCode: "DBD-STEAM-0H",
        name: "Dead by Daylight | Steam | 0 horas | Full Email Access",
        salePrice: 49.9,
        unitCost: 25,
        stockCurrent: 0,
        stockMin: 0,
        supplierName: "Fornecedor DBD / a definir",
        deliveryType: "on_demand",
        needsReview: false
      },
      {
        variantCode: "DBD-EPIC-20GAMES",
        name: "Dead by Daylight | Epic Games | +20 jogos | Full Access",
        salePrice: 59.9,
        unitCost: 32,
        stockCurrent: 0,
        stockMin: 0,
        supplierName: "Fornecedor DBD / a definir",
        deliveryType: "on_demand",
        needsReview: true,
        notes: "Preço de venda sugerido. Revisar."
      },
      {
        variantCode: "DBD-EPIC-ARK",
        name: "Dead by Daylight | Epic Games | +ARK + bônus | Full Access",
        salePrice: 69.9,
        unitCost: 37,
        stockCurrent: 0,
        stockMin: 0,
        supplierName: "Fornecedor DBD / a definir",
        deliveryType: "on_demand",
        needsReview: true,
        notes: "Preço de venda sugerido. Revisar."
      },
      {
        variantCode: "DBD-EPIC-ALL-DLC",
        name: "Dead by Daylight | Epic Games | All DLC/Characters | Merge",
        salePrice: 79.9,
        unitCost: 39,
        stockCurrent: 0,
        stockMin: 0,
        supplierName: "Fornecedor DBD / a definir",
        deliveryType: "on_demand",
        needsReview: true,
        notes: "Preço de venda sugerido. Produto precisa de atenção especial por uso para merge."
      }
    ]
  },
  {
    key: "genshin",
    variants: [
      {
        variantCode: "GENSHIN-REROLL-AR55-AMERICA",
        name: "Genshin Impact | Reroll AR55+ | América",
        salePrice: 149.9,
        unitCost: 0,
        stockCurrent: 0,
        stockMin: 0,
        supplierName: "Fornecedor Genshin / a definir",
        deliveryType: "on_demand",
        needsReview: true,
        notes: "Custo do fornecedor precisa ser preenchido manualmente."
      }
    ]
  },
  {
    key: "tft-elojob",
    variants: [
      ["TFT-FERRO-BRONZE", "[ELOJOB TFT] Ferro → Bronze", 9.9],
      ["TFT-BRONZE-PRATA", "[ELOJOB TFT] Bronze → Prata", 12.9],
      ["TFT-PRATA-OURO", "[ELOJOB TFT] Prata → Ouro", 17.9],
      ["TFT-OURO-PLATINA", "[ELOJOB TFT] Ouro → Platina", 24.9],
      ["TFT-PLATINA-ESMERALDA", "[ELOJOB TFT] Platina → Esmeralda", 59.9]
    ].map(([variantCode, name, salePrice]) => ({
      variantCode,
      name,
      salePrice,
      unitCost: 0,
      stockCurrent: 99999,
      stockMin: 0,
      supplierName: "Serviço próprio",
      deliveryType: "service",
      needsReview: false
    }))
  },
  {
    key: "site-profissional",
    variants: [
      {
        variantCode: "SITE-PROFISSIONAL-BASE",
        name: "Criação de site profissional | Base",
        salePrice: 99.9,
        unitCost: 0,
        stockCurrent: 99999,
        stockMin: 0,
        supplierName: "Serviço próprio",
        deliveryType: "service",
        needsReview: false,
        notes: "Serviço próprio. Custo unitário pode ser 0 ou calculado manualmente por horas de trabalho."
      }
    ]
  }
];

const externalProductId = (product) =>
  product.internalCode ??
  product.internal_code ??
  product.externalProductId ??
  product.external_product_id ??
  product.externalId ??
  product.external_id ??
  null;

const findProductByExternalId = (products, externalId) =>
  products.find((product) => externalProductId(product) === externalId) ?? null;

const normalizedVariantName = (variant) => normalize(variant.name);

const completenessScore = (variant) => {
  const textFields = ["description", "supplier_name", "supplierName", "supplier_url", "supplierUrl", "notes"];
  const numericFields = [
    "sale_price_cents",
    "salePriceCents",
    "unit_cost_cents",
    "unitCostCents",
    "stock_current",
    "stockCurrent",
    "stock_min",
    "stockMin"
  ];

  let score = 0;
  if (variant.manually_edited_at ?? variant.manuallyEditedAt) score += 10000;
  if ((variant.source ?? "") === "manual") score += 5000;
  if (["imported", "gamemarket_sync"].includes(variant.source ?? "")) score += 1000;

  for (const field of textFields) {
    if (String(variant[field] ?? "").trim().length > 0) score += 100;
  }

  for (const field of numericFields) {
    if (Number(variant[field] ?? 0) > 0) score += 10;
  }

  const updatedAt = Date.parse(variant.updated_at ?? variant.updatedAt ?? "");
  if (Number.isFinite(updatedAt)) score += Math.min(updatedAt / 10_000_000_000_000, 1);

  return score;
};

export const planLolSmurfVariantRepair = ({ products, variants }) => {
  const wrongProduct =
    findProductByExternalId(products, TFT_ELOJOB_EXTERNAL_PRODUCT_ID) ??
    products.find((product) => productMatchesGroup(product, "tft-elojob")) ??
    null;
  const targetProduct =
    findProductByExternalId(products, LOL_SMURF_EXTERNAL_PRODUCT_ID) ??
    products.find((product) => productMatchesGroup(product, "lol-smurf")) ??
    null;

  if (!wrongProduct || !targetProduct) {
    return {
      wrongProduct,
      targetProduct,
      actions: [],
      errors: [
        !wrongProduct ? `Produto errado ${TFT_ELOJOB_EXTERNAL_PRODUCT_ID} não encontrado.` : null,
        !targetProduct ? `Produto correto ${LOL_SMURF_EXTERNAL_PRODUCT_ID} não encontrado.` : null
      ].filter(Boolean)
    };
  }

  const targetVariants = variants.filter((variant) => variant.product_id === targetProduct.id);
  const candidates = variants.filter(
    (variant) => variant.product_id === wrongProduct.id && isLolSmurfVariant(variant)
  );

  const actions = candidates.map((variant) => {
    const duplicate =
      targetVariants.find(
        (targetVariant) =>
          targetVariant.id !== variant.id &&
          (targetVariant.variant_code === variant.variant_code ||
            normalizedVariantName(targetVariant) === normalizedVariantName(variant))
      ) ?? null;

    if (!duplicate) {
      return {
        type: "move",
        variantId: variant.id,
        variantCode: variant.variant_code,
        fromProductId: wrongProduct.id,
        toProductId: targetProduct.id,
        preservedVariantId: variant.id,
        duplicateVariantId: null
      };
    }

    const sourceWins = completenessScore(variant) > completenessScore(duplicate);

    return {
      type: sourceWins ? "replace_duplicate_with_source" : "merge_into_existing",
      variantId: variant.id,
      variantCode: variant.variant_code,
      fromProductId: wrongProduct.id,
      toProductId: targetProduct.id,
      preservedVariantId: sourceWins ? variant.id : duplicate.id,
      duplicateVariantId: sourceWins ? duplicate.id : variant.id,
      existingVariantId: duplicate.id,
      existingVariantCode: duplicate.variant_code
    };
  });

  return {
    wrongProduct,
    targetProduct,
    actions,
    errors: []
  };
};
