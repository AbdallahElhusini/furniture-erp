export interface StorefrontEditorialVisual {
  src: string;
  objectPosition: string;
  altAr: string;
  altEn: string;
}

const visual = (
  src: string,
  objectPosition: string,
  altAr: string,
  altEn: string,
): StorefrontEditorialVisual => ({ src, objectPosition, altAr, altEn });

export const STOREFRONT_EDITORIAL_MEDIA = {
  catalogHero: visual(
    "/images/editorial/open-learning.webp",
    "50% 58%",
    "مساحة عمل مرنة للتعلّم والتعاون",
    "A flexible workspace for learning and collaboration",
  ),
  collectionsHero: visual(
    "/images/editorial/executive-boardroom.webp",
    "50% 52%",
    "غرفة اجتماعات تنفيذية متكاملة",
    "A complete executive meeting room",
  ),
  portfolioHero: visual(
    "/images/editorial/huddle-room.webp",
    "50% 50%",
    "مساحة اجتماع مرتفعة مصممة للعمل المشترك",
    "An elevated meeting space designed for collaboration",
  ),
  portfolioCta: visual(
    "/images/editorial/project-consultation.webp",
    "42% 50%",
    "جلسة تخطيط مشروع تجمع العميل وفريق التصميم حول الخامات والمخططات",
    "A project consultation bringing the client, materials, and space plan together",
  ),
  collectionsMotionVideo: "/media/hatab-chair-family-loop.mp4",
  homeMotionVideo: "/media/hatab-chair-motion-loop.mp4",
  homeMotionPoster: "/images/editorial/sit-stand-motion.webp",
} as const;

export const HOME_SPACE_VISUALS = {
  executive: visual(
    "/images/editorial/executive-stage.webp",
    "56% 50%",
    "مكتب تنفيذي بخشب طبيعي في مشهد هادئ",
    "A natural-wood executive desk in a calm setting",
  ),
  open: visual(
    "/images/editorial/operational-office.webp",
    "50% 50%",
    "مساحة تشغيل مفتوحة بمحطات عمل متناسقة",
    "An open operational workspace with coordinated workstations",
  ),
  meeting: visual(
    "/images/editorial/leather-boardroom.webp",
    "52% 50%",
    "غرفة اجتماعات مع طاولة ومقاعد جلدية",
    "A meeting room with a boardroom table and leather seating",
  ),
  reception: visual(
    "/images/editorial/reception-lounge.webp",
    "62% 50%",
    "استقبال مع كاونتر خشبي ومنطقة انتظار هادئة",
    "A reception with a walnut counter and calm waiting lounge",
  ),
} as const;

export const CATEGORY_EDITORIAL_VISUALS: Record<
  string,
  StorefrontEditorialVisual
