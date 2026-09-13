export interface StableKeySource {
  id: number;
  externalKey: string | null;
}

/** Collision-free, deterministic keys for legacy rows whose import key is null. */
export function allocateStableKeys(prefix: string, rows: readonly StableKeySource[]): Map<number, string> {
  const result = new Map<number, string>();
  const used = new Set(rows.flatMap((row) => row.externalKey ? [row.externalKey] : []));
  for (const row of [...rows].sort((left, right) => left.id - right.id)) {
    if (row.externalKey) {
      result.set(row.id, row.externalKey);
      continue;
    }
    const baseKey = `${prefix}-${row.id}`;
    let candidate = baseKey;
    let suffix = 1;
    while (used.has(candidate)) {
      candidate = `${baseKey}-AUTO-${suffix}`;
      suffix += 1;
    }
    used.add(candidate);
    result.set(row.id, candidate);
  }
  return result;
}

export function stableKeyMap(prefix: string, rows: readonly StableKeySource[]): Map<string, number> {
  return new Map([...allocateStableKeys(prefix, rows)].map(([id, key]) => [key, id]));
}

