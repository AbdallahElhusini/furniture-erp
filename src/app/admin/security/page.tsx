"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";

export default function SecurityPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmation }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذر تحديث كلمة المرور");

      router.replace("/admin");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحديث كلمة المرور");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl py-8">
      <div className="border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
        <div className="mb-8 flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
            <ShieldCheck className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">تأمين حساب الإدارة</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              يجب استبدال كلمة المرور المؤقتة قبل استخدام أدوات الإدارة.
            </p>
          </div>
        </div>

        {error && (
          <div role="alert" className="mb-6 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <form className="space-y-5" onSubmit={handleSubmit}>
          <PasswordField id="currentPassword" label="كلمة المرور الحالية" autoComplete="current-password" value={currentPassword} onChange={setCurrentPassword} />
          <PasswordField id="newPassword" label="كلمة المرور الجديدة" autoComplete="new-password" value={newPassword} onChange={setNewPassword} />
          <PasswordField id="confirmation" label="تأكيد كلمة المرور الجديدة" autoComplete="new-password" value={confirmation} onChange={setConfirmation} />

          <p className="text-xs leading-5 text-slate-500">
            12 حرفاً على الأقل، وثلاثة أنواع من الحروف الصغيرة والكبيرة والأرقام والرموز.
          </p>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex h-12 w-full items-center justify-center gap-2 bg-[#9c3b40] font-bold text-white transition hover:bg-[#762b30] disabled:opacity-60"
          >
            {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
            حفظ ومتابعة
          </button>
        </form>
      </div>
    </div>
  );
}

function PasswordField({
  id,
  label,
  autoComplete,
  value,
  onChange,
}: {
  id: string;
  label: string;
  autoComplete: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-slate-800">{label}</label>
      <input
        id={id}
        type="password"
        autoComplete={autoComplete}
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full border border-slate-200 px-4 outline-none transition focus:border-[#9c3b40] focus:ring-2 focus:ring-[#9c3b40]/10"
      />
    </div>
  );
}
