import { requireLiveAdminSession } from "@/lib/api-auth";
import { isDataModuleName, MAX_UPLOAD_BYTES } from "@/lib/data-transfer/contracts";
import { runSpreadsheetImport } from "@/lib/data-transfer/importer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireLiveAdminSession(request);
  if (auth.response) return auth.response;
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES + 1024 * 1024) {
    return Response.json({ error: "Upload is too large" }, { status: 413 });
  }
  let form: FormData;
  try { form = await request.formData(); } catch { return Response.json({ error: "Invalid multipart form" }, { status: 400 }); }
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "file is required" }, { status: 400 });
  if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) return Response.json({ error: "File size is not allowed" }, { status: 413 });
  const csvModuleValue = form.get("module");
  const csvModule = typeof csvModuleValue === "string" && csvModuleValue ? csvModuleValue : null;
  if (csvModule && !isDataModuleName(csvModule)) return Response.json({ error: "Unknown CSV module" }, { status: 400 });
  const dryRun = form.get("dryRun") !== "false";
  try {
    const result = await runSpreadsheetImport({
      fileName: file.name,
      buffer: Buffer.from(await file.arrayBuffer()),
      csvModule,
      dryRun,
      actor: { id: auth.user.id, email: auth.user.email },
    });
    return Response.json(result, { status: result.errorCount ? 422 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Data import request failed before a structured job result was available.", error);
    return Response.json({ error: "Import service is unavailable; no data was applied" }, { status: 503 });
  }
}
