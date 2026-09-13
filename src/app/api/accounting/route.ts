import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireLiveAdminSession } from "@/lib/api-auth";
import { PRIVILEGED_API_ROLES } from "@/lib/roles";
import { accountingSnapshot, createLedgerRecord, editLedgerRecord, voidLedgerRecord } from "@/lib/accounting/service";
import { AccountingError } from "@/lib/accounting/validation";
import { neutralizeSpreadsheetText } from "@/lib/data-transfer/egress-security";
import { readBoundedJson, InvalidJsonBodyError, RequestBodyTooLargeError } from "@/lib/public-request-security";

export const runtime = "nodejs";

function failure(error: unknown) {
  if (error instanceof AccountingError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error("Accounting request failed", error);
  return NextResponse.json({ error: "تعذر إتمام عملية الحسابات. حاول مرة أخرى." }, { status: 500 });
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await readBoundedJson(request, 16_384);
    if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) throw new AccountingError("حجم الطلب أكبر من المسموح.", 413);
    if (!(error instanceof InvalidJsonBodyError)) throw error;
  }
  throw new AccountingError("بيانات الطلب غير صحيحة.");
}

const kinds: Record<string, string> = { RECEIPT: "تحصيل عميل", SUPPLIER_PAYMENT: "دفعة مورد", EXPENSE: "مصروف", OTHER_INCOME: "إيراد آخر" };
const methods: Record<string, string> = { CASH: "نقدي", BANK_TRANSFER: "تحويل بنكي", CHECK: "شيك" };

export async function GET(request: Request) {
  try {
    const auth = await requireLiveAdminSession(request, PRIVILEGED_API_ROLES);
    if (auth.response) return auth.response;
    const params = new URL(request.url).searchParams;
    const data = await accountingSnapshot({ from: params.get("from"), to: params.get("to"), q: params.get("q"), kind: params.get("kind") });
    const format = params.get("format");
    if (format !== "xlsx" && format !== "csv") return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "HATAB ERP";
    const addSheet = (name: string, headers: string[], rows: (string | number | null)[][]) => {
      const sheet = workbook.addWorksheet(name, { views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }] });
      sheet.addRow(headers);
      for (const row of rows) sheet.addRow(row.map((value) => typeof value === "string" ? neutralizeSpreadsheetText(value) : value));
      sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF80363D" } };
      sheet.columns.forEach((column) => { column.width = 23; });
      sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
      return sheet;
    };
    addSheet("الحركات", ["المرجع", "التاريخ", "النوع", "الطرف", "المشروع", "أمر التوريد", "البيان", "التصنيف", "وارد", "صادر", "طريقة الدفع", "الحالة", "ملاحظات", "سبب الإلغاء"], data.rows.map((row) => [
      row.key, row.date, kinds[row.kind], row.party, row.projectTitle, row.supplierOrderId, row.description, row.category,
      row.kind === "RECEIPT" || row.kind === "OTHER_INCOME" ? row.amount : 0,
      row.kind === "SUPPLIER_PAYMENT" || row.kind === "EXPENSE" ? row.amount : 0,
      methods[row.method] ?? row.method, row.status === "VOID" ? "ملغاة — مستبعدة من الإجماليات" : "مسجلة", row.notes, row.voidReason,
    ]));
    addSheet("حسابات المشاريع", ["المشروع", "العميل", "الحالة", "سعر البيع", "التكلفة المقدرة", "المحصل", "المتبقي"], data.projects.map((row) => [row.title, row.clientName, row.status, row.totalPrice, row.totalCost, row.amountPaid, row.remaining]));
    addSheet("حسابات المصانع", ["أمر التوريد", "المصنع", "المشروع", "الحالة", "قيمة الأمر", "المدفوع", "المتبقي"], data.supplierOrders.map((row) => [row.id, row.supplierName, row.projectId, row.status, row.totalAmount, row.amountPaid, row.remaining]));
    addSheet("ملخص", ["البند", "القيمة"], [
      ["وارد الحركات المسجلة في الفلتر", data.summary.cashIn], ["صادر الحركات المسجلة في الفلتر", data.summary.cashOut], ["صافي الحركات — ليس الربح", data.summary.netCash],
      ["المتبقي على العملاء — جميع المشاريع غير الملغاة", data.summary.customerDue], ["المتبقي للمصانع — جميع الأوامر", data.summary.supplierDue],
      ["أرصدة تحصيل سابقة دون حركة مفصلة", data.summary.legacyCustomerBalance], ["أرصدة سداد مصانع سابقة دون حركة مفصلة", data.summary.legacySupplierBalance],
      ["ملاحظة", "الحركات الملغاة مستبعدة من الإجماليات. هذا كشف حسابات؛ استيراد البيانات يتم بقوالب مركز البيانات."],
    ]);
    const output = format === "csv" ? await workbook.csv.writeBuffer({ sheetName: "الحركات" }) : await workbook.xlsx.writeBuffer();
    return new NextResponse(new Uint8Array(format === "csv" ? Buffer.concat([Buffer.from("\uFEFF"), Buffer.from(output)]) : Buffer.from(output)), {
      headers: { "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="hatab-accounts-${new Date().toISOString().slice(0, 10)}.${format}"`, "Cache-Control": "private, no-store" },
    });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const auth = await requireLiveAdminSession(request, PRIVILEGED_API_ROLES);
    if (auth.response) return auth.response;
    const body = await readBody(request);
    const result = await createLedgerRecord(body, body.requestKey, auth.user);
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) { return failure(error); }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireLiveAdminSession(request, PRIVILEGED_API_ROLES);
    if (auth.response) return auth.response;
    const body = await readBody(request);
    const result = body.operation === "VOID"
      ? await voidLedgerRecord(body.key, body.token, body.reason, auth.user)
      : await editLedgerRecord(body.key, body.token, body, auth.user);
    return NextResponse.json(result);
  } catch (error) { return failure(error); }
}
