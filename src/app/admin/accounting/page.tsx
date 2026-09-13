"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Download, Plus, RefreshCw, Save, X, Pencil, Ban, Search, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";
import type { LedgerKind } from "@/lib/accounting/validation";
import type { LedgerRow } from "@/lib/accounting/service";

type ProjectBalance = { id: number; title: string; clientName: string; totalPrice: number; totalCost: number; amountPaid: number; remaining: number; status: string };
type SupplierBalance = { id: number; projectId: number; supplierName: string; totalAmount: number; amountPaid: number; remaining: number; status: string };
type Snapshot = { rows: LedgerRow[]; projects: ProjectBalance[]; supplierOrders: SupplierBalance[]; summary: { cashIn: number; cashOut: number; netCash: number; customerDue: number; supplierDue: number; legacyCustomerBalance: number; legacySupplierBalance: number } };
type Draft = { key?: string; token?: string; requestKey: string; kind: LedgerKind; amount: string; date: string; method: string; projectId: string; supplierOrderId: string; description: string; category: string; notes: string };
const kinds: Record<LedgerKind, string> = { RECEIPT: "تحصيل عميل", SUPPLIER_PAYMENT: "دفعة مصنع / مورد", EXPENSE: "مصروف تشغيل", OTHER_INCOME: "إيراد آخر" };
const methods: Record<string, string> = { CASH: "نقدي", BANK_TRANSFER: "تحويل بنكي", CHECK: "شيك" };
const control = "h-10 w-full min-w-28 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-900 focus:outline-2 focus:outline-[#80363D] disabled:bg-slate-100";
const cell = "border-b border-l border-slate-200 px-3 py-3 text-right align-top";

async function fetchSnapshot(query: string, signal?: AbortSignal): Promise<Snapshot> {
  const response = await fetch(`/api/accounting?${query}`, { cache: "no-store", signal });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "تعذر تحميل الحسابات.");
  return body;
}

