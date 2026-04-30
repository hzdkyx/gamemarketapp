import {
  analyzeProfitRows,
  buildProfitCsv,
  normalizeProfitListResult,
} from "../../shared/profit-analysis";
import type {
  CsvExportResult,
  DeliveryType,
  ProfitAnalysisRow,
  ProfitAnalysisStatus,
  ProfitFilters,
  ProfitListInput,
  ProfitListResult,
} from "../../shared/contracts";
import { profitRepository } from "../repositories/profit-repository";

const uniqueSorted = (values: Array<string | null | undefined>): string[] =>
  Array.from(
    new Set(
      values
        .map((value) => value?.trim() ?? "")
        .filter((value) => value.length > 0),
    ),
  ).sort((left, right) => left.localeCompare(right, "pt-BR"));

const uniqueTypedSorted = <T extends string>(values: T[]): T[] =>
  Array.from(new Set(values)).sort((left, right) =>
    left.localeCompare(right, "pt-BR"),
  );

const buildProfitFilters = (rows: ProfitAnalysisRow[]): ProfitFilters => ({
  categories: uniqueSorted(
    rows.flatMap((row) => [row.productCategory, row.game]),
  ),
  deliveryTypes: uniqueTypedSorted(
    rows.map((row) => row.deliveryType as DeliveryType),
  ),
  statuses: uniqueTypedSorted(
    rows.map((row) => row.status as ProfitAnalysisStatus),
  ),
  suppliers: uniqueSorted(rows.map((row) => row.supplierName)),
});

export interface ProfitServiceDiagnostics {
  totalProducts: number;
  totalVariants: number;
  activeVariants: number;
  parentOnlyProducts: number;
  rowsBeforeFilters: number;
  rowsAfterFilters: number;
}

export const profitService = {
  list(filters: ProfitListInput): ProfitListResult {
    const rows = profitRepository.listRows();
    const analysis = analyzeProfitRows(rows, filters);

    return normalizeProfitListResult({
      ...analysis,
      filters: buildProfitFilters(rows),
    });
  },

  exportCsv(filters: ProfitListInput): CsvExportResult {
    const rows = profitRepository.listRows();
    const analysis = analyzeProfitRows(rows, filters);

    return {
      filename: "hzdk-profit-analysis.csv",
      content: buildProfitCsv(analysis.list),
    };
  },

  getDiagnostics(filters: ProfitListInput): ProfitServiceDiagnostics {
    const rows = profitRepository.listRows();
    const analysis = analyzeProfitRows(rows, filters);

    return {
      ...profitRepository.getDiagnostics(),
      rowsBeforeFilters: rows.length,
      rowsAfterFilters: analysis.list.length,
    };
  },
};
