export const STOREFRONT_LOCALES = ["ar", "en"] as const;

export type StorefrontLocale = (typeof STOREFRONT_LOCALES)[number];
export type StorefrontDirection = "rtl" | "ltr";

export const DEFAULT_STOREFRONT_LOCALE: StorefrontLocale = "ar";
export const STOREFRONT_LOCALE_COOKIE = "hatab_storefront_locale";
export const STOREFRONT_LOCALE_MAX_AGE = 60 * 60 * 24 * 365;

interface CatalogLinkTranslation {
  slug: string;
  label: string;
}

interface CatalogGroupTranslation {
  title: string;
  eyebrow: string;
  links: CatalogLinkTranslation[];
}

interface FooterLinkTranslation {
  href: string;
  label: string;
}

export interface StorefrontDictionary {
  language: {
    name: string;
    shortName: string;
    switcherLabel: string;
    switchTo: string;
  };
  common: {
    brandHome: string;
    skipToContent: string;
    home: string;
    catalog: string;
    collections: string;
    portfolio: string;
    quote: string;
    search: string;
    viewAll: string;
    viewProduct: string;
    explore: string;
    close: string;
    open: string;
    remove: string;
    loading: string;
    noResults: string;
    product: string;
    products: string;
    piece: string;
    pieces: string;
    results: string;
    categories: string;
    styles: string;
    price: string;
    from: string;
    to: string;
    addToProject: string;
    requestQuote: string;
  };
  navigation: {
    landmark: string;
    mobileLandmark: string;
    mobileDialog: string;
    menuTitle: string;
    openMenu: string;
    closeMenu: string;
    tagline: string;
    products: string;
    catalogEyebrow: string;
    browseProducts: string;
    browseAll: string;
    searchCatalog: string;
    quoteShort: string;
    quoteWithCount: string;
    quoteStart: string;
    startNow: string;
    megaMessage: string;
    primaryLinks: FooterLinkTranslation[];
    catalogGroups: CatalogGroupTranslation[];
  };
  project: {
    landmark: string;
    closeBoard: string;
    compactTitle: string;
    expandedTitle: string;
    summary: string;
    reviewAndSend: string;
    review: string;
    eyebrow: string;
    description: string;
    privacy: string;
    viewItem: string;
    removeItem: string;
    productFallback: string;
    completeDetails: string;
    quantity: string;
    decreaseQuantity: string;
    increaseQuantity: string;
  };
  footer: {
    eyebrow: string;
    titleLead: string;
    titleStrong: string;
    intro: string;
    cta: string;
    about: string;
    exploreHeading: string;
    categoriesHeading: string;
    journeyHeading: string;
    journeyBody: string;
    journeyCta: string;
    siteLinksLabel: string;
    categoryLinksLabel: string;
    copyright: string;
    signature: string;
    links: FooterLinkTranslation[];
    categories: CatalogLinkTranslation[];
  };
  quote: {
    metadataTitle: string;
    metadataDescription: string;
    loadingBoard: string;
    stepper: {
      landmark: string;
      completed: string;
      current: string;
      next: string;
      steps: Array<{ label: string; shortLabel: string }>;
    };
    hero: {
      backToCatalog: string;
      eyebrow: string;
      titleLead: string;
      titleStrong: string;
      description: string;
      savedLocally: string;
      products: string;
      totalPieces: string;
      savedOnDevice: string;
    };
    empty: {
      eyebrow: string;
      titleLead: string;
      titleStrong: string;
      description: string;
      cta: string;
    };
    selection: {
      eyebrow: string;
      titleLead: string;
      titleStrong: string;
      description: string;
      clearBoardAria: string;
      clearPrompt: string;
      confirm: string;
      cancel: string;
      clearBoard: string;
      viewDetails: string;
      removeItem: string;
      officeFurniture: string;
      quantity: string;
      quantityGroup: string;
      decreaseQuantity: string;
      increaseQuantity: string;
      addMore: string;
      summaryEyebrow: string;
      summaryTitle: string;
      distinctProducts: string;
      totalPieces: string;
      priceNote: string;
      next: string;
    };
    project: {
      eyebrow: string;
      titleLead: string;
      titleStrong: string;
      description: string;
      optional: string;
      spaceType: string;
      spaceTypes: Array<{ value: string; label: string }>;
      targetDate: string;
      budgetDirection: string;
      budgetHelper: string;
      budgetBands: Array<{ value: string; label: string }>;
      notes: string;
      notesPlaceholder: string;
      afterEyebrow: string;
      afterTitle: string;
      afterSteps: string[];
      next: string;
      back: string;
      messageSpaceType: string;
      messageTargetDate: string;
      messageBudget: string;
      messageNotes: string;
    };
    contact: {
      eyebrow: string;
      titleLead: string;
      titleStrong: string;
      description: string;
      clientName: string;
      clientNamePlaceholder: string;
      companyName: string;
      companyPlaceholder: string;
      optional: string;
      phone: string;
      phonePlaceholder: string;
      phoneHint: string;
      email: string;
      emailPlaceholder: string;
      humanReviewTitle: string;
      humanReviewBody: string;
      back: string;
      submitting: string;
      submit: string;
      finalReview: string;
      editProducts: string;
      products: string;
      totalPieces: string;
      spaceType: string;
      targetDate: string;
      budgetDirection: string;
      notSpecified: string;
      editProject: string;
      finalEyebrow: string;
      finalTitle: string;
      finalChecklist: string[];
    };
    success: {
      eyebrow: string;
      stageLead: string;
      stageStrong: string;
      received: string;
      titleLead: string;
      titleStrong: string;
      requestNumber: string;
      description: string;
      process: string[];
      disclaimer: string;
      browseMore: string;
      home: string;
    };
    validation: {
      clientName: string;
      phone: string;
      email: string;
      companyName: string;
      submitFailed: string;
      unexpected: string;
      apiErrors: Record<string, string>;
    };
  };
  styles: {
    classic: string;
    boho: string;
    smart: string;
    contemporary: string;
    dynamic: string;
    minimal: string;
    executive: string;
  };
}

