import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ar-EG', {
    style: 'currency',
    currency: 'EGP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '-';
  const d = new Date(date);
  return new Intl.DateTimeFormat('ar-EG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(d);
}

export function formatDateEn(date: Date | string | null | undefined): string {
  if (!date) return '-';
  const d = new Date(date);
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(d);
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    // Project statuses
    LEAD: 'bg-gray-100 text-gray-700',
    INSPECTION: 'bg-blue-100 text-blue-700',
    DESIGNING: 'bg-purple-100 text-purple-700',
    PENDING_APPROVAL: 'bg-yellow-100 text-yellow-700',
    APPROVED: 'bg-green-100 text-green-700',
    IN_PRODUCTION: 'bg-orange-100 text-orange-700',
    READY: 'bg-emerald-100 text-emerald-700',
    INSTALLING: 'bg-indigo-100 text-indigo-700',
    COMPLETED: 'bg-green-100 text-green-800',
    CANCELLED: 'bg-red-100 text-red-700',
    // Task statuses
    TODO: 'bg-gray-100 text-gray-700',
    IN_PROGRESS: 'bg-blue-100 text-blue-700',
    DONE: 'bg-green-100 text-green-700',
    // Quote statuses
    NEW: 'bg-blue-100 text-blue-700',
    CONTACTED: 'bg-yellow-100 text-yellow-700',
    QUOTED: 'bg-purple-100 text-purple-700',
    CONVERTED: 'bg-green-100 text-green-700',
    REJECTED: 'bg-red-100 text-red-700',
    // Supplier order statuses
    PENDING: 'bg-gray-100 text-gray-700',
    CONFIRMED: 'bg-blue-100 text-blue-700',
    SHIPPED: 'bg-indigo-100 text-indigo-700',
    DELIVERED: 'bg-green-100 text-green-700',
  };
  return colors[status] || 'bg-gray-100 text-gray-700';
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    LEAD: 'عميل محتمل',
    INSPECTION: 'معاينة',
    DESIGNING: 'جاري التصميم',
    PENDING_APPROVAL: 'في انتظار الموافقة',
    APPROVED: 'تمت الموافقة',
    IN_PRODUCTION: 'جاري التصنيع',
    READY: 'جاهز للتسليم',
    INSTALLING: 'جاري التركيب',
    COMPLETED: 'مكتمل',
    CANCELLED: 'ملغي',
    TODO: 'للتنفيذ',
    IN_PROGRESS: 'جاري',
    DONE: 'تم',
    NEW: 'جديد',
    CONTACTED: 'تم التواصل',
    QUOTED: 'تم التسعير',
    CONVERTED: 'تم التحويل',
    REJECTED: 'مرفوض',
    PENDING: 'معلق',
    CONFIRMED: 'مؤكد',
    SHIPPED: 'تم الشحن',
    DELIVERED: 'تم التسليم',
    LARGE_PROJECT: 'مشروع كبير',
    SIMPLE_ORDER: 'طلب بسيط',
    SUPPLIER_FOLLOWUP: 'متابعة موردين',
    DESIGN: 'تصميم',
    INSTALLATION: 'تركيب',
    DELIVERY: 'توصيل',
    GENERAL: 'عام',
    LOW: 'منخفض',
    MEDIUM: 'متوسط',
    HIGH: 'عالي',
    URGENT: 'عاجل',
    CASH: 'نقدي',
    BANK_TRANSFER: 'تحويل بنكي',
    CHECK: 'شيك',
  };
  return labels[status] || status;
}

export function getPriorityColor(priority: string): string {
  const colors: Record<string, string> = {
    LOW: 'bg-gray-100 text-gray-600',
    MEDIUM: 'bg-blue-100 text-blue-600',
    HIGH: 'bg-orange-100 text-orange-600',
    URGENT: 'bg-red-100 text-red-600',
  };
  return colors[priority] || 'bg-gray-100 text-gray-600';
}

export function getTaskTypeIcon(type: string): string {
  const icons: Record<string, string> = {
    SUPPLIER_FOLLOWUP: '🏭',
    DESIGN: '🎨',
    INSTALLATION: '🔧',
    DELIVERY: '🚚',
    INSPECTION: '📋',
    GENERAL: '📌',
  };
  return icons[type] || '📌';
}

export function calculateSyncDate(items: { leadTimeDays: number }[], startDate: Date = new Date()): Date {
  const maxLeadTime = Math.max(...items.map(item => item.leadTimeDays), 0);
  const syncDate = new Date(startDate);
  syncDate.setDate(syncDate.getDate() + maxLeadTime + 2); // +2 days buffer
  return syncDate;
}

export function daysUntil(date: Date | string): number {
  const target = new Date(date);
  const now = new Date();
  const diff = target.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function generateOrderNumber(): string {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `ORD-${year}${month}-${random}`;
}