> = {
  "operative-desks": visual(
    "/images/editorial/sit-stand-motion.webp",
    "50% 50%",
    "مكتب تشغيلي بسيط يدعم الحركة اليومية",
    "A simple operative desk supporting everyday movement",
  ),
  "task-ergonomic-seating": visual(
    "/images/editorial/mesh-detail.webp",
    "64% 50%",
    "تفاصيل ظهر شبكي لمقعد عمل إرجونومك",
    "Mesh-back detail of an ergonomic task chair",
  ),
  "partitions-screens": visual(
    "/images/editorial/acoustic-partitions.webp",
    "62% 50%",
    "فواصل صوتية نسيجية تنظم مساحة العمل بهدوء",
    "Textile acoustic partitions organizing a calm workspace",
  ),
  "meeting-conference-tables": visual(
    "/images/editorial/leather-boardroom.webp",
    "52% 50%",
    "طاولة اجتماعات كبيرة داخل غرفة مجلس معاصرة",
    "A large meeting table in a contemporary boardroom",
  ),
  "cabinets-storage": visual(
    "/images/editorial/cabinets-storage.webp",
    "64% 50%",
    "وحدات تخزين وخزائن مكتبية متكاملة بخامات دافئة",
    "Integrated office cabinets and storage in warm materials",
  ),
  "lounge-sofas": visual(
    "/images/editorial/waiting-lounge.webp",
    "55% 55%",
    "كنبة ومقاعد استراحة منجدة داخل بهو عمل هادئ",
    "A sofa and upholstered lounge seating in a calm workplace lobby",
  ),
  "waiting-beam-seating": visual(
    "/images/editorial/waiting-beam-seating.webp",
    "66% 52%",
    "خمسة مقاعد انتظار متصلة على هيكل معدني واضح ومتين",
    "Five connected waiting seats on a clear, durable metal beam",
  ),
  "executive-desks": visual(
    "/images/editorial/executive-stage.webp",
    "58% 50%",
    "مكتب تنفيذي بخشب طبيعي وخطوط منحوتة",
    "A natural-wood executive desk with sculpted lines",
  ),
  "office-accessories": visual(
    "/images/editorial/office-accessories.webp",
    "64% 52%",
    "إضاءة ووحدات طاقة وتنظيم كابلات مدمجة في سطح العمل",
    "Lighting, power, and cable management integrated into the work surface",
  ),
  "shelving-bookcases": visual(
    "/images/editorial/home-office.webp",
    "45% 46%",
    "مكتبة جدارية منظمة داخل مساحة عمل",
    "Organized wall shelving inside a workspace",
  ),
  "conference-visitor-seating": visual(
    "/images/editorial/smart-conference.webp",
    "50% 55%",
    "مقاعد اجتماعات منجدة حول طاولة مشتركة",
    "Upholstered conference seating around a shared table",
  ),
  "counter-stools": visual(
    "/images/editorial/counter-stools.webp",
    "36% 52%",
    "مقاعد مرتفعة منجدة حول طاولة تعاون سريعة",
    "Upholstered counter stools around a quick collaboration table",
  ),
  "reception-counters": visual(
    "/images/editorial/reception-lounge.webp",
    "61% 52%",
    "كاونتر استقبال مخصص من خشب الجوز",
    "A custom walnut reception counter",
  ),
  "general-tables": visual(
    "/images/editorial/multipurpose-tables.webp",
    "58% 54%",
    "طاولات متعددة الاستخدام على عجلات داخل مساحة قابلة لإعادة التشكيل",
    "Mobile multi-purpose tables in a reconfigurable workspace",
  ),
  "bench-workstations": visual(
    "/images/editorial/operational-office.webp",
    "52% 52%",
    "محطات عمل متتابعة داخل مكتب تشغيلي",
    "Bench workstations in an operational office",
  ),
};

export const STYLE_EDITORIAL_VISUALS: Record<
  string,
  StorefrontEditorialVisual
> = {
  classic: visual(
    "/images/editorial/classic-boardroom.webp",
    "43% 50%",
    "تشكيلة كلاسيكية مفصلة من الجوز والجلد لغرفة مجلس هادئة",
    "A tailored classic boardroom edit in walnut and leather",
  ),
  "boho-natural": visual(
    "/images/editorial/boho-natural-workspace.webp",
    "56% 50%",
    "تشكيلة طبيعية راقية تجمع البلوط والخوص والنسيج الهادئ",
    "A refined natural edit in oak, cane, and quiet textiles",
  ),
  smart: visual(
    "/images/editorial/smart-workspace.webp",
    "44% 52%",
    "تشكيلة ذكية بارتفاع متغير وطاقة وتنظيم كابلات مدمج",
    "A smart edit with height adjustment, power, and integrated cable management",
  ),
  contemporary: visual(
    "/images/editorial/contemporary-workspace.webp",
    "44% 50%",
    "تشكيلة معاصرة بخطوط دقيقة وخشب طبيعي وتقنية هادئة",
    "A contemporary edit in precise lines, natural timber, and quiet technology",
  ),
  dynamic: visual(
    "/images/editorial/dynamic-workspace.webp",
    "54% 50%",
    "مساحة ديناميكية بطاولات وفواصل وتخزين متحرك قابل لإعادة التشكيل",
    "A dynamic space with mobile tables, screens, and storage that reconfigures with the team",
  ),
};

export function getCategoryEditorialVisual(
  slug?: string | null,
): StorefrontEditorialVisual | undefined {
  return slug ? CATEGORY_EDITORIAL_VISUALS[slug] : undefined;
}

export function getStyleEditorialVisual(
  slug?: string | null,
): StorefrontEditorialVisual | undefined {
  return slug ? STYLE_EDITORIAL_VISUALS[slug] : undefined;
}
