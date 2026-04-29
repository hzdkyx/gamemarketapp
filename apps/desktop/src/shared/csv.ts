export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | boolean | null | undefined;
}

const escapeCsvValue = (value: string | number | boolean | null | undefined): string => {
  if (value === null || value === undefined) {
    return "";
  }

  const stringValue = String(value);
  if (/[",\n\r;]/.test(stringValue)) {
    return `"${stringValue.replaceAll('"', '""')}"`;
  }

  return stringValue;
};

export const buildCsv = <T,>(rows: T[], columns: Array<CsvColumn<T>>): string => {
  const header = columns.map((column) => escapeCsvValue(column.header)).join(";");
  const body = rows.map((row) =>
    columns.map((column) => escapeCsvValue(column.value(row))).join(";")
  );

  return [header, ...body].join("\n");
};
