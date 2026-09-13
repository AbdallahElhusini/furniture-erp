// Mechanical, reversible repair of the doubly Windows-1252-decoded UTF-8
// literals found in this one legacy page. Dry-run unless --apply is supplied.
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const file = path.join(root, "src/app/admin/projects/[id]/page.tsx");
const before = fs.readFileSync(file, "utf8");
const legacy = new TextDecoder("windows-1252");
const utf8 = new TextDecoder("utf-8", { fatal: true });
const reverse = new Map(Array.from({ length: 256 }, (_, byte) => [legacy.decode(Uint8Array.of(byte)), byte]));
const score = (line) => (line.match(/[ÃÂØÙ]/g) ?? []).length;
let changedLines = 0;
const after = before.split("\n").map((line) => {
  let value = line;
  for (let pass = 0; pass < 3 && score(value); pass++) {
    if ([...value].some((character) => !reverse.has(character))) break;
    try {
      const decoded = utf8.decode(Uint8Array.from([...value].map((character) => reverse.get(character))));
      if (legacy.decode(Buffer.from(decoded, "utf8")) !== value || decoded.length >= value.length) break;
      value = decoded;
    } catch { break; }
  }
  if (line !== value) changedLines++;
  return value;
}).join("\n");

const syntax = (source) => {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  if (parsed.parseDiagnostics.length) throw new Error("Source must parse cleanly before encoding repair");
  const visit = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isJsxText(node)) return [node.kind];
    return [node.kind, ts.isIdentifier(node) ? node.text : ts.isNumericLiteral(node) ? node.text : "", node.getChildren(parsed).map(visit)];
  };
  return JSON.stringify(visit(parsed));
};
if (syntax(before) !== syntax(after)) throw new Error("Encoding repair changed code structure");
console.log(JSON.stringify({ file, changedLines, remainingMojibake: score(after), sample: after.split("\n").filter((line) => /[\u0600-\u06ff]/.test(line)).slice(0, 4) }, null, 2));
if (process.argv.includes("--apply") && changedLines) {
  const backup = path.join(root, ".codex-logs", `project-details-before-encoding-${Date.now()}.tsx`);
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  fs.writeFileSync(backup, before, { flag: "wx" });
  fs.writeFileSync(file, after, "utf8");
  console.log(`Saved reversible source backup: ${backup}`);
}
