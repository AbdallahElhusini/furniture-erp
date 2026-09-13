import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import {
  EXTERNAL_KEY_TABLES,
  loadProjectDatabaseUrl,
  migrateDatabaseFile,
  migrateDataManagement,
  resolveDatabasePath,
} from "../scripts/migrate-data-management.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
// Keep migration tests pinned to an immutable pre-migration fixture. The live
// development database is intentionally migrated in place, so using it as the
// legacy source makes this suite order-dependent after a successful rollout.
const sourceDatabase = path.join(
  projectRoot,
  "backups",
  "manual",
  "pre-data-management-2026-08-25.db",
);

function temporaryDatabase(name) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hatab-data-migration-"));
  const target = path.join(directory, name);
  fs.copyFileSync(sourceDatabase, target);
  return { directory, target };
}

function removeTemporaryDirectory(directory) {
  const resolved = path.resolve(directory);
  const temporaryRoot = path.resolve(os.tmpdir());
  if (
    path.dirname(resolved) !== temporaryRoot ||
    !path.basename(resolved).startsWith("hatab-data-migration-")
  ) {
    throw new Error(`Refusing to remove an unexpected test directory: ${resolved}`);
  }
  fs.rmSync(resolved, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
}

function tableNames(database) {
  return database
    .prepare(
      `select name from sqlite_master
       where type = 'table' and name not like 'sqlite_%'
       order by name`,
    )
    .all()
    .map((row) => row.name);
}

function schemaFingerprint(database) {
  const schema = database
    .prepare(
      `select type, name, tbl_name as tableName, sql
       from sqlite_master
       where name not like 'sqlite_%'
       order by type, name`,
    )
    .all();
  return createHash("sha256").update(JSON.stringify(schema)).digest("hex");
}

function indexNames(database) {
  return database
    .prepare(
      `select name from sqlite_master
       where type = 'index' and name not like 'sqlite_%'
       order by name`,
    )
    .all()
    .map((row) => row.name);
}

function columnDefinition(database, tableName, columnName) {
  return database
    .prepare(`pragma table_info("${tableName.replaceAll('"', '""')}")`)
    .all()
    .find((column) => column.name === columnName);
}

function columns(database, tableName) {
  return database
    .prepare(`pragma table_info("${tableName.replaceAll('"', '""')}")`)
    .all()
    .map((column) => column.name);
}

function originalTableFingerprints(database) {
  const result = new Map();
  for (const tableName of tableNames(database)) {
    const originalColumns = columns(database, tableName);
    const selected = originalColumns
      .map((column) => `"${column.replaceAll('"', '""')}"`)
      .join(", ");
    const rows = database
      .prepare(
        `select ${selected} from "${tableName.replaceAll('"', '""')}" order by rowid`,
      )
      .all();
    result.set(tableName, {
      columns: originalColumns,
      count: rows.length,
      hash: createHash("sha256").update(JSON.stringify(rows)).digest("hex"),
    });
  }
  return result;
}

function assertOriginalDataUnchanged(database, before) {
  for (const [tableName, fingerprint] of before) {
    const selected = fingerprint.columns
      .map((column) => `"${column.replaceAll('"', '""')}"`)
      .join(", ");
    const rows = database
      .prepare(
        `select ${selected} from "${tableName.replaceAll('"', '""')}" order by rowid`,
      )
      .all();
    assert.equal(rows.length, fingerprint.count, `${tableName} row count changed`);
    assert.equal(
      createHash("sha256").update(JSON.stringify(rows)).digest("hex"),
      fingerprint.hash,
      `${tableName} legacy data changed`,
    );
  }
}

test("data-management migration preserves the real legacy database and is idempotent", (context) => {
  assert.equal(fs.existsSync(sourceDatabase), true, "The real legacy dev.db fixture is required");
  const { directory, target } = temporaryDatabase("legacy-copy.db");
  context.after(() => removeTemporaryDirectory(directory));
  const database = new Database(target);
  database.pragma("foreign_keys = ON");
  const before = originalTableFingerprints(database);

  const first = migrateDataManagement(database);
  const second = migrateDataManagement(database);
  assert.ok(first.addedColumns >= EXTERNAL_KEY_TABLES.length + 2);
  assert.equal(second.addedColumns, 0);
  assertOriginalDataUnchanged(database, before);

  for (const tableName of EXTERNAL_KEY_TABLES) {
    assert.ok(columns(database, tableName).includes("externalKey"));
  }
  assert.ok(columns(database, "User").includes("sessionVersion"));
  assert.ok(columns(database, "User").includes("passwordChangedAt"));
  for (const tableName of [
    "DataTransferJob",
    "DataTransferIssue",
    "DataChangeAudit",
    "SiteContent",
  ]) {
    assert.ok(tableNames(database).includes(tableName));
  }
  const expectedIndexes = [
    ...EXTERNAL_KEY_TABLES.map((tableName) => `${tableName}_externalKey_key`),
    "OrderItem_supplierOrderId_projectItemId_key",
    "DataTransferJob_idempotencyKey_key",
    "DataTransferJob_kind_status_idx",
    "DataTransferJob_sourceHash_idx",
    "DataTransferJob_createdAt_idx",
    "DataTransferIssue_jobId_severity_idx",
    "DataTransferIssue_module_code_idx",
    "DataChangeAudit_jobId_module_idx",
    "DataChangeAudit_module_recordKey_idx",
    "SiteContent_key_key",
    "SiteContent_group_sortOrder_idx",
    "SiteContent_type_idx",
    "SiteContent_isActive_idx",
  ];
  const migratedIndexes = new Set(indexNames(database));
  for (const indexName of expectedIndexes) {
    assert.ok(migratedIndexes.has(indexName), `missing index ${indexName}`);
  }
  assert.deepEqual(
    {
      type: columnDefinition(database, "DataTransferJob", "status").type,
      notNull: columnDefinition(database, "DataTransferJob", "status").notnull,
      defaultValue: columnDefinition(database, "DataTransferJob", "status").dflt_value,
    },
    { type: "TEXT", notNull: 1, defaultValue: "'PENDING'" },
  );
  assert.deepEqual(
    database
      .prepare('pragma foreign_key_list("DataTransferIssue")')
      .all()
      .map((foreignKey) => ({
        table: foreignKey.table,
        from: foreignKey.from,
        to: foreignKey.to,
        onUpdate: foreignKey.on_update,
        onDelete: foreignKey.on_delete,
      })),
    [
      {
        table: "DataTransferJob",
        from: "jobId",
        to: "id",
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
    ],
  );
  database.close();

  const prismaSmokeScript = `
    import { PrismaClient } from "@prisma/client";
    import { PrismaLibSql } from "@prisma/adapter-libsql";
    const normalizedPath = process.env.HATAB_TEST_DB.replaceAll("\\\\", "/");
    const prisma = new PrismaClient({ adapter: new PrismaLibSql({ url: "file:" + normalizedPath }) });
    try {
      const result = {
        clients: await prisma.client.count(),
        jobs: await prisma.dataTransferJob.count(),
        content: await prisma.siteContent.count(),
        users: await prisma.user.findMany({ select: { sessionVersion: true } }),
      };
      process.stdout.write(JSON.stringify(result));
    } finally {
      await prisma.$disconnect();
    }
  `;
  const smoke = spawnSync(
    process.execPath,
    ["--input-type=module", "--eval", prismaSmokeScript],
    {
      cwd: projectRoot,
      env: { ...process.env, HATAB_TEST_DB: target },
      encoding: "utf8",
      timeout: 20_000,
    },
  );
  assert.equal(smoke.status, 0, smoke.stderr || "Prisma smoke process failed");
  const smokeResult = JSON.parse(smoke.stdout);
  assert.equal(smokeResult.clients, before.get("Client").count);
  assert.equal(smokeResult.jobs, 0);
  assert.equal(smokeResult.content, 0);
  assert.ok(smokeResult.users.every((user) => user.sessionVersion === 1));
});

test("migration aborts before any schema change when duplicate order links exist", (context) => {
  const { directory, target } = temporaryDatabase("duplicate-copy.db");
  context.after(() => removeTemporaryDirectory(directory));
  const database = new Database(target);
  database.pragma("foreign_keys = OFF");
  database
    .prepare(
      `insert into "OrderItem" ("supplierOrderId", "projectItemId", "quantity")
       values (?, ?, ?)`,
    )
    .run(987654, 987654, 1);
  database
    .prepare(
      `insert into "OrderItem" ("supplierOrderId", "projectItemId", "quantity")
       values (?, ?, ?)`,
    )
    .run(987654, 987654, 2);

  assert.throws(() => migrateDataManagement(database), /duplicate supplierOrderId\/projectItemId/);
  assert.equal(columns(database, "Client").includes("externalKey"), false);
  assert.equal(tableNames(database).includes("DataTransferJob"), false);
  database.close();
});

test("preflight rejects new tables missing indexed or non-indexed fields without mutation", async (context) => {
  for (const scenario of [
    {
      name: "indexed sourceHash",
      prepare(database) {
        database.exec('drop index "DataTransferJob_sourceHash_idx"');
        database.exec('alter table "DataTransferJob" drop column "sourceHash"');
      },
    },
    {
      name: "non-indexed resultName",
      prepare(database) {
        database.exec('alter table "DataTransferJob" drop column "resultName"');
      },
    },
  ]) {
    await context.test(scenario.name, (subtest) => {
      const { directory, target } = temporaryDatabase(
        `${scenario.name.replaceAll(" ", "-")}.db`,
      );
      subtest.after(() => removeTemporaryDirectory(directory));
      const database = new Database(target);
      database.pragma("foreign_keys = ON");
      migrateDataManagement(database);
      scenario.prepare(database);
      const beforeSchema = schemaFingerprint(database);

      assert.throws(
        () => migrateDataManagement(database),
        /Incompatible partial DataTransferJob|Incompatible schema for DataTransferJob/,
      );
      assert.equal(schemaFingerprint(database), beforeSchema);
      database.close();
    });
  }
});

test("preflight rejects wrong new-table defaults, nullability, and foreign keys", async (context) => {
  await context.test("wrong default and nullability", (subtest) => {
    const { directory, target } = temporaryDatabase("wrong-default.db");
    subtest.after(() => removeTemporaryDirectory(directory));
    const database = new Database(target);
    database.pragma("foreign_keys = ON");
    migrateDataManagement(database);
    database.exec(`
      drop table "SiteContent";
      create table "SiteContent" (
        "id" integer not null primary key autoincrement,
        "key" text not null,
        "group" text not null,
        "type" text not null default 'TEXT',
        "label" text not null,
        "valueAr" text,
        "valueEn" text,
        "mediaUrl" text,
        "altAr" text,
        "altEn" text,
        "linkUrl" text,
        "metadata" text,
        "isActive" boolean default 0,
        "sortOrder" integer not null default 0,
        "createdAt" datetime not null default current_timestamp,
        "updatedAt" datetime not null default current_timestamp
      );
      create unique index "SiteContent_key_key" on "SiteContent" ("key");
      create index "SiteContent_group_sortOrder_idx" on "SiteContent" ("group", "sortOrder");
      create index "SiteContent_type_idx" on "SiteContent" ("type");
      create index "SiteContent_isActive_idx" on "SiteContent" ("isActive");
    `);
    const beforeSchema = schemaFingerprint(database);
    assert.equal(columnDefinition(database, "SiteContent", "isActive").notnull, 0);
    assert.equal(columnDefinition(database, "SiteContent", "isActive").dflt_value, "0");
    assert.throws(
      () => migrateDataManagement(database),
      /Incompatible schema for SiteContent\.isActive/,
    );
    assert.equal(schemaFingerprint(database), beforeSchema);
    database.close();
  });

  await context.test("wrong foreign-key action", (subtest) => {
    const { directory, target } = temporaryDatabase("wrong-foreign-key.db");
    subtest.after(() => removeTemporaryDirectory(directory));
    const database = new Database(target);
    database.pragma("foreign_keys = ON");
    migrateDataManagement(database);
    database.exec(`
      drop table "DataTransferIssue";
      create table "DataTransferIssue" (
        "id" integer not null primary key autoincrement,
        "jobId" integer not null,
        "module" text not null,
        "sheet" text,
        "rowNumber" integer,
        "field" text,
        "severity" text not null default 'ERROR',
        "code" text not null,
        "message" text not null,
        "rawData" text,
        "createdAt" datetime not null default current_timestamp,
        constraint "DataTransferIssue_jobId_fkey"
          foreign key ("jobId") references "DataTransferJob" ("id")
          on delete restrict on update cascade
      );
      create index "DataTransferIssue_jobId_severity_idx"
        on "DataTransferIssue" ("jobId", "severity");
      create index "DataTransferIssue_module_code_idx"
        on "DataTransferIssue" ("module", "code");
    `);
    const beforeSchema = schemaFingerprint(database);
    assert.throws(
      () => migrateDataManagement(database),
      /Incompatible foreign keys for DataTransferIssue/,
    );
    assert.equal(schemaFingerprint(database), beforeSchema);
    database.close();
  });
});

test("preflight validates already-present legacy columns and named indexes", async (context) => {
  for (const scenario of [
    {
      name: "wrong externalKey declaration",
      prepare(database) {
        database.exec(
          'alter table "Client" add column "externalKey" integer not null default 0',
        );
      },
      expected: /Incompatible schema for Client\.externalKey/,
    },
    {
      name: "wrong User sessionVersion declaration",
      prepare(database) {
        database.exec(
          'alter table "User" add column "sessionVersion" text default \'1\'',
        );
      },
      expected: /Incompatible schema for User\.sessionVersion/,
    },
    {
      name: "wrong named index",
      prepare(database) {
        database.exec('alter table "Client" add column "externalKey" text');
        database.exec(
          'create unique index "Client_externalKey_key" on "Client" ("name")',
        );
      },
      expected: /Incompatible existing index Client_externalKey_key/,
    },
    {
      name: "wrong index collation and direction",
      prepare(database) {
        database.exec('alter table "Client" add column "externalKey" text');
        database.exec(
          'create unique index "Client_externalKey_key" on "Client" ("externalKey" collate nocase desc)',
        );
      },
      expected: /Incompatible existing index Client_externalKey_key/,
    },
  ]) {
    await context.test(scenario.name, (subtest) => {
      const { directory, target } = temporaryDatabase(
        `${scenario.name.replaceAll(" ", "-")}.db`,
      );
      subtest.after(() => removeTemporaryDirectory(directory));
      const database = new Database(target);
      scenario.prepare(database);
      const beforeSchema = schemaFingerprint(database);
      assert.throws(() => migrateDataManagement(database), scenario.expected);
      assert.equal(schemaFingerprint(database), beforeSchema);
      assert.equal(tableNames(database).includes("DataTransferJob"), false);
      database.close();
    });
  }
});

test("a post-DDL verification failure rolls the transaction back", (context) => {
  const { directory, target } = temporaryDatabase("rollback-copy.db");
  context.after(() => removeTemporaryDirectory(directory));
  const database = new Database(target);
  database.pragma("foreign_keys = OFF");
  database
    .prepare(
      `insert into "OrderItem" ("supplierOrderId", "projectItemId", "quantity")
       values (?, ?, ?)`,
    )
    .run(876543, 876543, 1);
  const beforeSchema = schemaFingerprint(database);
  const beforeData = originalTableFingerprints(database);
  database.pragma("foreign_keys = ON");

  assert.throws(() => migrateDataManagement(database), /foreign-key issue/);
  assert.equal(schemaFingerprint(database), beforeSchema);
  assertOriginalDataUnchanged(database, beforeData);
  assert.equal(columns(database, "Client").includes("externalKey"), false);
  assert.equal(tableNames(database).includes("DataTransferJob"), false);
  database.close();
});

test("project-root env targeting creates an intact pre-migration backup", async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hatab-data-migration-"));
  context.after(() => removeTemporaryDirectory(directory));
  const databaseDirectory = path.join(directory, "database files");
  fs.mkdirSync(databaseDirectory, { recursive: true });
  const target = path.join(databaseDirectory, "target db.db");
  fs.copyFileSync(sourceDatabase, target);
  fs.writeFileSync(
    path.join(directory, ".env"),
    'DATABASE_URL="file:./database%20files/target%20db.db"\n',
    { encoding: "utf8", flag: "wx" },
  );
  const source = new Database(target, { readonly: true });
  const before = originalTableFingerprints(source);
  source.close();

  const previousDatabaseUrl = process.env.DATABASE_URL;
  try {
    delete process.env.DATABASE_URL;
    const configuredUrl = loadProjectDatabaseUrl(directory);
    assert.equal(configuredUrl, "file:./database%20files/target%20db.db");
    const resolved = resolveDatabasePath(configuredUrl, directory);
    assert.equal(resolved, path.resolve(target));
    const result = await migrateDatabaseFile(resolved);
    assert.equal(result.databasePath, fs.realpathSync.native(target));
    assert.equal(fs.existsSync(result.backupPath), true);

    const backup = new Database(result.backupPath, {
      readonly: true,
      fileMustExist: true,
    });
    assert.equal(backup.pragma("integrity_check", { simple: true }), "ok");
    assertOriginalDataUnchanged(backup, before);
    assert.equal(columns(backup, "Client").includes("externalKey"), false);
    assert.equal(tableNames(backup).includes("DataTransferJob"), false);
    backup.close();

    const migrated = new Database(target, { readonly: true });
    assert.equal(columns(migrated, "Client").includes("externalKey"), true);
    assert.equal(tableNames(migrated).includes("DataTransferJob"), true);
    migrated.close();
  } finally {
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  }
});

test("database path resolver refuses remote and ephemeral database URLs", () => {
  assert.throws(() => resolveDatabasePath("libsql://example.invalid/db"), /file:/);
  assert.throws(() => resolveDatabasePath("file::memory:"), /persistent/);
  assert.throws(() => resolveDatabasePath(undefined, projectRoot), /required/);
  assert.throws(
    () => resolveDatabasePath("file:./dev.db?mode=ro", projectRoot),
    /directly/,
  );
  assert.match(
    resolveDatabasePath("file:./dev.db", projectRoot),
    /furniture-erp[\\/]dev\.db$/,
  );
  assert.equal(
    resolveDatabasePath("file:./data%20files/hatab%20erp.db", projectRoot),
    path.resolve(projectRoot, "data files", "hatab erp.db"),
  );
  if (process.platform === "win32") {
    const drive = path.parse(projectRoot).root.slice(0, 2);
    const expected = path.win32.resolve(`${drive}/migration paths/hatab erp.db`);
    assert.equal(
      resolveDatabasePath(`file:${drive}/migration%20paths/hatab%20erp.db`, projectRoot),
      expected,
    );
    assert.equal(
      resolveDatabasePath(`file:///${drive}/migration%20paths/hatab%20erp.db`, projectRoot),
      expected,
    );
  }
});
