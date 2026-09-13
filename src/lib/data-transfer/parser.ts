import "server-only";

import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { inflateRawSync } from "node:zlib";
import ExcelJS from "exceljs";
import {
  DATA_TRANSFER_SCHEMA_VERSION,
  MAX_CELL_CHARACTERS,
  MAX_COLUMNS_PER_SHEET,
  MAX_ROWS_PER_SHEET,
  MAX_SHEETS,
  MAX_TOTAL_ROWS,
  MAX_UPLOAD_BYTES,
  isDataModuleName,
  type CellScalar,
  type DataModuleName,
  type DataTransferIssueInput,
  type ParsedDataFile,
  type ParsedDataRow,
} from "./contracts";
import { DATA_MODULE_REGISTRY, moduleColumnKeys } from "./registry";
import { decodeNeutralizedSpreadsheetText } from "./egress-security";

export class DataFileParseError extends Error {
  constructor(
    message: string,
    readonly issues: DataTransferIssueInput[],
  ) {
    super(message);
    this.name = "DataFileParseError";
  }
}

const MAX_ZIP_ENTRIES = 2_048;
const MAX_ZIP_ENTRY_UNCOMPRESSED_BYTES = 20 * 1024 * 1024;
const MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;
const MAX_ZIP_COMPRESSION_RATIO = 100;
const BLOCKED_XLSX_PATHS = [
  "xl/vbaproject.bin",
  "xl/externallinks/",
  "xl/embeddings/",
  "xl/activex/",
  "xl/connections.xml",
  "xl/querytables/",
  "customui/",
] as const;

function parseIssue(
  module: string,
  code: string,
  message: string,
  details: Partial<DataTransferIssueInput> = {},
): DataTransferIssueInput {
  return {
    module,
    severity: "ERROR",
    code,
    message,
    ...details,
  };
}

export function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function normalizeSheetName(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function isFormulaValue(value: ExcelJS.CellValue): boolean {
  return Boolean(
    value &&
      typeof value === "object" &&
      !(value instanceof Date) &&
      ("formula" in value || "sharedFormula" in value),
  );
}

function scalarFromCell(
  value: ExcelJS.CellValue,
  module: string,
  sheet: string,
  rowNumber: number,
  field: string,
): CellScalar {
  if (value === null || value === undefined) return null;
  if (isFormulaValue(value)) {
    throw new DataFileParseError("Spreadsheet formulas are not allowed", [
      parseIssue(module, "FORMULA_NOT_ALLOWED", "Formula cells are rejected; upload literal values only", {
        sheet,
        rowNumber,
        field,
      }),
    ]);
  }
  if (value instanceof Date) return new Date(value.getTime());
  if (["string", "number", "boolean"].includes(typeof value)) {
    if (typeof value === "string" && value.length > MAX_CELL_CHARACTERS) {
      throw new DataFileParseError("A cell exceeds the character limit", [
        parseIssue(module, "CELL_TOO_LARGE", `Cell values may not exceed ${MAX_CELL_CHARACTERS} characters`, {
          sheet,
          rowNumber,
          field,
        }),
      ]);
    }
    return typeof value === "string" ? decodeNeutralizedSpreadsheetText(value) : value as number | boolean;
  }

  throw new DataFileParseError("Unsupported spreadsheet cell type", [
    parseIssue(module, "UNSUPPORTED_CELL", "Rich text, hyperlinks, errors, and other complex cells are not accepted", {
      sheet,
      rowNumber,
      field,
    }),
  ]);
}

function readManifest(worksheet: ExcelJS.Worksheet): Record<string, string> {
  const manifest: Record<string, string> = {};
  for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const key = String(row.getCell(1).value ?? "").trim().toLowerCase();
    if (!key || key === "key") continue;
    const value = row.getCell(2).value;
    if (isFormulaValue(value)) {
      throw new DataFileParseError("Manifest formulas are not allowed", [
        parseIssue("_manifest", "FORMULA_NOT_ALLOWED", "Manifest values must be literal values", {
          sheet: worksheet.name,
          rowNumber,
          field: key,
        }),
      ]);
    }
    manifest[key] = String(value ?? "").trim();
  }
  return manifest;
}

