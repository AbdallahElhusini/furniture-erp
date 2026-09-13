import { requireLiveAdminSession } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { DATA_MODULES, isDataModuleName, type DataModuleName } from "@/lib/data-transfer/contracts";
import { createCsvExport, createXlsxExport } from "@/lib/data-transfer/exporter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireLiveAdminSession(request);
  if (auth.response) return auth.response;
  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "csv" ? "csv" : "xlsx";
  const requested = url.searchParams.get("modules")?.split(",").filter(Boolean) ?? [];
  if (requested.some((module) => !isDataModuleName(module))) return Response.json({ error: "Unknown module" }, { status: 400 });
  const modules: readonly DataModuleName[] = requested.length ? requested as DataModuleName[] : DATA_MODULES;
  if (format === "csv" && modules.length !== 1) return Response.json({ error: "CSV export supports exactly one module" }, { status: 400 });
  const job = await prisma.dataTransferJob.create({ data: {
    kind: "EXPORT", scope: modules.length === 1 ? "MODULE" : "FULL_BUSINESS",
    module: modules.length === 1 ? modules[0] : null, status: "VALIDATING",
    actorId: auth.user.id, actorEmail: auth.user.email,
  } });
  try {
    const buffer = format === "csv"
      ? await createCsvExport({ module: modules[0], includeData: true })
      : await createXlsxExport({ modules, includeData: true });
    const extension = format;
    const fileName = `hatab-export-${modules.length === 1 ? modules[0] : "all"}-${new Date().toISOString().slice(0, 10)}.${extension}`;
    await prisma.dataTransferJob.update({ where: { id: job.id }, data: {
      status: "SUCCESS", resultName: fileName, summary: JSON.stringify({ modules }), completedAt: new Date(),
    } });
    return new Response(new Uint8Array(buffer), { headers: {
      "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    await prisma.dataTransferJob.update({ where: { id: job.id }, data: {
      status: "FAILED", errorCount: 1, errors: JSON.stringify([{ code: "EXPORT_FAILED", message: error instanceof Error ? error.message : "Export failed" }]), completedAt: new Date(),
    } });
    return Response.json({ error: "Export failed" }, { status: 500 });
  }
}

