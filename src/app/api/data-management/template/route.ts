import { requireLiveAdminSession } from "@/lib/api-auth";
import { DATA_MODULES, isDataModuleName, type DataModuleName } from "@/lib/data-transfer/contracts";
import { createCsvExport, createXlsxExport } from "@/lib/data-transfer/exporter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function download(buffer: Buffer, fileName: string, contentType: string) {
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(request: Request) {
  const auth = await requireLiveAdminSession(request);
  if (auth.response) return auth.response;
  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "csv" ? "csv" : "xlsx";
  const moduleValue = url.searchParams.get("module");
  const selectedModule: DataModuleName | null =
    moduleValue && isDataModuleName(moduleValue) ? moduleValue : null;
  if (moduleValue && !selectedModule) {
    return Response.json({ error: "Unknown module" }, { status: 400 });
  }
  if (format === "csv") {
    if (!selectedModule) return Response.json({ error: "A valid module is required for CSV" }, { status: 400 });
    const buffer = await createCsvExport({ module: selectedModule, includeData: false });
    return download(buffer, `hatab-${selectedModule}-template.csv`, "text/csv; charset=utf-8");
  }
  const modules: readonly DataModuleName[] = selectedModule ? [selectedModule] : DATA_MODULES;
  const buffer = await createXlsxExport({ modules, includeData: false });
  return download(buffer, `hatab-data-template${selectedModule ? `-${selectedModule}` : ""}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}
