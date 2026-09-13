export interface CategoryColorTheme {
  gradient: string;
  badgeBg: string;
  badgeText: string;
  accentBorder: string;
  iconName: string;
}

export const CATEGORY_THEMES: Record<string, CategoryColorTheme> = {
  desks: {
    gradient: "from-blue-900 via-slate-800 to-indigo-950",
    badgeBg: "bg-blue-100 text-blue-800",
    badgeText: "text-blue-600",
    accentBorder: "hover:border-blue-500",
    iconName: "Layout",
  },
  "office-chairs": {
    gradient: "from-slate-900 via-sky-900 to-slate-950",
    badgeBg: "bg-sky-100 text-sky-800",
    badgeText: "text-sky-600",
    accentBorder: "hover:border-sky-500",
    iconName: "Armchair",
  },
  partitions: {
    gradient: "from-teal-950 via-slate-900 to-cyan-950",
    badgeBg: "bg-teal-100 text-teal-800",
    badgeText: "text-teal-600",
    accentBorder: "hover:border-teal-500",
    iconName: "SplitSquareVertical",
  },
  "meeting-tables": {
    gradient: "from-amber-950 via-stone-900 to-yellow-950",
    badgeBg: "bg-amber-100 text-amber-800",
    badgeText: "text-amber-600",
    accentBorder: "hover:border-amber-500",
    iconName: "Users",
  },
  "storage-units": {
    gradient: "from-zinc-900 via-slate-800 to-neutral-900",
    badgeBg: "bg-zinc-100 text-zinc-800",
    badgeText: "text-zinc-600",
    accentBorder: "hover:border-zinc-500",
    iconName: "Archive",
  },
  "sofas-reception": {
    gradient: "from-rose-950 via-stone-900 to-amber-950",
    badgeBg: "bg-rose-100 text-rose-800",
    badgeText: "text-rose-600",
    accentBorder: "hover:border-rose-500",
    iconName: "Sofa",
  },
  "waiting-chairs": {
    gradient: "from-indigo-950 via-slate-900 to-blue-950",
    badgeBg: "bg-indigo-100 text-indigo-800",
    badgeText: "text-indigo-600",
    accentBorder: "hover:border-indigo-500",
    iconName: "Clock",
  },
  "executive-desks": {
    gradient: "from-[#132847] via-[#1e3a5f] to-[#0a1829]",
    badgeBg: "bg-amber-100 text-amber-900",
    badgeText: "text-[#d4a843]",
    accentBorder: "hover:border-[#d4a843]",
    iconName: "Crown",
  },
  "office-accessories": {
    gradient: "from-emerald-950 via-slate-900 to-teal-950",
    badgeBg: "bg-emerald-100 text-emerald-800",
    badgeText: "text-emerald-600",
    accentBorder: "hover:border-emerald-500",
    iconName: "Package",
  },
  "shelves-bookcases": {
    gradient: "from-stone-900 via-amber-950 to-stone-950",
    badgeBg: "bg-stone-100 text-stone-800",
    badgeText: "text-stone-600",
    accentBorder: "hover:border-stone-500",
    iconName: "Library",
  },
};

export function getCategoryTheme(slug?: string | null): CategoryColorTheme {
  if (slug && CATEGORY_THEMES[slug]) {
    return CATEGORY_THEMES[slug];
  }
  return {
    gradient: "from-[#1e3a5f] via-[#2c5282] to-[#132847]",
    badgeBg: "bg-slate-100 text-slate-800",
    badgeText: "text-[#1e3a5f]",
    accentBorder: "hover:border-[#d4a843]",
    iconName: "Layers",
  };
}
