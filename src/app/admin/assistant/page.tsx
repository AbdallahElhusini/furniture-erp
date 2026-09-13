"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock3,
  DatabaseBackup,
  History,
  Loader2,
  MessageSquarePlus,
  Mic,
  MicOff,
  PencilLine,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { AssistantModelBinding as ModelBinding } from "@/lib/admin-assistant/types";

type Risk = "LOW" | "MEDIUM" | "HIGH";

interface PlanAction {
  id: string;
  kind: string;
  title: string;
  description: string;
  risk: Risk;
  details: Array<{
    label: string;
    value: string;
    previousValue?: string;
  }>;
}

interface PreviewResult {
  understood: boolean;
  actions: PlanAction[];
  warnings: string[];
  blockingIssues: string[];
  planToken: string | null;
  expiresAt: string | null;
  conversation?: {
    reply: string;
    summary: string | null;
    needsReply: boolean;
    links?: Array<{ label: string; href: string }>;
    questions: Array<{ field: string; text: string; suggestions: Array<{ label: string; message: string }> }>;
  };
  operationContract: {
    schemaVersion: string;
    contractVersion: number;
    hash: string;
  };
  run?: {
    conversationId: string;
    runId: string;
    status: string;
    planRevision: number | null;
    planHash: string | null;
  };
  retrieval: {
    matches: Array<{
      kind: "client" | "project" | "product" | "task" | "supplier-order" | "supplier";
      ref: string;
      label: string;
    }>;
  };
  extractor: {
    mode: "deterministic" | "local-model" | "deterministic-fallback";
    localModelAvailable: boolean | null;
    model: string | null;
    latencyMs: number | null;
    modelBinding: ModelBinding | null;
  };
}

interface LocalModelStatus {
  available: boolean;
  status: string;
  model: string | null;
  device: string | null;
  schemaVersion: string | null;
  contractVersion: number | null;
  contractHash: string | null;
  contractCompatible: boolean;
  productionReady: boolean;
  identityVerified: boolean;
  modelBinding: ModelBinding | null;
  adapterContractErrors: string[];
}

interface ApplyResult {
  duplicate: boolean;
  jobId: number;
  status: string;
  insertedCount: number;
  updatedCount: number;
  skippedCount: number;
  backupFile: string | null;
  summary: string[];
  run?: { runId: string; status: string };
}

interface AssistantRunHistory {
  publicId: string;
  status: string;
  mode: string;
  intent: string | null;
  riskLevel: string;
  requiresApproval: boolean;
  resultSummary: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
  conversation: { publicId: string; title: string | null };
  plans: Array<{ revision: number; status: string; planHash: string }>;
  _count: { steps: number; approvals: number };
}

interface AssistantJob {
  id: number;
  status: string;
  rowCount: number;
  insertedCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  actorEmail: string | null;
  summary: string;
  createdAt: string;
  completedAt: string | null;
  _count: { changes: number };
}

const EXAMPLES = [
  { label: "احكي طلب جديد", value: "كلمنا انهارده عميل احمد طلب مكتب هنعمله عند محمود الابيض و هيقف علينا ب 6 و بعته ب 12000" },
  { label: "عميل جديد", value: "عميل: أحمد علي | هاتف: 01012345678" },
  { label: "طلب متكامل", value: "عميل: شركة النور | هاتف: 01012345679 | مشروع: مكتب الإدارة | كود: EXE-0001 | كمية: 2 | مصنع: اسم المصنع" },
  { label: "تعديل كمية", value: "عدّل كمية المنتج EXE-0001 في المشروع 15 إلى 4" },
  { label: "إزالة منتج", value: "احذف المنتج EXE-0001 من المشروع 15" },
  { label: "تحكم بأمر توريد", value: "غيّر حالة أمر التوريد 10 إلى SHIPPED" },
  { label: "حالة مشروع", value: "مشروع: 15 | حالة: READY" },
  { label: "مهمة", value: "مهمة: متابعة اعتماد التصميم | مشروع: 15 | موعد: غدا | أولوية: عالية" },
];

const RISK_LABELS: Record<Risk, string> = {
  LOW: "منخفض",
  MEDIUM: "متوسط",
  HIGH: "مرتفع",
};

