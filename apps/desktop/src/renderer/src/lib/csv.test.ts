import { describe, expect, it } from "vitest";
import { buildCsv } from "./csv";

describe("buildCsv", () => {
  it("escapes semicolons and quotes", () => {
    const csv = buildCsv(
      [{ name: 'Conta "Prime"; entrega', price: 74.9 }],
      [
        { header: "Nome", value: (row) => row.name },
        { header: "Preço", value: (row) => row.price }
      ]
    );

    expect(csv).toBe('Nome;Preço\n"Conta ""Prime""; entrega";74.9');
  });
});
