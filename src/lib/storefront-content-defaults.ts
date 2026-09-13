import type { StorefrontLocale } from "@/lib/i18n/storefront";

export interface StorefrontPageContent {
  catalog: {
    metaTitle: string; metaDescription: string; categoryMetaDescription: string; categoryNotFoundTitle: string; categoryMetaTitle: string;
    breadcrumb: string; kicker: string; searchResults: string; title: string; collectionBody: string; categoryBody: string; body: string;
    resultsSummary: string; curatedIndex: string; matches: string; summaryHint: string; startCategory: string; allProducts: string;
    categoriesLabel: string; all: string; searchResultsFor: string; resultCount: string; pageCount: string; pagesLabel: string;
    previous: string; next: string; noMatchLabel: string; noResults: string; noResultsBody: string; viewAll: string; loading: string;
  };
  catalogFilter: {
    searchCatalog: string; search: string; searchPlaceholder: string; clearSearch: string;
    recommended: string; newest: string; alphabetical: string; filterSort: string; refineLabel: string; refineTitle: string;
    activeFilters: string; selections: string; reset: string; sortResults: string; sort: string; price: string; priceCurrency: string;
    allPriceBands: string; priceBand: string; priceSummary: string; workspaceStyle: string; styleEdit: string; style: string;
    category: string; categoryLabel: string; allProducts: string; tagHint: string; updating: string; updated: string;
    priceBandLabels: Record<string, string>;
  };
  productCard: {
    officeFurniture: string; officePiece: string; viewNamed: string; selected: string; priceCurrency: string;
    priceLabel: string; priceOnRequest: string; requestPricing: string; hatabObject: string;
  };
  collections: {
    metaTitle: string; metaDescription: string; breadcrumb: string; home: string; title: string; kicker: string;
    heroLead: string; heroStrong: string; heroBody: string; directory: string; coordinatedEdits: string; style: string;
    curatedLabel: string; curatedLead: string; curatedStrong: string; curatedBody: string; spacePlan: string; styleEdit: string;
    stylePieces: string; onRequest: string; explore: string; publishedLabel: string; publishedLead: string; publishedStrong: string;
    publishedBody: string; fallbackType: string; collectionLabel: string; publishedPieces: string; emptyTitle: string; emptyBody: string; fullCatalog: string;
    typeLabels: { STYLE: string; SET: string; SPACE: string; CAMPAIGN: string };
  };
  portfolio: {
    title: string; metaTitle: string; description: string; breadcrumb: string; home: string; projects: string; documentedSpaces: string;
    axisLabel: string; heroLead: string; heroStrong: string; heroBody: string; publicationFrame: string; frameLead: string;
    frameStrong: string; publishedCases: string; emptyLead: string; emptyStrong: string; emptyBody: string; startProject: string;
    browseProducts: string; processEyebrow: string; processLead: string; processStrong: string; processBody: string;
    briefEyebrow: string; briefLead: string; briefStrong: string; startFromCatalog: string;
    steps: readonly { title: string; description: string }[];
  };
  product: {
    notFound: string; officePiece: string; metaDescription: string; schemaDescription: string; breadcrumb: string; home: string; catalog: string;
    objectLabel: string; catalogueLocation: string; selected: string; fallbackDescription: string; materialData: string; dimensions: string;
    material: string; color: string; traitsLabel: string; assurances: readonly string[]; detailsTitle: string; detailsBody: string;
    specificationLabels: { dimensions: string; material: string; materials: string; color: string; finish: string; weight: string; warranty: string; origin: string };
    specificationFallbacks: readonly { title: string; copy: string }[]; sameFamily: string; familyBody: string; coordinated: string;
    completeSet: string; discoverMore: string; sameCategory: string; allCategory: string;
  };
  productActions: {
    coordinate: string; eyebrow: string; title: string; body: string; inBoard: string; quantityLimit: string; productLimit: string;
    invalid: string; saved: string; addQuantity: string; add: string; disclaimer: string; review: string;
  };
  addToQuote: {
    quantityLimit: string; productLimit: string; invalid: string; saved: string; increase: string; addNamed: string;
    title: string; addMore: string; add: string;
  };
  quantity: { group: string; decrease: string; input: string; increase: string };
  gallery: {
    pendingLabel: string; pendingTitle: string; pendingBody: string; object: string; previous: string; next: string;
    thumbnails: string; imageOf: string; coordinate: string;
  };
  notFound: { routeUnknown: string; errorRoute: string; savedBoard: string; eyebrow: string; title: string; body: string; browse: string; home: string };
  styles: Record<string, { name: string; tagline: string; description: string; criteria: string }>;
}

