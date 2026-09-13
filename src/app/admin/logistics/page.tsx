"use client";

import React, { useEffect, useState } from "react";
import {
  Truck,
  Plus,
  Phone,
  Calendar as CalendarIcon,
  CheckCircle,
  Clock,
  UserCheck,
  UserX,
  AlertCircle,
  RefreshCw,
  Wrench,
  DollarSign,
  ChevronRight,
  ChevronLeft,
  Briefcase,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  formatCurrency,
  formatDate,
  getStatusColor,
  getStatusLabel,
  getPriorityColor,
  getTaskTypeIcon,
} from "@/lib/utils";

interface TechnicianItem {
  id: number;
  name: string;
  phone: string;
  specialization?: string | null;
  isAvailable: boolean;
  dailyRate: number;
  notes?: string | null;
  tasks: Array<{
    id: number;
    title: string;
    dueDate: string;
    status: string;
    priority: string;
    type: string;
    project?: {
      id: number;
      title: string;
      status: string;
      client?: { name: string; phone: string } | null;
    } | null;
  }>;
  _count?: {
    tasks: number;
  };
}

export default function LogisticsPage() {
  const [technicians, setTechnicians] = useState<TechnicianItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add Technician Dialog
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    specialization: "فني تجميع وتركيبات خشبية",
    dailyRate: 400,
    isAvailable: true,
    notes: "",
  });

  // Calendar Week Offset (0 = this week, +1 = next week, etc.)
  const [weekOffset, setWeekOffset] = useState(0);

  const fetchTechnicians = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/technicians");
      if (!res.ok) throw new Error("فشل في تحميل بيانات الفنيين واللوجستيات");
      const data = await res.json();
      setTechnicians(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "حدث خطأ أثناء تحميل الفنيين");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTechnicians();
  }, []);

  const handleToggleAvailability = async (tech: TechnicianItem) => {
    try {
      const res = await fetch(`/api/technicians/${tech.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isAvailable: !tech.isAvailable }),
      });
      if (!res.ok) throw new Error("فشل في تحديث حالة التفرغ");
      fetchTechnicians();
    } catch (err: any) {
      alert(err.message || "حدث خطأ");
    }
  };

  const handleCreateTechnician = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.phone) {
      alert("يرجى إدخال اسم الفني ورقم الهاتف");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/technicians", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          phone: formData.phone,
          specialization: formData.specialization,
          dailyRate: parseFloat(String(formData.dailyRate)) || 0,
          isAvailable: formData.isAvailable,
          notes: formData.notes || null,
        }),
      });

      if (!res.ok) throw new Error("فشل في إضافة الفني");

      setIsAddOpen(false);
      setFormData({
        name: "",
        phone: "",
        specialization: "فني تجميع وتركيبات خشبية",
        dailyRate: 400,
        isAvailable: true,
        notes: "",
      });
      fetchTechnicians();
    } catch (err: any) {
      alert(err.message || "حدث خطأ أثناء إضافة الفني");
    } finally {
      setSubmitting(false);
    }
  };

  // Generate 7 days of the selected week
  const getWeekDays = () => {
    const today = new Date();
    // Start from Sunday of current week + offset
    const currentDay = today.getDay(); // 0 is Sunday
    const sunday = new Date(today);
    sunday.setDate(today.getDate() - currentDay + weekOffset * 7);

    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(sunday);
      d.setDate(sunday.getDate() + i);
      days.push(d);
    }
    return days;
  };

  const weekDays = getWeekDays();
  const dayNamesAr = [
    "الأحد",
    "الإثنين",
    "الثلاثاء",
    "الأربعاء",
    "الخميس",
    "الجمعة",
    "السبت",
  ];

  // Helper to find tasks for a specific technician and date
  const getTasksForTechAndDate = (tech: TechnicianItem, date: Date) => {
    const dateStr = date.toISOString().split("T")[0];
    return (tech.tasks || []).filter((task) => {
      if (!task.dueDate) return false;
      const taskDateStr = new Date(task.dueDate).toISOString().split("T")[0];
      return taskDateStr === dateStr;
    });
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-[#0f172a]">
            اللوجستيات وإدارة الفنيين
          </h2>
          <p className="text-sm text-slate-600">
            تنسيق فرق التركيب الميداني، جداول المعاينات، ومتابعة تفرغ الفنيين
          </p>
        </div>

        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#0f172a] hover:bg-[#162d4a] text-white shadow">
              <Plus className="w-4 h-4 ml-1.5 text-[#c5a975]" />
              إضافة فني تركيبات
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-[#0f172a]">
                إضافة فني أو مسؤول تركيبات جديد
              </DialogTitle>
              <DialogDescription className="text-xs">
                تسجيل بيانات الفني وتخصصه واليومية المعتمدة
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleCreateTechnician} className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="techName" className="text-xs font-bold">
                  اسم الفني <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="techName"
                  placeholder="مثال: أحمد عبد الله"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="techPhone" className="text-xs font-bold">
                  رقم الهاتف <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="techPhone"
                  placeholder="01099887766"
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData({ ...formData, phone: e.target.value })
                  }
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="techSpec" className="text-xs font-bold">
                  التخصص الميداني
                </Label>
                <Select
                  value={formData.specialization}
                  onValueChange={(val) =>
                    setFormData({ ...formData, specialization: val })
                  }
                >
                  <SelectTrigger id="techSpec">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="فني تجميع وتركيبات خشبية">
                      فني تجميع وتركيبات خشبية
                    </SelectItem>
                    <SelectItem value="فني قواطع ألومنيوم وزجاج">
                      فني قواطع ألومنيوم وزجاج
                    </SelectItem>
                    <SelectItem value="فني تمديدات وكابلات مكاتب">
                      فني تمديدات وكابلات مكاتب
                    </SelectItem>
                    <SelectItem value="مشرف معاينات ورفع مقاسات">
                      مشرف معاينات ورفع مقاسات
                    </SelectItem>
                    <SelectItem value="فني تنجيد وإصلاحات">
                      فني تنجيد وإصلاحات
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="techRate" className="text-xs font-bold">
                  اليومية المعتمدة (ج.م)
                </Label>
                <Input
                  id="techRate"
                  type="number"
                  min="0"
                  value={formData.dailyRate}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      dailyRate: parseFloat(e.target.value) || 0,
                    })
                  }
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="techNotes" className="text-xs font-bold">
                  ملاحظات
                </Label>
                <Textarea
                  id="techNotes"
                  placeholder="أيام التفرغ، منطقة السكن أو التغطية..."
                  rows={2}
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData({ ...formData, notes: e.target.value })
                  }
                />
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAddOpen(false)}
                >
                  إلغاء
                </Button>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="bg-[#0f172a] hover:bg-[#162d4a] text-white"
                >
                  {submitting ? "جاري الحفظ..." : "حفظ بيانات الفني"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* SECTION 1: Technicians List & Availability */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-[#0f172a] flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-[#c5a975]" />
            طاقم الفنيين والتركيبات الميدانية ({technicians.length})
          </h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchTechnicians}
            className="text-xs"
          >
            <RefreshCw className="w-3.5 h-3.5 ml-1" />
            تحديث
          </Button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-500 bg-white rounded-md border">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#0f172a] mb-2" />
            <p className="text-xs">جاري تحميل بيانات الفنيين...</p>
          </div>
        ) : error ? (
          <div className="p-6 text-center text-red-600 bg-white rounded-md border border-red-200 text-xs">
            {error}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {technicians.map((tech) => (
              <Card
                key={tech.id}
                className="shadow-sm border-slate-200 hover:shadow-sm transition-all flex flex-col justify-between"
              >
                <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-bold text-slate-900">
                      {tech.name}
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-500 mt-0.5">
                      {tech.specialization || "فني عام"}
                    </CardDescription>
                  </div>

                  <button
                    onClick={() => handleToggleAvailability(tech)}
                    className={`px-2.5 py-1 rounded-full text-xs font-bold transition-colors flex items-center gap-1.5 ${
                      tech.isAvailable
                        ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                        : "bg-red-100 text-red-800 hover:bg-red-200"
                    }`}
                    title="انقر لتبديل حالة التفرغ"
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        tech.isAvailable ? "bg-emerald-600" : "bg-red-600"
                      }`}
                    />
                    {tech.isAvailable ? "متاح للعمل" : "مشغول / إجازة"}
                  </button>
                </CardHeader>

                <CardContent className="pt-3 space-y-2 text-xs">
                  <div className="flex justify-between items-center text-slate-600">
                    <span className="flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5 text-[#c5a975]" />
                      الهاتف:
                    </span>
                    <span className="font-semibold text-slate-800">
                      {tech.phone}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-slate-600">
                    <span className="flex items-center gap-1">
                      <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                      اليومية المقررة:
                    </span>
                    <span className="font-bold text-slate-900">
                      {formatCurrency(tech.dailyRate)}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-slate-600 pt-1 border-t border-slate-50">
                    <span>المهام القادمة المسندة:</span>
                    <Badge variant="secondary" className="text-xs">
                      {tech.tasks?.length || 0} مهام
                    </Badge>
                  </div>
                </CardContent>

                <CardFooter className="pt-2 pb-3 border-t border-slate-50 bg-slate-50/50 flex justify-between text-[11px] text-slate-500">
                  <span>{tech.notes || "لا توجد ملاحظات"}</span>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* SECTION 2: Weekly Schedule Calendar Grid */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white p-4 rounded-md border border-slate-200 shadow-sm">
          <div>
            <h3 className="text-base font-bold text-[#0f172a] flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-[#c5a975]" />
              جدول التركيبات والمتابعات الأسبوعي
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              توزيع الفنيين على مشاريع ومعاينات الأسبوع
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setWeekOffset(weekOffset - 1)}
              className="h-8 text-xs"
            >
              <ChevronRight className="w-3.5 h-3.5 ml-1" />
              الأسبوع السابق
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setWeekOffset(0)}
              className="h-8 text-xs font-bold"
            >
              الأسبوع الحالي
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setWeekOffset(weekOffset + 1)}
              className="h-8 text-xs"
            >
              الأسبوع التالي
              <ChevronLeft className="w-3.5 h-3.5 mr-1" />
            </Button>
          </div>
        </div>

        {/* Calendar Weekly Matrix */}
        <div className="bg-white rounded-md border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full min-w-[750px] text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-700">
                <th className="p-3 text-start w-44 font-bold border-l border-slate-200">
                  الفني / المختص
                </th>
                {weekDays.map((day, idx) => {
                  const isToday =
                    day.toISOString().split("T")[0] ===
                    new Date().toISOString().split("T")[0];

                  return (
                    <th
                      key={idx}
                      className={`p-2.5 text-center font-bold border-l border-slate-200 last:border-0 ${
                        isToday ? "bg-amber-50 text-amber-900" : ""
                      }`}
                    >
                      <div className="text-xs">{dayNamesAr[day.getDay()]}</div>
                      <div className="text-[10px] text-slate-500 font-normal mt-0.5">
                        {day.getDate()}/{day.getMonth() + 1}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {technicians.map((tech) => (
                <tr key={tech.id} className="hover:bg-slate-50/50">
                  <td className="p-3 font-semibold text-slate-900 border-l border-slate-200 bg-slate-50/30">
                    <div>{tech.name}</div>
                    <div className="text-[10px] text-slate-400 font-normal">
                      {tech.specialization?.slice(0, 24)}
                    </div>
                  </td>

                  {weekDays.map((day, dIdx) => {
                    const tasksForDay = getTasksForTechAndDate(tech, day);
                    const isToday =
                      day.toISOString().split("T")[0] ===
                      new Date().toISOString().split("T")[0];

                    return (
                      <td
                        key={dIdx}
                        className={`p-2 align-top border-l border-slate-200 last:border-0 min-h-[64px] ${
                          isToday ? "bg-amber-50/20" : ""
                        }`}
                      >
                        {tasksForDay.length === 0 ? (
                          <div className="h-10 flex items-center justify-center text-[10px] text-slate-300">
                            -
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            {tasksForDay.map((t) => (
                              <div
                                key={t.id}
                                className="p-1.5 bg-[#0f172a]/10 rounded border border-[#0f172a]/20 text-[10px] space-y-0.5"
                              >
                                <div className="font-bold text-[#0f172a] truncate flex items-center gap-1">
                                  <span>{getTaskTypeIcon(t.type)}</span>
                                  <span className="truncate">{t.title}</span>
                                </div>
                                {t.project && (
                                  <div className="text-[9px] text-slate-600 truncate">
                                    {t.project.title}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
