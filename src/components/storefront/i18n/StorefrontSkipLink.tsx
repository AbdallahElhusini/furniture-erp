"use client";

import { useStorefrontI18n } from "./StorefrontI18nProvider";

export function StorefrontSkipLink() {
  const { dictionary } = useStorefrontI18n();

  return (
    <a
      href="#main-content"
      className="fixed start-4 top-3 z-[140] -translate-y-24 rounded-md bg-[var(--hatab-brown)] px-5 py-3 text-sm font-bold text-white shadow-xl transition-transform focus:translate-y-0 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 motion-reduce:transition-none"
    >
      {dictionary.common.skipToContent}
    </a>
  );
}
