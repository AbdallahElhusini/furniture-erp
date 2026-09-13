import ExcelJS from 'exceljs';
import { prisma } from '@/lib/db';
import { calculateProjectTimeline, getProjectSyncStatus } from '@/lib/sync-engine';
import { getStatusLabel, getPriorityColor } from '@/lib/utils';

// Color Palette Constants
const COLORS = {
  NAVY_PRIMARY: 'FF1E3A8A', // #1E3A8A Dark Blue
  NAVY_SECONDARY: 'FF0F172A', // #0F172A Slate Dark
  GOLD_PRIMARY: 'FFD97706', // #D97706 Warm Amber/Gold
  GOLD_LIGHT: 'FFFEF3C7', // #FEF3C7 Light Gold
  GRAY_HEADER: 'FFF1F5F9', // #F1F5F9 Slate 100
  GRAY_LIGHT: 'FFF8FAFC', // #F8FAFC Slate 50
  BORDER_COLOR: 'FFCBD5E1', // #CBD5E1 Slate 300
  TEXT_WHITE: 'FFFFFFFF',
  TEXT_DARK: 'FF1E293B',
  SUCCESS_BG: 'FFDCFCE7', // #DCFCE7 Emerald 100
  SUCCESS_TEXT: 'FF166534',
  WARNING_BG: 'FFFEF9C3', // #FEF9C3 Yellow 100
  WARNING_TEXT: 'FF854D0E',
  DANGER_BG: 'FFFEE2E2', // #FEE2E2 Red 100
  DANGER_TEXT: 'FF991B1B',
};

// Common Header Font
const HEADER_FONT: Partial<ExcelJS.Font> = {
  name: 'Segoe UI',
  size: 11,
  bold: true,
  color: { argb: COLORS.TEXT_WHITE },
};

// Common Data Font
const DATA_FONT: Partial<ExcelJS.Font> = {
  name: 'Segoe UI',
  size: 10,
  color: { argb: COLORS.TEXT_DARK },
};

// Common Thin Border
const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: COLORS.BORDER_COLOR } },
  left: { style: 'thin', color: { argb: COLORS.BORDER_COLOR } },
  bottom: { style: 'thin', color: { argb: COLORS.BORDER_COLOR } },
  right: { style: 'thin', color: { argb: COLORS.BORDER_COLOR } },
};

// Helper: Setup RTL worksheet
function createRtlWorksheet(workbook: ExcelJS.Workbook, name: string): ExcelJS.Worksheet {
  const ws = workbook.addWorksheet(name, {
    views: [{ rightToLeft: true, showGridLines: true }],
    properties: { defaultRowHeight: 22 },
  });
  return ws;
}

// Helper: Add Title Banner
function addTitleBanner(
  ws: ExcelJS.Worksheet,
  title: string,
  subtitle: string,
  endColNumber: number = 10
) {
  // Main title row
  const titleRow = ws.addRow([title]);
  titleRow.height = 32;
  ws.mergeCells(titleRow.number, 1, titleRow.number, endColNumber);

  const titleCell = ws.getCell(titleRow.number, 1);
  titleCell.font = { name: 'Segoe UI', size: 16, bold: true, color: { argb: COLORS.TEXT_WHITE } };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: COLORS.NAVY_PRIMARY },
  };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // Subtitle / Date row
  const subRow = ws.addRow([subtitle]);
  subRow.height = 24;
  ws.mergeCells(subRow.number, 1, subRow.number, endColNumber);

  const subCell = ws.getCell(subRow.number, 1);
  subCell.font = { name: 'Segoe UI', size: 11, italic: true, color: { argb: COLORS.TEXT_WHITE } };
  subCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: COLORS.NAVY_SECONDARY },
  };
  subCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // Empty separator row
  ws.addRow([]);
}

// Helper: Apply styling to headers and zebra data
function styleTable(
  ws: ExcelJS.Worksheet,
  headerRowNumber: number,
  startDataRow: number,
  endDataRow: number,
  numCols: number,
  headerBgColor = COLORS.NAVY_PRIMARY
) {
  const headerRow = ws.getRow(headerRowNumber);
  headerRow.height = 28;

  for (let c = 1; c <= numCols; c++) {
    const cell = headerRow.getCell(c);
    cell.font = HEADER_FONT;
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: headerBgColor },
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = THIN_BORDER;
  }

  for (let r = startDataRow; r <= endDataRow; r++) {
    const row = ws.getRow(r);
    row.height = 22;
    const isEven = (r - startDataRow) % 2 === 1;

    for (let c = 1; c <= numCols; c++) {
      const cell = row.getCell(c);
      cell.font = DATA_FONT;
      cell.border = THIN_BORDER;
      cell.alignment = { vertical: 'middle' };

      if (isEven) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: COLORS.GRAY_LIGHT },
        };
      }
    }
  }
}

