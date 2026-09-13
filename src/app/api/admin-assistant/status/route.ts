import { NextRequest, NextResponse } from "next/server";
import { requireLiveAdminSession } from "@/lib/api-auth";
import { getLocalModelStatus } from "@/lib/admin-assistant/local-model";
import {
  MODEL_ENABLED_OPERATION_KINDS,
  OPERATION_CONTRACT_HASH,
  OPERATION_CONTRACT_VERSION,
  OPERATION_KINDS,
  OPERATION_SCHEMA_VERSION,
} from "@/lib/admin-assistant/operation-registry";

const ALLOWED_ROLES = ["ADMIN", "MANAGER"] as const;

export async function GET(request: NextRequest) {
  const auth = await requireLiveAdminSession(request, ALLOWED_ROLES);
  if (auth.response) return auth.response;
  const localModel = await getLocalModelStatus();
  return NextResponse.json(
    {
      localModel,
      operationContract: {
        schemaVersion: OPERATION_SCHEMA_VERSION,
        contractVersion: OPERATION_CONTRACT_VERSION,
        hash: OPERATION_CONTRACT_HASH,
        registeredKinds: OPERATION_KINDS,
        modelEnabledKinds: MODEL_ENABLED_OPERATION_KINDS,
      },
      safety: {
        databaseAccess: false,
        executionRequiresPreview: true,
        executionRequiresConfirmation: true,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
