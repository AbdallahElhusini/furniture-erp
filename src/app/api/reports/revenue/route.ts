import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireApiSession } from '@/lib/api-auth';
import ExcelJS from 'exceljs';

// Status labels in Arabic for export
const STATUS_LABELS: Record<string, string> = {
  LEAD: 'عميل محتمل',
  INSPECTION: 'معاينة ورفع مقاسات',
  DESIGNING: 'تصميم 3D',
  PENDING_APPROVAL: 'بانتظار الاعتماد',
  APPROVED: 'معتمد',
  IN_PRODUCTION: 'جاري التصنيع',
  READY: 'جاهز للتسليم',
  INSTALLING: 'جاري التركيب',
  COMPLETED: 'مكتمل',
  CANCELLED: 'ملغي',
};

// GET /api/reports/revenue - Generate client revenue report
export async function GET(request: NextRequest) {
  const unauthorized = requireApiSession(request);
  if (unauthorized) return unauthorized;
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const status = searchParams.get('status');
    const format = searchParams.get('format') || 'json';

    const whereClause: any = {};

    if (status) {
      whereClause.status = status;
    }

    if (startDate || endDate) {
      whereClause.createdAt = {};
      if (startDate) {
        whereClause.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        whereClause.createdAt.lte = end;
      }
    }

    const projects = await prisma.project.findMany({
      where: whereClause,
      include: {
        client: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const reportData = projects.map((project) => {
      const remaining = project.totalPrice - project.amountPaid;
      const profit = project.totalPrice - project.totalCost;
      const profitMargin =
        project.totalPrice > 0 ? ((profit / project.totalPrice) * 100).toFixed(1) + '%' : '0%';

      return {
        id: project.id,
        projectTitle: project.title,
        clientName: project.client.name,
        company: project.client.company || '-',
        phone: project.client.phone,
        type: project.type === 'LARGE_PROJECT' ? 'مشروع متكامل' : 'طلب فردي',
        status: project.status,
        statusAr: STATUS_LABELS[project.status] || project.status,
        totalCost: project.totalCost,
        totalPrice: project.totalPrice,
        amountPaid: project.amountPaid,
        remaining: Math.max(0, remaining),
        profit,
        profitMargin,
        createdAt: project.createdAt.toISOString(),
      };
    });

    const summary = {
      totalProjects: reportData.length,
      totalRevenue: reportData.reduce((sum, p) => sum + p.totalPrice, 0),
      totalCost: reportData.reduce((sum, p) => sum + p.totalCost, 0),
      totalPaid: reportData.reduce((sum, p) => sum + p.amountPaid, 0),
      totalRemaining: reportData.reduce((sum, p) => sum + p.remaining, 0),
      totalProfit: reportData.reduce((sum, p) => sum + p.profit, 0),
    };

    // If Excel format is requested, generate Excel file
    if (format.toLowerCase() === 'excel') {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'HATAB ERP';
      workbook.created = new Date();

      const worksheet = workbook.addWorksheet('تقرير الإيرادات والمشاريع', {
        views: [{ rightToLeft: true }],
      });

      worksheet.columns = [
        { header: 'اسم المشروع', key: 'projectTitle', width: 30 },
        { header: 'العميل', key: 'clientName', width: 22 },
        { header: 'الشركة', key: 'company', width: 22 },
        { header: 'الهاتف', key: 'phone', width: 16 },
        { header: 'نوع المشروع', key: 'type', width: 16 },
        { header: 'الحالة', key: 'statusAr', width: 18 },
        { header: 'إجمالي السعر (ج.م)', key: 'totalPrice', width: 18 },
        { header: 'المحصل (ج.م)', key: 'amountPaid', width: 18 },
        { header: 'المتبقي (ج.م)', key: 'remaining', width: 18 },
        { header: 'التكلفة (ج.م)', key: 'totalCost', width: 18 },
        { header: 'الربح (ج.م)', key: 'profit', width: 18 },
      ];

      // Style header row
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E293B' },
      };
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
      headerRow.height = 28;

      // Add data rows
      reportData.forEach((row) => {
        const addedRow = worksheet.addRow(row);
        addedRow.alignment = { vertical: 'middle', horizontal: 'right' };
      });

      // Add summary row
      const totalRow = worksheet.addRow({
        projectTitle: 'الإجمالي الكلي',
        clientName: '',
        company: '',
        phone: '',
        type: '',
        statusAr: '',
        totalPrice: summary.totalRevenue,
        amountPaid: summary.totalPaid,
        remaining: summary.totalRemaining,
        totalCost: summary.totalCost,
        profit: summary.totalProfit,
      });

      totalRow.font = { bold: true, size: 12 };
      totalRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF1F5F9' },
      };

      const buffer = await workbook.xlsx.writeBuffer();

      return new NextResponse(buffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': 'attachment; filename="revenue-report.xlsx"',
        },
      });
    }

    // Default JSON response
    return NextResponse.json({
      startDate: startDate || null,
      endDate: endDate || null,
      summary,
      projects: reportData,
    });
  } catch (error: any) {
    console.error('Error generating revenue report:', error);
    return NextResponse.json(
      { error: 'Failed to generate revenue report', details: error.message },
      { status: 500 }
    );
  }
}
