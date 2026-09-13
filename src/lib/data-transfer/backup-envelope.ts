import {
  DATA_TRANSFER_SCHEMA_VERSION,
  isDataScope,
  type BackupEnvelope,
  type DataTransferIssueInput,
} from "./contracts.ts";
import { calculateBackupHash } from "./backup-integrity.ts";

function backupIssue(code: string, message: string): DataTransferIssueInput {
  return { module: "_backup", severity: "ERROR", code, message };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

export function decodeBackupEnvelope(
  buffer: Buffer,
  maximumBytes: number,
): { envelope: BackupEnvelope | null; issues: DataTransferIssueInput[] } {
  const issues: DataTransferIssueInput[] = [];
  if (buffer.length === 0 || buffer.length > maximumBytes) {
    return { envelope: null, issues: [backupIssue("BACKUP_SIZE", `Backup must be between 1 and ${maximumBytes} bytes`)] };
  }
  let value: unknown;
  try { value = JSON.parse(buffer.toString("utf8")); }
  catch { return { envelope: null, issues: [backupIssue("BACKUP_JSON", "Backup is not valid UTF-8 JSON")] }; }
  if (!isPlainRecord(value)) return { envelope: null, issues: [backupIssue("BACKUP_SHAPE", "Backup root must be an object")] };
  const envelope = value as unknown as BackupEnvelope;
  if (envelope.format !== "HATAB_ERP_LOGICAL_BACKUP") issues.push(backupIssue("BACKUP_FORMAT", "Unsupported backup format"));
  if (envelope.schemaVersion !== DATA_TRANSFER_SCHEMA_VERSION) issues.push(backupIssue("BACKUP_VERSION", `Expected schema version ${DATA_TRANSFER_SCHEMA_VERSION}`));
  if (!isDataScope(String(envelope.scope))) issues.push(backupIssue("BACKUP_SCOPE", "Unknown backup scope"));
  if (envelope.restoreMode !== "MERGE_NO_DELETE") issues.push(backupIssue("BACKUP_MODE", "Only MERGE_NO_DELETE backups are accepted"));
  if (!envelope.createdAt || Number.isNaN(Date.parse(envelope.createdAt))) issues.push(backupIssue("BACKUP_DATE", "createdAt is invalid"));
  if (!/^[a-f0-9]{64}$/i.test(String(envelope.sourceHash))) issues.push(backupIssue("BACKUP_HASH", "sourceHash must be a SHA-256 digest"));
  else if (calculateBackupHash(envelope) !== envelope.sourceHash) issues.push(backupIssue("BACKUP_HASH", "Backup integrity hash does not match its content"));
  if (!isPlainRecord(envelope.data)) issues.push(backupIssue("BACKUP_DATA", "Portable data payload is missing"));
  if (!isPlainRecord(envelope.records)) issues.push(backupIssue("BACKUP_RECORDS", "Lossless records payload is missing"));
  if (!isPlainRecord(envelope.bindings)) issues.push(backupIssue("BACKUP_BINDINGS", "Stable identity bindings are missing"));
  if (!isPlainRecord(envelope.counts)) issues.push(backupIssue("BACKUP_COUNTS", "Record counts are missing"));
  return { envelope: issues.length ? null : envelope, issues };
}
