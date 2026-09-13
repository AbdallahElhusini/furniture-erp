import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

const files = [
  "dev.db",
  ...walk("backups").filter((file) => file.toLowerCase().endsWith(".db")),
];

for (const file of files) {
  const db = new Database(file, { readonly: true });
  const tables = new Set(
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name),
  );
  const count = (table) =>
    tables.has(table) ? db.prepare(`SELECT COUNT(*) AS total FROM "${table}"`).get().total : null;

  console.log(
    JSON.stringify({
      file,
      catalogItems: count("CatalogItem"),
      activeCatalogItems: tables.has("CatalogItem")
        ? db.prepare('SELECT COUNT(*) AS total FROM "CatalogItem" WHERE "isActive" = 1').get().total
        : null,
      productAssets: count("ProductAsset"),
      collections: count("Collection"),
      collectionLinks: count("_CatalogItemToCollection"),
    }),
  );
  db.close();
}