function readModuleWorksheet(
  worksheet: ExcelJS.Worksheet,
  module: DataModuleName,
): ParsedDataRow[] {
  if (worksheet.rowCount < 1) return [];
  if (worksheet.rowCount - 1 > MAX_ROWS_PER_SHEET) {
    throw new DataFileParseError("Sheet row limit exceeded", [
      parseIssue(module, "ROW_LIMIT", `${module} exceeds the ${MAX_ROWS_PER_SHEET} row limit`, {
        sheet: worksheet.name,
      }),
    ]);
  }

  const headerRow = worksheet.getRow(1);
  const headerCount = headerRow.cellCount;
  if (headerCount < 1 || headerCount > MAX_COLUMNS_PER_SHEET) {
    throw new DataFileParseError("Invalid sheet column count", [
      parseIssue(module, "COLUMN_LIMIT", `Sheets must contain 1-${MAX_COLUMNS_PER_SHEET} columns`, {
        sheet: worksheet.name,
        rowNumber: 1,
      }),
    ]);
  }

  const headers: string[] = [];
  const headerSet = new Set<string>();
  for (let index = 1; index <= headerCount; index += 1) {
    const raw = headerRow.getCell(index).value;
    if (isFormulaValue(raw)) {
      throw new DataFileParseError("Header formulas are not allowed", [
        parseIssue(module, "FORMULA_NOT_ALLOWED", "Header cells must contain literal technical column names", {
          sheet: worksheet.name,
          rowNumber: 1,
        }),
      ]);
    }
    const header = normalizeHeader(raw);
    if (!header) {
      throw new DataFileParseError("Blank header detected", [
        parseIssue(module, "BLANK_HEADER", "Every used column must have a technical header", {
          sheet: worksheet.name,
          rowNumber: 1,
        }),
      ]);
    }
    if (headerSet.has(header)) {
      throw new DataFileParseError("Duplicate header detected", [
        parseIssue(module, "DUPLICATE_HEADER", `The header '${header}' appears more than once`, {
          sheet: worksheet.name,
          rowNumber: 1,
          field: header,
        }),
      ]);
    }
    headerSet.add(header);
    headers.push(header);
  }

  const allowed = moduleColumnKeys(module);
  const unknown = headers.filter((header) => !allowed.has(header));
  if (unknown.length > 0) {
    throw new DataFileParseError("Unknown columns detected", unknown.map((field) =>
      parseIssue(module, "UNKNOWN_COLUMN", `Column '${field}' is not allowlisted for ${module}`, {
        sheet: worksheet.name,
        rowNumber: 1,
        field,
      }),
    ));
  }

  const required = DATA_MODULE_REGISTRY[module].columns
    .filter((column) => column.required)
    .map((column) => column.key);
  const missing = required.filter((field) => !headerSet.has(field));
  if (missing.length > 0) {
    throw new DataFileParseError("Required columns are missing", missing.map((field) =>
      parseIssue(module, "MISSING_COLUMN", `Required column '${field}' is missing`, {
        sheet: worksheet.name,
        rowNumber: 1,
        field,
      }),
    ));
  }

  const result: ParsedDataRow[] = [];
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const worksheetRow = worksheet.getRow(rowNumber);
    const values: Record<string, CellScalar> = {};
    let hasValue = false;
    for (let columnIndex = 1; columnIndex <= headers.length; columnIndex += 1) {
      const header = headers[columnIndex - 1];
      const value = scalarFromCell(
        worksheetRow.getCell(columnIndex).value,
        module,
        worksheet.name,
        rowNumber,
        header,
      );
      values[header] = value;
      if (value !== null && !(typeof value === "string" && value.trim() === "")) hasValue = true;
    }
    if (hasValue) result.push({ module, sheet: worksheet.name, rowNumber, values });
  }
  return result;
}

async function loadWorkbook(buffer: Buffer, fileType: "xlsx" | "csv"): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  if (fileType === "xlsx") {
    // ExcelJS carries its own Buffer declaration; runtime receives a normal
    // Node Buffer after the ZIP has passed the bounded preflight above.
    await workbook.xlsx.load(buffer as never);
    return workbook;
  }

  await workbook.csv.read(Readable.from(buffer));
  return workbook;
}

function detectFileType(fileName: string, buffer: Buffer): "xlsx" | "csv" {
  const extension = fileName.toLowerCase().split(".").pop();
  if (extension === "xlsx") {
    if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
      throw new DataFileParseError("Invalid XLSX signature", [
        parseIssue("_file", "INVALID_SIGNATURE", "The file extension is XLSX but the ZIP signature is missing"),
      ]);
    }
    return "xlsx";
  }
  if (extension === "csv") {
    if (buffer.includes(0)) {
      throw new DataFileParseError("Invalid CSV content", [
        parseIssue("_file", "BINARY_CSV", "CSV uploads must be plain UTF-8 text"),
      ]);
    }
    return "csv";
  }
  throw new DataFileParseError("Unsupported file type", [
    parseIssue("_file", "UNSUPPORTED_FILE", "Only .xlsx and .csv files are accepted"),
  ]);
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  if (buffer.length < 22) return -1;
  const minimumOffset = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= minimumOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  return -1;
}

