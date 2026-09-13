"use client";

import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  FolderKanban,
  Package,
  Factory,
  FileText,
  Truck,
  Columns3,
  BarChart3,
  Menu,
  X,
  Users,
  Wallet,
  ExternalLink,
  Tags,
  Layers3,
  LogOut,
  ShieldCheck,
  FilePenLine,
  DatabaseBackup,
  SearchCheck,
  MousePointerClick,
  Bot,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navGroups = [
  { label: "الشغل اليومي", items: [
  { label: "لوحة التحكم", href: "/admin", icon: LayoutDashboard, exact: true },
  { label: "المساعد التنفيذي", href: "/admin/assistant", icon: Bot },
  { label: "العملاء والمتابعة", href: "/admin/clients", icon: Users },
  { label: "المشاريع", href: "/admin/projects", icon: FolderKanban },
  { label: "الحسابات", href: "/admin/accounting", icon: Wallet },
  { label: "عروض الأسعار", href: "/admin/quotes", icon: FileText },
  { label: "المهام", href: "/admin/kanban", icon: Columns3 },
  { label: "المصانع والموردين", href: "/admin/suppliers", icon: Factory },
  { label: "اللوجستيات والفنيين", href: "/admin/logistics", icon: Truck },
  { label: "التقارير", href: "/admin/reports", icon: BarChart3 },
  ] },
  { label: "الكتالوج والموقع", items: [
  { label: "الكتالوج", href: "/admin/catalog", icon: Package },
  { label: "جودة البيانات", href: "/admin/data-quality", icon: FileText },
  { label: "محتوى الموقع", href: "/admin/content", icon: FilePenLine },
  { label: "SEO وفرص البحث", href: "/admin/seo", icon: SearchCheck },
  { label: "الفئات والتصنيفات", href: "/admin/categories", icon: Tags },
  { label: "التشكيلات والأطقم", href: "/admin/collections", icon: Layers3 },
  { label: "تحليلات الموقع", href: "/admin/analytics", icon: MousePointerClick },
  ] },
  { label: "إعدادات النظام", items: [
  { label: "تحديث ونسخ البيانات", href: "/admin/data-management", icon: DatabaseBackup },
  { label: "أمان الحساب", href: "/admin/security", icon: ShieldCheck },
  ] },
];
const navItems = navGroups.flatMap((group) => group.items);

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!sidebarOpen) return;
    closeButton.current?.focus();
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSidebarOpen(false);
        menuButton.current?.focus();
      }
    };
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [sidebarOpen]);

  const handleLogout = async () => {
    setLoggingOut(true);
    setLogoutError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("تعذر تسجيل الخروج. حاول مرة أخرى.");
      router.replace("/login");
      router.refresh();
    } catch {
      setLogoutError("تعذر تسجيل الخروج. حاول مرة أخرى.");
    } finally {
      setLoggingOut(false);
    }
  };

  const isActive = (item: (typeof navItems)[0]) => {
    if ("exact" in item && item.exact) return pathname === item.href;
    return pathname.startsWith(item.href);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex font-sans" dir="rtl">
      <a href="#admin-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:right-2 focus:z-[70] focus:bg-white focus:p-3">انتقل إلى المحتوى</a>
      {/* Mobile Backdrop */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-[#0f172a]/40 backdrop-blur-sm z-40 lg:hidden transition-all duration-300"
        />
      )}

      {/* Sidebar - Clean Dark Theme */}
      <aside
        id="admin-navigation"
        aria-label="قائمة الإدارة"
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex-col bg-[#0f172a] text-slate-400 w-64 border-l border-slate-800",
          sidebarOpen ? "flex" : "hidden lg:flex"
        )}
      >
        {/* Brand Header */}
        <div className="h-20 flex items-center justify-between px-6 border-b border-slate-800/60">
          <Link href="/admin" className="flex items-center gap-3 overflow-hidden group">
            <Image
              src="/images/brand/hatab-wordmark.png"
              alt=""
              width={128}
              height={43}
              priority
              className="h-9 w-auto shrink-0 object-contain brightness-0 invert"
            />
            <div className="flex min-w-0 flex-col truncate border-r border-slate-700 pr-3">
              <span className="text-[11px] font-bold tracking-[0.16em] text-white">
                ERP
              </span>
              <span className="text-[8px] uppercase tracking-[0.13em] text-slate-500">
                Admin Portal
              </span>
            </div>
          </Link>

          <button ref={closeButton} type="button" aria-label="إغلاق القائمة" onClick={() => { setSidebarOpen(false); menuButton.current?.focus(); }} className="lg:hidden p-2 text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 overflow-y-auto py-4 px-4 space-y-5" aria-label="أقسام النظام">
          {navGroups.map((group) => <div key={group.label} className="space-y-1">
          <p className="px-4 text-[11px] font-semibold text-slate-400 mb-2">{group.label}</p>
          {group.items.map((item) => {
            const active = isActive(item);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-all duration-200 group",
                  active
                    ? "bg-[#c5a975]/10 text-[#c5a975] font-medium"
                    : "hover:bg-slate-800/50 hover:text-slate-200"
                )}
              >
                <Icon strokeWidth={active ? 2 : 1.5} className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
          </div>)}
        </nav>

        {/* Footer Area */}
        <div className="p-4 border-t border-slate-800/60">
          <Link
            href="/"
            target="_blank"
            className="flex items-center justify-between px-4 py-3 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800/50 transition-colors group"
          >
            <div className="flex items-center gap-3">
              <ExternalLink strokeWidth={1.5} className="w-4 h-4" />
              <span>المعرض الإلكتروني</span>
            </div>
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="mt-1 flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm text-slate-400 transition-colors hover:bg-slate-800/50 hover:text-white"
          >
            <LogOut strokeWidth={1.5} className="h-4 w-4" />
            <span>{loggingOut ? "جارٍ تسجيل الخروج…" : "تسجيل الخروج"}</span>
          </button>
          {logoutError && <p role="alert" className="px-4 text-xs text-red-300">{logoutError}</p>}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 transition-all duration-300 lg:mr-64">
        {/* Top Header - Clean White */}
        <header className="h-20 bg-white border-b border-slate-100 flex items-center justify-between px-4 sm:px-8 z-10 sticky top-0">
          <div className="flex items-center gap-4">
            <button
              ref={menuButton}
              type="button"
              aria-label="فتح قائمة الإدارة"
              aria-expanded={sidebarOpen}
              aria-controls="admin-navigation"
              onClick={() => setSidebarOpen(true)}
              className="p-2 -mr-2 text-slate-400 hover:text-[#0f172a] hover:bg-slate-50 rounded-lg lg:hidden transition-colors"
            >
              <Menu strokeWidth={1.5} className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-medium text-[#0f172a] hidden sm:block">
              {navItems.find((n) => isActive(n))?.label || "لوحة التحكم"}
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <Link href="/admin/assistant" className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
              <Bot strokeWidth={1.5} className="w-4 h-4" /><span>اسأل المساعد</span>
            </Link>
            
            <div className="h-6 w-px bg-slate-200 mx-1"></div>

            <div className="flex items-center gap-3">
              <div className="text-left hidden md:block">
                <p className="text-sm font-medium text-[#0f172a] leading-none">حساب الإدارة</p>
                <p className="text-[10px] text-slate-500 mt-1">HATAB ERP</p>
              </div>
              <div className="h-9 w-9 overflow-hidden border border-slate-200 bg-[#8a3940]">
                <Image
                  src="/images/brand/hatab-mark.png"
                  alt=""
                  width={36}
                  height={36}
                  className="h-full w-full object-cover"
                />
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div id="admin-content" tabIndex={-1} className="flex-1 p-4 sm:p-8 focus:outline-none">
          {children}
        </div>
      </main>
    </div>
  );
}