const arabic: StorefrontDictionary = {
  language: {
    name: "العربية",
    shortName: "ع",
    switcherLabel: "اختيار لغة الموقع",
    switchTo: "Switch to English",
  },
  common: {
    brandHome: "HATAB — الصفحة الرئيسية",
    skipToContent: "انتقل إلى المحتوى",
    home: "الرئيسية",
    catalog: "الكتالوج",
    collections: "التشكيلات",
    portfolio: "مشروعاتنا",
    quote: "طلب عرض سعر",
    search: "بحث",
    viewAll: "عرض الكل",
    viewProduct: "عرض المنتج",
    explore: "استكشف",
    close: "إغلاق",
    open: "فتح",
    remove: "إزالة",
    loading: "جارٍ التحميل",
    noResults: "لا توجد نتائج",
    product: "منتج",
    products: "منتجات",
    piece: "قطعة",
    pieces: "قطع",
    results: "نتائج",
    categories: "التصنيفات",
    styles: "الأنماط",
    price: "السعر",
    from: "من",
    to: "إلى",
    addToProject: "أضف إلى المشروع",
    requestQuote: "اطلب عرض سعر",
  },
  navigation: {
    landmark: "التنقل الرئيسي",
    mobileLandmark: "التنقل عبر الهاتف",
    mobileDialog: "قائمة التنقل",
    menuTitle: "HATAB / القائمة",
    openMenu: "فتح القائمة",
    closeMenu: "إغلاق القائمة",
    tagline: "حلول متكاملة لمساحات العمل",
    products: "المنتجات",
    catalogEyebrow: "الكتالوج",
    browseProducts: "تصفح المنتجات",
    browseAll: "عرض الكل",
    searchCatalog: "البحث في كتالوج المنتجات",
    quoteShort: "عرض السعر",
    quoteWithCount: "طلب عرض السعر، {count} عنصر",
    quoteStart: "ابدأ طلب عرض سعر",
    startNow: "ابدأ الآن",
    megaMessage: "كل عناصر مساحة العمل في مكان واحد.",
    primaryLinks: [
      { href: "/", label: "الرئيسية" },
      { href: "/collections", label: "التشكيلات" },
      { href: "/portfolio", label: "مشروعاتنا" },
    ],
    catalogGroups: [
      {
        title: "المكاتب ومساحات العمل",
        eyebrow: "مساحات العمل",
        links: [
          { label: "مكاتب تنفيذية", slug: "executive-desks" },
          { label: "مكاتب تشغيلية", slug: "operative-desks" },
          { label: "محطات عمل", slug: "bench-workstations" },
          { label: "كاونترات استقبال", slug: "reception-counters" },
        ],
      },
      {
        title: "الجلوس",
        eyebrow: "المقاعد",
        links: [
          { label: "كراسي عمل وإرجونومك", slug: "task-ergonomic-seating" },
          { label: "كراسي اجتماعات وزوار", slug: "conference-visitor-seating" },
          { label: "مقاعد انتظار", slug: "waiting-beam-seating" },
          { label: "كنب ومقاعد استراحة", slug: "lounge-sofas" },
        ],
      },
      {
        title: "الاجتماعات والتخزين",
        eyebrow: "المساحات المشتركة",
        links: [
          { label: "طاولات اجتماعات", slug: "meeting-conference-tables" },
          { label: "خزائن ووحدات تخزين", slug: "cabinets-storage" },
          { label: "أرفف ومكتبات", slug: "shelving-bookcases" },
          { label: "قواطع وشاشات", slug: "partitions-screens" },
        ],
      },
    ],
  },
  project: {
    landmark: "لوحة المشروع المحفوظة",
    closeBoard: "إغلاق لوحة المشروع",
    compactTitle: "لوحة المشروع",
    expandedTitle: "اختيارات المشروع",
    summary: "{products} منتجات · {pieces} قطع · محفوظة محلياً",
    reviewAndSend: "راجع وأرسل الطلب",
    review: "راجع الطلب",
    eyebrow: "لوحة المشروع",
    description:
      "عدّل الكميات الآن. ستبقى الاختيارات محفوظة على هذا الجهاز لمدة تصل إلى 30 يوماً أو حتى ترسل الطلب.",
    privacy: "لم يتم إرسال أي بيانات بعد",
    viewItem: "عرض {name}",
    removeItem: "إزالة {name} من لوحة المشروع",
    productFallback: "منتج مكتبي",
    completeDetails: "أكمل تفاصيل المشروع",
    quantity: "الكمية: {name}",
    decreaseQuantity: "تقليل كمية {name}",
    increaseQuantity: "زيادة كمية {name}",
  },
  footer: {
    eyebrow: "ملخص المشروع",
    titleLead: "مساحة أفضل تبدأ",
    titleStrong: "باحتياج واضح.",
    intro: "اجمع المنتجات والكميات وملاحظات المشروع في طلب واحد منظم.",
    cta: "ابدأ طلب عرض سعر",
    about:
      "أثاث مكتبي وحلول متكاملة تساعد على بناء مساحات عمل متناسقة، عملية، وواضحة التفاصيل.",
    exploreHeading: "استكشف",
    categoriesHeading: "التصنيفات",
    journeyHeading: "مسار مشروعك",
    journeyBody: "اختر المنتجات، حدّد الكميات، ثم أرسل متطلباتك في نموذج واحد.",
    journeyCta: "متابعة الطلب",
    siteLinksLabel: "روابط الموقع",
    categoryLinksLabel: "تصنيفات المنتجات",
    copyright: "© {year} HATAB للأثاث المكتبي. جميع الحقوق محفوظة.",
    signature: "مصمم لمساحات عمل أفضل",
    links: [
      { href: "/catalog", label: "الكتالوج الكامل" },
      { href: "/collections", label: "التشكيلات" },
      { href: "/portfolio", label: "مشروعاتنا" },
      { href: "/quote", label: "طلب عرض سعر" },
    ],
    categories: [
      { slug: "executive-desks", label: "المكاتب التنفيذية" },
      { slug: "bench-workstations", label: "محطات العمل" },
      { slug: "task-ergonomic-seating", label: "كراسي العمل" },
      { slug: "meeting-conference-tables", label: "طاولات الاجتماعات" },
      { slug: "cabinets-storage", label: "التخزين" },
    ],
  },
  quote: {
    metadataTitle: "طلب عرض سعر",
    metadataDescription:
      "اجمع منتجات مشروعك وحدد احتياجات المساحة ثم أرسل طلباً منظماً للمراجعة.",
    loadingBoard: "جارٍ تحميل لوحة المشروع",
    stepper: {
      landmark: "خطوات طلب عرض السعر",
      completed: "مكتملة",
      current: "الحالية",
      next: "التالية",
      steps: [
        { label: "مراجعة المنتجات", shortLabel: "المنتجات" },
        { label: "تفاصيل المشروع", shortLabel: "المشروع" },
        { label: "التواصل والإرسال", shortLabel: "الإرسال" },
      ],
    },
    hero: {
      backToCatalog: "العودة إلى الكتالوج",
      eyebrow: "لوحة المشروع",
      titleLead: "طلبك،",
      titleStrong: "خطوة بخطوة.",
      description:
        "اجمع المنتجات في لوحة واحدة، أخبرنا عن المساحة، ثم أرسل بيانات التواصل ليُراجع الفريق الطلب.",
      savedLocally: "محفوظ محلياً",
      products: "المنتجات",
      totalPieces: "إجمالي القطع",
      savedOnDevice: "اختياراتك محفوظة على هذا الجهاز.",
    },
    empty: {
      eyebrow: "لوحة مشروع فارغة",
      titleLead: "ابدأ لوحة",
      titleStrong: "مشروعك.",
      description:
        "لم تضف منتجات بعد. اختر القطع المناسبة من الكتالوج، وسنحفظها على هذا الجهاز لمدة تصل إلى 30 يوماً أو حتى إرسال الطلب.",
      cta: "تصفح الكتالوج",
    },
    selection: {
      eyebrow: "مراجعة الاختيارات",
      titleLead: "راجع المنتجات",
      titleStrong: "والكميات.",
      description: "يمكنك العودة للكتالوج وإضافة المزيد قبل إرسال الطلب.",
      clearBoardAria: "تأكيد إفراغ لوحة المشروع",
      clearPrompt: "إفراغ الكل؟",
      confirm: "تأكيد",
      cancel: "إلغاء",
      clearBoard: "إفراغ اللوحة",
      viewDetails: "عرض تفاصيل {name}",
      removeItem: "إزالة {name} من الطلب",
      officeFurniture: "أثاث مكتبي",
      quantity: "الكمية المطلوبة",
      quantityGroup: "كمية {name}",
      decreaseQuantity: "تقليل كمية {name}",
      increaseQuantity: "زيادة كمية {name}",
      addMore: "إضافة منتجات أخرى",
      summaryEyebrow: "ملخص المشروع",
      summaryTitle: "ملخص اللوحة",
      distinctProducts: "منتجات مختلفة",
      totalPieces: "إجمالي القطع",
      priceNote:
        "لا نعرض سعراً تقديرياً غير موثّق. سيُبنى عرض السعر بعد مراجعة المواصفات والكميات والتوافر.",
      next: "التالي: تفاصيل المشروع",
    },
    project: {
      eyebrow: "سياق المشروع",
      titleLead: "أخبرنا عن",
      titleStrong: "المساحة.",
      description:
        "هذه التفاصيل اختيارية، لكنها تساعد الفريق في مراجعة حلول أنسب قبل التواصل. تُحفظ على هذا الجهاز لمدة تصل إلى 30 يوماً أو حتى الإرسال.",
      optional: "اختياري",
      spaceType: "نوع المساحة",
      spaceTypes: [
        { value: "corporate-office", label: "مكتب شركة" },
        { value: "workspace", label: "مساحة عمل مشتركة" },
        { value: "meeting-training", label: "اجتماعات أو تدريب" },
        { value: "reception-waiting", label: "استقبال أو انتظار" },
        { value: "home-office", label: "مكتب منزلي" },
        { value: "other", label: "مساحة أخرى" },
      ],
      targetDate: "التاريخ المستهدف",
      budgetDirection: "توجه الميزانية",
      budgetHelper: "اختيار وصفي فقط؛ لا يُنشئ سعراً أو التزاماً مالياً.",
      budgetBands: [
        { value: "guidance", label: "أحتاج توجيه الفريق" },
        { value: "value", label: "حل عملي واقتصادي" },
        { value: "balanced", label: "توازن بين القيمة والمواصفات" },
        { value: "premium", label: "أولوية للمواصفات المميزة" },
      ],
      notes: "تفاصيل تساعدنا",
      notesPlaceholder:
        "مثال: عدد الموظفين، طبيعة الاستخدام، المقاسات المتاحة، أو أي متطلبات خاصة.",
      afterEyebrow: "بعد الإرسال",
      afterTitle: "ما الذي سيحدث؟",
      afterSteps: [
        "يطّلع الفريق على المنتجات والكميات وسياق المساحة.",
        "تُراجع المواصفات والتوافر قبل تثبيت التفاصيل التجارية.",
        "يتواصل الفريق معك لتأكيد الخطوة التالية.",
      ],
      next: "التالي: بيانات التواصل",
      back: "العودة للمنتجات",
      messageSpaceType: "نوع المساحة",
      messageTargetDate: "التاريخ المستهدف",
      messageBudget: "توجه الميزانية",
      messageNotes: "تفاصيل إضافية",
    },
    contact: {
      eyebrow: "التواصل والإرسال",
      titleLead: "كيف يتواصل الفريق",
      titleStrong: "معك؟",
      description: "نطلب الحد الأدنى اللازم لمراجعة الطلب والعودة إليك.",
      clientName: "الاسم أو اسم المندوب",
      clientNamePlaceholder: "الاسم الكامل",
      companyName: "اسم الشركة",
      companyPlaceholder: "اسم الشركة أو الجهة",
      optional: "اختياري",
      phone: "رقم الهاتف",
      phonePlaceholder: "+20 100 000 0000",
      phoneHint: "يمكن استخدام + والمسافات والأقواس والشرطات.",
      email: "البريد الإلكتروني",
      emailPlaceholder: "name@company.com",
      humanReviewTitle: "مراجعة بشرية قبل عرض السعر",
      humanReviewBody:
        "الإرسال لا يتضمن دفعاً إلكترونياً ولا يؤكد سعراً أو توافراً. يستخدم الفريق بيانات التواصل لمتابعة هذا الطلب.",
      back: "العودة لتفاصيل المشروع",
      submitting: "جارٍ حفظ الطلب…",
      submit: "إرسال طلب المراجعة",
      finalReview: "مراجعة أخيرة",
      editProducts: "تعديل المنتجات",
      products: "المنتجات",
      totalPieces: "إجمالي القطع",
      spaceType: "نوع المساحة",
      targetDate: "التاريخ المستهدف",
      budgetDirection: "توجه الميزانية",
      notSpecified: "غير محدد",
      editProject: "تعديل تفاصيل المشروع",
      finalEyebrow: "الفحص الأخير",
      finalTitle: "قبل الإرسال",
      finalChecklist: [
        "تأكد من الكميات ورقم الهاتف.",
        "يمكن للفريق طلب تفاصيل إضافية للمواصفات.",
        "لن تُعرض بيانات اتصال غير موثّقة على هذه الصفحة.",
      ],
    },
    success: {
      eyebrow: "تم استلام الملخص",
      stageLead: "الطلب الآن في",
      stageStrong: "مرحلة المراجعة.",
      received: "تم استلام الطلب",
      titleLead: "أصبح مشروعك",
      titleStrong: "جاهزاً للمراجعة.",
      requestNumber: "الطلب رقم {id}",
      description:
        "سيُراجع الفريق المنتجات والكميات واحتياجات المساحة قبل التواصل معك لتأكيد المواصفات والتوافر وخطوات إعداد عرض السعر.",
      process: ["حفظ الطلب", "مراجعة التفاصيل", "تأكيد العرض معك"],
      disclaimer:
        "لا يتضمن إرسال الطلب دفعاً إلكترونياً أو التزاماً بالشراء. يتم تثبيت التفاصيل التجارية بعد المراجعة والتواصل.",
      browseMore: "تصفح المزيد",
      home: "العودة للرئيسية",
    },
    validation: {
      clientName: "اكتب الاسم باستخدام حرفين على الأقل.",
      phone: "اكتب رقم هاتف صحيحاً من 7 إلى 32 خانة.",
      email: "تحقق من صيغة البريد الإلكتروني.",
      companyName: "اسم الشركة أطول من الحد المسموح.",
      submitFailed: "تعذر إرسال الطلب. حاول مرة أخرى.",
      unexpected: "حدث خطأ غير متوقع. حاول مرة أخرى.",
      apiErrors: {},
    },
  },
  styles: {
    classic: "كلاسيكي",
    boho: "بوهو",
    smart: "ذكي",
    contemporary: "معاصر",
    dynamic: "ديناميكي",
    minimal: "بسيط",
    executive: "تنفيذي",
  },
};