export const STOREFRONT_PAGE_CONTENT_DEFAULTS: Record<StorefrontLocale, StorefrontPageContent> = {
  ar: {
    catalog: {
      metaTitle: "الكتالوج", metaDescription: "استكشف الأثاث المكتبي حسب الفئة والمساحة والخامة والميزة.", categoryMetaDescription: "استكشف {category} ضمن كتالوج HATAB للأثاث المكتبي.", categoryNotFoundTitle: "القسم غير موجود | HATAB", categoryMetaTitle: "{category} | HATAB",
      breadcrumb: "مسار الصفحة", kicker: "استكشاف مرن", searchResults: "نتائج البحث", title: "كتالوج حطب", collectionBody: "استكشف القطع المنسقة ضمن {collection} وأضف ما يناسب مشروعك.", categoryBody: "استكشف {category} وقارن القطع المتاحة قبل إضافتها إلى لوحة مشروعك.", body: "ابحث بين الفئات وصفِّ المنتجات حسب المساحة والخامة واللون والميزات، ثم اجمع اختياراتك في طلب واحد.",
      resultsSummary: "ملخص النتائج", curatedIndex: "فهرس منسق", matches: "قطعة تطابق طريقة الاستكشاف الحالية", summaryHint: "اجمع الفئة والخامة والميزة للوصول إلى تكوين أدق.", startCategory: "ابدأ من الفئة", allProducts: "كل المنتجات",
      categoriesLabel: "فئات الكتالوج", all: "الكل", searchResultsFor: "نتائج البحث عن", resultCount: "{count} نتيجة جاهزة للمقارنة", pageCount: "صفحة {page} من {total}", pagesLabel: "صفحات الكتالوج",
      previous: "السابق", next: "التالي", noMatchLabel: "لا تطابق / 00", noResults: "لا توجد نتائج مطابقة.", noResultsBody: "جرّب كلمة أقصر، أو أزل أحد الفلاتر للحصول على نطاق أوسع من المنتجات.", viewAll: "عرض كل المنتجات", loading: "جارٍ تحميل الكتالوج",
    },
    catalogFilter: {
      searchCatalog: "ابحث في الكتالوج", search: "بحث", searchPlaceholder: "اسم، كود أو خامة...", clearSearch: "مسح البحث",
      recommended: "الأنسب", newest: "الأحدث", alphabetical: "أبجدياً", filterSort: "التصفية والترتيب", refineLabel: "تصفية / 01", refineTitle: "اضبط اختيارك",
      activeFilters: "{count} فلاتر مفعلة", selections: "اختياراتك", reset: "إعادة الضبط", sortResults: "ترتيب النتائج", sort: "ترتيب", price: "السعر", priceCurrency: "السعر / ج.م",
      allPriceBands: "كل نطاقات السعر", priceBand: "نطاق {index}", priceSummary: "الأسعار المؤكدة حالياً من {min} إلى {max}. القطع بلا سعر موجب تظهر بوضوح كسعر حسب الطلب.", workspaceStyle: "أسلوب المساحة", styleEdit: "تنسيق الأسلوب", style: "أسلوب",
      category: "الفئة", categoryLabel: "الفئة / 02", allProducts: "كل المنتجات", tagHint: "اختر أكثر من وسم داخل المجموعة للتوسّع، واجمع مجموعات مختلفة لتضييق النتائج.", updating: "جارٍ تحديث النتائج", updated: "تم تحديث النتائج",
      priceBandLabels: { "under-3000": "حتى ٣٬٠٠٠ ج.م", "3000-7000": "٣٬٠٠٠ — ٧٬٠٠٠ ج.م", "7000-15000": "٧٬٠٠٠ — ١٥٬٠٠٠ ج.م", "over-15000": "أكثر من ١٥٬٠٠٠ ج.م", "request-only": "السعر حسب الطلب" },
    },
    productCard: { officeFurniture: "أثاث مكتبي", officePiece: "قطعة مكتبية", viewNamed: "عرض {name}", selected: "مختار", priceCurrency: "السعر / ج.م", priceLabel: "السعر {price}", priceOnRequest: "السعر حسب الطلب", requestPricing: "طلب تسعير", hatabObject: "قطعة HATAB" },
    collections: {
      metaTitle: "التشكيلات والأساليب", metaDescription: "تشكيلات أثاث مكتبي منسقة بأساليب كلاسيكية وطبيعية وذكية ومعاصرة وديناميكية من قطع الكتالوج الحالية.", breadcrumb: "مسار الصفحة", home: "الرئيسية", title: "التشكيلات", kicker: "مكتبة الأساليب · تشكيلات منسقة",
      heroLead: "أسلوب واحد.", heroStrong: "مساحة مفهومة.", heroBody: "خمس طرق واضحة لتنسيق المكتب والجلوس والتخزين والاجتماع. كل دليل مبني من قطع موجودة فعلياً في الكتالوج، ويمكن تعديل أي قطعة قبل إرسال الطلب.", directory: "دليل التشكيلات", coordinatedEdits: "تشكيلات متكاملة", style: "أسلوب",
      curatedLabel: "01 · منسقة حسب الأسلوب", curatedLead: "قطع تكمل بعضها،", curatedStrong: "لا منتجات منفصلة بلا سياق.", curatedBody: "تُبنى هذه الأدلة لحظياً من القطع المتاحة وفق أكوادها وسماتها الحالية؛ ولن تظهر قطعة خارج بوابة النشر.", spacePlan: "مخطط المساحة", styleEdit: "تنسيق أسلوب",
      stylePieces: "قطع أسلوب {style}", onRequest: "حسب الطلب", explore: "استكشف التكوين", publishedLabel: "02 · التشكيلات المنشورة", publishedLead: "التشكيلات التجارية ", publishedStrong: "المنشورة.",
      publishedBody: "هذه المساحة تعرض حصراً التشكيلات النشطة وغير المسودة التي تحتوي منتجات متاحة للنشر.", fallbackType: "تشكيلة", collectionLabel: "تشكيلة", publishedPieces: "{count} قطعة منشورة", emptyTitle: "لا توجد تشكيلات تجارية منشورة الآن.", emptyBody: "لن ننشر مجموعة قاعدة بيانات قبل اعتمادها واكتمال قطعها. أدلة الأسلوب أعلاه تبقى مدخلك الآمن للقطع المتاحة حالياً.", fullCatalog: "الكتالوج الكامل",
      typeLabels: { STYLE: "أسلوب", SET: "طقم", SPACE: "مساحة", CAMPAIGN: "مختارات" },
    },
    portfolio: {
      title: "المشروعات", metaTitle: "مشروعات مساحات العمل", description: "خطوات بدء مشروع تأثيث مساحة عمل جديدة مع HATAB.", breadcrumb: "مسار الصفحة", home: "الرئيسية", projects: "المشروعات", documentedSpaces: "مساحات موثّقة", axisLabel: "المحور {index} / دراسات الحالة", heroLead: "من القطعة", heroStrong: "إلى المشهد.", heroBody: "نعرض المشروعات بعد اكتمال صورها وتفاصيلها واعتمادها للنشر؛ لتكون كل حالة مرجعاً بصرياً واضحاً، لا مجرد اسم أو وعد.", publicationFrame: "إطار النشر", frameLead: "الصورة لا تدخل المعرض قبل", frameStrong: "اعتمادها للنشر.", publishedCases: "حالات منشورة", emptyLead: "معرض المشروعات", emptyStrong: "قيد التوثيق.", emptyBody: "لن تظهر سجلات العملاء الداخلية هنا. سيُنشر كل مشروع فقط بعد إضافة حالة نشر صريحة واعتماد صوره وبياناته؛ ويمكنك الآن بدء لوحة مشروع جديدة من الكتالوج.", startProject: "ابدأ مشروعك", browseProducts: "تصفح المنتجات", processEyebrow: "طريقة العمل", processLead: "ابدأ بما تعرفه", processStrong: "الآن.", processBody: "لا تحتاج إلى حسم كل التفاصيل قبل الإرسال؛ يكفي تحديد المساحة والقطع الأولية والكميات التقريبية.", briefEyebrow: "ابدأ بملخص", briefLead: "حوّل الاختيارات إلى", briefStrong: "طلب قابل للمراجعة.", startFromCatalog: "ابدأ من الكتالوج",
      steps: [{ title: "نوع المساحة", description: "حدّد إن كانت تنفيذية، مفتوحة، اجتماعات، استقبال، أو مزيجاً منها." }, { title: "القطع والكميات", description: "اجمع المنتجات من الكتالوج وعدّل الكمية لكل قطعة داخل اللوحة." }, { title: "ملخص المشروع", description: "أضف الموعد المستهدف والميزانية الإرشادية وأي ملاحظات مهمة." }],
    },
    product: {
      notFound: "المنتج غير موجود", officePiece: "قطعة مكتبية", metaDescription: "استكشف {name} وأضفه إلى لوحة مشروعك لطلب عرض مخصص.", schemaDescription: "قطعة من فئة {category} ضمن كتالوج HATAB للأثاث المكتبي.", breadcrumb: "مسار الصفحة", home: "الرئيسية", catalog: "الكتالوج", objectLabel: "المنتج / القطعة", catalogueLocation: "HATAB · القاهرة · الكتالوج", selected: "مختار من HATAB", fallbackDescription: "أضف هذه القطعة من فئة {category} إلى لوحة مشروعك وحدد الكمية، ثم شارك متطلبات المساحة والتشطيب للمراجعة.", materialData: "بيانات الخامة والمقاس", dimensions: "الأبعاد", material: "الخامة", color: "اللون", traitsLabel: "خصائص ومجموعات المنتج", assurances: ["عرض مخصص حسب الكمية", "الكميات قابلة للتعديل", "تأكيد التشطيب قبل التنفيذ"], detailsTitle: "تفاصيل واضحة، قرار أدق.", detailsBody: "تُراجع الخامات والألوان والأبعاد النهائية مع فريق المشروع قبل اعتماد العرض.", specificationLabels: { dimensions: "الأبعاد", material: "الخامة", materials: "الخامات", color: "اللون", finish: "التشطيب", weight: "الوزن", warranty: "الضمان", origin: "بلد المنشأ" }, specificationFallbacks: [{ title: "المقاس", copy: "أرسل أبعاد المساحة أو المخطط ضمن ملخص الطلب." }, { title: "الكمية", copy: "عدّل عدد كل قطعة داخل لوحة المشروع في أي وقت." }, { title: "التشطيب", copy: "أضف تفضيلات اللون والخامة في ملاحظات المشروع." }], sameFamily: "العائلة نفسها", familyBody: "قطع أخرى مسجّلة ضمن عائلة المنتج نفسها.", coordinated: "تكوين متناسق", completeSet: "أكمل مجموعة القطع", discoverMore: "اكتشف المزيد", sameCategory: "من الفئة نفسها", allCategory: "كل {category}",
    },
    productActions: { coordinate: "المشروع / إضافة", eyebrow: "لوحة المشروع", title: "حدّد الكمية واحفظ القطعة", body: "يمكنك تعديل الكمية ومراجعة كل القطع قبل إرسال الطلب.", inBoard: "في اللوحة: {quantity}", quantityLimit: "وصلت الكمية إلى الحد الأقصى", productLimit: "لوحة المشروع تستوعب حتى {limit} منتج مختلف", invalid: "تعذرت إضافة هذا المنتج", saved: "حُفظ المنتج في اللوحة · الإجمالي {quantity}", addQuantity: "أضف الكمية إلى اللوحة", add: "أضف إلى لوحة المشروع", disclaimer: "الحفظ لا يرسل الطلب؛ تُراجع المواصفات والتوافر بعد الإرسال.", review: "راجع المشروع" },
    addToQuote: { quantityLimit: "وصلت الكمية إلى الحد الأقصى", productLimit: "لوحة المشروع تستوعب حتى {limit} منتج", invalid: "تعذرت إضافة هذا المنتج", saved: "تم الحفظ في اللوحة · الكمية {quantity}", increase: "زيادة كمية {name} في لوحة المشروع", addNamed: "إضافة {name} إلى لوحة المشروع", title: "أضف إلى لوحة المشروع", addMore: "أضف المزيد · في اللوحة {quantity}", add: "أضف إلى لوحة المشروع" },
    quantity: { group: "الكمية: {name}", decrease: "تقليل كمية {name}", input: "كمية {name}", increase: "زيادة كمية {name}" },
    gallery: { pendingLabel: "الصورة / قيد المراجعة", pendingTitle: "الصورة قيد المراجعة", pendingBody: "لا تتوفر صورة معتمدة لهذا المنتج حالياً.", object: "القطعة", previous: "عرض الصورة السابقة", next: "عرض الصورة التالية", thumbnails: "صور المنتج المصغرة", imageOf: "صورة {current} من {total}", coordinate: "س {x} · ص {y}" },
    notFound: { routeUnknown: "المسار / غير معروف", errorRoute: "خطأ / المسار", savedBoard: "المسار غير متاح، لكن اختيارات لوحة المشروع تبقى محفوظة على هذا الجهاز.", eyebrow: "مسار غير متاح", title: "لم نجد هذه الصفحة.", body: "قد يكون الرابط قد تغيّر، أو لم تعد القطعة منشورة. ارجع إلى الكتالوج وتابع الاستكشاف من حيث توقفت.", browse: "تصفح الكتالوج", home: "العودة للرئيسية" },
    styles: {
      classic: { name: "كلاسيكي", tagline: "خشب دافئ وحضور راسخ", description: "مكتب قيادة، كرسي جلدي، تخزين خشبي وطاولة اجتماع بتدرجات بنية متقاربة.", criteria: "اختيار من القطع الحالية الموسومة بالخشب والبني." },
      "boho-natural": { name: "بوهو طبيعي", tagline: "ملمس هادئ ودرجات ترابية", description: "مكتب خشبي فاتح، جلوس بني، تخزين بيج وفاصل قماشي لتكوين مساحة أكثر دفئاً.", criteria: "اختيار من خامات الخشب والقماش ودرجات البني والبيج الحالية." },
      smart: { name: "ذكي", tagline: "تقنية نظيفة وأداء مركز", description: "مكتب ذكي، كرسي إرجونومك، تخزين منظم وطاولة اجتماع فاتحة مع حامل شاشة عملي.", criteria: "تكوين دقيق من القطع الذكية والإرجونومك والأبيض والأسود المتاحة." },
      contemporary: { name: "معاصر", tagline: "خطوط خفيفة وتباين محسوب", description: "مكتب تنفيذي مودرن، كرسي رمادي، خزانة محايدة وطاولة اجتماع مع قاطع زجاجي.", criteria: "اختيار من القطع الرمادية والمعدنية والزجاجية ذات الخطوط الحديثة." },
      dynamic: { name: "ديناميكي", tagline: "تكوين مرن ليوم متغير", description: "مكتب زاوية، كرسي إرجونومك، ملفات معدنية وطاولة اجتماع مع فاصل متحرك بصرياً.", criteria: "اختيار من قطع العمل المفتوح والإرجونومك والتقسيم القابل لإعادة الترتيب." },
    },
  },
  en: {
    catalog: {
      metaTitle: "Catalog", metaDescription: "Explore office furniture by category, workspace, material, and feature.", categoryMetaDescription: "Explore {category} in the HATAB office furniture catalog.", categoryNotFoundTitle: "Category not found | HATAB", categoryMetaTitle: "{category} | HATAB",
      breadcrumb: "Breadcrumb", kicker: "Flexible discovery", searchResults: "Search results", title: "HATAB catalog", collectionBody: "Explore the pieces coordinated for {collection}, then add the right ones to your project.", categoryBody: "Explore {category}, compare available pieces, and add the right ones to your project board.", body: "Search categories and filter products by space, material, color, and feature, then bring your choices into one request.",
      resultsSummary: "Results summary", curatedIndex: "CURATED INDEX", matches: "pieces match the current selection", summaryHint: "Combine category, material, and feature for a more precise edit.", startCategory: "Start with a category", allProducts: "All products",
      categoriesLabel: "Catalog categories", all: "All", searchResultsFor: "Search results for", resultCount: "{count} results ready to compare", pageCount: "Page {page} of {total}", pagesLabel: "Catalog pages",
      previous: "Previous", next: "Next", noMatchLabel: "NO MATCH / 00", noResults: "No matching results.", noResultsBody: "Try a shorter term or remove a filter to see a broader range of products.", viewAll: "View all products", loading: "Loading catalogue",
    },
    catalogFilter: {
      searchCatalog: "Search the catalog", search: "SEARCH", searchPlaceholder: "Name, SKU, or material...", clearSearch: "Clear search",
      recommended: "Recommended", newest: "Newest", alphabetical: "A–Z", filterSort: "Filter & sort", refineLabel: "REFINE / 01", refineTitle: "Refine your selection",
      activeFilters: "{count} active filters", selections: "Your selections", reset: "Reset", sortResults: "Sort results", sort: "SORT", price: "Price", priceCurrency: "PRICE / EGP",
      allPriceBands: "All price bands", priceBand: "{slug}", priceSummary: "Confirmed prices currently run from {min} to {max}. Items without a positive price are clearly marked price on request.", workspaceStyle: "Workspace style", styleEdit: "STYLE EDIT", style: "STYLE",
      category: "Category", categoryLabel: "CATEGORY / 02", allProducts: "All products", tagHint: "Choose multiple tags within a group to broaden it, and combine different groups to narrow the results.", updating: "Updating results", updated: "Results updated",
      priceBandLabels: { "under-3000": "Up to EGP 3,000", "3000-7000": "EGP 3,000 — 7,000", "7000-15000": "EGP 7,000 — 15,000", "over-15000": "Above EGP 15,000", "request-only": "Price on request" },
    },
    productCard: { officeFurniture: "Office furniture", officePiece: "Office piece", viewNamed: "View {name}", selected: "Selected", priceCurrency: "PRICE / EGP", priceLabel: "Price {price}", priceOnRequest: "Price on request", requestPricing: "REQUEST PRICING", hatabObject: "HATAB object" },
    collections: {
      metaTitle: "Collections & styles", metaDescription: "Coordinated office furniture edits in Classic, Boho / Natural, Smart, Contemporary, and Dynamic styles, built from the current catalog.", breadcrumb: "Breadcrumb", home: "Home", title: "Collections", kicker: "STYLE LIBRARY · COORDINATED EDITS",
      heroLead: "One style.", heroStrong: "A space that reads clearly.", heroBody: "Five clear ways to coordinate desks, seating, storage, and meeting pieces. Every edit is built from real catalog items, and every piece can be changed before the request is sent.", directory: "Style directory", coordinatedEdits: "COORDINATED EDITS", style: "STYLE",
      curatedLabel: "01 · Curated by style", curatedLead: "Pieces that complete one another,", curatedStrong: "not isolated objects without context.", curatedBody: "These edits are assembled live from available pieces using their current SKUs and attributes; nothing outside the publication gate appears.", spacePlan: "SPACE PLAN", styleEdit: "STYLE EDIT",
      stylePieces: "{style} style pieces", onRequest: "On request", explore: "Explore this edit", publishedLabel: "02 · Published collections", publishedLead: "Commercial collections, ", publishedStrong: "published.",
      publishedBody: "This area only shows active, non-draft collections containing products cleared for publication.", fallbackType: "Collection", collectionLabel: "COLLECTION", publishedPieces: "{count} published pieces", emptyTitle: "No commercial collections are published yet.", emptyBody: "A database collection will not appear until it is approved and complete. The style edits above remain the safe route into currently available pieces.", fullCatalog: "Full catalog",
      typeLabels: { STYLE: "Style", SET: "Set", SPACE: "Space", CAMPAIGN: "Edit" },
    },
    portfolio: {
      title: "Projects", metaTitle: "Workspace projects", description: "The steps for starting a new workspace furnishing project with HATAB.", breadcrumb: "Breadcrumb", home: "Home", projects: "Projects", documentedSpaces: "Documented spaces", axisLabel: "AXIS {index} / CASE STUDIES", heroLead: "From a piece", heroStrong: "to a complete scene.", heroBody: "Projects appear only after their images, details and publication status are approved, so every case becomes a clear visual reference rather than a name or a promise.", publicationFrame: "Publication frame", frameLead: "An image enters the portfolio only after", frameStrong: "publication approval.", publishedCases: "Published cases", emptyLead: "The project portfolio is", emptyStrong: "being documented.", emptyBody: "Internal client records never appear here. A project is published only after an explicit publication state and approved imagery and data; meanwhile, you can start a new project board from the catalogue.", startProject: "Start your project", browseProducts: "Browse products", processEyebrow: "How it works", processLead: "Start with what you know", processStrong: "today.", processBody: "You do not need every detail settled before submitting. Start with the space, initial pieces and approximate quantities.", briefEyebrow: "Start with a brief", briefLead: "Turn selections into", briefStrong: "a reviewable request.", startFromCatalog: "Start from the catalogue",
      steps: [{ title: "Space type", description: "Choose executive, open-plan, meeting, reception, or a considered mix." }, { title: "Pieces and quantities", description: "Collect catalogue products and adjust the quantity of each piece on the board." }, { title: "Project brief", description: "Add the target date, indicative budget and any important notes." }],
    },
    product: {
      notFound: "Product not found", officePiece: "Office piece", metaDescription: "Explore {name} and add it to your project board for a tailored quote.", schemaDescription: "A {category} piece from the HATAB office furniture catalogue.", breadcrumb: "Breadcrumb", home: "Home", catalog: "Catalogue", objectLabel: "PRODUCT / OBJECT", catalogueLocation: "HATAB · CAIRO · CATALOGUE", selected: "Selected by HATAB", fallbackDescription: "Add this {category} piece to your project board, set the quantity, then share your space and finish requirements for review.", materialData: "Material and size data", dimensions: "Dimensions", material: "Material", color: "Colour", traitsLabel: "Product features and collections", assurances: ["Quote tailored to quantity", "Quantities remain editable", "Finish confirmed before production"], detailsTitle: "Clear details. Better decisions.", detailsBody: "Materials, colours and final dimensions are reviewed with the project team before the quote is approved.", specificationLabels: { dimensions: "Dimensions", material: "Material", materials: "Materials", color: "Colour", finish: "Finish", weight: "Weight", warranty: "Warranty", origin: "Origin" }, specificationFallbacks: [{ title: "Dimensions", copy: "Share the room dimensions or plan in the project brief." }, { title: "Quantity", copy: "Adjust the quantity of every piece on your project board at any time." }, { title: "Finish", copy: "Add colour and material preferences to your project notes." }], sameFamily: "From the same family", familyBody: "Other approved pieces registered in the same product family.", coordinated: "Coordinated composition", completeSet: "Complete the set", discoverMore: "Discover more", sameCategory: "From the same category", allCategory: "All {category}",
    },
    productActions: { coordinate: "PROJECT / ADD", eyebrow: "Project board", title: "Set the quantity and save the piece", body: "Adjust quantities and review every piece before sending the request.", inBoard: "On board: {quantity}", quantityLimit: "This quantity has reached the maximum", productLimit: "The project board supports up to {limit} different products", invalid: "This product could not be added", saved: "Saved to the board · total {quantity}", addQuantity: "Add quantity to board", add: "Add to project board", disclaimer: "Saving does not send the request; specifications and availability are reviewed after submission.", review: "Review project" },
    addToQuote: { quantityLimit: "This quantity has reached the maximum", productLimit: "The project board supports up to {limit} products", invalid: "This product could not be added", saved: "Saved to the board · quantity {quantity}", increase: "Increase the quantity of {name} on the project board", addNamed: "Add {name} to the project board", title: "Add to project board", addMore: "Add more · {quantity} on board", add: "Add to project board" },
    quantity: { group: "Quantity: {name}", decrease: "Decrease quantity of {name}", input: "Quantity of {name}", increase: "Increase quantity of {name}" },
    gallery: { pendingLabel: "IMAGE / PENDING", pendingTitle: "Image under review", pendingBody: "No approved image is currently available for this product.", object: "OBJECT", previous: "View previous image", next: "View next image", thumbnails: "Product thumbnails", imageOf: "Image {current} of {total}", coordinate: "X {x} · Y {y}" },
    notFound: { routeUnknown: "ROUTE / UNKNOWN", errorRoute: "ERROR / ROUTE", savedBoard: "This route is unavailable, but your project-board selections remain saved on this device.", eyebrow: "Route unavailable", title: "We could not find this page.", body: "The link may have changed, or the piece may no longer be published. Return to the catalog and continue exploring where you left off.", browse: "Browse catalog", home: "Return home" },
    styles: {
      classic: { name: "Classic", tagline: "Warm timber, enduring presence", description: "An executive desk, leather seating, timber storage and a meeting table in related brown tones.", criteria: "Selected from current wood- and brown-tagged pieces." },
      "boho-natural": { name: "Boho / Natural", tagline: "Calm texture, earthy tones", description: "A light timber desk, brown lounge seating, beige storage and a fabric divider for a warmer workspace.", criteria: "Selected from current timber, fabric, brown and beige catalog attributes." },
      smart: { name: "Smart", tagline: "Clean technology, focused performance", description: "A smart desk, ergonomic chair, ordered storage, light meeting table and practical monitor stand.", criteria: "A precise edit of available smart, ergonomic, black and white pieces." },
      contemporary: { name: "Contemporary", tagline: "Light lines, measured contrast", description: "A modern executive desk, grey chair, neutral cabinet, meeting table and clear glass divider.", criteria: "Selected from current grey, metal and glass pieces with modern lines." },
      dynamic: { name: "Dynamic", tagline: "A flexible edit for changing days", description: "A corner desk, ergonomic chair, metal filing and meeting table supported by a movable fabric divider.", criteria: "Selected from open-office, ergonomic and reconfigurable space-planning pieces." },
    },
  },
};
