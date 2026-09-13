"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarClock, Download, FileText, FolderPlus, Loader2, Pencil, Plus, RefreshCw, Search, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CLIENT_STAGES, CLIENT_STAGE_LABELS, type ClientStage } from "@/lib/client-crm";
import { formatCurrency, getStatusLabel } from "@/lib/utils";

type Project = { id: number; title: string; status: string; totalPrice: number; amountPaid: number };
type Client = {
  id: number; name: string; phone: string; company: string | null; email: string | null; address: string | null;
  notes: string | null; stage: ClientStage; brief: string | null; source: string | null; nextFollowUpAt: string | null;
  updatedAt: string; projects: Project[]; totalSpent: number; totalPaid: number; outstandingBalance: number;
};
const emptyForm = { name: "", phone: "", company: "", email: "", address: "", notes: "", stage: "LEAD" as ClientStage, brief: "", source: "", nextFollowUpAt: "" };
type ClientForm = typeof emptyForm;
function formFor(client: Client): ClientForm {
  return { name: client.name, phone: client.phone, company: client.company || "", email: client.email || "", address: client.address || "", notes: client.notes || "", stage: client.stage, brief: client.brief || "", source: client.source || "", nextFollowUpAt: client.nextFollowUpAt?.slice(0, 10) || "" };
}
const fieldStyle = "h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a3940]/30";
const stageStyle: Record<ClientStage, string> = { LEAD: "bg-amber-50 text-amber-800", QUALIFIED: "bg-blue-50 text-blue-800", CUSTOMER: "bg-emerald-50 text-emerald-800", LOST: "bg-slate-100 text-slate-600" };
function today() { return new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" }); }
function due(client: Client) { return client.stage !== "LOST" && !!client.nextFollowUpAt && client.nextFollowUpAt.slice(0, 10) <= today(); }

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("ALL");
  const [dueOnly, setDueOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Client | null>(null);
  const [form, setForm] = useState<ClientForm>({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [projectTitle, setProjectTitle] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/clients", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر تحميل العملاء.");
      setClients(data);
      return data as Client[];
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحميل العملاء.");
      return null;
    } finally { setLoading(false); }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/clients", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "تعذر تحميل العملاء.");
        setClients(data);
        const params = new URLSearchParams(window.location.search);
        const matching = (data as Client[]).find((client) => String(client.id) === params.get("client"));
        if (matching) { setSelected(matching); setForm(formFor(matching)); setOpen(true); }
        else if (params.get("new") === "1") {
          setForm({ ...emptyForm, name: (params.get("name") || "").slice(0, 200), brief: (params.get("brief") || "").slice(0, 5000), source: "المساعد التنفيذي" });
          setOpen(true);
        }
      }).catch((caught) => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "تعذر تحميل العملاء."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  const filtered = useMemo(() => clients.filter((client) => {
    const matches = [client.name, client.phone, client.company, client.email, client.brief, client.source].join(" ").toLowerCase().includes(search.trim().toLowerCase());
    return matches && (stage === "ALL" || client.stage === stage) && (!dueOnly || due(client));
  }), [clients, search, stage, dueOnly]);
  const pages = Math.max(1, Math.ceil(filtered.length / 25));
  const activePage = Math.min(page, pages);
  const visible = filtered.slice((activePage - 1) * 25, activePage * 25);
  const setField = (key: keyof ClientForm, value: string) => setForm((current) => ({ ...current, [key]: value }));

  function edit(client: Client | null) {
    setSelected(client); setFormError(""); setProjectTitle("");
    setForm(client ? formFor(client) : { ...emptyForm });
    setOpen(true);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setFormError(""); setNotice("");
    try {
      const response = await fetch(selected ? `/api/clients/${selected.id}` : "/api/clients", {
        method: selected ? "PUT" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, nextFollowUpAt: form.nextFollowUpAt || null, expectedUpdatedAt: selected?.updatedAt }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر حفظ العميل.");
      setOpen(false); setNotice(selected ? "تم حفظ تعديلات العميل." : "تم إضافة العميل. يمكنك متابعة بياناته وإنشاء مشروع من ملفه.");
      await load();
    } catch (caught) { setFormError(caught instanceof Error ? caught.message : "تعذر الحفظ."); }
    finally { setSaving(false); }
  }

  async function remove(client: Client) {
    if (!window.confirm(`حذف العميل «${client.name}»؟ استخدم مرحلة «لم يتم الاتفاق» إذا كنت تحتاج الاحتفاظ بالمتابعة.`)) return;
    setSaving(true); setFormError("");
    try {
      const response = await fetch(`/api/clients/${client.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "تعذر الحذف.");
      setOpen(false); setNotice("تم حذف سجل العميل. عملية الحذف مسجلة في سجل التغييرات."); await load();
    } catch (caught) { setFormError(caught instanceof Error ? caught.message : "تعذر الحذف."); }
    finally { setSaving(false); }
  }

  async function createProject() {
    if (!selected || !projectTitle.trim()) return;
    setCreatingProject(true); setFormError("");
    try {
      const response = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        clientId: selected.id, title: projectTitle.trim(), type: "SIMPLE_ORDER", status: "LEAD", notes: selected.brief || null,
      }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "تعذر إنشاء المشروع.");
      const refreshed = await load();
      if (refreshed) setSelected(refreshed.find((client) => client.id === selected.id) ?? selected);
      setProjectTitle(""); setNotice(`تم إنشاء المشروع #${result.id}. افتحه لإضافة القطع والتكاليف.`);
    } catch (caught) { setFormError(caught instanceof Error ? caught.message : "تعذر إنشاء المشروع."); }
    finally { setCreatingProject(false); }
  }

  return <div className="mx-auto max-w-7xl space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><div className="mb-2 flex items-center gap-2 text-xs text-slate-500"><Users className="h-4 w-4" />علاقات العملاء</div><h1 className="text-2xl font-semibold">العملاء والمتابعة</h1><p className="mt-2 max-w-2xl text-sm leading-7 text-slate-500">من أول مكالمة إلى المشروع: سجّل البريف، بيانات التواصل، والخطوة القادمة في ملف واحد.</p></div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" asChild><Link href="/admin/data-management"><FileText className="h-4 w-4" />استيراد شيت</Link></Button><Button variant="outline" asChild><a href="/api/data-management/export?modules=clients&format=xlsx"><Download className="h-4 w-4" />تنزيل Excel</a></Button><Button onClick={() => edit(null)}><Plus className="h-4 w-4" />إضافة عميل</Button></div>
    </div>
    {notice && <div role="status" className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}
    {error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}<button className="mr-3 underline" onClick={() => void load()}>إعادة المحاولة</button></div>}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {CLIENT_STAGES.map((value) => <button key={value} onClick={() => { setStage(stage === value ? "ALL" : value); setPage(1); }} aria-pressed={stage === value} className={`rounded-lg border bg-white p-4 text-right ${stage === value ? "border-[#8a3940] ring-1 ring-[#8a3940]" : "border-slate-200"}`}><span className="text-xs text-slate-500">{CLIENT_STAGE_LABELS[value]}</span><strong className="mt-2 block text-2xl font-semibold">{clients.filter((client) => client.stage === value).length}</strong></button>)}
    </div>
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4">
        <div className="relative min-w-48 flex-1"><Search className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-slate-400" /><Input aria-label="ابحث عن عميل" placeholder="الاسم، الهاتف، البريف أو مصدر العميل" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className="pr-9" /></div>
        <select aria-label="مرحلة العميل" className={`${fieldStyle} w-auto`} value={stage} onChange={(event) => { setStage(event.target.value); setPage(1); }}><option value="ALL">كل المراحل</option>{CLIENT_STAGES.map((value) => <option key={value} value={value}>{CLIENT_STAGE_LABELS[value]}</option>)}</select>
        <Button variant={dueOnly ? "default" : "outline"} onClick={() => { setDueOnly(!dueOnly); setPage(1); }} aria-pressed={dueOnly}><CalendarClock className="h-4 w-4" />متابعة اليوم ({clients.filter(due).length})</Button>
        <Button variant="outline" aria-label="تحديث العملاء" disabled={loading} onClick={() => void load()}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></Button>
      </div>
      {loading ? <div role="status" className="flex items-center justify-center gap-2 p-12 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" />جارٍ تحميل العملاء…</div> : visible.length === 0 ? <div className="p-12 text-center"><Users className="mx-auto mb-3 h-8 w-8 text-slate-300" /><p className="font-medium">{clients.length ? "لا توجد نتائج بهذه الفلاتر" : "سجّل أول عميل محتمل"}</p><p className="mt-2 text-sm text-slate-500">يمكنك البدء بالاسم والبريف واستكمال رقم الهاتف لاحقاً.</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-right text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr>{["العميل والتواصل", "المرحلة", "البريف", "المتابعة القادمة", "المشاريع / المستحق", ""].map((heading, index) => <th key={index} scope="col" className="p-4 font-medium">{heading}</th>)}</tr></thead><tbody>{visible.map((client) => <tr key={client.id} className="border-t border-slate-100 hover:bg-slate-50/60">
        <td className="p-4"><button onClick={() => edit(client)} className="text-right font-semibold hover:text-[#8a3940]">{client.name}</button><div className="mt-1 text-xs text-slate-500">{client.company || `#${client.id}`}</div><div className="mt-1 text-xs" dir="ltr">{client.phone ? <a href={`tel:${client.phone}`} className="text-slate-500 hover:underline">{client.phone}</a> : <span className="text-amber-700">لم يُسجّل الهاتف</span>}</div></td>
        <td className="p-4"><span className={`whitespace-nowrap rounded px-2 py-1 text-xs ${stageStyle[client.stage] || stageStyle.LEAD}`}>{CLIENT_STAGE_LABELS[client.stage] || client.stage}</span>{client.source && <p className="mt-2 text-xs text-slate-500">{client.source}</p>}</td>
        <td className="max-w-72 p-4"><p className="line-clamp-2 leading-6 text-slate-600">{client.brief || "—"}</p></td>
        <td className="p-4"><span className={due(client) ? "font-medium text-amber-700" : "text-slate-500"}>{client.nextFollowUpAt ? new Date(client.nextFollowUpAt).toLocaleDateString("ar-EG") : "غير محددة"}</span></td>
        <td className="p-4"><span>{client.projects.length} مشاريع</span><p className="mt-1 text-xs text-slate-500">{formatCurrency(client.outstandingBalance)}</p></td>
        <td className="p-4"><Button variant="ghost" size="sm" onClick={() => edit(client)} aria-label={`فتح ملف ${client.name}`}><Pencil className="h-4 w-4" />فتح الملف</Button></td>
      </tr>)}</tbody></table></div>}
      <div className="flex items-center justify-between border-t border-slate-100 p-4 text-xs text-slate-500"><span>{filtered.length} عميل · صفحة {activePage} من {pages}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={activePage === 1} onClick={() => setPage(activePage - 1)}>السابق</Button><Button size="sm" variant="outline" disabled={activePage >= pages} onClick={() => setPage(activePage + 1)}>التالي</Button></div></div>
    </div>
    <Dialog open={open} onOpenChange={(value) => { if (!saving && !creatingProject) setOpen(value); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl" dir="rtl"><DialogHeader><DialogTitle>{selected ? `ملف ${selected.name}` : "إضافة عميل"}</DialogTitle><DialogDescription>يمكن حفظ العميل المحتمل بالاسم فقط. أكمل التواصل والبريف وحدد موعد المتابعة.</DialogDescription></DialogHeader>
      {formError && <div role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{formError}</div>}
      <form onSubmit={save} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="crm-name">اسم العميل *</Label><Input id="crm-name" required maxLength={200} value={form.name} onChange={(event) => setField("name", event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="crm-stage">مرحلة العميل</Label><select id="crm-stage" className={fieldStyle} value={form.stage} onChange={(event) => setField("stage", event.target.value)}>{CLIENT_STAGES.map((value) => <option key={value} value={value}>{CLIENT_STAGE_LABELS[value]}</option>)}</select></div>
          <div className="space-y-2"><Label htmlFor="crm-phone">رقم الهاتف{form.stage === "CUSTOMER" ? " *" : " (يمكن استكماله لاحقاً)"}</Label><Input id="crm-phone" type="tel" dir="ltr" required={form.stage === "CUSTOMER"} maxLength={80} value={form.phone} onChange={(event) => setField("phone", event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="crm-company">الشركة</Label><Input id="crm-company" maxLength={200} value={form.company} onChange={(event) => setField("company", event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="crm-email">البريد الإلكتروني</Label><Input id="crm-email" type="email" dir="ltr" maxLength={320} value={form.email} onChange={(event) => setField("email", event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="crm-source">مصدر العميل</Label><Input id="crm-source" maxLength={200} placeholder="مكالمة، واتساب، ترشيح، فيسبوك…" value={form.source} onChange={(event) => setField("source", event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="crm-followup">موعد المتابعة القادمة</Label><Input id="crm-followup" type="date" value={form.nextFollowUpAt} onChange={(event) => setField("nextFollowUpAt", event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="crm-address">العنوان</Label><Input id="crm-address" maxLength={1000} value={form.address} onChange={(event) => setField("address", event.target.value)} /></div>
        </div>
        <div className="space-y-2"><Label htmlFor="crm-brief">بريف العميل واحتياجه</Label><Textarea id="crm-brief" rows={3} maxLength={5000} placeholder="المطلوب، المقاسات، الميزانية، موعد التسليم وأي تفاصيل اتفقتوا عليها…" value={form.brief} onChange={(event) => setField("brief", event.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="crm-notes">ملاحظات المتابعة</Label><Textarea id="crm-notes" rows={2} maxLength={5000} value={form.notes} onChange={(event) => setField("notes", event.target.value)} /></div>
        <DialogFooter className="gap-2"><Button type="submit" disabled={saving || creatingProject}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}حفظ بيانات العميل</Button><Button type="button" variant="outline" disabled={saving || creatingProject} onClick={() => setOpen(false)}>إغلاق</Button>{selected && selected.projects.length === 0 && <Button type="button" variant="ghost" className="text-red-700" disabled={saving || creatingProject} onClick={() => void remove(selected)}><Trash2 className="h-4 w-4" />حذف</Button>}</DialogFooter>
      </form>
      {selected && <section className="space-y-3 border-t border-slate-200 pt-5"><h2 className="font-semibold">المشاريع المرتبطة</h2>{selected.projects.length === 0 ? <p className="text-sm text-slate-500">لا توجد مشاريع بعد. يمكنك تسجيل فرصة وبدء تجهيز عرضها.</p> : <div className="space-y-2">{selected.projects.map((project) => <Link href={`/admin/projects/${project.id}`} key={project.id} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 p-3 text-sm hover:border-[#8a3940]"><span>#{project.id} · {project.title}</span><span className="text-xs text-slate-500">{getStatusLabel(project.status)}</span></Link>)}</div>}<div className="flex flex-wrap gap-2"><Input aria-label="عنوان مشروع العميل الجديد" className="min-w-48 flex-1" maxLength={200} placeholder="عنوان الطلب أو المشروع الجديد" value={projectTitle} onChange={(event) => setProjectTitle(event.target.value)} /><Button type="button" variant="outline" disabled={!projectTitle.trim() || creatingProject || saving} onClick={() => void createProject()}>{creatingProject ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderPlus className="h-4 w-4" />}إنشاء مشروع</Button></div><p className="text-xs leading-6 text-slate-500">يبدأ المشروع كفرصة جديدة. يستخدم آخر بريف محفوظ؛ احفظ تعديلاته أولاً.</p></section>}
    </DialogContent></Dialog>
  </div>;
}
