import "server-only";
import { prisma } from "@/lib/db";
import { CURRENT_OPERATION_CONTRACT } from "./operation-registry";
import { compileOrderDraft, contextualizeConversationAnswer, describeOrderDraft, isConversationReset, prepareOrderConversation } from "./conversation";
import { previewAssistantCommand, type AssistantActor } from "./service";
import type { AssistantPreview } from "./types";

const nameKey = (value: string) => value.trim().toLowerCase().replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/[ًٌٍَُِّْـ]/g, "");

export async function pendingConversationMessages(conversationPublicId: string, actorId: number, nextMessage?: string): Promise<string[]> {
  const conversation = await prisma.aiConversation.findFirst({ where: { publicId: conversationPublicId, actorId, status: "ACTIVE" }, select: { id: true } });
  if (!conversation) throw new Error("المحادثة غير موجودة أو ليست مرتبطة بحسابك.");
  const completed = await prisma.aiRun.findFirst({ where: { conversationId: conversation.id, status: "SUCCEEDED", mode: "EXECUTE" }, orderBy: { id: "desc" }, select: { triggerMessageId: true } });
  const messages = await prisma.aiMessage.findMany({
    where: { conversationId: conversation.id, role: { in: ["USER", "ASSISTANT"] }, ...(completed?.triggerMessageId ? { id: { gt: completed.triggerMessageId } } : {}) },
    orderBy: { id: "desc" }, take: 40, select: { content: true, role: true, metadata: true },
  });
  let expectedField: string | undefined;
  const result: string[] = [];
  for (const entry of messages.reverse()) {
    if (entry.role === "USER" && typeof entry.content === "string") result.push(contextualizeConversationAnswer(entry.content, expectedField));
    if (entry.role === "ASSISTANT") {
      try { const metadata = JSON.parse(entry.metadata ?? "{}"); expectedField = metadata.conversation?.questions?.[0]?.field; } catch { expectedField = undefined; }
    }
  }
  if (nextMessage !== undefined) result.push(contextualizeConversationAnswer(nextMessage, expectedField));
  return result;
}

