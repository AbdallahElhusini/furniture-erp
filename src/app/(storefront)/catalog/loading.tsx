import { getStorefrontLocale } from "@/lib/i18n/storefront-server";
import { getStorefrontPageContent } from "@/lib/site-content-server";

function ProductSkeleton({ featured = false }: { featured?: boolean }) {
  return (
    <div className={`architectural-panel overflow-hidden p-2.5 ${featured ? "sm:col-span-2 lg:col-span-2" : ""}`}>
      <div className={`architectural-line-field animate-pulse rounded-[var(--shape-control)] bg-[var(--surface-editorial)] ${featured ? "aspect-[1.65/1]" : "aspect-[1.08/1]"}`} />
      <div className="space-y-3 px-2.5 py-4">
        <div className="h-2.5 w-1/4 animate-pulse rounded-[0.2rem] bg-[var(--surface-editorial)]" />
        <div className="h-5 w-4/5 animate-pulse rounded-[var(--shape-xs)] bg-[var(--surface-editorial)]" />
        <div className="h-2.5 w-2/5 animate-pulse rounded-[0.2rem] bg-[var(--surface-editorial)]" />
      </div>
    </div>
  );
}

export default async function CatalogLoading() {
  const [locale, content] = await Promise.all([getStorefrontLocale(), getStorefrontPageContent()]);
  const loadingLabel = content[locale].catalog.loading;

  return (
    <div
      className="architectural-line-field min-h-screen bg-[var(--surface-editorial)] pb-24"
      aria-label={loadingLabel}
      aria-busy="true"
      lang={locale}
      dir={locale === "ar" ? "rtl" : "ltr"}
    >
      <section className="architectural-banner py-14 sm:py-20">
        <div className="editorial-shell grid items-end gap-8 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <div className="space-y-5">
            <div className="h-3 w-28 animate-pulse rounded-[0.2rem] bg-[var(--surface-clay)]/60" />
            <div className="h-20 max-w-2xl animate-pulse rounded-[var(--shape-panel)] bg-[var(--surface-paper)] sm:h-28" />
            <div className="h-4 max-w-xl animate-pulse rounded-[0.2rem] bg-[var(--surface-paper)]" />
          </div>
          <div className="editorial-crosshair hidden h-60 animate-pulse rounded-[var(--shape-panel)] bg-[var(--surface-ink)] lg:block" />
        </div>
      </section>

      <div className="h-28 animate-pulse border-b border-white/10 bg-[var(--surface-ink)]" />

      <section className="editorial-shell grid gap-8 py-12 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="architectural-panel hidden space-y-4 p-5 lg:block">
          <div className="h-11 animate-pulse rounded-[var(--shape-control)] bg-[var(--surface-editorial)]" />
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-9 animate-pulse rounded-[var(--shape-xs)] bg-[var(--surface-editorial)]" />
          ))}
        </aside>
        <div className="grid min-w-0 grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          <ProductSkeleton featured />
          {Array.from({ length: 7 }).map((_, index) => <ProductSkeleton key={index} />)}
        </div>
      </section>
    </div>
  );
}
