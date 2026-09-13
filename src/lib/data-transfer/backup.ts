import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import {
  DATA_TRANSFER_SCHEMA_VERSION,
  MAX_BACKUP_RECORDS,
  MAX_BACKUP_UPLOAD_BYTES,
  SCOPE_MODULES,
  type ActorIdentity,
  type BackupEnvelope,
  type DataScope,
} from "./contracts";
import { exportTrustedSnapshot } from "./data-source";
import { calculateBackupHash } from "./backup-integrity";

export { calculateBackupHash } from "./backup-integrity";

export interface BackupArtifact {
  jobId: number;
  fileName: string;
  absolutePath: string;
  buffer: Buffer;
  envelope: BackupEnvelope;
}

function backupDirectory(): string {
  const configured = process.env.DATA_BACKUP_DIR?.trim();
  return configured ? path.resolve(configured) : path.resolve(process.cwd(), ".data-backups");
}

function artifactName(scope: DataScope, createdAt: string, sourceHash: string): string {
  const timestamp = createdAt.replace(/[:.]/g, "-");
  return `hatab-${scope.toLowerCase()}-${timestamp}-${sourceHash.slice(0, 12)}.json`;
}

async function persistArtifact(fileName: string, buffer: Buffer): Promise<string> {
  const directory = backupDirectory();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const safeName = path.basename(fileName);
  const target = path.join(directory, safeName);
  const temporary = path.join(directory, `.${safeName}.${randomUUID()}.tmp`);
  await writeFile(temporary, buffer, { flag: "wx", mode: 0o600 });
  await rename(temporary, target);
  return target;
}

export async function createBackupArtifact(input: {
  scope: DataScope;
  actor: ActorIdentity;
  reason: "MANUAL" | "PRE_IMPORT" | "PRE_RESTORE" | "PRE_ASSISTANT";
}): Promise<BackupArtifact> {
  const job = await prisma.dataTransferJob.create({
    data: {
      schemaVersion: DATA_TRANSFER_SCHEMA_VERSION,
      kind: "BACKUP",
      scope: input.scope,
      status: "VALIDATING",
      actorId: input.actor.id,
      actorEmail: input.actor.email,
      summary: JSON.stringify({ reason: input.reason }),
    },
  });

  try {
    const snapshot = await exportTrustedSnapshot(SCOPE_MODULES[input.scope]);
    const counts = Object.fromEntries(
      SCOPE_MODULES[input.scope].map((module) => [module, snapshot.records[module]?.length ?? 0]),
    );
    const withoutHash: Omit<BackupEnvelope, "sourceHash"> = {
      format: "HATAB_ERP_LOGICAL_BACKUP",
      schemaVersion: DATA_TRANSFER_SCHEMA_VERSION,
      scope: input.scope,
      createdAt: new Date().toISOString(),
      restoreMode: "MERGE_NO_DELETE",
      counts,
      data: snapshot.portable,
      records: snapshot.records,
      bindings: snapshot.bindings,
    };
    const sourceHash = calculateBackupHash(withoutHash);
    const envelope: BackupEnvelope = { ...withoutHash, sourceHash };
    const buffer = Buffer.from(`${JSON.stringify(envelope, null, 2)}\n`, "utf8");
    const rowCount = Object.values(counts).reduce((sum, count) => sum + count, 0);
    if (rowCount > MAX_BACKUP_RECORDS) throw new Error(`Backup exceeds the restorable ${MAX_BACKUP_RECORDS} record limit`);
    if (buffer.length > MAX_BACKUP_UPLOAD_BYTES) throw new Error(`Backup exceeds the restorable ${MAX_BACKUP_UPLOAD_BYTES} byte limit`);
    const fileName = artifactName(input.scope, envelope.createdAt, sourceHash);
    const absolutePath = await persistArtifact(fileName, buffer);
    await prisma.dataTransferJob.update({
      where: { id: job.id },
      data: {
        status: "SUCCESS",
        sourceHash,
        rowCount,
        resultName: fileName,
        summary: JSON.stringify({
          reason: input.reason,
          counts,
          restoreMode: envelope.restoreMode,
          artifact: fileName,
        }),
        completedAt: new Date(),
      },
    });
    return { jobId: job.id, fileName, absolutePath, buffer, envelope };
  } catch (error) {
    await prisma.dataTransferJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        errorCount: 1,
        errors: JSON.stringify([{
          code: "BACKUP_FAILED",
          message: error instanceof Error ? error.message : "Backup failed",
        }]),
        completedAt: new Date(),
      },
    });
    throw error;
  }
}