export async function previewConversation(messages: string[], actor: AssistantActor): Promise<AssistantPreview> {
  if (isConversationReset(messages.at(-1) ?? "")) return {
    understood: true, actions: [], warnings: [], blockingIssues: [], planToken: null, expiresAt: null,
    operationContract: CURRENT_OPERATION_CONTRACT, retrieval: { matches: [] },
    extractor: { mode: "deterministic", localModelAvailable: null, model: null, latencyMs: null, modelBinding: null },
    conversation: { reply: "تمام، لغيت مسودة الطلب. احكي لي عن الطلب أو العميل الجديد.", summary: null, needsReply: false, questions: [] },
  };
  const turn = prepareOrderConversation(messages);
  if (!turn) {
    const preview = await previewAssistantCommand(messages.at(-1) ?? "", actor);
    const source = messages.at(-1) ?? "";
    const lead = !preview.planToken && source.match(/(?:عميل\s+(?:محتمل|جديد)|(?:ضيف|سجل|أضف|اضف)\s+عميل)\s*(?:اسمه|باسم)?\s*[:=]?\s*([\p{L}][\p{L}\s.'-]{1,60}?)(?=\s+(?:بريف|هاتف|تليفون|موبايل|محتاج|عايز|يريد|طلب)|[|،؛]|$)/iu);
    const links = lead ? [{ label: "فتح سجل العميل المحتمل بالبيانات", href: `/admin/clients?${new URLSearchParams({ new: "1", name: lead[1].trim(), brief: source })}` }]
      : !preview.planToken && /(?:حسابات|حساب|مصروف|قبض|دفعة|دفعه|دفعت|payment|expense)/iu.test(source) ? [{ label: "فتح شيت الحسابات", href: "/admin/accounting" }] : [];
    return { ...preview, conversation: {
      reply: preview.planToken ? "جهزت الإجراءات. راجع التفاصيل واختار تنفيذ الخطة."
        : lead ? `تقدر تسجل ${lead[1].trim()} كعميل محتمل حتى لو رقم الموبايل لسه مش متاح. جهزت لك رابط نموذج ببيانات كلامك؛ راجعه واضغط حفظ.`
        : links.length ? "الحركات المالية متاحة في شيت الحسابات للمراجعة والإضافة والتعديل والتنزيل. افتحه من الرابط وسجل الحركة."
        : preview.blockingIssues.join("\n") || preview.warnings.join("\n"),
      summary: null, needsReply: false, questions: [], links,
    } };
  }
  const { draft, questions } = turn;
  const matches: AssistantPreview["retrieval"]["matches"] = [];
  if (draft.productReference) {
    const reference = draft.productReference.trim();
    const products = await prisma.catalogItem.findMany({
      where: { isActive: true, OR: [{ sku: reference.toUpperCase() }, { nameAr: { contains: reference } }, { nameEn: { contains: reference } }] },
      orderBy: [{ displayOrder: "asc" }, { id: "asc" }], take: 8,
      select: { sku: true, nameAr: true, nameEn: true },
    });
    const exact = products.filter((item) => [item.sku, item.nameAr, item.nameEn ?? ""].some((name) => nameKey(name) === nameKey(reference)));
    matches.push(...products.map((item) => ({ kind: "product" as const, ref: item.sku, label: `${item.nameAr} · ${item.sku}` })));
    if (exact.length !== 1) questions.push({
      field: "productReference",
      text: products.length ? `أي ${reference} تقصد؟ اختار المنتج أو اكتب كوده.` : `مش لاقي منتج نشط باسم «${reference}». اكتب كوده أو أضفه من الكتالوج.`,
      suggestions: products.map((item) => ({ label: `${item.nameAr} · ${item.sku}`, message: `المنتج: ${item.sku}` })),
    });
  }
  if (draft.supplierQuery) {
    const suppliers = await prisma.supplier.findMany({ where: { isActive: true }, select: { id: true, name: true }, take: 2000 });
    const reference = nameKey(draft.supplierQuery);
    const alias = reference === "ماك" ? "mac" : reference;
    const exact = suppliers.filter((supplier) => nameKey(supplier.name) === alias);
    if (exact.length !== 1) {
      const words = reference.split(/\s+/).filter((word) => word.length > 1);
      const candidates = suppliers.map((supplier) => ({ ...supplier, score: words.filter((word) => nameKey(supplier.name).includes(word)).length }))
        .filter((supplier) => supplier.score > 0).sort((a, b) => b.score - a.score).slice(0, 6);
      matches.push(...candidates.map((supplier) => ({ kind: "supplier" as const, ref: String(supplier.id), label: supplier.name.trim() })));
      questions.push({ field: "supplierQuery", text: `أكد اسم المصنع «${draft.supplierQuery}» من السجلات أو اكتب الاسم المسجل بالكامل.`, suggestions: candidates.map((supplier) => ({ label: supplier.name.trim(), message: `المصنع: ${supplier.name.trim()}` })) });
    }
  }
  const phoneQuestion = questions.find((question) => question.field === "clientPhone");
  if (phoneQuestion && draft.clientName) {
    const clients = await prisma.client.findMany({ where: { name: { contains: draft.clientName } }, select: { name: true, phone: true }, take: 5 });
    phoneQuestion.suggestions = clients.filter((client) => client.phone && client.phone.length >= 8).map((client) => ({ label: `${client.name} · ${client.phone}`, message: `هاتف: ${client.phone}` }));
  }
  const summary = describeOrderDraft(draft);
  if (questions.length) return {
    understood: true, actions: [], warnings: [], blockingIssues: questions.map((question) => question.text),
    planToken: null, expiresAt: null, operationContract: CURRENT_OPERATION_CONTRACT,
    retrieval: { matches }, extractor: { mode: "deterministic", localModelAvailable: null, model: null, latencyMs: null, modelBinding: null },
    conversation: { reply: `فهمت: ${summary}.\n${questions[0].text}`, summary, needsReply: true, questions },
  };
  const preview = await previewAssistantCommand(compileOrderDraft(draft), actor);
  return { ...preview, conversation: { reply: preview.planToken ? `تمام، جهزت طلب ${draft.clientName}. راجع البيع والتكلفة والمصنع ثم أكد التنفيذ.` : preview.blockingIssues.join("\n") || preview.warnings.join("\n"), summary, needsReply: !preview.planToken && preview.blockingIssues.length > 0, questions: [] } };
}
