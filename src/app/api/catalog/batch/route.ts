import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireApiSession } from '@/lib/api-auth';

// POST /api/catalog/batch - Batch operations on catalog items
export async function POST(request: NextRequest) {
  const unauthorized = requireApiSession(request);
  if (unauthorized) return unauthorized;
  try {
    const body = await request.json();
    const { action, ids, categoryId } = body;

    if (!action || !ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: 'action and ids[] are required' },
        { status: 400 }
      );
    }

    const numericIds = ids.map((id: any) => parseInt(String(id), 10)).filter((id: number) => !isNaN(id));

    switch (action) {
      case 'activate': {
        await prisma.catalogItem.updateMany({
          where: { id: { in: numericIds } },
          data: { isActive: true },
        });
        return NextResponse.json({ success: true, message: `تم تنشيط ${numericIds.length} منتج` });
      }

      case 'deactivate': {
        await prisma.catalogItem.updateMany({
          where: { id: { in: numericIds } },
          data: { isActive: false },
        });
        return NextResponse.json({ success: true, message: `تم تعطيل ${numericIds.length} منتج` });
      }

      case 'delete': {
        await prisma.catalogItem.updateMany({
          where: { id: { in: numericIds } },
          data: { isActive: false },
        });
        return NextResponse.json({ success: true, message: `تم حذف ${numericIds.length} منتج` });
      }

      case 'move': {
        if (!categoryId) {
          return NextResponse.json(
            { error: 'categoryId is required for move action' },
            { status: 400 }
          );
        }
        const targetCategoryId = parseInt(String(categoryId), 10);
        const category = await prisma.category.findUnique({ where: { id: targetCategoryId } });
        if (!category) {
          return NextResponse.json({ error: 'الفئة المستهدفة غير موجودة' }, { status: 404 });
        }

        await prisma.catalogItem.updateMany({
          where: { id: { in: numericIds } },
          data: { categoryId: targetCategoryId },
        });
        return NextResponse.json({
          success: true,
          message: `تم نقل ${numericIds.length} منتج إلى فئة "${category.nameAr}"`,
        });
      }

      case 'feature': {
        await prisma.catalogItem.updateMany({
          where: { id: { in: numericIds } },
          data: { isFeatured: true },
        });
        return NextResponse.json({ success: true, message: `تم تمييز ${numericIds.length} منتج` });
      }

      case 'unfeature': {
        await prisma.catalogItem.updateMany({
          where: { id: { in: numericIds } },
          data: { isFeatured: false },
        });
        return NextResponse.json({ success: true, message: `تم إزالة التمييز من ${numericIds.length} منتج` });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error: any) {
    console.error('Error in batch operation:', error);
    return NextResponse.json(
      { error: 'فشل في تنفيذ العملية', details: error.message },
      { status: 500 }
    );
  }
}
