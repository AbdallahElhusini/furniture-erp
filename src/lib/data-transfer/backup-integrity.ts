import { createHash } from "node:crypto";
import type { BackupEnvelope } from "./contracts";

function canonicalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

export function calculateBackupHash(envelope: Omit<BackupEnvelope, "sourceHash"> | BackupEnvelope): string {
  const payload = Object.fromEntries(Object.entries(envelope).filter(([key]) => key !== "sourceHash"));
  return createHash("sha256").update(JSON.stringify(canonicalize(payload))).digest("hex");
}

