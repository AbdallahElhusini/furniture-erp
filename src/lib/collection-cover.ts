import { realpath, stat } from "node:fs/promises";
import path from "node:path";

export async function collectionCoverExists(
  imagePath: string | null | undefined,
  publicDirectory = path.resolve(process.cwd(), "public"),
): Promise<boolean> {
  if (
    !imagePath?.startsWith("/") ||
    imagePath.includes("..") ||
    imagePath.includes("\\") ||
    imagePath.includes("%") ||
    imagePath.includes("?") ||
    imagePath.includes("#")
  ) {
    return false;
  }

  try {
    const publicRoot = await realpath(publicDirectory);
    const candidate = await realpath(path.resolve(publicRoot, imagePath.slice(1)));
    const relative = path.relative(publicRoot, candidate);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return false;
    return (await stat(candidate)).isFile();
  } catch {
    return false;
  }
}
