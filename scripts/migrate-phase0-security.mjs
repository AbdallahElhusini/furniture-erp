import { randomBytes, scryptSync } from "node:crypto";
import path from "node:path";
import Database from "better-sqlite3";

const configuredUrl = process.env.DATABASE_URL || "file:./dev.db";
if (!configuredUrl.startsWith("file:")) {
  throw new Error("security:migrate currently supports file: SQLite databases only");
}

const databasePath = path.resolve(process.cwd(), configuredUrl.slice(5));
const database = new Database(databasePath);
const columns = database.prepare("pragma table_info(User)").all();

if (!columns.some((column) => column.name === "mustChangePassword")) {
  database.exec(
    "ALTER TABLE User ADD COLUMN mustChangePassword BOOLEAN NOT NULL DEFAULT true",
  );
}

const users = database.prepare("select id, password from User").all();
const update = database.prepare(
  "update User set password = ?, mustChangePassword = 1 where id = ?",
);

const migrate = database.transaction(() => {
  for (const user of users) {
    if (user.password.startsWith("scrypt$")) continue;

    const salt = randomBytes(16).toString("base64url");
    const hash = scryptSync(user.password, salt, 64, {
      N: 16_384,
      r: 8,
      p: 1,
      maxmem: 64 * 1024 * 1024,
    }).toString("base64url");

    update.run(["scrypt", 16_384, 8, 1, salt, hash].join("$"), user.id);
  }
});

migrate();
const plaintextRemaining = database
  .prepare("select count(*) as count from User where password not like ?")
  .get("scrypt%$%$%$%$%")?.count;
database.close();

console.log({ usersChecked: users.length, plaintextRemaining });
