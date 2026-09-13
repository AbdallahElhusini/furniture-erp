"use client";

import { useCallback, useEffect, useState } from "react";
import { Archive, Database, Download, FileCheck2, Loader2, RefreshCw, ShieldCheck, Upload } from "lucide-react";

interface ModuleInfo {
  name: string;
  labelAr: string;
  labelEn: string;
  keyColumn: string;
  columns: Array<{ key: string; required?: boolean; description: string }>;
}

interface TransferJob {
  id: number;
  kind: string;
  scope: string;
  module: string | null;
  fileName: string | null;
  status: string;
  dryRun: boolean;
  rowCount: number;
  insertedCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  actorEmail: string | null;
  resultName: string | null;
  createdAt: string;
  _count: { issues: number; changes: number };
}

type Notice = { tone: "success" | "error" | "info"; text: string } | null;
type ValidationIssue = {
  module: string;
  sheet?: string;
  rowNumber?: number;
  field?: string;
  code?: string;
  message: string;
};

function fileNameFromResponse(response: Response, fallback: string): string {
  const disposition = response.headers.get("content-disposition") ?? "";
  return disposition.match(/filename="([^"]+)"/)?.[1] ?? fallback;
}

async function downloadResponse(response: Response, fallback: string) {
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(payload.error ?? "تعذر إنشاء الملف");
  }
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileNameFromResponse(response, fallback);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function DataManagementPage() {
  const [modules, setModules] = useState<ModuleInfo[]>([]);
  const [jobs, setJobs] = useState<TransferJob[]>([]);
  const [selectedModule, setSelectedModule] = useState("clients");
  const [backupScope, setBackupScope] = useState("FULL_BUSINESS");
  const [spreadsheet, setSpreadsheet] = useState<File | null>(null);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);

  const loadData = useCallback(async () => {
    const [moduleResponse, jobResponse] = await Promise.all([
      fetch("/api/data-management/modules", { cache: "no-store" }),
      fetch("/api/data-management/jobs?limit=30", { cache: "no-store" }),
    ]);
    if (moduleResponse.ok) setModules(((await moduleResponse.json()) as { modules: ModuleInfo[] }).modules);
    if (jobResponse.ok) setJobs(((await jobResponse.json()) as { jobs: TransferJob[] }).jobs);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadData(), 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const run = async (key: string, operation: () => Promise<void>) => {
    setBusy(key); setNotice(null); setIssues([]);
    try { await operation(); await loadData(); }
    catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "حدث خطأ غير متوقع" }); }
    finally { setBusy(null); }
  };

  const importSheet = (dryRun: boolean) => run(dryRun ? "import-check" : "import-apply", async () => {
    if (!spreadsheet) throw new Error("اختر ملف XLSX أو CSV أولاً");
    if (!dryRun && !window.confirm("سيتم أخذ نسخة كاملة تلقائياً ثم تطبيق UPSERT. هل تريد المتابعة؟")) return;
    const form = new FormData();
    form.set("file", spreadsheet);
    form.set("dryRun", String(dryRun));
    if (spreadsheet.name.toLowerCase().endsWith(".csv")) form.set("module", selectedModule);
    const response = await fetch("/api/data-management/import", { method: "POST", body: form });
    const result = await response.json() as { errorCount?: number; rowCount?: number; insertedCount?: number; updatedCount?: number; skippedCount?: number; issues?: ValidationIssue[] };
    setIssues(result.issues ?? []);
    if (!response.ok) throw new Error(result.issues?.[0]?.message ?? "فشل فحص الملف");
    setNotice({ tone: "success", text: dryRun
      ? `الفحص سليم: ${result.rowCount ?? 0} صف جاهز، ولا توجد كتابة.`
      : `تم التطبيق: ${result.insertedCount ?? 0} جديد، ${result.updatedCount ?? 0} محدث، ${result.skippedCount ?? 0} متخطى.` });
  });

  const restore = (dryRun: boolean) => run(dryRun ? "restore-check" : "restore-apply", async () => {
    if (!restoreFile) throw new Error("اختر ملف النسخة الاحتياطية أولاً");
    if (!dryRun && !window.confirm("سيتم إنشاء نسخة ما قبل الاستعادة ثم دمج السجلات بلا حذف. هل تريد المتابعة؟")) return;
    const form = new FormData(); form.set("file", restoreFile); form.set("dryRun", String(dryRun));
    const response = await fetch("/api/data-management/restore", { method: "POST", body: form });
    const result = await response.json() as { rowCount?: number; restoredCount?: number; preRestoreBackup?: string; issues?: ValidationIssue[] };
    setIssues(result.issues ?? []);
    if (!response.ok) throw new Error(result.issues?.[0]?.message ?? "فشل فحص النسخة");
    setNotice({ tone: "success", text: dryRun
      ? `النسخة سليمة: ${result.rowCount ?? 0} سجل، ولا توجد كتابة.`
      : `تمت استعادة ${result.restoredCount ?? 0} سجل. نقطة الرجوع: ${result.preRestoreBackup ?? "تم إنشاؤها"}.` });
  });

  const download = (key: string, url: string, fallback: string, init?: RequestInit) => run(key, async () => {
    await downloadResponse(await fetch(url, init), fallback);
    setNotice({ tone: "success", text: "تم إنشاء الملف وتنزيله." });
  });

  return (
    <div className="mx-auto max-w-[1500px] space-y-7 p-4 pb-16 md:p-8" dir="rtl">
      <header className="border-b border-black/10 pb-6">
        <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#8c343c]">
          <Database className="h-4 w-4" /> HATAB / Data Center
        </div>
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-[#14241c] md:text-5xl">مركز تحديث ونسخ بيانات ERP</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-black/60">ارفع ملف Excel يومياً، افحصه بالكامل، ثم طبّق التحديثات الآمنة. يدعم النظام 24 وحدة أعمال مع قوالب مستقلة ونسخة كاملة أو كتالوج أو تشغيل أو محتوى.</p>
          </div>
          <button onClick={() => void loadData()} className="inline-flex h-11 items-center justify-center gap-2 border border-black/15 bg-white px-5 text-sm font-bold hover:bg-black/[0.03]">
            <RefreshCw className="h-4 w-4" /> تحديث السجل
          </button>
        </div>
      </header>

      {notice && <div className={`border p-4 text-sm font-bold ${notice.tone === "error" ? "border-red-300 bg-red-50 text-red-800" : notice.tone === "success" ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-blue-300 bg-blue-50"}`}>{notice.text}</div>}

      {issues.length > 0 && (
        <section className="border border-red-200 bg-red-50/60 p-5" aria-labelledby="data-issues-title">
          <div className="flex items-center justify-between gap-3">
            <h2 id="data-issues-title" className="font-black text-red-900">تفاصيل الفحص ({issues.length})</h2>
            <span className="text-xs text-red-700">صحّح الملف ثم أعد تشغيل الفحص فقط</span>
          </div>
          <ol className="mt-4 max-h-72 space-y-2 overflow-y-auto text-xs text-red-950">
            {issues.slice(0, 100).map((item, index) => (
              <li key={`${item.module}-${item.rowNumber ?? 0}-${item.field ?? ""}-${item.code ?? ""}-${index}`} className="grid gap-1 border-t border-red-200/70 pt-2 md:grid-cols-[14rem_1fr]">
                <span className="font-mono text-[11px] text-red-700" dir="ltr">
                  {item.module}{item.sheet ? ` / ${item.sheet}` : ""}{item.rowNumber ? ` / row ${item.rowNumber}` : ""}{item.field ? ` / ${item.field}` : ""}
                </span>
                <span>{item.message}{item.code ? <span className="mr-2 font-mono text-[10px] text-red-500">{item.code}</span> : null}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-3">
        {[
          [ShieldCheck, "لا حذف في الإصدار الأول", "UPSERT فقط؛ الأعمدة غير الموجودة والخلايا الفارغة لا تمسح القيمة الحالية."],
          [Archive, "نسخة قبل كل تغيير", "أي Import أو Restore فعلي يتوقف إذا تعذر حفظ نقطة رجوع كاملة."],
          [FileCheck2, "البيانات الأمنية مستبعدة", "لا يتم تصدير أو استعادة المستخدمين أو كلمات المرور أو الجلسات."],
        ].map(([Icon, title, text]) => {
          const CardIcon = Icon as typeof ShieldCheck;
          return <div key={String(title)} className="border border-black/10 bg-[#f6f6f3] p-5"><CardIcon className="mb-5 h-6 w-6 text-[#8c343c]" /><h2 className="font-black text-[#14241c]">{String(title)}</h2><p className="mt-2 text-xs leading-6 text-black/55">{String(text)}</p></div>;
        })}
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="border border-black/10 bg-white p-5 md:p-7">
          <div className="mb-6 flex items-center gap-3"><Upload className="h-5 w-5 text-[#8c343c]" /><div><h2 className="text-xl font-black">التحديث اليومي</h2><p className="text-xs text-black/50">Daily spreadsheet sync · XLSX bundle or one-module CSV</p></div></div>
          <label className="block border border-dashed border-black/25 bg-[#fafaf8] p-6 text-center">
            <input type="file" accept=".xlsx,.csv" className="block w-full text-sm" onChange={(event) => setSpreadsheet(event.target.files?.[0] ?? null)} />
          </label>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="text-xs font-bold">وحدة CSV<select value={selectedModule} onChange={(event) => setSelectedModule(event.target.value)} className="mt-2 h-11 w-full border border-black/15 bg-white px-3">{modules.map((module) => <option key={module.name} value={module.name}>{module.labelAr} · {module.name}</option>)}</select></label>
            <div className="flex items-end gap-2">
              <button disabled={Boolean(busy)} onClick={() => void importSheet(true)} className="h-11 flex-1 border border-[#14241c] px-3 text-sm font-black disabled:opacity-50">{busy === "import-check" ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "1. فحص فقط"}</button>
              <button disabled={Boolean(busy)} onClick={() => void importSheet(false)} className="h-11 flex-1 bg-[#14241c] px-3 text-sm font-black text-white disabled:opacity-50">{busy === "import-apply" ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "2. تطبيق آمن"}</button>
            </div>
          </div>
        </article>

        <article className="border border-black/10 bg-white p-5 md:p-7">
          <div className="mb-6 flex items-center gap-3"><Download className="h-5 w-5 text-[#8c343c]" /><div><h2 className="text-xl font-black">القوالب والتصدير</h2><p className="text-xs text-black/50">Separate modules or a complete workbook</p></div></div>
          <select value={selectedModule} onChange={(event) => setSelectedModule(event.target.value)} className="h-11 w-full border border-black/15 bg-white px-3 text-sm">{modules.map((module) => <option key={module.name} value={module.name}>{module.labelAr} · {module.labelEn}</option>)}</select>
          <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3">
            <button disabled={Boolean(busy)} onClick={() => void download("template-one", `/api/data-management/template?module=${selectedModule}`, "template.xlsx")} className="h-11 border border-black/15 text-sm font-bold">قالب الوحدة XLSX</button>
            <button disabled={Boolean(busy)} onClick={() => void download("template-one-csv", `/api/data-management/template?format=csv&module=${selectedModule}`, "template.csv")} className="h-11 border border-black/15 text-sm font-bold">قالب الوحدة CSV</button>
            <button disabled={Boolean(busy)} onClick={() => void download("export-one", `/api/data-management/export?modules=${selectedModule}`, "export.xlsx")} className="h-11 border border-black/15 text-sm font-bold">تصدير الوحدة</button>
            <button disabled={Boolean(busy)} onClick={() => void download("export-one-csv", `/api/data-management/export?format=csv&modules=${selectedModule}`, "export.csv")} className="h-11 border border-black/15 text-sm font-bold">تصدير الوحدة CSV</button>
            <button disabled={Boolean(busy)} onClick={() => void download("template-all", "/api/data-management/template", "hatab-template.xlsx")} className="h-11 border border-black/15 text-sm font-bold">قالب كل الوحدات</button>
            <button disabled={Boolean(busy)} onClick={() => void download("export-all", "/api/data-management/export", "hatab-export.xlsx")} className="h-11 bg-[#8c343c] text-sm font-bold text-white">تصدير كل الوحدات</button>
          </div>
        </article>

        <article className="border border-black/10 bg-white p-5 md:p-7">
          <div className="mb-6 flex items-center gap-3"><Archive className="h-5 w-5 text-[#8c343c]" /><div><h2 className="text-xl font-black">نسخة احتياطية موثوقة</h2><p className="text-xs text-black/50">Lossless JSON · merge restore · no security tables</p></div></div>
          <select value={backupScope} onChange={(event) => setBackupScope(event.target.value)} className="h-11 w-full border border-black/15 bg-white px-3 text-sm"><option value="FULL_BUSINESS">كامل الأعمال + الكتالوج + المحتوى</option><option value="OPERATIONS">التشغيل والمحاسبة والمهام</option><option value="CATALOG">المنتجات والتصنيفات والمجموعات</option><option value="CONTENT">النصوص والبنرات والإعدادات الآمنة</option></select>
          <button disabled={Boolean(busy)} onClick={() => void download("backup", "/api/data-management/backup", "hatab-backup.json", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: backupScope }) })} className="mt-4 h-11 w-full bg-[#14241c] text-sm font-black text-white">إنشاء وحفظ وتنزيل النسخة</button>
          <p className="mt-3 text-[11px] leading-5 text-amber-800">تحتوي النسخة على بيانات أعمال بصيغة مقروءة. احفظها في مجلد بصلاحيات مقيدة وطبّق سياسة احتفاظ وحذف آمنة.</p>
        </article>

        <article className="border border-[#8c343c]/30 bg-[#fffafa] p-5 md:p-7">
          <div className="mb-6 flex items-center gap-3"><RefreshCw className="h-5 w-5 text-[#8c343c]" /><div><h2 className="text-xl font-black">فحص / استعادة نسخة</h2><p className="text-xs text-black/50">Integrity + schema + field + foreign-key preflight</p></div></div>
          <input type="file" accept=".json,application/json" className="block w-full border border-dashed border-black/25 bg-white p-5 text-sm" onChange={(event) => setRestoreFile(event.target.files?.[0] ?? null)} />
          <div className="mt-4 flex gap-2"><button disabled={Boolean(busy)} onClick={() => void restore(true)} className="h-11 flex-1 border border-[#8c343c] text-sm font-black">فحص فقط</button><button disabled={Boolean(busy)} onClick={() => void restore(false)} className="h-11 flex-1 bg-[#8c343c] text-sm font-black text-white">استعادة بعد الفحص</button></div>
        </article>
      </section>

      <section className="border border-black/10 bg-white p-5 md:p-7">
        <div className="mb-5 flex items-end justify-between"><div><h2 className="text-xl font-black">الوحدات المدعومة ({modules.length})</h2><p className="mt-1 text-xs text-black/50">لكل وحدة قالب واستيراد وتصدير؛ النسخ الاحتياطية تشمل حقولها الداخلية أيضاً.</p></div></div>
        <div className="flex flex-wrap gap-2">{modules.map((module) => <span key={module.name} title={`Key: ${module.keyColumn}`} className="border border-black/10 bg-[#f6f6f3] px-3 py-2 text-xs font-bold">{module.labelAr} <span className="text-black/35">{module.name}</span></span>)}</div>
      </section>

      <section className="overflow-hidden border border-black/10 bg-white">
        <div className="border-b border-black/10 p-5"><h2 className="text-xl font-black">سجل العمليات</h2></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-right text-xs"><thead className="bg-[#f6f6f3] text-black/55"><tr>{["#", "النوع", "النطاق", "الحالة", "الملف", "الصفوف", "جديد", "محدث", "أخطاء", "المنفذ", "الوقت"].map((head) => <th key={head} className="px-4 py-3 font-bold">{head}</th>)}</tr></thead><tbody>{jobs.map((job) => <tr key={job.id} className="border-t border-black/5"><td className="px-4 py-3 font-mono">{job.id}</td><td className="px-4 py-3 font-bold">{job.kind}{job.dryRun ? " · DRY" : ""}</td><td className="px-4 py-3">{job.module ?? job.scope}</td><td className="px-4 py-3"><span className={`px-2 py-1 font-bold ${job.status === "SUCCESS" ? "bg-emerald-50 text-emerald-800" : job.status === "FAILED" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-800"}`}>{job.status}</span></td><td className="max-w-48 truncate px-4 py-3" title={job.fileName ?? job.resultName ?? ""}>{job.fileName ?? job.resultName ?? "—"}</td><td className="px-4 py-3">{job.rowCount}</td><td className="px-4 py-3">{job.insertedCount}</td><td className="px-4 py-3">{job.updatedCount}</td><td className="px-4 py-3">{job.errorCount}</td><td className="px-4 py-3">{job.actorEmail ?? "—"}</td><td className="px-4 py-3" dir="ltr">{new Date(job.createdAt).toLocaleString("ar-EG")}</td></tr>)}</tbody></table></div>
      </section>
    </div>
  );
}