export function preflightXlsxArchive(buffer: Buffer): void {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  if (eocdOffset < 0) {
    throw new DataFileParseError("Invalid XLSX archive", [
      parseIssue("_file", "ZIP_DIRECTORY_MISSING", "The XLSX central directory is missing"),
    ]);
  }
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const directorySize = buffer.readUInt32LE(eocdOffset + 12);
  const directoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  if (entryCount === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) {
    throw new DataFileParseError("ZIP64 workbooks are not accepted", [
      parseIssue("_file", "ZIP64_NOT_ALLOWED", "Use a normal XLSX workbook within the documented limits"),
    ]);
  }
  if (entryCount < 1 || entryCount > MAX_ZIP_ENTRIES || directoryOffset + directorySize > buffer.length) {
    throw new DataFileParseError("XLSX archive limits are invalid", [
      parseIssue("_file", "ZIP_DIRECTORY_LIMIT", `XLSX archives may contain at most ${MAX_ZIP_ENTRIES} entries`),
    ]);
  }

  let offset = directoryOffset;
  let totalUncompressed = 0;
  const entryNames = new Set<string>();
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new DataFileParseError("Invalid XLSX central directory entry", [
        parseIssue("_file", "ZIP_ENTRY_INVALID", "The XLSX central directory is malformed"),
      ]);
    }
    const flags = buffer.readUInt16LE(offset + 8);
    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressed = buffer.readUInt32LE(offset + 20);
    const uncompressed = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const nextOffset = offset + 46 + nameLength + extraLength + commentLength;
    if (nextOffset > buffer.length) {
      throw new DataFileParseError("Invalid XLSX entry length", [
        parseIssue("_file", "ZIP_ENTRY_INVALID", "An XLSX entry exceeds the archive boundary"),
      ]);
    }
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    const lowerName = name.toLowerCase().replaceAll("\\", "/");
    if (
      (flags & 0x1) !== 0 ||
      (flags & 0x8) !== 0 ||
      lowerName.startsWith("/") ||
      lowerName.includes("../") ||
      lowerName.includes("\0")
    ) {
      throw new DataFileParseError("Unsafe XLSX archive entry", [
        parseIssue("_file", "ZIP_ENTRY_UNSAFE", `Unsafe or encrypted XLSX entry: ${name}`),
      ]);
    }
    if (entryNames.has(lowerName)) {
      throw new DataFileParseError("Duplicate XLSX archive entry", [
        parseIssue("_file", "ZIP_DUPLICATE_ENTRY", `Duplicate XLSX entry: ${name}`),
      ]);
    }
    entryNames.add(lowerName);
    if (BLOCKED_XLSX_PATHS.some((blocked) => lowerName === blocked || lowerName.startsWith(blocked))) {
      throw new DataFileParseError("Active XLSX content is not accepted", [
        parseIssue("_file", "ACTIVE_CONTENT_NOT_ALLOWED", `Macros, external links, connections, and embedded content are blocked (${name})`),
      ]);
    }
    totalUncompressed += uncompressed;
    const ratio = compressed === 0 ? (uncompressed === 0 ? 1 : Number.POSITIVE_INFINITY) : uncompressed / compressed;
    if (
      uncompressed > MAX_ZIP_ENTRY_UNCOMPRESSED_BYTES ||
      totalUncompressed > MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES ||
      ratio > MAX_ZIP_COMPRESSION_RATIO
    ) {
      throw new DataFileParseError("XLSX decompression limits exceeded", [
        parseIssue("_file", "ZIP_BOMB_LIMIT", `XLSX entry '${name}' exceeds decompression limits`),
      ]);
    }
    if (compressionMethod !== 0 && compressionMethod !== 8) {
      throw new DataFileParseError("Unsupported XLSX compression", [
        parseIssue("_file", "ZIP_COMPRESSION_METHOD", `Unsupported compression method for '${name}'`),
      ]);
    }
    if (localHeaderOffset + 30 > directoryOffset || buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
      throw new DataFileParseError("Invalid XLSX local header", [
        parseIssue("_file", "ZIP_LOCAL_HEADER", `Invalid local header for '${name}'`),
      ]);
    }
    const localFlags = buffer.readUInt16LE(localHeaderOffset + 6);
    const localMethod = buffer.readUInt16LE(localHeaderOffset + 8);
    const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
    if (localFlags !== flags || localMethod !== compressionMethod || dataOffset + compressed > directoryOffset) {
      throw new DataFileParseError("Inconsistent XLSX entry metadata", [
        parseIssue("_file", "ZIP_LOCAL_MISMATCH", `Local and central metadata differ for '${name}'`),
      ]);
    }
    const compressedSlice = buffer.subarray(dataOffset, dataOffset + compressed);
    let measuredLength = 0;
    try {
      measuredLength = compressionMethod === 0
        ? compressedSlice.length
        : inflateRawSync(compressedSlice, { maxOutputLength: MAX_ZIP_ENTRY_UNCOMPRESSED_BYTES }).length;
    } catch {
      throw new DataFileParseError("XLSX entry could not be safely inflated", [
        parseIssue("_file", "ZIP_INFLATE_FAILED", `Entry '${name}' is corrupt or exceeds the inflate limit`),
      ]);
    }
    if (measuredLength !== uncompressed) {
      throw new DataFileParseError("XLSX entry size mismatch", [
        parseIssue("_file", "ZIP_SIZE_MISMATCH", `Declared and measured sizes differ for '${name}'`),
      ]);
    }
    offset = nextOffset;
  }
  if (offset !== directoryOffset + directorySize) {
    throw new DataFileParseError("Unexpected XLSX directory data", [
      parseIssue("_file", "ZIP_DIRECTORY_MISMATCH", "The XLSX directory size does not match its entries"),
    ]);
  }
}

