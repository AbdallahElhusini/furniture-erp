import { requireLiveAdminSession } from "@/lib/api-auth";
import { createBackupArtifact } from "@/lib/data-transfer/backup";
import { isDataScope } from "@/lib/data-transfer/contracts";
import {
  InvalidJsonBodyError,
  RequestBodyTooLargeError,
  readBoundedJson,
} from "@/lib/public-request-security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireLiveAdminSession(request);
  if (auth.response) return auth.response;
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > 4096) return Response.json({ error: "Request is too large" }, { status: 413 });
  let body: unknown;
  try {
    body = await readBoundedJson(request, 4096);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return Response.json({ error: "Request is too large" }, { status: 413 });
    }
    if (error instanceof InvalidJsonBodyError) {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }
    throw error;
  }
  const scope = body && typeof body === "object" ? String((body as { scope?: unknown }).scope ?? "") : "";
  if (!isDataScope(scope)) return Response.json({ error: "Unknown backup scope" }, { status: 400 });
  try {
    const artifact = await createBackupArtifact({ scope, actor: { id: auth.user.id, email: auth.user.email }, reason: "MANUAL" });
    return new Response(new Uint8Array(artifact.buffer), { headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${artifact.fileName}"`,
      "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
      "X-Data-Transfer-Job": String(artifact.jobId),
    } });
  } catch {
    return Response.json({ error: "Backup could not be created or persisted" }, { status: 500 });
  }
}
