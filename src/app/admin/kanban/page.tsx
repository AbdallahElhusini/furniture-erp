"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Columns3,
  Plus,
  Calendar,
  CheckCircle2,
  Clock,
  Play,
  RotateCcw,
  User,
  FolderKanban,
  AlertCircle,
  RefreshCw,
  Filter,
  Layers,
  Factory,
  Wrench,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  formatDate,
  getStatusColor,
  getStatusLabel,
  getPriorityColor,
  getTaskTypeIcon,
} from "@/lib/utils";

interface TaskItem {
  id: number;
  projectId?: number | null;
  technicianId?: number | null;
  type: string;
  title: string;
  description?: string | null;
  dueDate: string;
  status: string;
  priority: string;
  project?: {
    id: number;
    title: string;
    status: string;
    client?: { name: string; phone: string; company?: string | null } | null;
  } | null;
  technician?: {
    id: number;
    name: string;
    phone: string;
  } | null;
}

interface ProjectOption {
  id: number;
  title: string;
}

interface TechOption {
  id: number;
  name: string;
}

const TASK_SECTIONS = [
  { type: "SUPPLIER_FOLLOWUP", title: "متابعات المصانع والموردين", icon: "🏭" },
  { type: "DESIGN", title: "مهام التصميم والمخططات 3D", icon: "🎨" },
  { type: "INSTALLATION", title: "مهام التركيبات الميدانية", icon: "🔧" },
  { type: "INSPECTION", title: "معاينات ورفع المقاسات", icon: "📋" },
  { type: "DELIVERY", title: "الشحن والتوصيل", icon: "🚚" },
  { type: "GENERAL", title: "مهام عامة وإدارية", icon: "📌" },
];

