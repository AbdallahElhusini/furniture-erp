import { NextResponse } from "next/server";
import { requireLiveAdminSession } from "@/lib/api-auth";
import { DATA_SCOPES, SCOPE_MODULES } from "@/lib/data-transfer/contracts";
import { DATA_MODULE_REGISTRY } from "@/lib/data-transfer/registry";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireLiveAdminSession(request);
  if (auth.response) return auth.response;
  return NextResponse.json({
    modules: Object.values(DATA_MODULE_REGISTRY).map((definition) => ({
      name: definition.name,
      labelAr: definition.labelAr,
      labelEn: definition.labelEn,
      keyColumn: definition.keyColumn,
      columns: definition.columns,
      spreadsheetImport: true,
    })),
    scopes: DATA_SCOPES.map((scope) => ({ scope, modules: SCOPE_MODULES[scope] })),
    guarantees: {
      mode: "UPSERT",
      deleteSupported: false,
      blankCellsClearValues: false,
      preApplyBackup: true,
      securityDataExcluded: true,
    },
  }, { headers: { "Cache-Control": "no-store" } });
}