// Helper: Auto-fit column widths with padding
function autoFitColumns(ws: ExcelJS.Worksheet, minWidth = 12) {
  ws.columns.forEach((column) => {
    let maxLength = minWidth;
    column.eachCell?.({ includeEmpty: true }, (cell) => {
      const val = cell.value;
      if (val !== undefined && val !== null) {
        const str = typeof val === 'object' && 'result' in val ? String(val.result || '') : String(val);
        // Arabic characters approximate length
        const charLength = str.length;
        if (charLength > maxLength) {
          maxLength = Math.min(charLength + 4, 45);
        }
      }
    });
    column.width = Math.max(maxLength, minWidth);
  });
}

// =========================================================================
// 1. SUPPLIER COSTS REPORT
// =========================================================================

/**
 * Generates an Excel report of costs paid and balances owed to suppliers/factories within a date range.
 */
export async function exportSupplierCostsReport(startDate: Date, endDate: Date): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'HATAB ERP';
  workbook.created = new Date();

  // Query suppliers and their orders within date range
  const suppliers = await prisma.supplier.findMany({
    include: {
      supplierOrders: {
        where: {
          orderDate: {
            gte: startDate,
            lte: endDate,
          },
        },
        include: {
          project: true,
          items: {
            include: {
              projectItem: {
                include: {
                  catalogItem: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  // Sheet 1: Supplier Summary
  const wsSummary = createRtlWorksheet(workbook, 'ملخص تكاليف الموردين');
  addTitleBanner(
    wsSummary,
    'تقرير تكاليف ومستحقات الموردين والمصانع',
    `الفترة من: ${startDate.toISOString().slice(0, 10)} إلى: ${endDate.toISOString().slice(0, 10)}`,
    10
  );

  // Headers
  const summaryHeaders = [
    'كود المورد',
    'اسم المصنع / المورد',
    'الشخص المسؤول',
    'رقم الهاتف',
    'التخصص',
    'تقييم الجودة',
    'عدد الأوامر',
    'إجمالي قيمة الأوامر',
    'إجمالي المسدد',
    'المتبقي للمورد',
  ];

  const headerRow = wsSummary.addRow(summaryHeaders);
  const startRow = headerRow.number + 1;

  let grandTotalCost = 0;
  let grandTotalPaid = 0;
  let grandTotalOrders = 0;

  for (const s of suppliers) {
    const ordersCount = s.supplierOrders.length;
    const totalCost = s.supplierOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
    const totalPaid = s.supplierOrders.reduce((sum, o) => sum + (o.amountPaid || 0), 0);
    const remaining = totalCost - totalPaid;

    grandTotalCost += totalCost;
    grandTotalPaid += totalPaid;
    grandTotalOrders += ordersCount;

    const row = wsSummary.addRow([
      s.id,
      s.name,
      s.contactPerson || '-',
      s.phone,
      s.specialization || 'عام',
      `⭐ ${s.qualityRating}/5`,
      ordersCount,
      totalCost,
      totalPaid,
      remaining,
    ]);

    // Format numbers
    row.getCell(1).alignment = { horizontal: 'center' };
    row.getCell(6).alignment = { horizontal: 'center' };
    row.getCell(7).alignment = { horizontal: 'center' };
    row.getCell(8).numFmt = '#,##0 "ج.م"';
    row.getCell(9).numFmt = '#,##0 "ج.م"';
    row.getCell(10).numFmt = '#,##0 "ج.م"';

    if (remaining > 0) {
      row.getCell(10).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: COLORS.WARNING_BG },
      };
      row.getCell(10).font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: COLORS.WARNING_TEXT } };
    }
  }

  const endRow = wsSummary.lastRow ? wsSummary.lastRow.number : startRow;
  styleTable(wsSummary, headerRow.number, startRow, endRow, summaryHeaders.length);

  // Totals Row
  const totalRow = wsSummary.addRow([
    'الإجمالي الكلي',
    '',
    '',
    '',
    '',
    '',
    grandTotalOrders,
    grandTotalCost,
    grandTotalPaid,
    grandTotalCost - grandTotalPaid,
  ]);
  totalRow.height = 26;
  wsSummary.mergeCells(totalRow.number, 1, totalRow.number, 6);

  for (let c = 1; c <= 10; c++) {
    const cell = totalRow.getCell(c);
    cell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: COLORS.TEXT_WHITE } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: COLORS.NAVY_PRIMARY },
    };
    cell.border = THIN_BORDER;
    if (c >= 8) cell.numFmt = '#,##0 "ج.م"';
  }
  totalRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  totalRow.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };

  autoFitColumns(wsSummary);

  // Sheet 2: Detailed Orders Breakdown
  const wsOrders = createRtlWorksheet(workbook, 'تفاصيل أوامر التوريد');
  addTitleBanner(
    wsOrders,
    'سجل أوامر التوريد للمصانع والورش',
    `الفترة من: ${startDate.toISOString().slice(0, 10)} إلى: ${endDate.toISOString().slice(0, 10)}`,
    10
  );

  const orderHeaders = [
    'رقم الأمر',
    'اسم المصنع',
    'كود المشروع',
    'عنوان المشروع',
    'تاريخ الطلب',
    'تاريخ التسليم المتوقع',
    'حالة الأمر',
    'إجمالي القيمة',
    'المبلغ المسدد',
    'المتبقي',
  ];

  const orderHeaderRow = wsOrders.addRow(orderHeaders);
  const startOrderRow = orderHeaderRow.number + 1;

  for (const s of suppliers) {
    for (const o of s.supplierOrders) {
      const rem = (o.totalAmount || 0) - (o.amountPaid || 0);
      const row = wsOrders.addRow([
        `PO-${o.id.toString().padStart(4, '0')}`,
        s.name,
        `PRJ-${o.project.id}`,
        o.project.title,
        o.orderDate ? o.orderDate.toISOString().slice(0, 10) : '-',
        o.expectedDate ? o.expectedDate.toISOString().slice(0, 10) : '-',
        getStatusLabel(o.status),
        o.totalAmount,
        o.amountPaid,
        rem,
      ]);

      row.getCell(1).alignment = { horizontal: 'center' };
      row.getCell(3).alignment = { horizontal: 'center' };
      row.getCell(5).alignment = { horizontal: 'center' };
      row.getCell(6).alignment = { horizontal: 'center' };
      row.getCell(7).alignment = { horizontal: 'center' };
      row.getCell(8).numFmt = '#,##0 "ج.م"';
      row.getCell(9).numFmt = '#,##0 "ج.م"';
      row.getCell(10).numFmt = '#,##0 "ج.م"';
    }
  }

  const endOrderRow = wsOrders.lastRow ? wsOrders.lastRow.number : startOrderRow;
  styleTable(wsOrders, orderHeaderRow.number, startOrderRow, endOrderRow, orderHeaders.length);
  autoFitColumns(wsOrders);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// =========================================================================
// 2. CLIENT REVENUE & PROFITABILITY REPORT
// =========================================================================

/**
 * Generates an Excel report of client revenues, payments collected, outstanding receivables,
 * and project profit margins within a date range.
 */
export async function exportClientRevenueReport(startDate: Date, endDate: Date): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'HATAB ERP';
  workbook.created = new Date();

  const projects = await prisma.project.findMany({
    where: {
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    },
    include: {
      client: true,
      payments: true,
      items: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  const ws = createRtlWorksheet(workbook, 'تقرير الإيرادات والمتحصلات');
  addTitleBanner(
    ws,
    'تقرير إيرادات ومتحصلات المشاريع وهامش الربحية',
    `الفترة من: ${startDate.toISOString().slice(0, 10)} إلى: ${endDate.toISOString().slice(0, 10)}`,
    14
  );

  const headers = [
    'كود المشروع',
    'عنوان المشروع',
    'اسم العميل',
    'الشركة / الجهة',
    'رقم الهاتف',
    'نوع المشروع',
    'الحالة',
    'سعر البيع الإجمالي',
    'التكلفة الإجمالية',
    'مجمل الربح',
    'هامش الربح %',
    'المحصل نقداً',
    'المتبقي للتحصيل',
    'نسبة التحصيل %',
  ];

  const headerRow = ws.addRow(headers);
  const startRow = headerRow.number + 1;

  let totalRev = 0;
  let totalCost = 0;
  let totalPaid = 0;
  let totalRemaining = 0;

  for (const p of projects) {
    const profit = p.totalPrice - p.totalCost;
    const margin = p.totalPrice > 0 ? (profit / p.totalPrice) : 0;
    const remaining = p.totalPrice - p.amountPaid;
    const collectionRate = p.totalPrice > 0 ? (p.amountPaid / p.totalPrice) : 0;

    totalRev += p.totalPrice;
    totalCost += p.totalCost;
    totalPaid += p.amountPaid;
    totalRemaining += remaining;

    const row = ws.addRow([
      `PRJ-${p.id}`,
      p.title,
      p.client.name,
      p.client.company || '-',
      p.client.phone,
      getStatusLabel(p.type),
      getStatusLabel(p.status),
      p.totalPrice,
      p.totalCost,
      profit,
      margin,
      p.amountPaid,
      remaining,
      collectionRate,
    ]);

    row.getCell(1).alignment = { horizontal: 'center' };
    row.getCell(6).alignment = { horizontal: 'center' };
    row.getCell(7).alignment = { horizontal: 'center' };
    row.getCell(8).numFmt = '#,##0 "ج.م"';
    row.getCell(9).numFmt = '#,##0 "ج.م"';
    row.getCell(10).numFmt = '#,##0 "ج.م"';
    row.getCell(11).numFmt = '0.0%';
    row.getCell(12).numFmt = '#,##0 "ج.م"';
    row.getCell(13).numFmt = '#,##0 "ج.م"';
    row.getCell(14).numFmt = '0.0%';

    // Color code margin
    if (margin >= 0.35) {
      row.getCell(11).font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: COLORS.SUCCESS_TEXT } };
    } else if (margin < 0.2) {
      row.getCell(11).font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: COLORS.DANGER_TEXT } };
    }

    // Highlight unpaid balance
    if (remaining > 0) {
      row.getCell(13).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: COLORS.WARNING_BG },
      };
      row.getCell(13).font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: COLORS.WARNING_TEXT } };
    }
  }

  const endRow = ws.lastRow ? ws.lastRow.number : startRow;
  styleTable(ws, headerRow.number, startRow, endRow, headers.length);

  // Totals Row
  const overallProfit = totalRev - totalCost;
  const overallMargin = totalRev > 0 ? overallProfit / totalRev : 0;
  const overallCollection = totalRev > 0 ? totalPaid / totalRev : 0;

  const totalRow = ws.addRow([
    'الإجمالي الكلي',
    '',
    '',
    '',
    '',
    '',
    '',
    totalRev,
    totalCost,
    overallProfit,
    overallMargin,
    totalPaid,
    totalRemaining,
    overallCollection,
  ]);
  totalRow.height = 26;
  ws.mergeCells(totalRow.number, 1, totalRow.number, 7);

  for (let c = 1; c <= 14; c++) {
    const cell = totalRow.getCell(c);
    cell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: COLORS.TEXT_WHITE } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: COLORS.NAVY_PRIMARY },
    };
    cell.border = THIN_BORDER;

    if (c === 8 || c === 9 || c === 10 || c === 12 || c === 13) {
      cell.numFmt = '#,##0 "ج.م"';
    } else if (c === 11 || c === 14) {
      cell.numFmt = '0.0%';
    }
  }
  totalRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

  autoFitColumns(ws);

  // Sheet 2: Payments History Log
  const wsPayments = createRtlWorksheet(workbook, 'سجل سندات القبض');
  addTitleBanner(
    wsPayments,
    'سجل المتحصلات والمدفوعات النقدية والبنكية',
    `الفترة من: ${startDate.toISOString().slice(0, 10)} إلى: ${endDate.toISOString().slice(0, 10)}`,
    7
  );

  const payHeaders = [
    'رقم السند',
    'كود المشروع',
    'عنوان المشروع',
    'اسم العميل',
    'تاريخ السداد',
    'طريقة الدفع',
    'المبلغ المسدد',
    'البيان / ملاحظات',
  ];

  const payHeaderRow = wsPayments.addRow(payHeaders);
  const startPayRow = payHeaderRow.number + 1;

  for (const p of projects) {
    for (const pay of p.payments) {
      const row = wsPayments.addRow([
        `REC-${pay.id.toString().padStart(4, '0')}`,
        `PRJ-${p.id}`,
        p.title,
        p.client.name,
        pay.date ? pay.date.toISOString().slice(0, 10) : '-',
        getStatusLabel(pay.method),
        pay.amount,
        pay.notes || 'سداد دفعة من قيمة المشروع',
      ]);

      row.getCell(1).alignment = { horizontal: 'center' };
      row.getCell(2).alignment = { horizontal: 'center' };
      row.getCell(5).alignment = { horizontal: 'center' };
      row.getCell(6).alignment = { horizontal: 'center' };
      row.getCell(7).numFmt = '#,##0 "ج.م"';
    }
  }

  const endPayRow = wsPayments.lastRow ? wsPayments.lastRow.number : startPayRow;
  styleTable(wsPayments, payHeaderRow.number, startPayRow, endPayRow, payHeaders.length);
  autoFitColumns(wsPayments);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// =========================================================================
