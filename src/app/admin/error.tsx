"use client";

import Link from "next/link";
import { AlertCircle } from "lucide-react";

export default function AdminError({ error, retry }: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <section role="alert" className="mx-auto max-w-xl space-y-4 rounded-lg border border-slate-200 bg-white p-6 text-right" dir="rtl">
      <AlertCircle className="h-7 w-7 text-[#8a3940]" />
      <h2 className="text-xl font-semibold">تعذر تحميل هذه الشاشة</h2>
      <p className="text-sm leading-7 text-slate-600">حاول تحميلها مرة أخرى. إذا كنت تحفظ إجراءً قبل ظهور الخطأ، راجع السجل أولاً للتأكد من نتيجته.</p>
      {error.digest && <p className="text-xs text-slate-500">مرجع الخطأ: <bdi>{error.digest}</bdi></p>}
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={retry} className="rounded-md bg-[#8a3940] px-4 py-2 text-sm text-white">إعادة المحاولة</button>
        <Link href="/admin" className="rounded-md border border-slate-200 px-4 py-2 text-sm">لوحة التحكم</Link>
      </div>
    </section>
  );
}
