import { NextRequest, NextResponse } from "next/server";
import { requireLiveAdminSession } from "@/lib/api-auth";
import { pendingConversationMessages, previewConversation } from "@/lib/admin-assistant/conversation-service";
import { OPERATION_CONTRACT_HASH } from "@/lib/admin-assistant/operation-registry";
import {
  beginAssistantPlanning,
  failAssistantPlanning,
  finalizeAssistantPreview,
  type PlanningLedger,
} from "@/lib/admin-assistant/run-ledger";

const ALLOWED_ROLES = ["ADMIN", "MANAGER"] as const;
const MAX_MESSAGE_CHARACTERS = 8_000;

export async function POST(request: NextRequest) {
  const auth = await requireLiveAdminSession(request, ALLOWED_ROLES);
  if (auth.response) return auth.response;

  let planningLedger: PlanningLedger | null = null;
  try {
    const body = (await request.json()) as { message?: unknown; conversationId?: unknown; continueDraft?: unknown };
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const conversationId = typeof body.conversationId === "string"
      ? body.conversationId.trim()
      : undefined;
    if (!message) {
      return NextResponse.json({ error: "اكتب الطلب الذي تريد مراجعته أولاً." }, { status: 400 });
    }
    if (message.length > MAX_MESSAGE_CHARACTERS) {
      return NextResponse.json(
        { error: `الطلب أطول من الحد المسموح (${MAX_MESSAGE_CHARACTERS} حرف). قسّمه إلى دفعات.` },
        { status: 413 },
      );
    }
    if (conversationId && !/^[A-Za-z0-9_-]{8,100}$/.test(conversationId)) {
      return NextResponse.json({ error: "معرّف المحادثة غير صالح." }, { status: 400 });
    }

    const actor = {
      id: auth.user.id,
      email: auth.user.email,
      name: auth.user.name,
      role: auth.user.role,
    };
    const conversationMessages = body.continueDraft === true && conversationId
      ? await pendingConversationMessages(conversationId, auth.user.id, message)
      : [message];
    if (conversationMessages.join("\n").length > 24_000) {
      return NextResponse.json({ error: "المحادثة وصلت لحدها. ابدأ محادثة جديدة للطلب التالي." }, { status: 413 });
    }
    planningLedger = await beginAssistantPlanning({ message, actor, conversationPublicId: conversationId });
    const preview = await previewConversation(conversationMessages, actor);
    const recordedPreview = await finalizeAssistantPreview(planningLedger, preview, actor);
    return NextResponse.json(recordedPreview, {
      headers: {
        "Cache-Control": "no-store",
        "X-HATAB-Operation-Contract": OPERATION_CONTRACT_HASH,
      },
    });
  } catch (error) {
    if (planningLedger) {
      await failAssistantPlanning(planningLedger, error).catch((ledgerError) => {
        console.error("Admin assistant planning ledger failed:", ledgerError);
      });
    }
    console.error("Admin assistant preview failed:", error);
    return NextResponse.json(
      { error: "تعذر تحليل الطلب الآن. لم يتم تغيير أي بيانات." },
      { status: 500 },
    );
  }
}
