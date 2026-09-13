import "server-only";

import ExcelJS from "exceljs";
import {
  DATA_TRANSFER_SCHEMA_VERSION,
  MAX_ROWS_PER_SHEET,
  MAX_SHEETS,
  MAX_TOTAL_ROWS,
  MAX_UPLOAD_BYTES,
  MODULE_APPLY_ORDER,
  type DataModuleName,
} from "./contracts";
import { exportModulesSnapshot, type ExportDataRow } from "./data-source";
import { DATA_MODULE_REGISTRY } from "./registry";
import { neutralizeSpreadsheetText } from "./egress-security";

export { neutralizeSpreadsheetText } from "./egress-security";

function safeCellValue(value: ExportDataRow[string]): string | number | boolean | null {
  return typeof value === "string" ? neutralizeSpreadsheetText(value) : value;
}

function addManifest(workbook: ExcelJS.Workbook, modules: readonly DataModuleName[]) {
  const sheet = workbook.addWorksheet("_manifest", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = [{ width: 24 }, { width: 70 }];
  sheet.addRow(["key", "value"]);
  sheet.addRow(["schema_version", DATA_TRANSFER_SCHEMA_VERSION]);
  sheet.addRow(["source", "HATAB ERP data center"]);
  sheet.addRow(["generated_at", new Date().toISOString()]);
  sheet.addRow(["modules", modules.join(",")]);
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF14241C" } };
}

function addModuleSheet(
  workbook: ExcelJS.Workbook,
  module: DataModuleName,
  rows: readonly ExportDataRow[],
) {
  const definition = DATA_MODULE_REGISTRY[module];
  const worksheet = workbook.addWorksheet(module, {
    views: [{ state: "frozen", ySplit: 1, rightToLeft: false }],
    properties: { defaultRowHeight: 20 },
  });
  const headers = definition.columns.map((column) => column.key);
  const headerRow = worksheet.addRow(headers);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF14241C" } };
  headerRow.alignment = { vertical: "middle" };
  for (let index = 0; index < definition.columns.length; index += 1) {
    headerRow.getCell(index + 1).note = definition.columns[index].description;
  }

  for (const row of rows) {
    const output = headers.map((header) => safeCellValue(row[header] ?? null));
    worksheet.addRow(output);
  }
  worksheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, worksheet.rowCount), column: headers.length } };
  worksheet.columns.forEach((column, index) => {
    const headerLength = headers[index]?.length ?? 12;
    let width = Math.max(12, Math.min(34, headerLength + 2));
    column.eachCell?.({ includeEmpty: false }, (cell) => {
      width = Math.max(width, Math.min(42, String(cell.value ?? "").length + 2));
    });
    column.width = width;
  });
}

export async function createXlsxExport(input: {
  modules?: readonly DataModuleName[];
  includeData: boolean;
}): Promise<Buffer> {
  const dataModules = input.modules?.length ? [...input.modules] : [...MODULE_APPLY_ORDER];
  const snapshot = input.includeData ? await exportModulesSnapshot(dataModules) : {};
  if (dataModules.length > MAX_SHEETS) throw new Error(`Export exceeds the ${MAX_SHEETS} sheet import limit`);
  const totalRows = dataModules.reduce((sum, dataModule) => {
    const count = snapshot[dataModule]?.length ?? 0;
    if (count > MAX_ROWS_PER_SHEET) throw new Error(`${dataModule} exceeds the ${MAX_ROWS_PER_SHEET} row import limit`);
    return sum + count;
  }, 0);
  if (totalRows > MAX_TOTAL_ROWS) throw new Error(`Export exceeds the ${MAX_TOTAL_ROWS} total-row import limit`);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "HATAB ERP";
  workbook.created = new Date();
  workbook.modified = workbook.created;
  addManifest(workbook, dataModules);
  for (const dataModule of dataModules) addModuleSheet(workbook, dataModule, snapshot[dataModule] ?? []);
  const output = await workbook.xlsx.writeBuffer();
  const buffer = Buffer.from(output);
  if (buffer.length > MAX_UPLOAD_BYTES) throw new Error(`Export exceeds the ${MAX_UPLOAD_BYTES} byte re-import limit`);
  return buffer;
}

export async function createCsvExport(input: {
  module: DataModuleName;
  includeData: boolean;
}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const definition = DATA_MODULE_REGISTRY[input.module];
  const snapshot = input.includeData ? await exportModulesSnapshot([input.module]) : {};
  if ((snapshot[input.module]?.length ?? 0) > MAX_ROWS_PER_SHEET) throw new Error(`${input.module} exceeds the ${MAX_ROWS_PER_SHEET} row import limit`);
  const worksheet = workbook.addWorksheet(input.module);
  const headers = definition.columns.map((column) => column.key);
  worksheet.addRow(headers.map(neutralizeSpreadsheetText));
  for (const row of snapshot[input.module] ?? []) {
    worksheet.addRow(headers.map((header) => safeCellValue(row[header] ?? null)));
  }
  const output = await workbook.csv.writeBuffer({ sheetName: input.module });
  const buffer = Buffer.from(output);
  if (buffer.length > MAX_UPLOAD_BYTES) throw new Error(`Export exceeds the ${MAX_UPLOAD_BYTES} byte re-import limit`);
  return buffer;
}
