import assert from "node:assert/strict";
import { scryptSync, timingSafeEqual } from "node:crypto";
import { createRequire } from "node:module";
import test from "node:test";

import Database from "better-sqlite3";

const require = createRequire(import.meta.url);
const {
  CANONICAL_ADMIN_EMAIL,
  generateTemporaryPassword,
  resetCanonicalAdmin,
} = require("../reset-admin.js");

function verifyPassword(password, storedHash) {
  const [algorithm, cost, blockSize, parallelization, salt, encodedHash] =
    storedHash.split("$");
  assert.equal(algorithm, "scrypt");

  const expected = Buffer.from(encodedHash, "base64url");
  const actual = scryptSync(password, salt, expected.length, {
    N: Number(cost),
    r: Number(blockSize),
    p: Number(parallelization),
    maxmem: 64 * 1024 * 1024,
  });

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

test("admin reset changes only the canonical account and forces password rotation", () => {
  const database = new Database(":memory:");
  database.exec(`
    create table User (
      id integer primary key autoincrement,
      name text not null,
      email text not null unique,
      password text not null,
      role text not null,
      isActive integer not null,
      mustChangePassword integer not null,
      createdAt text not null
    );
  `);

  const insert = database.prepare(
    `insert into User
      (name, email, password, role, isActive, mustChangePassword, createdAt)
     values (?, ?, ?, ?, ?, ?, datetime('now'))`,
  );
  insert.run("Canonical", CANONICAL_ADMIN_EMAIL, "old-hash", "DESIGNER", 0, 0);
  insert.run("Legacy", "admin@admin.com", "leave-unchanged", "ADMIN", 1, 1);

  const temporaryPassword = generateTemporaryPassword();
  const legacyBefore = database
    .prepare("select * from User where email = ?")
    .get("admin@admin.com");

  resetCanonicalAdmin(database, temporaryPassword);

  const canonical = database
    .prepare("select * from User where email = ?")
    .get(CANONICAL_ADMIN_EMAIL);
  const legacyAfter = database
    .prepare("select * from User where email = ?")
    .get("admin@admin.com");

  assert.equal(canonical.role, "ADMIN");
  assert.equal(canonical.isActive, 1);
  assert.equal(canonical.mustChangePassword, 1);
  assert.equal(verifyPassword(temporaryPassword, canonical.password), true);
  assert.deepEqual(legacyAfter, legacyBefore);
  database.close();
});

test("admin reset refuses to create a missing canonical account", () => {
  const database = new Database(":memory:");
  database.exec(`
    create table User (
      id integer primary key autoincrement,
      name text not null,
      email text not null unique,
      password text not null,
      role text not null,
      isActive integer not null,
      mustChangePassword integer not null,
      createdAt text not null
    );
  `);

  assert.throws(
    () => resetCanonicalAdmin(database, generateTemporaryPassword()),
    /was not found; no account was changed/,
  );
  assert.equal(database.prepare("select count(*) as count from User").get().count, 0);
  database.close();
});

test("generated temporary passwords meet the ERP policy shape", () => {
  const password = generateTemporaryPassword();

  assert.ok(password.length >= 32);
  assert.match(password, /[a-z]/);
  assert.match(password, /[A-Z]/);
  assert.match(password, /\d/);
  assert.match(password, /[^A-Za-z0-9]/);
});

test("admin reset invalidates sessions when session fields are available", () => {
  const database = new Database(":memory:");
  database.exec(`
    create table User (
      id integer primary key autoincrement,
      name text not null,
      email text not null unique,
      password text not null,
      role text not null,
      isActive integer not null,
      mustChangePassword integer not null,
      sessionVersion integer not null default 1,
      passwordChangedAt text,
      createdAt text not null
    );
    insert into User
      (name, email, password, role, isActive, mustChangePassword, sessionVersion, createdAt)
    values
      ('Canonical', 'admin@hatab.local', 'old-hash', 'ADMIN', 1, 0, 7, datetime('now'));
  `);

  resetCanonicalAdmin(database, generateTemporaryPassword());

  const canonical = database
    .prepare("select sessionVersion, passwordChangedAt from User where email = ?")
    .get(CANONICAL_ADMIN_EMAIL);
  assert.equal(canonical.sessionVersion, 8);
  assert.ok(canonical.passwordChangedAt);
  database.close();
});