const english: StorefrontDictionary = {
  language: {
    name: "English",
    shortName: "EN",
    switcherLabel: "Choose website language",
    switchTo: "التبديل إلى العربية",
  },
  common: {
    brandHome: "HATAB — home",
    skipToContent: "Skip to content",
    home: "Home",
    catalog: "Catalog",
    collections: "Collections",
    portfolio: "Projects",
    quote: "Request a quote",
    search: "Search",
    viewAll: "View all",
    viewProduct: "View product",
    explore: "Explore",
    close: "Close",
    open: "Open",
    remove: "Remove",
    loading: "Loading",
    noResults: "No results",
    product: "product",
    products: "products",
    piece: "piece",
    pieces: "pieces",
    results: "results",
    categories: "Categories",
    styles: "Styles",
    price: "Price",
    from: "From",
    to: "To",
    addToProject: "Add to project",
    requestQuote: "Request a quote",
  },
  navigation: {
    landmark: "Main navigation",
    mobileLandmark: "Mobile navigation",
    mobileDialog: "Navigation menu",
    menuTitle: "HATAB / MENU",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    tagline: "Complete solutions for better workspaces",
    products: "Products",
    catalogEyebrow: "Catalog",
    browseProducts: "Browse products",
    browseAll: "View all",
    searchCatalog: "Search the product catalog",
    quoteShort: "Quote",
    quoteWithCount: "Quote request, {count} items",
    quoteStart: "Start a quote request",
    startNow: "Start now",
    megaMessage: "Everything your workspace needs, considered together.",
    primaryLinks: [
      { href: "/", label: "Home" },
      { href: "/collections", label: "Collections" },
      { href: "/portfolio", label: "Projects" },
    ],
    catalogGroups: [
      {
        title: "Desks & workspaces",
        eyebrow: "Workspace",
        links: [
          { label: "Executive desks", slug: "executive-desks" },
          { label: "Operative desks", slug: "operative-desks" },
          { label: "Bench workstations", slug: "bench-workstations" },
          { label: "Reception counters", slug: "reception-counters" },
        ],
      },
      {
        title: "Seating",
        eyebrow: "Seating",
        links: [
          { label: "Task & ergonomic seating", slug: "task-ergonomic-seating" },
          { label: "Conference & visitor chairs", slug: "conference-visitor-seating" },
          { label: "Waiting seats", slug: "waiting-beam-seating" },
          { label: "Lounge seating & sofas", slug: "lounge-sofas" },
        ],
      },
      {
        title: "Meetings & storage",
        eyebrow: "Shared spaces",
        links: [
          { label: "Meeting tables", slug: "meeting-conference-tables" },
          { label: "Cabinets & storage", slug: "cabinets-storage" },
          { label: "Shelving & bookcases", slug: "shelving-bookcases" },
          { label: "Partitions & screens", slug: "partitions-screens" },
        ],
      },
    ],
  },
  project: {
    landmark: "Saved project board",
    closeBoard: "Close project board",
    compactTitle: "Project board",
    expandedTitle: "Project selections",
    summary: "{products} products · {pieces} pieces · saved locally",
    reviewAndSend: "Review and send",
    review: "Review",
    eyebrow: "Project board",
    description:
      "Adjust quantities now. Your selections stay on this device for up to 30 days, or until you send the request.",
    privacy: "No information has been sent yet",
    viewItem: "View {name}",
    removeItem: "Remove {name} from the project board",
    productFallback: "Office product",
    completeDetails: "Complete project details",
    quantity: "Quantity: {name}",
    decreaseQuantity: "Decrease quantity of {name}",
    increaseQuantity: "Increase quantity of {name}",
  },
  footer: {
    eyebrow: "Project brief",
    titleLead: "A better workspace starts",
    titleStrong: "with a clear brief.",
    intro: "Bring products, quantities, and project notes together in one structured request.",
    cta: "Start a quote request",
    about:
      "Office furniture and complete solutions for building coherent, practical workspaces with every detail made clear.",
    exploreHeading: "Explore",
    categoriesHeading: "Categories",
    journeyHeading: "Your project path",
    journeyBody: "Choose products, set quantities, then send your requirements in one form.",
    journeyCta: "Continue request",
    siteLinksLabel: "Website links",
    categoryLinksLabel: "Product categories",
    copyright: "© {year} HATAB Office Furniture. All rights reserved.",
    signature: "DESIGNED FOR BETTER WORK",
    links: [
      { href: "/catalog", label: "Full catalog" },
      { href: "/collections", label: "Collections" },
      { href: "/portfolio", label: "Projects" },
      { href: "/quote", label: "Request a quote" },
    ],
    categories: [
      { slug: "executive-desks", label: "Executive desks" },
      { slug: "bench-workstations", label: "Workstations" },
      { slug: "task-ergonomic-seating", label: "Task seating" },
      { slug: "meeting-conference-tables", label: "Meeting tables" },
      { slug: "cabinets-storage", label: "Storage" },
    ],
  },
  quote: {
    metadataTitle: "Request a quote",
    metadataDescription:
      "Collect project products, describe your workspace needs, and send one structured request for review.",
    loadingBoard: "Loading your project board",
    stepper: {
      landmark: "Quote request steps",
      completed: "Completed",
      current: "Current",
      next: "Next",
      steps: [
        { label: "Review products", shortLabel: "Products" },
        { label: "Project details", shortLabel: "Project" },
        { label: "Contact and send", shortLabel: "Send" },
      ],
    },
    hero: {
      backToCatalog: "Back to catalog",
      eyebrow: "Project board",
      titleLead: "Your request,",
      titleStrong: "step by step.",
      description:
        "Collect products on one board, tell us about the space, then share contact details so the team can review the request.",
      savedLocally: "Saved locally",
      products: "Products",
      totalPieces: "Total pieces",
      savedOnDevice: "Your selections are saved on this device.",
    },
    empty: {
      eyebrow: "Empty project board",
      titleLead: "Start your",
      titleStrong: "project board.",
      description:
        "You have not added any products yet. Choose suitable pieces from the catalog and we will keep them on this device for up to 30 days, or until you send the request.",
      cta: "Browse the catalog",
    },
    selection: {
      eyebrow: "Selection review",
      titleLead: "Review products",
      titleStrong: "and quantities.",
      description: "You can return to the catalog and add more before sending the request.",
      clearBoardAria: "Confirm clearing the project board",
      clearPrompt: "Clear everything?",
      confirm: "Confirm",
      cancel: "Cancel",
      clearBoard: "Clear board",
      viewDetails: "View details for {name}",
      removeItem: "Remove {name} from the request",
      officeFurniture: "Office furniture",
      quantity: "Required quantity",
      quantityGroup: "Quantity of {name}",
      decreaseQuantity: "Decrease quantity of {name}",
      increaseQuantity: "Increase quantity of {name}",
      addMore: "Add more products",
      summaryEyebrow: "Project summary",
      summaryTitle: "Board summary",
      distinctProducts: "Distinct products",
      totalPieces: "Total pieces",
      priceNote:
        "We do not show unverified estimates. Your quote will be prepared after specifications, quantities, and availability are reviewed.",
      next: "Next: project details",
    },
    project: {
      eyebrow: "Project context",
      titleLead: "Tell us about",
      titleStrong: "the space.",
      description:
        "These details are optional, but help the team consider better-fit solutions before contacting you. They remain on this device for up to 30 days, or until submission.",
      optional: "optional",
      spaceType: "Space type",
      spaceTypes: [
        { value: "corporate-office", label: "Corporate office" },
        { value: "workspace", label: "Shared workspace" },
        { value: "meeting-training", label: "Meeting or training" },
        { value: "reception-waiting", label: "Reception or waiting" },
        { value: "home-office", label: "Home office" },
        { value: "other", label: "Another space" },
      ],
      targetDate: "Target date",
      budgetDirection: "Budget direction",
      budgetHelper: "A descriptive preference only; it does not create a price or financial commitment.",
      budgetBands: [
        { value: "guidance", label: "I need team guidance" },
        { value: "value", label: "Practical and economical" },
        { value: "balanced", label: "Balance value and specification" },
        { value: "premium", label: "Prioritize premium specifications" },
      ],
      notes: "Details that help us",
      notesPlaceholder:
        "For example: team size, type of use, available dimensions, or any special requirements.",
      afterEyebrow: "After submission",
      afterTitle: "What happens next?",
      afterSteps: [
        "The team reviews the products, quantities, and workspace context.",
        "Specifications and availability are checked before commercial details are confirmed.",
        "The team contacts you to confirm the next step.",
      ],
      next: "Next: contact details",
      back: "Back to products",
      messageSpaceType: "Space type",
      messageTargetDate: "Target date",
      messageBudget: "Budget direction",
      messageNotes: "Additional details",
    },
    contact: {
      eyebrow: "Contact and send",
      titleLead: "How should the team",
      titleStrong: "contact you?",
      description: "We ask only for what is needed to review the request and get back to you.",
      clientName: "Name or representative",
      clientNamePlaceholder: "Full name",
      companyName: "Company name",
      companyPlaceholder: "Company or organization",
      optional: "optional",
      phone: "Phone number",
      phonePlaceholder: "+20 100 000 0000",
      phoneHint: "+, spaces, parentheses, and hyphens are accepted.",
      email: "Email address",
      emailPlaceholder: "name@company.com",
      humanReviewTitle: "Human review before quoting",
      humanReviewBody:
        "Submitting does not include online payment or confirm price or availability. The team uses your contact details only to follow up on this request.",
      back: "Back to project details",
      submitting: "Saving request…",
      submit: "Send for review",
      finalReview: "Final review",
      editProducts: "Edit products",
      products: "Products",
      totalPieces: "Total pieces",
      spaceType: "Space type",
      targetDate: "Target date",
      budgetDirection: "Budget direction",
      notSpecified: "Not specified",
      editProject: "Edit project details",
      finalEyebrow: "Final check",
      finalTitle: "Before sending",
      finalChecklist: [
        "Confirm quantities and the phone number.",
        "The team may ask for more specification details.",
        "Unverified contact details will not be published on this page.",
      ],
    },
    success: {
      eyebrow: "Brief received",
      stageLead: "Your request is now",
      stageStrong: "under review.",
      received: "Request received",
      titleLead: "Your project is",
      titleStrong: "ready for review.",
      requestNumber: "Request #{id}",
      description:
        "The team will review products, quantities, and workspace needs before contacting you to confirm specifications, availability, and the next steps toward a quote.",
      process: ["Request saved", "Details reviewed", "Quote confirmed with you"],
      disclaimer:
        "Sending a request does not include online payment or a commitment to buy. Commercial details are confirmed after review and contact.",
      browseMore: "Browse more",
      home: "Back to home",
    },
    validation: {
      clientName: "Enter a name using at least two characters.",
      phone: "Enter a valid phone number containing 7 to 32 characters.",
      email: "Check the email address format.",
      companyName: "The company name exceeds the allowed length.",
      submitFailed: "The request could not be sent. Please try again.",
      unexpected: "An unexpected error occurred. Please try again.",
      apiErrors: {
        "تم إرسال عدة طلبات. يرجى المحاولة لاحقاً": "Several requests were sent. Please try again later.",
        "مصدر الطلب غير مسموح": "This request source is not allowed.",
        "يجب إرسال الطلب بصيغة JSON": "The request format was not accepted.",
        "حجم الطلب أكبر من الحد المسموح": "The request is larger than the allowed limit.",
        "بيانات الطلب غير صحيحة": "Some request details are invalid.",
        "يرجى إدخال الاسم ورقم هاتف صحيح": "Enter a name and a valid phone number.",
        "البريد الإلكتروني غير صحيح": "The email address is invalid.",
        "أضف منتجاً واحداً على الأقل إلى طلب عرض السعر": "Add at least one product to the quote request.",
        "بيانات المنتجات غير صحيحة": "Some product details are invalid.",
        "أحد المنتجات لم يعد متاحاً. حدّث السلة وحاول مجدداً": "One of the products is no longer available. Refresh the board and try again.",
        "حدث خطأ أثناء حفظ طلب عرض السعر. يرجى المحاولة مرة أخرى.": "An error occurred while saving the quote request. Please try again.",
      },
    },
  },
  styles: {
    classic: "Classic",
    boho: "Boho",
    smart: "Smart",
    contemporary: "Contemporary",
    dynamic: "Dynamic",
    minimal: "Minimal",
    executive: "Executive",
  },
};

