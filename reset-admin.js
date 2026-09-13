/* eslint-disable @typescript-eslint/no-require-imports */

const path = require("node:path");
const fs = require("node:fs");
const { randomBytes, scryptSync } = require("node:crypto");
const Database = require("better-sqlite3");

const CANONICAL_ADMIN_EMAIL = "admin@hatab.local";
const DEFAULT_DATABASE_URL = "file:./dev.db";
const SCRYPT_COST = 16_384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_KEY_LENGTH = 64;

function generateTemporaryPassword() {
  // The random portion carries 256 bits of entropy. The suffix guarantees that
  // the generated value satisfies every group in the ERP password policy.
  return `${randomBytes(32).toString("base64url")}!Aa1`;
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(password, salt, SCRYPT_KEY_LENGTH, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION,
    maxmem: 64 * 1024 * 1024,
  }).toString("base64url");

  return [
    "scrypt",
    SCRYPT_COST,
    SCRYPT_BLOCK_SIZE,
    SCRYPT_PARALLELIZATION,
    salt,
    hash,
  ].join("$");
}

function resolveDatabasePath(configuredUrl = process.env.DATABASE_URL) {
  const databaseUrl = configuredUrl?.trim() || DEFAULT_DATABASE_URL;
  if (!databaseUrl.startsWith("file:")) {
    throw new Error("admin:reset supports local file: SQLite databases only");
  }

  const relativeOrAbsolutePath = databaseUrl.slice("file:".length);
  if (!relativeOrAbsolutePath || relativeOrAbsolutePath.includes("?")) {
    throw new Error("DATABASE_URL must point directly to a local SQLite file");
  }

  return path.resolve(process.cwd(), relativeOrAbsolutePath);
}

function resetCanonicalAdmin(database, temporaryPassword) {
  const passwordHash = hashPassword(temporaryPassword);
  const reset = database.transaction(() => {
    const existing = database
      .prepare("select id from User where email = ?")
      .get(CANONICAL_ADMIN_EMAIL);

    if (!existing) {
      throw new Error(
        `Canonical administrator ${CANONICAL_ADMIN_EMAIL} was not found; no account was changed`,
      );
    }

    const userColumns = new Set(
      database
        .prepare("pragma table_info(User)")
        .all()
        .map((column) => column.name),
    );
    const assignments = [
      "password = ?",
      "role = 'ADMIN'",
      "isActive = 1",
      "mustChangePassword = 1",
    ];
    if (userColumns.has("sessionVersion")) {
      assignments.push("sessionVersion = coalesce(sessionVersion, 0) + 1");
    }
    if (userColumns.has("passwordChangedAt")) {
      assignments.push("passwordChangedAt = datetime('now')");
    }

    const result = database
      .prepare(
        `update User set ${assignments.join(", ")} where email = ?`,
      )
      .run(passwordHash, CANONICAL_ADMIN_EMAIL);

    if (result.changes !== 1) {
      throw new Error("Administrator reset did not update exactly one account");
    }

    return existing.id;
  });

  return reset();
}

function main() {
  const temporaryPassword = generateTemporaryPassword();
  const databasePath = resolveDatabasePath();
  if (!fs.existsSync(databasePath)) {
    throw new Error(`SQLite database was not found at ${databasePath}; no file was created`);
  }
  const database = new Database(databasePath);

  try {
    resetCanonicalAdmin(database, temporaryPassword);
  } finally {
    database.close();
  }

  process.stdout.write(
    [
      `Administrator reset completed for ${CANONICAL_ADMIN_EMAIL}.`,
      "The account must change this password at /admin/security.",
      `Temporary password (shown once): ${temporaryPassword}`,
    ].join("\n") + "\n",
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown reset error";
    process.stderr.write(`Administrator reset failed: ${message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  CANONICAL_ADMIN_EMAIL,
  generateTemporaryPassword,
  hashPassword,
  resetCanonicalAdmin,
  resolveDatabasePath,
};