// 3. SHIPPING & LOGISTICS REPORT
// =========================================================================

/**
 * Generates an Excel report of shipping costs, installation expenses, and technician logistics.
 */
export async function exportShippingReport(startDate: Date, endDate: Date): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'HATAB ERP';
  workbook.created = new Date();

  const projects = await prisma.project.findMany({
    where: {
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
      OR: [
        { shippingCost: { gt: 0 } },
        { installationCost: { gt: 0 } },
        { tasks: { some: { type: { in: ['INSTALLATION', 'DELIVERY'] } } } },
      ],
    },
    include: {
      client: true,
      tasks: {
        where: {
          type: { in: ['INSTALLATION', 'DELIVERY'] },
        },
        include: {
          technician: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const ws = createRtlWorksheet(workbook, 'تقرير الشحن والتركيبات');
  addTitleBanner(
    ws,
    'تقرير تكاليف الشحن وعمليات التركيب الميداني',
    `الفترة من: ${startDate.toISOString().slice(0, 10)} إلى: ${endDate.toISOString().slice(0, 10)}`,
    11
  );

  const headers = [
    'كود المشروع',
    'عنوان المشروع',
    'اسم العميل',
    'عنوان الموقع / التسليم',
    'حالة المشروع',
    'موعد التسليم المتوقع',
    'تكلفة الشحن',
    'تكلفة التركيب',
    'إجمالي المصروفات اللوجستية',
    'الفنيين المعينين',
    'حالة مهام التركيب',
  ];

  const headerRow = ws.addRow(headers);
  const startRow = headerRow.number + 1;

  let grandShipping = 0;
  let grandInstallation = 0;

  for (const p of projects) {
    const totalLogistics = p.shippingCost + p.installationCost;
    grandShipping += p.shippingCost;
    grandInstallation += p.installationCost;

    const techniciansList = Array.from(
      new Set(
        p.tasks
          .map((t) => t.technician?.name)
          .filter((name): name is string => Boolean(name))
      )
    ).join('، ') || 'لم يتم تعيين فني';

    const completedTasks = p.tasks.filter((t) => t.status === 'DONE').length;
    const totalTasks = p.tasks.length;
    const tasksStatusStr = totalTasks > 0 ? `${completedTasks}/${totalTasks} منجز` : 'لا توجد مهام';

    const row = ws.addRow([
      `PRJ-${p.id}`,
      p.title,
      p.client.name,
      p.client.address || '-',
      getStatusLabel(p.status),
      p.estimatedDelivery ? p.estimatedDelivery.toISOString().slice(0, 10) : '-',
      p.shippingCost,
      p.installationCost,
      totalLogistics,
      techniciansList,
      tasksStatusStr,
    ]);

    row.getCell(1).alignment = { horizontal: 'center' };
    row.getCell(5).alignment = { horizontal: 'center' };
    row.getCell(6).alignment = { horizontal: 'center' };
    row.getCell(7).numFmt = '#,##0 "ج.م"';
    row.getCell(8).numFmt = '#,##0 "ج.م"';
    row.getCell(9).numFmt = '#,##0 "ج.م"';
    row.getCell(11).alignment = { horizontal: 'center' };
  }

  const endRow = ws.lastRow ? ws.lastRow.number : startRow;
  styleTable(ws, headerRow.number, startRow, endRow, headers.length);

  // Totals Row
  const totalRow = ws.addRow([
    'الإجمالي الكلي',
    '',
    '',
    '',
    '',
    '',
    grandShipping,
    grandInstallation,
    grandShipping + grandInstallation,
    '',
    '',
  ]);
  totalRow.height = 26;
  ws.mergeCells(totalRow.number, 1, totalRow.number, 6);

  for (let c = 1; c <= 11; c++) {
    const cell = totalRow.getCell(c);
    cell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: COLORS.TEXT_WHITE } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: COLORS.NAVY_PRIMARY },
    };
    cell.border = THIN_BORDER;

    if (c === 7 || c === 8 || c === 9) {
      cell.numFmt = '#,##0 "ج.م"';
    }
  }
  totalRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

  autoFitColumns(ws);

  // Sheet 2: Technician Tasks Detail
  const wsTasks = createRtlWorksheet(workbook, 'سجل مهام الفنيين');
  addTitleBanner(
    wsTasks,
    'سجل مهام الشحن والتركيبات الميدانية للفنيين',
    `الفترة من: ${startDate.toISOString().slice(0, 10)} إلى: ${endDate.toISOString().slice(0, 10)}`,
    9
  );

  const taskHeaders = [
    'رقم المهمة',
    'كود المشروع',
    'عنوان المشروع',
    'الفني المعين',
    'التخصص',
    'نوع المهمة',
    'تاريخ الاستحقاق',
    'الأولوية',
    'الحالة',
  ];

  const taskHeaderRow = wsTasks.addRow(taskHeaders);
  const startTaskRow = taskHeaderRow.number + 1;

  for (const p of projects) {
    for (const t of p.tasks) {
      const row = wsTasks.addRow([
        `TSK-${t.id}`,
        `PRJ-${p.id}`,
        p.title,
        t.technician ? t.technician.name : 'غير محدد',
        t.technician?.specialization || '-',
        getStatusLabel(t.type),
        t.dueDate ? t.dueDate.toISOString().slice(0, 10) : '-',
        getStatusLabel(t.priority),
        getStatusLabel(t.status),
      ]);

      row.getCell(1).alignment = { horizontal: 'center' };
      row.getCell(2).alignment = { horizontal: 'center' };
      row.getCell(6).alignment = { horizontal: 'center' };
      row.getCell(7).alignment = { horizontal: 'center' };
      row.getCell(8).alignment = { horizontal: 'center' };
      row.getCell(9).alignment = { horizontal: 'center' };
    }
  }

  const endTaskRow = wsTasks.lastRow ? wsTasks.lastRow.number : startTaskRow;
  styleTable(wsTasks, taskHeaderRow.number, startTaskRow, endTaskRow, taskHeaders.length);
  autoFitColumns(wsTasks);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// =========================================================================
// 4. DETAILED SINGLE PROJECT REPORT
// =========================================================================

/**
 * Generates an all-inclusive Excel report for a single project including metadata,
 * bill of quantities (items), supplier orders breakdown, payments, and timeline tasks.
 */
export async function exportProjectReport(projectId: number): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'HATAB ERP';
  workbook.created = new Date();

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      client: true,
      items: {
        include: {
          catalogItem: {
            include: {
              category: true,
              supplier: true,
            },
          },
        },
      },
      supplierOrders: {
        include: {
          supplier: true,
          items: true,
        },
      },
      tasks: {
        include: {
          technician: true,
        },
      },
      payments: true,
    },
  });

  if (!project) {
    throw new Error(`المشروع رقم ${projectId} غير موجود.`);
  }

  const timeline = await calculateProjectTimeline(projectId);
  const syncStatus = await getProjectSyncStatus(projectId);

  // -------------------------------------------------------------------------
  // Sheet 1: Project Overview & Financial KPI Dashboard
  // -------------------------------------------------------------------------
  const wsOverview = createRtlWorksheet(workbook, 'نظرة عامة والملخص المالي');
  addTitleBanner(
    wsOverview,
    `تقرير شامل: ${project.title} (PRJ-${project.id})`,
    `العميل: ${project.client.name} | تاريخ الإنشاء: ${project.createdAt.toISOString().slice(0, 10)}`,
    8
  );

  // Project Info Table
  wsOverview.addRow(['بيانات المشروع والعميل الأساسية']);
  const infoHeader = wsOverview.lastRow!;
  wsOverview.mergeCells(infoHeader.number, 1, infoHeader.number, 8);
  infoHeader.getCell(1).font = { name: 'Segoe UI', size: 12, bold: true, color: { argb: COLORS.TEXT_WHITE } };
  infoHeader.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.NAVY_PRIMARY } };
  infoHeader.getCell(1).alignment = { horizontal: 'center' };

  const infoData = [
    ['كود المشروع', `PRJ-${project.id}`, 'اسم العميل', project.client.name],
    ['عنوان المشروع', project.title, 'الشركة / المؤسسة', project.client.company || '-'],
    ['نوع المشروع', getStatusLabel(project.type), 'رقم هاتف العميل', project.client.phone],
    ['حالة المشروع', getStatusLabel(project.status), 'البريد الإلكتروني', project.client.email || '-'],
    ['الأولوية', getStatusLabel(project.priority), 'عنوان الموقع', project.client.address || '-'],
    ['تاريخ المعاينة', project.inspectionDate ? project.inspectionDate.toISOString().slice(0, 10) : '-', 'تاريخ المزامنة المستهدف', syncStatus.calculatedSyncDate ? syncStatus.calculatedSyncDate.toISOString().slice(0, 10) : '-'],
    ['تاريخ الاعتماد', project.approvalDate ? project.approvalDate.toISOString().slice(0, 10) : '-', 'تاريخ التسليم المتوقع', project.estimatedDelivery ? project.estimatedDelivery.toISOString().slice(0, 10) : '-'],
    ['نسبة إنجاز المشروع', `${timeline.progressPercentage}%`, 'المرحلة الحالية', timeline.currentPhase],
  ];

  for (const rowVals of infoData) {
    const r = wsOverview.addRow(rowVals);
    r.getCell(1).font = { name: 'Segoe UI', bold: true, color: { argb: COLORS.TEXT_DARK } };
    r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.GRAY_HEADER } };
    r.getCell(3).font = { name: 'Segoe UI', bold: true, color: { argb: COLORS.TEXT_DARK } };
    r.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.GRAY_HEADER } };
    for (let c = 1; c <= 4; c++) r.getCell(c).border = THIN_BORDER;
  }

  wsOverview.addRow([]); // Spacer

  // Financial KPI Table
  wsOverview.addRow(['المؤشرات المالية وهامش الربحية']);
  const finHeader = wsOverview.lastRow!;
  wsOverview.mergeCells(finHeader.number, 1, finHeader.number, 8);
  finHeader.getCell(1).font = { name: 'Segoe UI', size: 12, bold: true, color: { argb: COLORS.TEXT_WHITE } };
  finHeader.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.GOLD_PRIMARY } };
  finHeader.getCell(1).alignment = { horizontal: 'center' };

  const grossProfit = project.totalPrice - project.totalCost;
  const marginPct = project.totalPrice > 0 ? grossProfit / project.totalPrice : 0;
  const balanceDue = project.totalPrice - project.amountPaid;
  const netProfit = grossProfit - (project.shippingCost + project.installationCost);

  const finData: Array<[string, number | string, string, number | string]> = [
    ['إجمالي سعر البيع للعميل', project.totalPrice, 'إجمالي تكلفة الشراء من المصانع', project.totalCost],
    ['مجمل الربح التقديري', grossProfit, 'هامش مجمل الربح %', marginPct],
    ['المبلغ المسدد من العميل', project.amountPaid, 'المبلغ المتبقي للتحصيل', balanceDue],
    ['تكلفة الشحن والنقل', project.shippingCost, 'تكلفة التركيبات والعمالة', project.installationCost],
    ['صافي الربح بعد اللوجستيات', netProfit, 'حالة التحصيل المالي', balanceDue <= 0 ? 'مسدد بالكامل ✅' : `متبقي ${balanceDue.toLocaleString('ar-EG')} ج.م ⏳`],
  ];

  for (const rowVals of finData) {
    const r = wsOverview.addRow(rowVals);
    r.getCell(1).font = { name: 'Segoe UI', bold: true };
    r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.GRAY_HEADER } };
    r.getCell(3).font = { name: 'Segoe UI', bold: true };
    r.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.GRAY_HEADER } };

    if (typeof rowVals[1] === 'number') r.getCell(2).numFmt = '#,##0 "ج.م"';
    if (typeof rowVals[3] === 'number') {
      if (rowVals[2].includes('%')) r.getCell(4).numFmt = '0.0%';
      else r.getCell(4).numFmt = '#,##0 "ج.م"';
    }

    for (let c = 1; c <= 4; c++) r.getCell(c).border = THIN_BORDER;
  }

  autoFitColumns(wsOverview);

  // -------------------------------------------------------------------------
  // Sheet 2: Bill of Quantities / Project Items
  // -------------------------------------------------------------------------
  const wsItems = createRtlWorksheet(workbook, 'جدول الكميات والبنود');
  addTitleBanner(
    wsItems,
    `جدول بنود وكميات المشروع: ${project.title}`,
    `إجمالي البنود: ${project.items.length} منتج | كود المشروع: PRJ-${project.id}`,
    13
  );

  const itemHeaders = [
    '#',
    'كود الصنف (SKU)',
    'اسم المنتج (عربي)',
    'اسم المنتج (إنجليزي)',
    'الفئة',
    'المصنع / المورد',
    'الكمية',
    'سعر شراء الوحدة',
    'إجمالي التكلفة',
    'سعر بيع الوحدة',
    'إجمالي سعر البيع',
    'مدة التصنيع (يوم)',
    'حالة البند',
  ];

  const itemHeaderRow = wsItems.addRow(itemHeaders);
  const startItemRow = itemHeaderRow.number + 1;

  let totalItemsCost = 0;
  let totalItemsPrice = 0;
  let totalQty = 0;

  project.items.forEach((item, idx) => {
    const itemTotalCost = item.unitCost * item.quantity;
    const itemTotalPrice = item.unitPrice * item.quantity;
    totalItemsCost += itemTotalCost;
    totalItemsPrice += itemTotalPrice;
    totalQty += item.quantity;

    const row = wsItems.addRow([
      idx + 1,
      item.catalogItem.sku,
      item.catalogItem.nameAr,
      item.catalogItem.nameEn,
      item.catalogItem.category?.nameAr || '-',
      item.catalogItem.supplier?.name || 'غير محدد',
      item.quantity,
      item.unitCost,
      itemTotalCost,
      item.unitPrice,
      itemTotalPrice,
      item.leadTimeDays || item.catalogItem.leadTimeDays,
      getStatusLabel(item.status),
    ]);

    row.getCell(1).alignment = { horizontal: 'center' };
    row.getCell(2).alignment = { horizontal: 'center' };
    row.getCell(7).alignment = { horizontal: 'center' };
    row.getCell(8).numFmt = '#,##0 "ج.م"';
    row.getCell(9).numFmt = '#,##0 "ج.م"';
    row.getCell(10).numFmt = '#,##0 "ج.م"';
    row.getCell(11).numFmt = '#,##0 "ج.م"';
    row.getCell(12).alignment = { horizontal: 'center' };
    row.getCell(13).alignment = { horizontal: 'center' };

    if (['READY', 'DELIVERED', 'INSTALLED'].includes(item.status)) {
      row.getCell(13).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.SUCCESS_BG } };
      row.getCell(13).font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: COLORS.SUCCESS_TEXT } };
    }
  });

  const endItemRow = wsItems.lastRow ? wsItems.lastRow.number : startItemRow;
  styleTable(wsItems, itemHeaderRow.number, startItemRow, endItemRow, itemHeaders.length);

  // Totals row for Items
  const totalItemRow = wsItems.addRow([
    'الإجمالي الكلي',
    '',
    '',
    '',
    '',
    '',
    totalQty,
    '',
    totalItemsCost,
    '',
    totalItemsPrice,
    '',
    '',
  ]);
  totalItemRow.height = 26;
  wsItems.mergeCells(totalItemRow.number, 1, totalItemRow.number, 6);

  for (let c = 1; c <= 13; c++) {
    const cell = totalItemRow.getCell(c);
    cell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: COLORS.TEXT_WHITE } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.NAVY_PRIMARY } };
    cell.border = THIN_BORDER;

    if (c === 9 || c === 11) cell.numFmt = '#,##0 "ج.م"';
  }
  totalItemRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  totalItemRow.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };

  autoFitColumns(wsItems);

  // -------------------------------------------------------------------------
  // Sheet 3: Supplier Orders Breakdown
  // -------------------------------------------------------------------------
  const wsSuppliers = createRtlWorksheet(workbook, 'أوامر التوريد للمصانع');
  addTitleBanner(
    wsSuppliers,
    `أوامر التوريد والتصنيع للمصانع: ${project.title}`,
    `تاريخ المزامنة المحسوب: ${syncStatus.calculatedSyncDate?.toISOString().slice(0, 10) || '-'}`,
    9
  );

  const suppHeaders = [
    'رقم أمر الشراء',
    'اسم المصنع / المورد',
    'هاتف المصنع',
    'تاريخ الطلب',
    'تاريخ التسليم المتوقع',
    'حالة أمر التوريد',
    'إجمالي القيمة',
    'المبلغ المسدد',
    'المتبقي للمصنع',
  ];

  const suppHeaderRow = wsSuppliers.addRow(suppHeaders);
  const startSuppRow = suppHeaderRow.number + 1;

  for (const order of project.supplierOrders) {
    const rem = order.totalAmount - order.amountPaid;
    const row = wsSuppliers.addRow([
      `PO-${order.id.toString().padStart(4, '0')}`,
      order.supplier.name,
      order.supplier.phone,
      order.orderDate ? order.orderDate.toISOString().slice(0, 10) : '-',
      order.expectedDate ? order.expectedDate.toISOString().slice(0, 10) : '-',
      getStatusLabel(order.status),
      order.totalAmount,
      order.amountPaid,
      rem,
    ]);

    row.getCell(1).alignment = { horizontal: 'center' };
    row.getCell(4).alignment = { horizontal: 'center' };
    row.getCell(5).alignment = { horizontal: 'center' };
    row.getCell(6).alignment = { horizontal: 'center' };
    row.getCell(7).numFmt = '#,##0 "ج.م"';
    row.getCell(8).numFmt = '#,##0 "ج.م"';
    row.getCell(9).numFmt = '#,##0 "ج.م"';
  }

  const endSuppRow = wsSuppliers.lastRow ? wsSuppliers.lastRow.number : startSuppRow;
  styleTable(wsSuppliers, suppHeaderRow.number, startSuppRow, endSuppRow, suppHeaders.length);
  autoFitColumns(wsSuppliers);

  // -------------------------------------------------------------------------
  // Sheet 4: Payments History
  // -------------------------------------------------------------------------
  const wsPayments = createRtlWorksheet(workbook, 'سجل المدفوعات والمقبوضات');
  addTitleBanner(
    wsPayments,
    `سجل المدفوعات وسندات القبض: ${project.title}`,
    `إجمالي المسدد: ${project.amountPaid.toLocaleString('ar-EG')} ج.م من إجمالي ${project.totalPrice.toLocaleString('ar-EG')} ج.م`,
    6
  );

  const payHeaders = [
    'رقم السند',
    'تاريخ التحصيل',
    'طريقة السداد',
    'المبلغ المحصل',
    'البيان / ملاحظات',
    'تاريخ التسجيل',
  ];

  const payHeaderRow = wsPayments.addRow(payHeaders);
  const startPayRow = payHeaderRow.number + 1;

  for (const pay of project.payments) {
    const row = wsPayments.addRow([
      `REC-${pay.id.toString().padStart(4, '0')}`,
      pay.date ? pay.date.toISOString().slice(0, 10) : '-',
      getStatusLabel(pay.method),
      pay.amount,
      pay.notes || 'سداد دفعة من قيمة المشروع',
      pay.createdAt.toISOString().slice(0, 10),
    ]);

    row.getCell(1).alignment = { horizontal: 'center' };
    row.getCell(2).alignment = { horizontal: 'center' };
    row.getCell(3).alignment = { horizontal: 'center' };
    row.getCell(4).numFmt = '#,##0 "ج.م"';
    row.getCell(6).alignment = { horizontal: 'center' };
  }

  const endPayRow = wsPayments.lastRow ? wsPayments.lastRow.number : startPayRow;
  styleTable(wsPayments, payHeaderRow.number, startPayRow, endPayRow, payHeaders.length);
  autoFitColumns(wsPayments);

  // -------------------------------------------------------------------------
  // Sheet 5: Execution Tasks & Logistics
  // -------------------------------------------------------------------------
  const wsTasks = createRtlWorksheet(workbook, 'مهام التنفيذ والمتابعة');
  addTitleBanner(
    wsTasks,
    `جدول مهام التنفيذ والمتابعة والتركيب: ${project.title}`,
    `إجمالي المهام: ${project.tasks.length} مهمة`,
    7
  );

  const taskHeaders = [
    'كود المهمة',
    'نوع المهمة',
    'عنوان المهمة',
    'الفني المعين',
    'تاريخ الاستحقاق',
    'الأولوية',
    'الحالة',
  ];

  const taskHeaderRow = wsTasks.addRow(taskHeaders);
  const startTaskRow = taskHeaderRow.number + 1;

  for (const t of project.tasks) {
    const row = wsTasks.addRow([
      `TSK-${t.id}`,
      getStatusLabel(t.type),
      t.title,
      t.technician?.name || 'فريق العمل العام',
      t.dueDate ? t.dueDate.toISOString().slice(0, 10) : '-',
      getStatusLabel(t.priority),
      getStatusLabel(t.status),
    ]);

    row.getCell(1).alignment = { horizontal: 'center' };
    row.getCell(2).alignment = { horizontal: 'center' };
    row.getCell(5).alignment = { horizontal: 'center' };
    row.getCell(6).alignment = { horizontal: 'center' };
    row.getCell(7).alignment = { horizontal: 'center' };

    if (t.status === 'DONE') {
      row.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.SUCCESS_BG } };
      row.getCell(7).font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: COLORS.SUCCESS_TEXT } };
    }
  }

  const endTaskRow = wsTasks.lastRow ? wsTasks.lastRow.number : startTaskRow;
  styleTable(wsTasks, taskHeaderRow.number, startTaskRow, endTaskRow, taskHeaders.length);
  autoFitColumns(wsTasks);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
