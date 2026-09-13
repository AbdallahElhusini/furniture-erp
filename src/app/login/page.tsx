"use client";

import Image from "next/image";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, LockKeyhole } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          next:
            new URLSearchParams(window.location.search).get("next") ||
            "/admin",
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        redirectTo?: string;
      };

      if (!response.ok) throw new Error(result.error || "تعذر تسجيل الدخول");
      router.replace(result.redirectTo || "/admin");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تسجيل الدخول");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#fbfaf7] px-4 py-12 flex items-center justify-center" dir="rtl">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center justify-center text-[#762b30]">
          <Image
            src="/images/brand/hatab-wordmark.png"
            alt="HATAB for Office Furniture"
            width={238}
            height={80}
            priority
            className="h-20 w-auto object-contain"
          />
          <p className="mt-3 border-t border-[#8a3940]/20 pt-3 text-[10px] font-bold tracking-[0.22em] text-[#716a64]">
            ERP · SECURE ADMIN ACCESS
          </p>
        </div>

        <section className="border border-[#e7e2dc] bg-white p-7 shadow-[0_24px_70px_rgba(55,37,28,0.08)] sm:p-10">
          <div className="mb-8">
            <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-[#e9f0eb] text-[#3e6650]">
              <LockKeyhole className="h-5 w-5" />
            </span>
            <h1 className="text-2xl font-bold text-[#171411]">تسجيل دخول الإدارة</h1>
            <p className="mt-2 text-sm leading-6 text-[#716a64]">
              أدخل بيانات حسابك للوصول إلى المشاريع والكتالوج وعروض الأسعار.
            </p>
          </div>

          {error && (
            <div role="alert" className="mb-5 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-medium text-[#171411]">البريد الإلكتروني</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                required
                dir="ltr"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-12 w-full border border-[#d8d1ca] bg-white px-4 text-left outline-none transition focus:border-[#9c3b40] focus:ring-2 focus:ring-[#9c3b40]/15"
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-medium text-[#171411]">كلمة المرور</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-12 w-full border border-[#d8d1ca] bg-white px-4 outline-none transition focus:border-[#9c3b40] focus:ring-2 focus:ring-[#9c3b40]/15"
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex h-12 w-full items-center justify-center gap-2 bg-[#9c3b40] px-5 font-bold text-white transition hover:bg-[#762b30] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowLeft className="h-4 w-4" />}
              دخول آمن
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