export async function parseUploadedDataFile(input: {
  fileName: string;
  buffer: Buffer;
  csvModule?: string | null;
}): Promise<ParsedDataFile> {
  const { fileName, buffer } = input;
  if (buffer.length === 0 || buffer.length > MAX_UPLOAD_BYTES) {
    throw new DataFileParseError("Upload size is invalid", [
      parseIssue("_file", "FILE_SIZE", `Files must contain data and be no larger than ${MAX_UPLOAD_BYTES} bytes`),
    ]);
  }

  const sourceHash = createHash("sha256").update(buffer).digest("hex");
  const fileType = detectFileType(fileName, buffer);
  if (fileType === "xlsx") preflightXlsxArchive(buffer);
  const workbook = await loadWorkbook(buffer, fileType);
  if (workbook.worksheets.length < 1 || workbook.worksheets.length > MAX_SHEETS) {
    throw new DataFileParseError("Workbook sheet count is invalid", [
      parseIssue("_file", "SHEET_LIMIT", `Workbooks must contain 1-${MAX_SHEETS} worksheets`),
    ]);
  }

  let manifest: Record<string, string> = {};
  const rows: ParsedDataRow[] = [];
  const modules = new Set<DataModuleName>();

  if (fileType === "csv") {
    const normalizedModule = normalizeSheetName(input.csvModule || "");
    if (!isDataModuleName(normalizedModule)) {
      throw new DataFileParseError("CSV module is required", [
        parseIssue("_file", "CSV_MODULE_REQUIRED", "Select the allowlisted module represented by this CSV file"),
      ]);
    }
    const worksheet = workbook.worksheets[0];
    rows.push(...readModuleWorksheet(worksheet, normalizedModule));
    modules.add(normalizedModule);
  } else {
    for (const worksheet of workbook.worksheets) {
      const normalizedName = normalizeSheetName(worksheet.name);
      if (normalizedName === "_manifest") {
        manifest = readManifest(worksheet);
        continue;
      }
      if (!isDataModuleName(normalizedName)) {
        throw new DataFileParseError("Unknown worksheet", [
          parseIssue(normalizedName || worksheet.name, "UNKNOWN_SHEET", `Worksheet '${worksheet.name}' is not an allowlisted data module`, {
            sheet: worksheet.name,
          }),
        ]);
      }
      rows.push(...readModuleWorksheet(worksheet, normalizedName));
      modules.add(normalizedName);
    }
  }

  if (rows.length > MAX_TOTAL_ROWS) {
    throw new DataFileParseError("Workbook row limit exceeded", [
      parseIssue("_file", "TOTAL_ROW_LIMIT", `A workbook may contain at most ${MAX_TOTAL_ROWS} data rows`),
    ]);
  }
  if (modules.size === 0) {
    throw new DataFileParseError("No import modules found", [
      parseIssue("_file", "NO_MODULES", "The file does not contain any supported data module"),
    ]);
  }

  const schemaVersion = manifest.schema_version ? Number(manifest.schema_version) : DATA_TRANSFER_SCHEMA_VERSION;
  if (schemaVersion !== DATA_TRANSFER_SCHEMA_VERSION) {
    throw new DataFileParseError("Unsupported schema version", [
      parseIssue("_manifest", "SCHEMA_VERSION", `Expected schema version ${DATA_TRANSFER_SCHEMA_VERSION}, received ${manifest.schema_version}`),
    ]);
  }

  return {
    schemaVersion,
    source: manifest.source || "manual-upload",
    generatedAt: manifest.generated_at || null,
    fileName,
    fileType,
    sourceHash,
    rows,
    modules: [...modules],
  };
}
