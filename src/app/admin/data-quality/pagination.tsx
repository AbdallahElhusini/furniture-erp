import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PaginationMeta } from "./types";

export function Pagination({
  value,
  onPageChange,
}: {
  value: PaginationMeta;
  onPageChange: (page: number) => void;
}) {
  if (value.total === 0) return null;

  const first = (value.page - 1) * value.pageSize + 1;
  const last = Math.min(value.total, value.page * value.pageSize);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
      <p className="text-xs text-slate-500">
        عرض <span className="font-semibold text-slate-700">{first}–{last}</span> من{" "}
        <span className="font-semibold text-slate-700">{value.total}</span>
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!value.hasPreviousPage}
          onClick={() => onPageChange(value.page - 1)}
        >
          <ChevronRight aria-hidden="true" />
          السابق
        </Button>
        <span className="min-w-20 text-center text-xs font-medium text-slate-600">
          {value.page} / {value.pageCount}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!value.hasNextPage}
          onClick={() => onPageChange(value.page + 1)}
        >
          التالي
          <ChevronLeft aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
