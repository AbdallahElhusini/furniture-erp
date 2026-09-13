import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const databasePath = path.join(projectRoot, "dev.db");
const shouldApply = process.argv.includes("--apply");

const categoryMedia = {
  "operative-desks": "/images/editorial/sit-stand-motion.webp",
  "task-ergonomic-seating": "/images/editorial/mesh-detail.webp",
  "partitions-screens": "/images/editorial/acoustic-partitions.webp",
  "meeting-conference-tables": "/images/editorial/leather-boardroom.webp",
  "cabinets-storage": "/images/editorial/cabinets-storage.webp",
  "lounge-sofas": "/images/editorial/waiting-lounge.webp",
  "waiting-beam-seating": "/images/editorial/waiting-beam-seating.webp",
  "executive-desks": "/images/editorial/executive-stage.webp",
  "office-accessories": "/images/editorial/office-accessories.webp",
  "shelving-bookcases": "/images/editorial/home-office.webp",
  "conference-visitor-seating": "/images/editorial/smart-conference.webp",
  "counter-stools": "/images/editorial/counter-stools.webp",
  "reception-counters": "/images/editorial/reception-lounge.webp",
  "general-tables": "/images/editorial/multipurpose-tables.webp",
  "bench-workstations": "/images/editorial/operational-office.webp",
};

const collectionMedia = {
  "executive-office-suite": "/images/editorial/executive-stage.webp",
  "open-plan-workspace": "/images/editorial/open-learning.webp",
  "collaborative-meeting": "/images/editorial/huddle-room.webp",
  "reception-welcome": "/images/editorial/reception-lounge.webp",
  "focused-work": "/images/editorial/sit-stand-motion.webp",
  "warm-natural": "/images/editorial/boho-natural-workspace.webp",
};

const categoryMediaReplacements = [
  {
    slug: "lounge-sofas",
    fromImage: "/images/editorial/reception-lounge.webp",
    image: "/images/editorial/waiting-lounge.webp",
  },
  {
    slug: "waiting-beam-seating",
    fromImage: "/images/editorial/waiting-lounge.webp",
    image: "/images/editorial/waiting-beam-seating.webp",
  },
  {
    slug: "partitions-screens",
    fromImage: "/images/editorial/elevated-collaboration.webp",
    image: "/images/editorial/acoustic-partitions.webp",
  },
  {
    slug: "cabinets-storage",
    fromImage: "/images/editorial/home-office.webp",
    image: "/images/editorial/cabinets-storage.webp",
  },
  {
    slug: "office-accessories",
    fromImage: "/images/editorial/home-office.webp",
    image: "/images/editorial/office-accessories.webp",
  },
  {
    slug: "counter-stools",
    fromImage: "/images/editorial/elevated-collaboration.webp",
    image: "/images/editorial/counter-stools.webp",
  },
  {
    slug: "general-tables",
    fromImage: "/images/editorial/open-learning.webp",
    image: "/images/editorial/multipurpose-tables.webp",
  },
];

const collectionMediaReplacements = [
  {
    slug: "warm-natural",
    fromImage: "/images/editorial/home-office.webp",
    image: "/images/editorial/boho-natural-workspace.webp",
  },
];

if (!fs.existsSync(databasePath)) {
  throw new Error(`Database not found at ${databasePath}`);
}

for (const mediaPath of new Set([
  ...Object.values(categoryMedia),
  ...Object.values(collectionMedia),
])) {
  const absolutePath = path.join(
    projectRoot,
    "public",
    ...mediaPath.split("/").filter(Boolean),
  );
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Editorial media is missing: ${absolutePath}`);
  }
}

const db = new Database(databasePath);
db.pragma("foreign_keys = ON");

const categoryUpdate = db.prepare(`
  UPDATE "Category"
  SET "image" = @image
  WHERE "slug" = @slug
    AND ("image" IS NULL OR TRIM("image") = '')
`);
const collectionUpdate = db.prepare(`
  UPDATE "Collection"
  SET "image" = @image
  WHERE "slug" = @slug
    AND ("image" IS NULL OR TRIM("image") = '')
`);
const categoryReplacement = db.prepare(`
  UPDATE "Category"
  SET "image" = @image
  WHERE "slug" = @slug
    AND "image" = @fromImage
`);
const collectionReplacement = db.prepare(`
  UPDATE "Collection"
  SET "image" = @image
  WHERE "slug" = @slug
    AND "image" = @fromImage
`);

const applyBackfill = db.transaction(() => {
  let categories = 0;
  let collections = 0;
  for (const [slug, image] of Object.entries(categoryMedia)) {
    categories += categoryUpdate.run({ slug, image }).changes;
  }
  for (const replacement of categoryMediaReplacements) {
    categories += categoryReplacement.run(replacement).changes;
  }
  for (const [slug, image] of Object.entries(collectionMedia)) {
    collections += collectionUpdate.run({ slug, image }).changes;
  }
  for (const replacement of collectionMediaReplacements) {
    collections += collectionReplacement.run(replacement).changes;
  }
  return { categories, collections };
});

if (!shouldApply) {
  const categoryCount = db
    .prepare(`SELECT COUNT(*) AS count FROM "Category" WHERE "slug" IN (${Object.keys(categoryMedia).map(() => "?").join(", ")}) AND ("image" IS NULL OR TRIM("image") = '')`)
    .get(...Object.keys(categoryMedia)).count;
  const collectionCount = db
    .prepare(`SELECT COUNT(*) AS count FROM "Collection" WHERE "slug" IN (${Object.keys(collectionMedia).map(() => "?").join(", ")}) AND ("image" IS NULL OR TRIM("image") = '')`)
    .get(...Object.keys(collectionMedia)).count;
  console.log(`Dry run: ${categoryCount} categories and ${collectionCount} collections can receive editorial media.`);
  console.log("Run with --apply to write only currently empty image fields.");
} else {
  const result = applyBackfill();
  console.log(`Updated ${result.categories} category images and ${result.collections} collection images.`);
}

db.close();