export default function AccountingPage() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [voidRow, setVoidRow] = useState<LedgerRow | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [tab, setTab] = useState<"ledger" | "projects" | "suppliers">("ledger");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [kind, setKind] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      setData(await fetchSnapshot(filter)); setPage(1);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "تعذر تحميل الحسابات."); }
    finally { setLoading(false); }
  }, [filter]);
  useEffect(() => {
    const controller = new AbortController();
    fetchSnapshot(filter, controller.signal).then((snapshot) => { setData(snapshot); setPage(1); setError(""); })
      .catch((caught: unknown) => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "تعذر تحميل الحسابات."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filter]);

  const start = () => { setDraft({ requestKey: crypto.randomUUID(), kind: "RECEIPT", amount: "", date: new Date().toLocaleDateString("en-CA"), method: "CASH", projectId: "", supplierOrderId: "", description: "", category: "", notes: "" }); setTab("ledger"); setNotice(""); };
  const edit = (row: LedgerRow) => { setDraft({ ...row, amount: String(row.amount), category: row.category ?? "", notes: row.notes ?? "", projectId: String(row.projectId ?? ""), supplierOrderId: String(row.supplierOrderId ?? ""), requestKey: crypto.randomUUID() }); setNotice(""); };
  const change = (field: keyof Draft, value: string) => setDraft((previous) => previous ? { ...previous, [field]: value } : previous);

  async function save() {
    if (!draft || saving) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/accounting", { method: draft.key ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "تعذر حفظ الحركة.");
      setDraft(null); setNotice(body.duplicate ? "هذه الحركة محفوظة بالفعل، لم تُكرر." : "تم حفظ الحركة وتحديث الحساب المرتبط بها."); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "تعذر حفظ الحركة."); }
    finally { setSaving(false); }
  }

  async function cancelEntry() {
    if (!voidRow || saving) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/accounting", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "VOID", key: voidRow.key, token: voidRow.token, reason: voidReason }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "تعذر إلغاء الحركة.");
      setVoidRow(null); setVoidReason(""); setNotice("تم إلغاء الحركة وتحديث الرصيد؛ ستظل محفوظة في السجل."); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "تعذر إلغاء الحركة."); }
    finally { setSaving(false); }
  }

  async function download(format: "xlsx" | "csv") {
    setError("");
    try {
      const response = await fetch(`/api/accounting?${filter}&format=${format}`);
      if (!response.ok) { const body = await response.json(); throw new Error(body.error || "تعذر تنزيل الملف."); }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a"); link.href = url; link.download = `hatab-accounts.${format}`; link.click(); URL.revokeObjectURL(url);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "تعذر التنزيل."); }
  }

  return <div className="space-y-6" dir="rtl">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="mb-1 text-xs font-bold tracking-widest text-[#80363D]">HATAB / ACCOUNTS</p><h1 className="text-2xl font-bold text-slate-900">حسابات الشغل</h1><p className="mt-2 max-w-2xl text-sm leading-7 text-slate-500">كل التحصيلات ودفعات المصانع والمصروفات في شيت واحد. أضف حركة أو عدّل صفًا، ويتحدث حساب المشروع أو المصنع معها.</p></div>
      <div className="flex flex-wrap gap-2"><Button onClick={start} disabled={!!draft || loading}><Plus className="h-4 w-4" />حركة جديدة</Button><Button variant="outline" onClick={() => void download("xlsx")} disabled={!data}><FileSpreadsheet className="h-4 w-4" />تنزيل Excel</Button><Button variant="outline" onClick={() => void download("csv")} disabled={!data}><Download className="h-4 w-4" />CSV</Button><Button variant="outline" onClick={() => void load()} disabled={loading || !!draft} aria-label="تحديث الحسابات"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></Button></div>
    </div>
    {error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
    {notice && <div role="status" className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">{notice}</div>}
    {data && <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">{[
      ["وارد الحركات", data.summary.cashIn, "في الفترة والفلتر المحددين"], ["صادر الحركات", data.summary.cashOut, "في الفترة والفلتر المحددين"], ["صافي الحركة", data.summary.netCash, "الوارد ناقص الصادر؛ ليس الربح"], ["المتبقي على العملاء", data.summary.customerDue, "كل المشاريع غير الملغاة"], ["المتبقي للمصانع", data.summary.supplierDue, "كل أوامر التوريد"],
    ].map(([title, value, hint]) => <div key={String(title)} className="rounded-lg border border-slate-200 bg-white p-4"><p className="text-xs text-slate-600">{title}</p><p className="my-2 text-xl font-bold text-slate-900" dir="ltr">{formatCurrency(Number(value))}</p><p className="text-[11px] leading-5 text-slate-500">{hint}</p></div>)}</div>}
    {data && (Math.abs(data.summary.legacyCustomerBalance) > 0.01 || Math.abs(data.summary.legacySupplierBalance) > 0.01) && <div className="border-r-2 border-amber-500 bg-amber-50 p-3 text-xs leading-6 text-amber-900">توجد أرصدة سابقة لا يقابلها سجل حركة مفصل: العملاء {formatCurrency(data.summary.legacyCustomerBalance)}، المصانع {formatCurrency(data.summary.legacySupplierBalance)}. تظهر ضمن حسابات المشاريع والمصانع ولا تُحتسب كحركات جديدة.</div>}
    <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3" role="tablist" aria-label="دفاتر الحسابات">{([ ["ledger", "شيت الحركات"], ["projects", "حسابات المشاريع"], ["suppliers", "حسابات المصانع"] ] as const).map(([value, label]) => <button key={value} role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={`rounded-md px-4 py-2 text-sm font-semibold ${tab === value ? "bg-[#80363D] text-white" : "bg-white text-slate-600"}`}>{label}</button>)}</div>
    {tab === "ledger" && <>
      <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); setFilter(new URLSearchParams({ from, to, kind, q: search }).toString()); }}>
        <label className="text-xs text-slate-600">من<Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="mt-1 bg-white" /></label><label className="text-xs text-slate-600">إلى<Input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="mt-1 bg-white" /></label>
        <label className="text-xs text-slate-600">النوع<select className={`${control} mt-1`} value={kind} onChange={(event) => setKind(event.target.value)}><option value="">كل الحركات</option>{Object.entries(kinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="min-w-44 flex-1 text-xs text-slate-600">بحث<Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="عميل، مشروع، مصنع أو بيان..." className="mt-1 bg-white" /></label><Button type="submit" variant="outline" disabled={!!draft}><Search className="h-4 w-4" />تطبيق</Button>
      </form>
      {draft && <form className="space-y-4 rounded-lg border border-[#80363D]/30 bg-white p-4 shadow-sm" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <div className="flex items-center justify-between"><h2 className="font-bold">{draft.key ? "تعديل الحركة" : "إضافة حركة"}</h2><button type="button" aria-label="إغلاق تعديل الحركة" disabled={saving} onClick={() => setDraft(null)}><X className="h-5 w-5" /></button></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-1 text-xs">نوع الحركة<select className={control} disabled={!!draft.key || saving} value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value as LedgerKind, projectId: "", supplierOrderId: "" })}>{Object.entries(kinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="space-y-1 text-xs">التاريخ<input required type="date" className={control} disabled={saving} value={draft.date} onChange={(event) => change("date", event.target.value)} /></label>
          <label className="space-y-1 text-xs">المبلغ (جنيه)<input required inputMode="decimal" type="text" className={control} disabled={saving} value={draft.amount} onChange={(event) => change("amount", event.target.value)} placeholder="6000.00" /></label>
          <label className="space-y-1 text-xs">طريقة الدفع<select className={control} disabled={saving} value={draft.method} onChange={(event) => change("method", event.target.value)}>{Object.entries(methods).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          {draft.kind === "SUPPLIER_PAYMENT" ? <label className="space-y-1 text-xs sm:col-span-2">أمر التوريد<select className={control} required disabled={!!draft.key || saving} value={draft.supplierOrderId} onChange={(event) => { const order = data?.supplierOrders.find((row) => row.id === Number(event.target.value)); setDraft({ ...draft, supplierOrderId: event.target.value, projectId: String(order?.projectId ?? "") }); }}><option value="">اختر المصنع وأمر التوريد</option>{data?.supplierOrders.map((row) => <option key={row.id} value={row.id}>#{row.id} — {row.supplierName} — المتبقي {formatCurrency(row.remaining)}</option>)}</select></label>
            : <label className="space-y-1 text-xs sm:col-span-2">{draft.kind === "RECEIPT" ? "مشروع العميل" : "المشروع المرتبط (اختياري)"}<select className={control} required={draft.kind === "RECEIPT"} disabled={!!draft.key || saving} value={draft.projectId} onChange={(event) => change("projectId", event.target.value)}><option value="">{draft.kind === "RECEIPT" ? "اختر مشروع العميل" : "مصروف / إيراد عام"}</option>{data?.projects.map((row) => <option key={row.id} value={row.id}>#{row.id} — {row.clientName} — {row.title}</option>)}</select></label>}
          {draft.kind !== "RECEIPT" && <><label className="space-y-1 text-xs">بيان الحركة<input required className={control} disabled={saving} maxLength={240} value={draft.description} onChange={(event) => change("description", event.target.value)} placeholder="دفعة تصنيع مكتب / نقل / إيجار..." /></label><label className="space-y-1 text-xs">التصنيف (اختياري)<input className={control} disabled={saving} maxLength={80} value={draft.category} onChange={(event) => change("category", event.target.value)} placeholder="نقل، تشغيل، إيجار..." /></label></>}
          <label className="space-y-1 text-xs sm:col-span-2 xl:col-span-4">ملاحظات / رقم إيصال<input className={control} disabled={saving} maxLength={2000} value={draft.notes} onChange={(event) => change("notes", event.target.value)} /></label>
        </div>
        <div className="flex gap-2"><Button type="submit" disabled={saving}><Save className="h-4 w-4" />{saving ? "جارٍ الحفظ..." : "حفظ الحركة"}</Button><Button type="button" variant="outline" disabled={saving} onClick={() => setDraft(null)}>إلغاء التعديل</Button></div>
      </form>}
      {voidRow && <form className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4" onSubmit={(event) => { event.preventDefault(); void cancelEntry(); }}><p className="text-sm">إلغاء «{voidRow.description}» بقيمة {formatCurrency(voidRow.amount)} سيعكس أثرها على الرصيد ويحتفظ بها في السجل.</p><label className="block text-xs">سبب الإلغاء<Input required minLength={3} maxLength={500} value={voidReason} onChange={(event) => setVoidReason(event.target.value)} className="mt-1 bg-white" /></label><div className="flex gap-2"><Button type="submit" disabled={saving}>تأكيد إلغاء الحركة</Button><Button type="button" variant="outline" disabled={saving} onClick={() => setVoidRow(null)}>رجوع</Button></div></form>}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white" tabIndex={0} aria-label="شيت الحركات المالية — مرر أفقيًا لرؤية بقية الأعمدة">
        <table className="w-full min-w-[1080px] border-collapse text-sm"><thead className="bg-slate-100 text-xs text-slate-600"><tr>{["التاريخ", "النوع", "العميل / المصنع", "المشروع", "البيان", "وارد", "صادر", "وسيلة الدفع", "الملاحظات", "تعديل"].map((title) => <th key={title} className={cell}>{title}</th>)}</tr></thead><tbody>{loading && !data ? <tr><td colSpan={10} className="p-10 text-center text-slate-500">جارٍ تحميل الحسابات...</td></tr> : data?.rows.slice((page - 1) * 50, page * 50).map((row) => <tr key={row.key} className={row.status === "VOID" ? "bg-slate-50 text-slate-400" : "hover:bg-slate-50"}>
          <td className={`${cell} whitespace-nowrap`}>{row.date}</td><td className={cell}>{kinds[row.kind]}{row.status === "VOID" && <span className="mt-1 block text-xs text-red-700">ملغاة</span>}</td><td className={cell}>{row.party || "—"}</td><td className={cell}>{row.projectId ? <Link href={`/admin/projects/${row.projectId}`} className="text-[#80363D] hover:underline">{row.projectTitle}</Link> : "—"}</td><td className={cell}>{row.description}{row.category && <span className="mt-1 block text-xs text-slate-500">{row.category}</span>}</td>
          <td className={`${cell} whitespace-nowrap font-semibold text-emerald-700`} dir="ltr">{row.kind === "RECEIPT" || row.kind === "OTHER_INCOME" ? formatCurrency(row.amount) : "—"}</td><td className={`${cell} whitespace-nowrap font-semibold text-[#80363D]`} dir="ltr">{row.kind === "SUPPLIER_PAYMENT" || row.kind === "EXPENSE" ? formatCurrency(row.amount) : "—"}</td><td className={cell}>{methods[row.method] ?? row.method}</td><td className={`${cell} max-w-52 whitespace-normal`}>{row.voidReason || row.notes || "—"}</td>
          <td className={cell}>{row.status === "POSTED" && <div className="flex gap-1"><Button size="icon" variant="ghost" aria-label={`تعديل ${row.description} ${row.amount}`} disabled={!!draft || saving} onClick={() => edit(row)}><Pencil className="h-4 w-4" /></Button>{row.kind !== "RECEIPT" && <Button size="icon" variant="ghost" aria-label={`إلغاء ${row.description} ${row.amount}`} disabled={!!draft || saving} onClick={() => { setVoidRow(row); setVoidReason(""); }}><Ban className="h-4 w-4" /></Button>}</div>}</td>
        </tr>)}{data?.rows.length === 0 && <tr><td colSpan={10} className="p-10 text-center text-slate-500">لا توجد حركات لهذا الفلتر. يمكنك إضافة أول حركة من الزر أعلى الصفحة.</td></tr>}</tbody></table>
      </div>
      {data && <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500"><span>{data.rows.length} حركة • الحركات الملغاة مستبعدة من الإجماليات</span><div className="flex items-center gap-3"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>السابق</Button><span>{page} / {Math.max(1, Math.ceil(data.rows.length / 50))}</span><Button variant="outline" size="sm" disabled={page * 50 >= data.rows.length} onClick={() => setPage(page + 1)}>التالي</Button></div></div>}
    </>}
    {tab === "projects" && <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white"><table className="w-full min-w-[780px] text-sm"><thead className="bg-slate-100"><tr>{["المشروع", "العميل", "سعر البيع", "التكلفة المقدرة", "المحصل", "المتبقي"].map((title) => <th key={title} className={cell}>{title}</th>)}</tr></thead><tbody>{data?.projects.map((row) => <tr key={row.id}><td className={cell}><Link href={`/admin/projects/${row.id}`} className="text-[#80363D] hover:underline">{row.title}</Link>{row.status === "CANCELLED" && <span className="block text-xs text-slate-500">مشروع ملغى</span>}</td><td className={cell}>{row.clientName}</td>{[row.totalPrice, row.totalCost, row.amountPaid, row.remaining].map((amount, index) => <td key={index} className={cell} dir="ltr">{formatCurrency(amount)}</td>)}</tr>)}</tbody></table><p className="p-4 text-xs text-slate-500">تعديل السعر والتكلفة يتم من تفاصيل المشروع وبنوده. لتسجيل دفعة جديدة اختر «حركة جديدة ← تحصيل عميل».</p></div>}
    {tab === "suppliers" && <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white"><table className="w-full min-w-[720px] text-sm"><thead className="bg-slate-100"><tr>{["أمر التوريد", "المصنع", "المشروع", "قيمة الأمر", "المدفوع", "المتبقي"].map((title) => <th key={title} className={cell}>{title}</th>)}</tr></thead><tbody>{data?.supplierOrders.map((row) => <tr key={row.id}><td className={cell}>#{row.id}</td><td className={cell}>{row.supplierName}</td><td className={cell}><Link href={`/admin/projects/${row.projectId}`} className="text-[#80363D] hover:underline">مشروع #{row.projectId}</Link></td>{[row.totalAmount, row.amountPaid, row.remaining].map((amount, index) => <td key={index} className={cell} dir="ltr">{formatCurrency(amount)}</td>)}</tr>)}</tbody></table><p className="p-4 text-xs text-slate-500">كل دفعة مصنع تتصل بأمر التوريد الخاص بها وتخصم من المتبقي عليه. الأرصدة السابقة محفوظة.</p></div>}
    <p className="text-xs leading-6 text-slate-500">Excel يتضمن الحركات وحسابات المشاريع والمصانع والملخص. CSV يتضمن الحركات فقط. للاستيراد والنسخ الاحتياطي استخدم <Link href="/admin/data-management" className="text-[#80363D] underline">مركز البيانات</Link>.</p>
  </div>;
}