export default function KanbanPage() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [technicians, setTechnicians] = useState<TechOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected date filter (default today)
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [isTodayOnly, setIsTodayOnly] = useState(true);

  // New Task Dialog
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    type: "SUPPLIER_FOLLOWUP",
    priority: "MEDIUM",
    dueDate: new Date().toISOString().split("T")[0],
    description: "",
    projectId: "",
    technicianId: "",
  });

  const fetchTasks = async () => {
    setLoading(true);
    setError(null);
    try {
      let url = `/api/tasks?date=${selectedDate}`;
      if (isTodayOnly) {
        url = "/api/tasks?today=true";
      }

      const [tasksRes, projsRes, techsRes] = await Promise.all([
        fetch(url),
        fetch("/api/projects"),
        fetch("/api/technicians"),
      ]);

      if (!tasksRes.ok) throw new Error("فشل في تحميل المهام اليومية");

      const tasksData = await tasksRes.json();
      const projsData = projsRes.ok ? await projsRes.json() : [];
      const techsData = techsRes.ok ? await techsRes.json() : [];

      setTasks(Array.isArray(tasksData) ? tasksData : []);
      setProjects(Array.isArray(projsData) ? projsData : []);
      setTechnicians(Array.isArray(techsData) ? techsData : []);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "حدث خطأ أثناء تحميل المهام");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, [selectedDate, isTodayOnly]);

  const handleUpdateStatus = async (taskId: number, newStatus: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("فشل في تحديث حالة المهمة");
      fetchTasks();
    } catch (err: any) {
      alert(err.message || "حدث خطأ");
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title) {
      alert("يرجى كتابة عنوان المهمة");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        title: formData.title,
        type: formData.type,
        priority: formData.priority,
        dueDate: new Date(formData.dueDate),
        description: formData.description || null,
        projectId: formData.projectId ? parseInt(formData.projectId, 10) : null,
        technicianId: formData.technicianId
          ? parseInt(formData.technicianId, 10)
          : null,
        status: "TODO",
      };

      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("فشل في إنشاء المهمة");

      setIsAddOpen(false);
      setFormData({
        title: "",
        type: "SUPPLIER_FOLLOWUP",
        priority: "MEDIUM",
        dueDate: new Date().toISOString().split("T")[0],
        description: "",
        projectId: "",
        technicianId: "",
      });
      fetchTasks();
    } catch (err: any) {
      alert(err.message || "حدث خطأ أثناء حفظ المهمة");
    } finally {
      setSubmitting(false);
    }
  };

  // Group tasks by status
  const todoTasks = tasks.filter((t) => t.status === "TODO");
  const inProgressTasks = tasks.filter((t) => t.status === "IN_PROGRESS");
  const doneTasks = tasks.filter((t) => t.status === "DONE");

  // Helper to render task card
  const renderTaskCard = (task: TaskItem) => {
    return (
      <div
        key={task.id}
        className="bg-white p-3.5 rounded-md border border-slate-200 shadow-sm hover:shadow-sm transition-all space-y-2.5"
      >
        {/* Header: Type icon, title, priority */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-1">
            <span className="text-base shrink-0">
              {getTaskTypeIcon(task.type)}
            </span>
            <span className="font-bold text-sm text-slate-900 leading-snug">
              {task.title}
            </span>
          </div>
          <Badge
            variant="outline"
            className={`text-[10px] py-0 px-1.5 shrink-0 ${getPriorityColor(
              task.priority
            )}`}
          >
            {getStatusLabel(task.priority)}
          </Badge>
        </div>

        {/* Project & Client reference */}
        {task.project && (
          <div className="bg-slate-50 p-2 rounded-lg text-xs space-y-0.5 border border-slate-100">
            <div className="font-semibold text-blue-900 truncate">
              📁 {task.project.title}
            </div>
            {task.project.client && (
              <div className="text-[11px] text-slate-500 truncate">
                العميل: {task.project.client.name}
              </div>
            )}
          </div>
        )}

        {/* Description */}
        {task.description && (
          <p className="text-xs text-slate-600 line-clamp-2">
            {task.description}
          </p>
        )}

        {/* Technician & Due Date */}
        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
          <span>
            {task.technician ? `فني: ${task.technician.name}` : "غير مسند"}
          </span>
          <span>{formatDate(task.dueDate)}</span>
        </div>

        {/* Quick Action Buttons to Move Status */}
        <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-1.5">
          {task.status === "TODO" && (
            <Button
              size="sm"
              onClick={() => handleUpdateStatus(task.id, "IN_PROGRESS")}
              className="bg-blue-600 hover:bg-blue-700 text-white h-7 text-xs px-2.5"
            >
              <Play className="w-3 h-3 ml-1" />
              ابدأ التنفيذ
            </Button>
          )}

          {task.status === "IN_PROGRESS" && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleUpdateStatus(task.id, "TODO")}
                className="h-7 text-xs px-2 text-slate-500 hover:text-slate-800"
              >
                إرجاع
              </Button>
              <Button
                size="sm"
                onClick={() => handleUpdateStatus(task.id, "DONE")}
                className="bg-emerald-600 hover:bg-emerald-700 text-white h-7 text-xs px-2.5"
              >
                <Check className="w-3 h-3 ml-1" />
                تم الإنجاز
              </Button>
            </>
          )}

          {task.status === "DONE" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleUpdateStatus(task.id, "IN_PROGRESS")}
              className="h-7 text-xs px-2 text-slate-500 hover:text-slate-800"
            >
              <RotateCcw className="w-3 h-3 ml-1" />
              إعادة فتح
            </Button>
          )}
        </div>
      </div>
    );
  };

  // Group column tasks by type
  const renderColumnGrouped = (taskList: TaskItem[], emptyMsg: string) => {
    if (taskList.length === 0) {
      return (
        <div className="text-center py-12 text-slate-400 text-xs">
          {emptyMsg}
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {TASK_SECTIONS.map((section) => {
          const sectionTasks = taskList.filter((t) => t.type === section.type);
          if (sectionTasks.length === 0) return null;

          return (
            <div key={section.type} className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 border-b border-slate-200 pb-1">
                <span>{section.icon}</span>
                <span>{section.title}</span>
                <span className="text-[10px] text-slate-400 font-normal">
                  ({sectionTasks.length})
                </span>
              </div>
              <div className="space-y-2.5">
                {sectionTasks.map((t) => renderTaskCard(t))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header with Date Selector & Add Task */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-[#0f172a]">
            لوحة المهام اليومية (Kanban)
          </h2>
          <p className="text-sm text-slate-600">
            متابعة إنجاز مهام التوريد والتصميم والتركيبات الميدانية
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchTasks}
            className="border-slate-300"
          >
            <RefreshCw className="w-4 h-4 ml-1.5" />
            تحديث
          </Button>

          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button className="bg-[#0f172a] hover:bg-[#162d4a] text-white shadow">
                <Plus className="w-4 h-4 ml-1.5 text-[#c5a975]" />
                مهمة جديدة +
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="text-base font-bold text-[#0f172a]">
                  إضافة مهمة جديدة
                </DialogTitle>
                <DialogDescription className="text-xs">
                  جدولة مهمة جديدة وإسنادها لفني أو مشروع
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleCreateTask} className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label htmlFor="kTitle" className="text-xs font-bold">
                    عنوان المهمة <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="kTitle"
                    placeholder="مثال: استلام عينة الجلد من مصنع الأهرام"
                    value={formData.title}
                    onChange={(e) =>
                      setFormData({ ...formData, title: e.target.value })
                    }
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="kType" className="text-xs font-bold">
                      نوع المهمة
                    </Label>
                    <Select
                      value={formData.type}
                      onValueChange={(val) =>
                        setFormData({ ...formData, type: val })
                      }
                    >
                      <SelectTrigger id="kType">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SUPPLIER_FOLLOWUP">
                          متابعة موردين
                        </SelectItem>
                        <SelectItem value="DESIGN">تصميم 3D</SelectItem>
                        <SelectItem value="INSTALLATION">
                          تركيب بالموقع
                        </SelectItem>
                        <SelectItem value="INSPECTION">
                          معاينة مقاسات
                        </SelectItem>
                        <SelectItem value="DELIVERY">توصيل وشحن</SelectItem>
                        <SelectItem value="GENERAL">عام</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="kPriority" className="text-xs font-bold">
                      الأولوية
                    </Label>
                    <Select
                      value={formData.priority}
                      onValueChange={(val) =>
                        setFormData({ ...formData, priority: val })
                      }
                    >
                      <SelectTrigger id="kPriority">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="LOW">منخفضة</SelectItem>
                        <SelectItem value="MEDIUM">متوسطة</SelectItem>
                        <SelectItem value="HIGH">عالية</SelectItem>
                        <SelectItem value="URGENT">عاجل</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="kProject" className="text-xs font-bold">
                    المشروع المرتبط
                  </Label>
                  <Select
                    value={formData.projectId || "none"}
                    onValueChange={(val) =>
                      setFormData({
                        ...formData,
                        projectId: val === "none" ? "" : val,
                      })
                    }
                  >
                    <SelectTrigger id="kProject">
                      <SelectValue placeholder="اختر المشروع" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">بدون مشروع محدد</SelectItem>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="kTech" className="text-xs font-bold">
                    الفني المكلف
                  </Label>
                  <Select
                    value={formData.technicianId || "none"}
                    onValueChange={(val) =>
                      setFormData({
                        ...formData,
                        technicianId: val === "none" ? "" : val,
                      })
                    }
                  >
                    <SelectTrigger id="kTech">
                      <SelectValue placeholder="اختر الفني" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">بدون فني محدد</SelectItem>
                      {technicians.map((t) => (
                        <SelectItem key={t.id} value={String(t.id)}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="kDueDate" className="text-xs font-bold">
                    تاريخ الاستحقاق
                  </Label>
                  <Input
                    id="kDueDate"
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) =>
                      setFormData({ ...formData, dueDate: e.target.value })
                    }
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="kDesc" className="text-xs font-bold">
                    التفاصيل
                  </Label>
                  <Textarea
                    id="kDesc"
                    rows={2}
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
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
                    {submitting ? "جاري الحفظ..." : "حفظ المهمة"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Date Filter Bar */}
      <div className="bg-white p-4 rounded-md border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant={isTodayOnly ? "default" : "outline"}
            onClick={() => {
              setIsTodayOnly(true);
              setSelectedDate(new Date().toISOString().split("T")[0]);
            }}
            className={
              isTodayOnly
                ? "bg-[#0f172a] text-white text-xs"
                : "text-slate-700 text-xs"
            }
          >
            مهام اليوم ({formatDate(new Date())})
          </Button>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">أو اختر تاريخ:</span>
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                setIsTodayOnly(false);
              }}
              className="h-8 text-xs w-40"
            />
          </div>
        </div>

        <div className="text-xs text-slate-500">
          إجمالي المهام المعروضة: <strong>{tasks.length}</strong>
        </div>
      </div>

      {/* Kanban 3-Column Board */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Column 1: TODO */}
        <div className="bg-slate-100/70 p-4 rounded-lg border border-slate-200/80 flex flex-col space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-slate-400" />
              <h3 className="font-bold text-sm text-slate-800">
                للتنفيذ (TODO)
              </h3>
            </div>
            <Badge variant="secondary" className="bg-white font-bold text-xs">
              {todoTasks.length}
            </Badge>
          </div>

          <div className="flex-1">
            {renderColumnGrouped(todoTasks, "لا توجد مهام جديدة للتنفيذ")}
          </div>
        </div>

        {/* Column 2: IN_PROGRESS */}
        <div className="bg-blue-50/50 p-4 rounded-lg border border-blue-200/80 flex flex-col space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-blue-200">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-blue-500 animate-pulse" />
              <h3 className="font-bold text-sm text-blue-950">
                جاري التنفيذ (IN PROGRESS)
              </h3>
            </div>
            <Badge
              variant="secondary"
              className="bg-blue-600 text-white font-bold text-xs"
            >
              {inProgressTasks.length}
            </Badge>
          </div>

          <div className="flex-1">
            {renderColumnGrouped(inProgressTasks, "لا توجد مهام جارية حالياً")}
          </div>
        </div>

        {/* Column 3: DONE */}
        <div className="bg-emerald-50/50 p-4 rounded-lg border border-emerald-200/80 flex flex-col space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-emerald-200">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-500" />
              <h3 className="font-bold text-sm text-emerald-950">
                تم الإنجاز (DONE)
              </h3>
            </div>
            <Badge
              variant="secondary"
              className="bg-emerald-600 text-white font-bold text-xs"
            >
              {doneTasks.length}
            </Badge>
          </div>

          <div className="flex-1">
            {renderColumnGrouped(doneTasks, "لم يتم إنجاز مهام بعد")}
          </div>
        </div>
      </div>
    </div>
  );
}
