import { requireLiveAdminSession } from "@/lib/api-auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireLiveAdminSession(request);
  if (auth.response) return auth.response;
  const url = new URL(request.url);
  const requested = Number(url.searchParams.get("limit") ?? 30);
  const take = Number.isInteger(requested) ? Math.min(100, Math.max(1, requested)) : 30;
  const jobs = await prisma.dataTransferJob.findMany({
    take,
    orderBy: { createdAt: "desc" },
    select: {
      id: true, kind: true, scope: true, module: true, fileName: true, status: true, dryRun: true,
      rowCount: true, insertedCount: true, updatedCount: true, skippedCount: true, errorCount: true,
      actorEmail: true, resultName: true, startedAt: true, createdAt: true, completedAt: true,
      _count: { select: { issues: true, changes: true } },
    },
  });
  return Response.json({ jobs }, { headers: { "Cache-Control": "no-store" } });
}

