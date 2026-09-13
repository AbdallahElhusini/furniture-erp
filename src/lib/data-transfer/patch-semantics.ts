import type { CellScalar } from "./contracts";

export function transferCellIsBlank(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
}

function camelToSnake(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

/** v1 merge contract: omitted and blank spreadsheet cells never clear data. */
export function buildPatchData(
  data: Record<string, unknown>,
  raw: Record<string, CellScalar>,
  excluded: readonly string[] = [],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(data)) {
    if (excluded.includes(field)) continue;
    const sourceField = camelToSnake(field);
    if (Object.hasOwn(raw, sourceField) && !transferCellIsBlank(raw[sourceField])) result[field] = value;
  }
  return result;
}

export function transferRowHasValue(raw: Record<string, CellScalar>, field: string): boolean {
  return Object.hasOwn(raw, field) && !transferCellIsBlank(raw[field]);
}

