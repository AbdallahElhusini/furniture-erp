import { revalidatePath, revalidateTag } from "next/cache";
import { requireLiveAdminSession } from "@/lib/api-auth";
import { MAX_BACKUP_UPLOAD_BYTES, runBackupRestore } from "@/lib/data-transfer/restore";
import { SITE_CONTENT_CACHE_TAG } from "@/lib/site-content-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireLiveAdminSession(request);
  if (auth.response) return auth.response;
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BACKUP_UPLOAD_BYTES + 1024 * 1024) {
    return Response.json({ error: "Backup upload is too large" }, { status: 413 });
  }
  let form: FormData;
  try { form = await request.formData(); } catch { return Response.json({ error: "Invalid multipart form" }, { status: 400 }); }
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "file is required" }, { status: 400 });
  if (file.size <= 0 || file.size > MAX_BACKUP_UPLOAD_BYTES) return Response.json({ error: "File size is not allowed" }, { status: 413 });
  const dryRun = form.get("dryRun") !== "false";
  try {
    const result = await runBackupRestore({
      fileName: file.name,
      buffer: Buffer.from(await file.arrayBuffer()),
      dryRun,
      actor: { id: auth.user.id, email: auth.user.email },
    });
    if (!dryRun && result.errorCount === 0) {
      try {
        revalidateTag(SITE_CONTENT_CACHE_TAG, { expire: 0 });
        revalidatePath("/", "layout");
        revalidatePath("/catalog");
        revalidatePath("/collections");
      } catch (error) {
        console.error("Restore committed, but cache revalidation failed.", error);
      }
    }
    return Response.json(result, { status: result.errorCount ? 422 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Restore request failed before a structured job result was available.", error);
    return Response.json({ error: "Restore service is unavailable; no restore transaction was started" }, { status: 503 });
  }
}
