import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const currentDir = dirname(fileURLToPath(import.meta.url));

const readSource = (relativePath: string): string =>
  readFileSync(resolve(currentDir, relativePath), "utf8");

describe("profit page wiring", () => {
  it("registers the Lucro route and sidebar item", () => {
    const app = readSource("../App.tsx");
    const navItems = readSource("../components/layout/nav-items.ts");

    expect(app).toContain('path="profit"');
    expect(navItems).toContain('label: "Lucro"');
    expect(navItems).toContain('path: "/profit"');
  });

  it("renders variation profit fields and safe CSV export action", () => {
    const page = readSource("profit.tsx");
    const desktopApi = readSource("../lib/desktop-api.ts");

    expect(page).toContain("Preço mínimo");
    expect(page).toContain("Custo pendente");
    expect(page).toContain("Needs review");
    expect(page).toContain("const rows = data?.list ?? []");
    expect(page).toContain("const groups = data?.groups ?? []");
    expect(page).toContain("const filterOptions = data?.filters");
    expect(page).toContain("buildProfitCsv(rows)");
    expect(desktopApi).toContain("unavailableElectronProfit");
    expect(desktopApi).toContain(
      "window.hzdk ? mergeDesktopApi(window.hzdk) : fallbackApi",
    );
  });

  it("keeps Products profit column variation-based when variants exist", () => {
    const productsPage = readSource("products.tsx");

    expect(productsPage).toContain("VariantProfitCell");
    expect(productsPage).toContain("Lucro mín");
    expect(productsPage).toContain("Lucro méd");
    expect(productsPage).toContain("Lucro máx");
    expect(productsPage).toContain("custo pendente");
  });
});