const RETRIEVAL_KIND_LABELS: Record<PreviewResult["retrieval"]["matches"][number]["kind"], string> = {
  client: "عميل",
  project: "مشروع",
  product: "منتج",
  task: "مهمة",
  "supplier-order": "أمر توريد",
  supplier: "مورد",
};

function readError(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string") {
    return payload.error;
  }
  return fallback;
}

interface DictationRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

export default function AdminAssistantPage() {
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<"preview" | "apply" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<AssistantJob[]>([]);
  const [runs, setRuns] = useState<AssistantRunHistory[]>([]);
  const [localModel, setLocalModel] = useState<LocalModelStatus | null>(null);
  const [selectedActionIds, setSelectedActionIds] = useState<string[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [pendingDraft, setPendingDraft] = useState(false);
  const [transcript, setTranscript] = useState<Array<{ role: "user" | "assistant"; text: string }>>([]);
  const [dictating, setDictating] = useState(false);
  const dictationRef = useRef<DictationRecognition | null>(null);
  const conversationEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { conversationEndRef.current?.scrollIntoView({ block: "nearest" }); }, [transcript, busy]);
  useEffect(() => () => { dictationRef.current?.stop(); }, []);

  const toggleDictation = () => {
    if (dictating) { dictationRef.current?.stop(); return; }
    const browser = window as unknown as { SpeechRecognition?: new () => DictationRecognition; webkitSpeechRecognition?: new () => DictationRecognition };
    const Recognition = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!Recognition) { setError("الإملاء غير متاح في المتصفح ده. استخدم Chrome أو Edge، أو اكتب رسالتك."); return; }
    const recognition = new Recognition();
    recognition.lang = "ar-EG";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const words = Array.from(event.results).map((entry) => entry[0]?.transcript ?? "").join(" ");
      setMessage((current) => [current.trim(), words.trim()].filter(Boolean).join(" "));
    };
    recognition.onerror = (event) => { setError(event.error === "not-allowed" ? "اسمح باستخدام الميكروفون من إعدادات المتصفح أو اكتب الرسالة." : "تعذر الإملاء الآن. جرّب مرة أخرى أو اكتب الرسالة."); setDictating(false); };
    recognition.onend = () => setDictating(false);
    dictationRef.current = recognition;
    setError(null);
    try { recognition.start(); setDictating(true); } catch { setError("تعذر بدء الميكروفون. يمكنك كتابة الرسالة."); }
  };

  const loadHistory = useCallback(async () => {
    const response = await fetch("/api/admin-assistant/apply", { cache: "no-store" });
    if (!response.ok) return;
    const payload = (await response.json()) as { jobs: AssistantJob[]; runs: AssistantRunHistory[] };
    setJobs(payload.jobs);
    setRuns(payload.runs ?? []);
  }, []);

  const loadModelStatus = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch("/api/admin-assistant/status", { cache: "no-store" });
      if (!response.ok) return false;
      const payload = (await response.json()) as { localModel: LocalModelStatus };
      setLocalModel(payload.localModel);
      return payload.localModel.available && payload.localModel.contractCompatible;
    } catch {
      setLocalModel((current) => current ?? {
        available: false,
        status: "offline",
        model: null,
        device: null,
        schemaVersion: null,
        contractVersion: null,
        contractHash: null,
        contractCompatible: false,
        productionReady: false,
        identityVerified: false,
        modelBinding: null,
        adapterContractErrors: [],
      });
      return false;
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadHistory(), 0);
    return () => window.clearTimeout(timer);
  }, [loadHistory]);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | null = null;

    const pollUntilAvailable = async () => {
      const available = await loadModelStatus();
      if (!cancelled && !available) {
        retryTimer = window.setTimeout(() => void pollUntilAvailable(), 5_000);
      }
    };

    const initialTimer = window.setTimeout(() => void pollUntilAvailable(), 0);
    return () => {
      cancelled = true;
      window.clearTimeout(initialTimer);
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, [loadModelStatus]);

  const resetPlan = () => {
    setPreview(null);
    setResult(null);
    setConfirmed(false);
    setSelectedActionIds([]);
    setError(null);
  };

  const startNewConversation = () => {
    if (busy) return;
    dictationRef.current?.stop();
    setConversationId(null);
    setMessage("");
    setPendingDraft(false);
    setTranscript([]);
    resetPlan();
    window.requestAnimationFrame(() => messageInputRef.current?.focus());
  };

  const analyze = async (submittedMessage = message) => {
    if (busy || !submittedMessage.trim()) return;
    setBusy("preview");
    setError(null);
    setResult(null);
    setPreview(null);
    setConfirmed(false);
    setSelectedActionIds([]);
    try {
      const response = await fetch("/api/admin-assistant/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: submittedMessage, conversationId, continueDraft: pendingDraft }),
      });
      const payload = await response.json() as PreviewResult | { error?: string };
      if (!response.ok) throw new Error(readError(payload, "تعذر تحليل الطلب."));
      const nextPreview = payload as PreviewResult;
      setPreview(nextPreview);
      setTranscript((current) => [...current, { role: "user", text: submittedMessage }, { role: "assistant", text: nextPreview.conversation?.reply ?? "راجع التفاصيل في خطة التنفيذ." }]);
      setMessage("");
      setPendingDraft(Boolean(nextPreview.conversation?.summary));
      if (nextPreview.run?.conversationId) setConversationId(nextPreview.run.conversationId);
      setSelectedActionIds(nextPreview.planToken ? nextPreview.actions.map((action) => action.id) : []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحليل الطلب.");
    } finally {
      setBusy(null);
    }
  };

  const apply = async () => {
    if (!preview?.planToken || !preview.run?.runId || !confirmed || selectedActionIds.length === 0) return;
    setBusy("apply");
    setError(null);
    try {
      const response = await fetch("/api/admin-assistant/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planToken: preview.planToken,
          confirmed: true,
          actionIds: selectedActionIds,
          runId: preview.run.runId,
        }),
      });
      const payload = await response.json() as ApplyResult | { error?: string };
      if (!response.ok) throw new Error(readError(payload, "تعذر تطبيق الخطة."));
      setResult(payload as ApplyResult);
      const applied = payload as ApplyResult;
      setTranscript((current) => [...current, { role: "assistant", text: `تم التنفيذ. ${applied.summary.join(" · ")}` }]);
      setPendingDraft(false);
      setPreview(null);
      setConfirmed(false);
      setSelectedActionIds([]);
      await loadHistory();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تطبيق الخطة.");
    } finally {
      setBusy(null);
    }
  };

  const toggleAction = (actionId: string) => {
    setConfirmed(false);
    setSelectedActionIds((current) => (
      current.includes(actionId)
        ? current.filter((id) => id !== actionId)
        : [...current, actionId]
    ));
  };

  const selectAllActions = () => {
    setConfirmed(false);
    setSelectedActionIds(preview?.actions.map((action) => action.id) ?? []);
  };

  const clearActionSelection = () => {
    setConfirmed(false);
    setSelectedActionIds([]);
  };

  const editRequest = () => {
    setPendingDraft(true);
    setPreview(null);
    setConfirmed(false);
    setSelectedActionIds([]);
    setError(null);
    window.requestAnimationFrame(() => {
      messageInputRef.current?.focus();
      messageInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  const selectedActionIdSet = new Set(selectedActionIds);

  return (
    <div className="mx-auto max-w-[1500px] space-y-7 p-4 pb-16 md:p-8" dir="rtl">
      <header className="border-b border-black/10 pb-6">
        <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#8c343c]">
          <Bot className="h-4 w-4" /> HATAB / Execution Assistant
        </div>
        <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-[#14241c] md:text-4xl">مساعد شغل حطب</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-black/60">
              احكي اللي حصل أو المطلوب يتعمل. هنرتب البيانات معاك، نسألك عن الناقص، ونجهز الطلب للمراجعة والتنفيذ.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className={`inline-flex h-11 items-center gap-2 border px-4 text-xs font-black ${localModel?.available && localModel.contractCompatible && localModel.productionReady ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
              <Bot className="h-4 w-4" />
              {localModel?.available && localModel.contractCompatible && localModel.productionReady
                ? "النموذج المحلي متصل ومتوافق"
                : localModel?.status === "ready" && localModel.contractCompatible && localModel.productionReady
                  ? "النموذج متصل لكن هويته غير موثقة"
                : localModel?.status === "ready" && localModel.contractCompatible
                  ? "النموذج متصل لكن لم يجتز بوابة الجودة"
                  : localModel?.status === "ready"
                    ? "النموذج متصل لكن عقده غير متوافق"
                  : "المحادثة الموجّهة متاحة · النموذج العام غير متصل"}
            </span>
            <span className="inline-flex h-11 items-center gap-2 border border-emerald-200 bg-emerald-50 px-4 text-xs font-black text-emerald-900">
              <ShieldCheck className="h-4 w-4" /> لا تنفيذ بدون معاينة وتأكيد
            </span>
          </div>
        </div>
        {localModel?.modelBinding && (
          <details className="mt-4 border border-black/10 bg-white px-4 py-3 text-[10px] text-black/60" dir="ltr">
            <summary className="cursor-pointer font-black text-[#14241c]">Active model identity · {localModel.modelBinding.activeModelKey}</summary>
            <dl className="mt-3 grid gap-2 font-mono lg:grid-cols-2">
              <div><dt className="text-black/35">Base revision</dt><dd className="break-all">{localModel.modelBinding.baseModel}@{localModel.modelBinding.baseModelRevision}</dd></div>
              <div><dt className="text-black/35">Model identity SHA-256</dt><dd className="break-all">{localModel.modelBinding.modelIdentitySha256}</dd></div>
              <div><dt className="text-black/35">Base artifact SHA-256</dt><dd className="break-all">{localModel.modelBinding.baseModelArtifactSha256}</dd></div>
              <div><dt className="text-black/35">Adapter path</dt><dd className="break-all">{localModel.modelBinding.adapter}</dd></div>
              <div><dt className="text-black/35">Adapter SHA-256</dt><dd className="break-all">{localModel.modelBinding.adapterModelSha256}</dd></div>
              <div><dt className="text-black/35">Adapter config SHA-256</dt><dd className="break-all">{localModel.modelBinding.adapterConfigSha256}</dd></div>
              <div><dt className="text-black/35">Training manifest SHA-256</dt><dd className="break-all">{localModel.modelBinding.adapterManifestSha256}</dd></div>
              <div><dt className="text-black/35">Evaluation report SHA-256</dt><dd className="break-all">{localModel.modelBinding.evaluationReportSha256}</dd></div>
              <div><dt className="text-black/35">Readiness semantic SHA-256</dt><dd className="break-all">{localModel.modelBinding.readinessSemanticSha256}</dd></div>
              <div><dt className="text-black/35">Prompt SHA-256</dt><dd className="break-all">{localModel.modelBinding.promptSha256}</dd></div>
              <div><dt className="text-black/35">Promotion verified</dt><dd>{String(localModel.modelBinding.promotionVerified)}</dd></div>
            </dl>
          </details>
        )}
      </header>

      <details className="text-xs text-black/60">
        <summary className="cursor-pointer">الإجراءات المتاحة وطريقة الحفظ</summary>
        <p className="mt-3 leading-6">المحادثة تدعم العملاء والطلبات وبنود المنتجات والمشاريع والمهام وحالات أوامر التوريد. الحسابات والبيانات الإضافية متاحة في <a href="/admin/accounting" className="underline">شيت الحسابات</a> و<a href="/admin/clients" className="underline">سجل العملاء</a>.</p>
      <section className="mt-4 grid gap-4 md:grid-cols-3">
        {[
          [Sparkles, "فهم مضبوط", "تصحيح الأرقام العربية والمرادفات الشائعة ثم تحويلها إلى أوامر محددة."],
          [ShieldCheck, "بوابة صلاحيات", "التنفيذ متاح للمدير والإدارة فقط، والخطة موقّعة وتنتهي خلال 10 دقائق."],
          [DatabaseBackup, "رجوع كامل", "نسخة تشغيلية تلقائية قبل كل خطة، ومعاملة واحدة تلغي الكل عند أي خطأ."],
        ].map(([Icon, title, text]) => {
          const CardIcon = Icon as typeof ShieldCheck;
          return (
            <article key={String(title)} className="border border-black/10 bg-[#f6f6f3] p-5">
              <CardIcon className="mb-5 h-6 w-6 text-[#8c343c]" />
              <h2 className="font-black text-[#14241c]">{String(title)}</h2>
              <p className="mt-2 text-xs leading-6 text-black/55">{String(text)}</p>
            </article>
          );
        })}
      </section>
      </details>

      {error && (
        <div role="alert" className="flex items-start gap-3 border border-red-300 bg-red-50 p-4 text-sm font-bold text-red-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /> {error}
        </div>
      )}

      {result && (
        <section className="border border-emerald-300 bg-emerald-50 p-5 md:p-7" aria-labelledby="apply-result-title">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-emerald-900">
                <CheckCircle2 className="h-5 w-5" />
                <h2 id="apply-result-title" className="text-xl font-black">تم تنفيذ الخطة بنجاح</h2>
              </div>
              <p className="mt-2 text-xs text-emerald-800">Job #{result.jobId} · {result.insertedCount} جديد · {result.updatedCount} محدث</p>
              {result.run?.runId && <p className="mt-1 font-mono text-[10px] text-emerald-700" dir="ltr">Run {result.run.runId}</p>}
            </div>
            <button type="button" onClick={() => setResult(null)} className="border border-emerald-300 bg-white p-2 text-emerald-900" aria-label="إغلاق النتيجة">
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
          <ul className="mt-5 space-y-2 text-sm text-emerald-950">
            {result.summary.map((line) => <li key={line}>• {line}</li>)}
          </ul>
          {result.backupFile && <p className="mt-5 border-t border-emerald-200 pt-4 font-mono text-[11px] text-emerald-800" dir="ltr">Recovery: {result.backupFile}</p>}
        </section>
      )}

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <article className="border border-black/10 bg-white p-5 md:p-7">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-[#14241c]">المحادثة</h2>
              <p className="mt-1 text-xs text-black/50">رد بطريقتك، أو اضغط على اختيار مناسب. الطلب يفضل محفوظ في نفس المحادثة.</p>
            </div>
            <div className="flex items-center gap-2">
              {conversationId && (
                <button type="button" disabled={busy !== null} onClick={startNewConversation} className="inline-flex items-center gap-1.5 border border-black/10 px-3 py-2 text-[10px] font-black text-black/55 hover:text-[#8c343c] disabled:opacity-40">
                  <MessageSquarePlus className="h-3.5 w-3.5" /> محادثة جديدة
                </button>
              )}
              <span className="font-mono text-[10px] text-black/35" dir="ltr">MAX 25 ACTIONS</span>
            </div>
          </div>
          <div role="log" aria-live="polite" aria-label="رسائل المحادثة" className="mb-4 max-h-[420px] min-h-36 space-y-3 overflow-y-auto overscroll-contain">
            {transcript.length === 0 && <p className="bg-[#f6f6f3] p-4 text-sm leading-7 text-black/65">أهلًا. احكي لي عن العميل أو الطلب أو المهمة اللي عاوز تسجلها. لو في معلومة ناقصة، هنكملها سوا.</p>}
            {transcript.map((entry, index) => <div key={index} className={`max-w-[95%] whitespace-pre-wrap p-4 text-sm leading-7 ${entry.role === "user" ? "mr-auto bg-[#14241c] text-white" : "bg-[#f6f6f3] text-[#14241c]"}`}><p className="mb-1 text-[10px] font-bold opacity-55">{entry.role === "user" ? "أنت" : "مساعد حطب"}</p>{entry.text}</div>)}
            {busy === "preview" && <p className="flex items-center gap-2 p-3 text-xs text-black/50"><Loader2 className="h-4 w-4 animate-spin" /> برتب الطلب وبراجع السجلات…</p>}
            <div ref={conversationEndRef} />
          </div>
          {preview?.conversation?.links?.map((link) => <a key={link.href} href={link.href} className="mb-4 inline-flex border border-[#8c343c]/30 px-4 py-3 text-sm font-bold text-[#8c343c]">{link.label}</a>)}
          {preview?.conversation?.needsReply && preview.conversation.questions.length > 0 && <div className="mb-4 space-y-3 border-r-2 border-[#8c343c] pr-3">
            {preview.conversation.questions.map((question) => <div key={question.field}>
              <p className="text-xs font-bold leading-6">{question.text}</p>
              {question.suggestions.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{question.suggestions.map((suggestion) => <button type="button" key={suggestion.message} disabled={busy !== null} onClick={() => void analyze(suggestion.message)} className="border border-[#8c343c]/25 bg-[#8c343c]/5 px-3 py-2 text-xs text-[#8c343c] disabled:opacity-40">{suggestion.label}</button>)}</div>}
            </div>)}
          </div>}
          <textarea
            ref={messageInputRef}
            value={message}
            disabled={busy !== null}
            onChange={(event) => { setMessage(event.target.value); setConfirmed(false); }}
            onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void analyze(); } }}
            aria-label="رسالتك للمساعد"
            maxLength={8000}
            placeholder={pendingDraft ? "اكتب التوضيح هنا… مثل: التكلفة 6000 جنيه، والكمية 1" : "مثل: كلمنا عميل أحمد طلب مكتب، تكلفته 6000 وبعته بـ12000…"}
            className="min-h-28 w-full resize-y border border-black/15 bg-[#fafaf8] p-4 text-sm leading-7 outline-none transition focus:border-[#8c343c] focus:ring-2 focus:ring-[#8c343c]/10"
          />
          <div className="mt-2 flex items-center justify-between gap-3"><span className="text-[10px] text-black/45">Enter للإرسال · Shift + Enter لسطر جديد</span><button type="button" onClick={toggleDictation} disabled={busy !== null} className={`inline-flex items-center gap-2 border px-3 py-2 text-xs ${dictating ? "border-red-300 bg-red-50 text-red-800" : "border-black/15 text-black/65"}`}>{dictating ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}{dictating ? "إيقاف الإملاء" : "إملاء صوتي"}</button></div>
          <p className="mt-1 text-[10px] text-black/40">الإملاء خدمة المتصفح وقد يرسل الصوت لخدمة تعرف خارج الجهاز. راجع النص قبل الإرسال.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {EXAMPLES.map((example) => (
              <button
                key={example.label}
                type="button"
                disabled={busy !== null}
                onClick={() => { dictationRef.current?.stop(); setMessage(example.value); setPendingDraft(false); resetPlan(); }}
                className="border border-black/10 bg-white px-3 py-2 text-[11px] font-bold text-black/60 hover:border-[#8c343c]/40 hover:text-[#8c343c]"
              >
                {example.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={busy !== null || message.trim().length === 0}
            onClick={() => void analyze()}
            className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 bg-[#14241c] px-6 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy === "preview" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {busy === "preview" ? "جاري تجهيز الرد…" : "إرسال"}
          </button>
        </article>

        <article className="border border-black/10 bg-[#f6f6f3] p-5 md:p-7">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-[#14241c]">2. راجع خطة التنفيذ</h2>
              <p className="mt-1 text-xs text-black/50">لا يعتمد النظام أي استنتاج غير محسوم.</p>
            </div>
            {preview?.expiresAt && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-black/45">
                <Clock3 className="h-3.5 w-3.5" /> صالحة 10 دقائق
              </span>
            )}
          </div>

          {!preview ? (
            <div className="grid min-h-60 place-items-center border border-dashed border-black/15 bg-white/50 p-8 text-center">
              <div>
                <Bot className="mx-auto h-9 w-9 text-black/20" />
                <p className="mt-4 text-sm font-bold text-black/45">ستظهر هنا الإجراءات الفعلية قبل التنفيذ.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {preview.blockingIssues.length > 0 && !preview.conversation?.needsReply && (
                <div className="border border-red-200 bg-red-50 p-4">
                  <h3 className="flex items-center gap-2 text-sm font-black text-red-900"><AlertTriangle className="h-4 w-4" /> يلزم تصحيح الطلب</h3>
                  <ul className="mt-3 space-y-2 text-xs leading-6 text-red-800">
                    {preview.blockingIssues.map((issue) => <li key={issue}>• {issue}</li>)}
                  </ul>
                </div>
              )}
              {preview.warnings.length > 0 && (
                <div className="border border-amber-200 bg-amber-50 p-4 text-xs leading-6 text-amber-900">
                  {preview.warnings.map((warning) => <p key={warning}>• {warning}</p>)}
                </div>
              )}
              <div className="border border-black/10 bg-white px-4 py-3 text-[11px] font-bold text-black/55">
                {preview.extractor.mode === "local-model"
                  ? `فهم محلي: ${preview.extractor.model ?? "Qwen"}${preview.extractor.latencyMs ? ` · ${preview.extractor.latencyMs}ms` : ""}`
                  : preview.extractor.mode === "deterministic-fallback"
                    ? "تمت مراجعة الأجزاء المفهومة. النموذج المحلي العام غير متصل حاليًا."
                    : "تم ترتيب البيانات والتحقق من الحقول."}
              </div>
              {preview.extractor.modelBinding && (
                <div className="border border-black/10 bg-white px-4 py-3 font-mono text-[10px] text-black/55" dir="ltr">
                  <p className="font-black text-[#14241c]">Preview model · {preview.extractor.modelBinding.activeModelKey}</p>
                  <p className="mt-1 break-all">identity {preview.extractor.modelBinding.modelIdentitySha256}</p>
                  <p className="mt-1 break-all">base {preview.extractor.modelBinding.baseModelRevision} · adapter {preview.extractor.modelBinding.adapterModelSha256}</p>
                </div>
              )}
              {preview.run && (
                <div className="grid gap-2 border border-black/10 bg-white px-4 py-3 text-[10px] text-black/55 sm:grid-cols-2" dir="ltr">
                  <span className="font-mono">Run {preview.run.runId}</span>
                  <span className="font-mono sm:text-right">Plan r{preview.run.planRevision ?? 1} · {preview.operationContract.hash.slice(0, 12)}</span>
                </div>
              )}
              {preview.retrieval?.matches.length > 0 && (
                <section className="border border-[#14241c]/10 bg-[#eef1ed] p-4" aria-labelledby="retrieval-matches-title">
                  <h3 id="retrieval-matches-title" className="text-xs font-black text-[#14241c]">السجلات التي طابقها النظام</h3>
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {preview.retrieval.matches.map((match) => (
                      <li key={`${match.kind}:${match.ref}`} className="border border-[#14241c]/10 bg-white px-3 py-2 text-[10px] text-black/65">
                        <span className="font-black text-[#8c343c]">{RETRIEVAL_KIND_LABELS[match.kind]}</span>
                        <span className="mx-1.5">{match.label}</span>
                        <span className="font-mono text-black/40" dir="ltr">#{match.ref}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3 border border-black/10 bg-white p-3">
                <button
                  type="button"
                  onClick={editRequest}
                  className="inline-flex items-center gap-2 border border-[#8c343c]/25 px-3 py-2 text-[11px] font-black text-[#8c343c] hover:bg-[#8c343c]/5"
                >
                  <PencilLine className="h-3.5 w-3.5" /> تعديل الطلب
                </button>
                {preview.planToken && preview.actions.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold text-black/50">
                    <span>{selectedActionIds.length} من {preview.actions.length} محدد</span>
                    <button type="button" onClick={selectAllActions} className="border border-black/10 px-2.5 py-1.5 text-[#14241c] hover:border-[#14241c]/30">تحديد الكل</button>
                    <button type="button" onClick={clearActionSelection} className="border border-black/10 px-2.5 py-1.5 text-[#8c343c] hover:border-[#8c343c]/30">إلغاء التحديد</button>
                  </div>
                )}
              </div>
              <ol className="space-y-3">
                {preview.actions.map((action, index) => (
                  <li key={action.id} className={`border bg-white p-4 transition ${selectedActionIdSet.has(action.id) ? "border-[#14241c]/25" : "border-black/8 opacity-60"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex gap-3">
                        <label className={`flex shrink-0 items-center gap-2 ${preview.planToken ? "cursor-pointer" : "cursor-not-allowed"}`} aria-label={`اختيار الإجراء ${index + 1}: ${action.title}`}>
                          <input
                            type="checkbox"
                            checked={selectedActionIdSet.has(action.id)}
                            disabled={!preview.planToken}
                            onChange={() => toggleAction(action.id)}
                            className="h-4 w-4 accent-[#8c343c] disabled:cursor-not-allowed"
                          />
                          <span className="grid h-7 w-7 place-items-center bg-[#14241c] font-mono text-[10px] font-bold text-white" dir="ltr">{String(index + 1).padStart(2, "0")}</span>
                        </label>
                        <div>
                          <h3 className="text-sm font-black text-[#14241c]">{action.title}</h3>
                          <p className="mt-1 text-xs leading-5 text-black/55">{action.description}</p>
                        </div>
                      </div>
                      <span className={`shrink-0 px-2 py-1 text-[9px] font-black ${action.risk === "HIGH" ? "bg-red-100 text-red-800" : action.risk === "MEDIUM" ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800"}`}>
                        {RISK_LABELS[action.risk]}
                      </span>
                    </div>
                    {(action.details?.length ?? 0) > 0 && (
                      <dl className="mt-4 grid gap-2 border-t border-black/8 pt-3 sm:grid-cols-2">
                        {action.details?.map((detail, detailIndex) => {
                          const hasPreviousValue = detail.previousValue !== undefined;
                          return (
                            <div key={`${detail.label}:${detailIndex}`} className="bg-[#fafaf8] px-3 py-2.5">
                              <dt className="text-[9px] font-bold text-black/40">{detail.label}</dt>
                              <dd className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                                {hasPreviousValue && (
                                  <>
                                    <span className="text-black/45 line-through" dir="auto">{detail.previousValue || "—"}</span>
                                    <span className="font-mono text-[#8c343c]" aria-hidden="true">→</span>
                                  </>
                                )}
                                <strong className="font-black text-[#14241c]" dir="auto">{detail.value || "—"}</strong>
                              </dd>
                            </div>
                          );
                        })}
                      </dl>
                    )}
                  </li>
                ))}
              </ol>

              {preview.planToken && (
                <div className="border-t border-black/10 pt-4">
                  <label className="flex cursor-pointer items-start gap-3 bg-white p-4 text-xs font-bold leading-6 text-[#14241c]">
                    <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1 h-4 w-4 accent-[#8c343c]" />
                    راجعت التفاصيل القديمة والجديدة وأوافق على تنفيذ الإجراءات المحددة فقط ({selectedActionIds.length}).
                  </label>
                  <button
                    type="button"
                    disabled={!confirmed || busy !== null || selectedActionIds.length === 0 || !preview.run?.runId}
                    onClick={() => void apply()}
                    className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 bg-[#8c343c] px-6 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {busy === "apply" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    تنفيذ {selectedActionIds.length} إجراء بعد إنشاء نسخة رجوع
                  </button>
                </div>
              )}
            </div>
          )}
        </article>
      </section>

      <section className="border border-black/10 bg-white p-5 md:p-7" aria-labelledby="assistant-history-title">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <History className="h-5 w-5 text-[#8c343c]" />
            <div>
              <h2 id="assistant-history-title" className="text-xl font-black text-[#14241c]">سجل التنفيذ</h2>
              <p className="text-xs text-black/50">كل خطة مرتبطة بالمستخدم والنسخة الاحتياطية وتفاصيل التغييرات.</p>
            </div>
          </div>
          <button type="button" onClick={() => void loadHistory()} className="border border-black/10 p-2 text-black/50 hover:text-[#8c343c]" aria-label="تحديث السجل">
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
        {runs.length === 0 ? (
          <p className="border border-dashed border-black/15 bg-[#fafaf8] p-8 text-center text-sm text-black/45">لا توجد خطط منفذة بعد.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-right text-xs">
              <thead><tr className="border-b border-black/10 text-black/45"><th className="p-3">Run</th><th className="p-3">الحالة</th><th className="p-3">الخطة</th><th className="p-3">المخاطر</th><th className="p-3">الوقت</th><th className="p-3">الملخص</th></tr></thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.publicId} className="border-b border-black/8 align-top last:border-b-0">
                    <td className="max-w-40 truncate p-3 font-mono" dir="ltr">{run.publicId}</td>
                    <td className="p-3"><span className={`px-2 py-1 font-bold ${run.status === "SUCCEEDED" ? "bg-emerald-100 text-emerald-800" : run.status === "FAILED" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"}`}>{run.status}</span></td>
                    <td className="p-3">r{run.plans[0]?.revision ?? "—"} · {run._count.steps} خطوة · {run._count.approvals} موافقة</td>
                    <td className="p-3">{run.riskLevel}</td>
                    <td className="p-3">{new Date(run.createdAt).toLocaleString("ar-EG")}</td>
                    <td className="max-w-md p-3 text-black/60">{run.resultSummary || run.errorMessage || run.intent || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {jobs.length > 0 && <p className="mt-3 text-[10px] text-black/40">سجلات التنفيذ القديمة المحفوظة: {jobs.length}</p>}
          </div>
        )}
      </section>
    </div>
  );
}
