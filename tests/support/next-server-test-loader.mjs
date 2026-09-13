import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(import.meta.dirname, "..", "..");
const serverOnlyModule = "data:text/javascript,export%20{}";

function resolveProjectFile(candidatePath) {
  for (const filePath of [candidatePath, `${candidatePath}.ts`, `${candidatePath}.tsx`, `${candidatePath}.js`]) {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return pathToFileURL(filePath).href;
    }
  }
  for (const indexName of ["index.ts", "index.tsx", "index.js"]) {
    const filePath = path.join(candidatePath, indexName);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return pathToFileURL(filePath).href;
    }
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return { url: serverOnlyModule, shortCircuit: true };
  }

  if (specifier.startsWith("@/")) {
    const resolved = resolveProjectFile(path.join(projectRoot, "src", specifier.slice(2)));
    if (resolved) return { url: resolved, shortCircuit: true };
  }

  if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
    const parentPath = path.dirname(fileURLToPath(context.parentURL));
    const resolved = resolveProjectFile(path.resolve(parentPath, specifier));
    if (resolved) return { url: resolved, shortCircuit: true };
  }

  return nextResolve(specifier, context);
}
