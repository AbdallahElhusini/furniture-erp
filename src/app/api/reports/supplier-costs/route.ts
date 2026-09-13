import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireApiSession } from '@/lib/api-auth';
import ExcelJS from 'exceljs';

// GET /api/reports/supplier-costs - Generate supplier costs report
export async function GET(request: NextRequest) {
  const unauthorized = requireApiSession(request);
  if (unauthorized) return unauthorized;
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const format = searchParams.get('format') || 'json';

    const orderWhere: any = {};
    if (startDate || endDate) {
      orderWhere.orderDate = {};
      if (startDate) {
        orderWhere.orderDate.gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        orderWhere.orderDate.lte = end;
      }
    }

    // Fetch suppliers with their orders in the date range
    const suppliers = await prisma.supplier.findMany({
      include: {
        supplierOrders: {
          where: orderWhere,
          select: {
            id: true,
            totalAmount: true,
            amountPaid: true,
            status: true,
            orderDate: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const reportData = suppliers.map((supplier) => {
      const totalOrders = supplier.supplierOrders.length;
      const totalAmount = supplier.supplierOrders.reduce((sum, o) => sum + o.totalAmount, 0);
      const amountPaid = supplier.supplierOrders.reduce((sum, o) => sum + o.amountPaid, 0);
      const remaining = totalAmount - amountPaid;

      return {
        id: supplier.id,
        name: supplier.name,
        contactPerson: supplier.contactPerson || '-',
        phone: supplier.phone,
        specialization: supplier.specialization || '-',
        totalOrders,
        totalAmount,
        amountPaid,
        remaining,
        isActive: supplier.isActive,
      };
    });

    const summary = {
      totalSuppliers: reportData.length,
      totalOrders: reportData.reduce((sum, s) => sum + s.totalOrders, 0),
      totalAmount: reportData.reduce((sum, s) => sum + s.totalAmount, 0),
      totalPaid: reportData.reduce((sum, s) => sum + s.amountPaid, 0),
      totalRemaining: reportData.reduce((sum, s) => sum + s.remaining, 0),
    };

    // If Excel format is requested, generate Excel file
    if (format.toLowerCase() === 'excel') {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'HATAB ERP';
      workbook.created = new Date();

      const worksheet = workbook.addWorksheet('تقرير تكاليف الموردين', {
        views: [{ rightToLeft: true }],
      });

      worksheet.columns = [
        { header: 'اسم المورد / المصنع', key: 'name', width: 28 },
        { header: 'الشخص المسؤول', key: 'contactPerson', width: 20 },
        { header: 'الهاتف', key: 'phone', width: 16 },
        { header: 'التخصص', key: 'specialization', width: 25 },
        { header: 'عدد الأوامر', key: 'totalOrders', width: 14 },
        { header: 'إجمالي التكاليف (ج.م)', key: 'totalAmount', width: 20 },
        { header: 'المدفوع (ج.م)', key: 'amountPaid', width: 18 },
        { header: 'المتبقي (ج.م)', key: 'remaining', width: 18 },
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
        name: 'الإجمالي الكلي',
        contactPerson: '',
        phone: '',
        specialization: '',
        totalOrders: summary.totalOrders,
        totalAmount: summary.totalAmount,
        amountPaid: summary.totalPaid,
        remaining: summary.totalRemaining,
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
          'Content-Disposition': 'attachment; filename="supplier-costs-report.xlsx"',
        },
      });
    }

    // Default JSON response
    return NextResponse.json({
      startDate: startDate || null,
      endDate: endDate || null,
      summary,
      suppliers: reportData,
    });
  } catch (error: any) {
    console.error('Error generating supplier costs report:', error);
    return NextResponse.json(
      { error: 'Failed to generate supplier costs report', details: error.message },
      { status: 500 }
    );
  }
}
