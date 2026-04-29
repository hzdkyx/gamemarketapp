export const moneyToCents = (value: number): number => Math.round((value + Number.EPSILON) * 100);

export const centsToMoney = (value: number | null | undefined): number => Math.round(value ?? 0) / 100;