export const storefrontDictionaries: Readonly<
  Record<StorefrontLocale, StorefrontDictionary>
> = {
  ar: arabic,
  en: english,
};

export function isStorefrontLocale(
  value: string | null | undefined,
): value is StorefrontLocale {
  return value === "ar" || value === "en";
}

export function resolveStorefrontLocale(
  value: string | null | undefined,
): StorefrontLocale {
  return isStorefrontLocale(value) ? value : DEFAULT_STOREFRONT_LOCALE;
}

export function getStorefrontDirection(
  locale: StorefrontLocale,
): StorefrontDirection {
  return locale === "ar" ? "rtl" : "ltr";
}

export function getStorefrontDictionary(
  locale: StorefrontLocale,
): StorefrontDictionary {
  return storefrontDictionaries[locale];
}

export function getAlternateStorefrontLocale(
  locale: StorefrontLocale,
): StorefrontLocale {
  return locale === "ar" ? "en" : "ar";
}

export function interpolateStorefrontMessage(
  message: string,
  values: Readonly<Record<string, string | number>>,
): string {
  return message.replace(/\{([a-zA-Z0-9_]+)\}/g, (token, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key)
      ? String(values[key])
      : token,
  );
}

export function formatStorefrontNumber(
  value: number,
  locale: StorefrontLocale,
): string {
  return new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-US").format(
    value,
  );
}

export function pickStorefrontText(
  locale: StorefrontLocale,
  arabicText: string | null | undefined,
  englishText: string | null | undefined,
): string {
  const primary = locale === "ar" ? arabicText : englishText;
  const fallback = locale === "ar" ? englishText : arabicText;
  return primary?.trim() || fallback?.trim() || "";
}
