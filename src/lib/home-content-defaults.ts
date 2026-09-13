import type { StorefrontLocale } from "@/lib/i18n/storefront";

export interface ProcessStageContent {
  label: string;
  title: string;
  description: string;
  detail: string;
}

export interface ProcessContent {
  sectionLabel: string;
  eyebrow: string;
  heading: string;
  instruction: string;
  progressLabel: string;
  stageLabel: string;
  filmLabel: string;
  loading: string;
  unavailable: string;
  reducedHeading: string;
  reducedDescription: string;
  jumpTo: string;
  catalogCta: string;
  projectCta: string;
  stages: ProcessStageContent[];
}

export interface HomeHeroContent {
  eyebrow: string;
  title: string;
  body: string;
  catalogCta: string;
  projectCta: string;
  imageCaption: string;
  stageLabels: string[];
  stageNotes: string[];
}

export interface HomePageContent {
  metadataTitle: string;
  metadataDescription: string;
  organizationName: string;
  hero: HomeHeroContent;
  proofPublished: string[];
  proofFallback: Array<[string, string]>;
  spacesKicker: string;
  spacesTitle: string;
  spacesLink: string;
  spaceStories: Array<{ title: string; eyebrow: string; copy: string }>;
  marquee: string[];
  marqueeLabel: string;
  motionKicker: string;
  motionTitle: string;
  motionBody: string;
  motionLink: string;
  catalogKicker: string;
  catalogTitle: string;
  catalogBody: string;
  piece: string;
  coordinationLabels: string[];
  coordinationKicker: string;
  coordinationTitle: string;
  coordinationBody: string;
  coordinationLink: string;
  picksKicker: string;
  picksTitle: string;
  picksLink: string;
  journeyKicker: string;
  journeyTitle: string;
  journeyBody: string;
  journeyLink: string;
  journeySteps: Array<[string, string]>;
  projectKicker: string;
  projectTitle: string;
  projectBody: string;
  backCatalog: string;
  openProject: string;
  process: ProcessContent;
}

export type HomePageContentByLocale = Record<StorefrontLocale, HomePageContent>;

export const HOME_PAGE_CONTENT_DEFAULTS: HomePageContentByLocale = {
  ar: {
    metadataTitle: "HATAB | أثاث مكتبي وحلول مساحات العمل",
    metadataDescription: "استكشف الأثاث المكتبي حسب المساحة، واجمع المنتجات والكميات في لوحة مشروع واحدة لطلب عرض مخصص.",
    organizationName: "HATAB للأثاث المكتبي",
    hero: {
      eyebrow: "حطب · مساحات العمل المتكاملة",
      title: "من أول خط إلى يوم عمل أذكى.",
      body: "نصمّم وننسّق أثاث المكتب كمنظومة واحدة؛ من سطح العمل والمقعد إلى التخزين والاجتماعات، بما يلائم مساحة فريقك وطريقة عمله.",
      catalogCta: "استكشف الكتالوج",
      projectCta: "ابدأ مشروعك",
      imageCaption: "تصميم · تصنيع · تنسيق · تركيب لمساحة عمل مكتملة",
      stageLabels: [
        "نفهم المساحة",
        "نصمّم المنظومة",
        "نصنع كل تفصيلة",
        "نفعّل مكتباً أذكى",
      ],
      stageNotes: [
        "نقرأ حركة الفريق واحتياجه قبل أن نختار أي قطعة.",
        "نحوّل التخطيط إلى نظام واضح الأبعاد وقابل للتنفيذ.",
        "نوازن الخشب والمعدن والتنجيد في لغة واحدة هادئة.",
        "ننسّق التركيب والتقنية لتبدأ المساحة عملها من اليوم الأول.",
      ],
    },
    proofPublished: ["قطعة متاحة للاستكشاف", "فئة مكتبية متخصصة", "وسماً للمساحة والخامة والميزة"],
    proofFallback: [
      ["حسب المساحة", "ابدأ من احتياج المكتب، لا من قائمة طويلة"],
      ["تكوين واحد", "اجمع المكتب والمقعد والتخزين في لوحة مشروع"],
      ["عرض مخصص", "أرسل الكميات والمتطلبات للمراجعة والتسعير"],
    ],
    spacesKicker: "ابدأ من المساحة",
    spacesTitle: "ليست قطعة منفردة، بل مشهد عمل متكامل.",
    spacesLink: "كل طرق الاستكشاف",
    spaceStories: [
      {
        title: "المكتب التنفيذي",
        eyebrow: "هدوء بصري وحضور واضح",
        copy: "مكاتب ووحدات تخزين ومقاعد تُكوّن مشهداً متوازناً للقيادة والعمل المركز.",
      },
      {
        title: "مساحات العمل المفتوحة",
        eyebrow: "تكوينات قابلة للنمو",
        copy: "محطات عمل وملحقات تساعدك على بناء فرق صغيرة أو مساحات تشغيل واسعة.",
      },
      {
        title: "غرف الاجتماعات",
        eyebrow: "حول الحوار",
        copy: "طاولات ومقاعد لاجتماعات يومية أو غرف مجالس أكثر رسمية.",
      },
      {
        title: "الاستقبال والانتظار",
        eyebrow: "انطباع أول مدروس",
        copy: "كاونترات ومقاعد ومساحات ضيافة متناسقة من أول خطوة.",
      },
    ],
    marquee: ["تركيز", "تعاون", "قيادة", "ضيافة"],
    marqueeLabel: "حلول لمساحات التركيز والتعاون والقيادة والضيافة",
    motionKicker: "الحركة جزء من الراحة",
    motionTitle: "المقعد الجيد لا يفرض وضعية واحدة.",
    motionBody: "ندرس حركة الجسد أثناء الجلوس والعمل، ثم نختار الآلية والدعم والخامة التي تستجيب للمستخدم بهدوء طوال اليوم.",
    motionLink: "استكشف مقاعد العمل",
    catalogKicker: "كتالوج واضح",
    catalogTitle: "اختر فئتك، ثم دقّق التفاصيل.",
    catalogBody: "تصنيفات موحّدة تُسهّل المقارنة وتبقي مسار البحث قصيراً حتى مع كتالوج كبير.",
    piece: "قطعة",
    coordinationLabels: ["سطح العمل", "المقعد", "التخزين"],
    coordinationKicker: "علاقات مدروسة",
    coordinationTitle: "التنسيق يبدأ من العلاقة بين القطع.",
    coordinationBody: "ابدأ بسطح العمل، ثم أضف المقعد والتخزين ضمن لغة واحدة. المجموعات تمنحك نقطة بداية واضحة، ويمكنك تعديل كل قطعة حسب احتياج المساحة.",
    coordinationLink: "استكشف المجموعات",
    picksKicker: "مختارات بصرية",
    picksTitle: "قطع تساعدك على بدء اللوحة.",
    picksLink: "تصفح كل القطع",
    journeyKicker: "من الاكتشاف إلى الطلب",
    journeyTitle: "رحلة قصيرة، وقرار أوضح.",
    journeyBody: "صُممت التجربة للمشروعات: لا سلة شراء تقليدية ولا أسعار تقديرية قبل فهم الكمية والمواصفات.",
    journeyLink: "ابدأ طلبك",
    journeySteps: [
      ["استكشف", "ابحث أو صفِّ القطع حسب المساحة والخامة والميزة."],
      ["كوّن", "أضف المنتجات وعدّل الكميات داخل لوحة المشروع."],
      ["أرسل", "شارك ملخص المساحة ومتطلباتك ليُراجعها الفريق."],
    ],
    projectKicker: "مشروع جديد",
    projectTitle: "اجمع احتياجات المساحة في لوحة واحدة.",
    projectBody: "يمكنك البدء بمنتج واحد وتطوير الطلب أثناء التصفح؛ سيبقى محفوظاً على هذا الجهاز لمدة تصل إلى 30 يوماً أو حتى الإرسال.",
    backCatalog: "العودة للكتالوج",
    openProject: "افتح لوحة المشروع",
    process: {
      sectionLabel: "رحلة حطب من التصميم إلى المكتب الذكي",
      eyebrow: "عملية حطب · من الفكرة إلى التسليم",
      heading: "شاهد المساحة وهي تتكوّن.",
      instruction: "مرّر إلى الأسفل لتحريك الفيلم",
      progressLabel: "تقدّم رحلة حطب",
      stageLabel: "المرحلة",
      filmLabel: "فيلم عملية حطب",
      loading: "يتم تجهيز الفيلم التفاعلي",
      unavailable: "تعذّر تحميل الفيلم، وتبقى مراحل العملية متاحة للقراءة.",
      reducedHeading: "من التصميم إلى مكتب يعمل بذكاء.",
      reducedDescription: "تم إيقاف حركة الفيلم احتراماً لإعداد تقليل الحركة. يمكنك استعراض العملية كاملة أدناه.",
      jumpTo: "انتقل إلى مرحلة",
      catalogCta: "استكشف الكتالوج",
      projectCta: "ابدأ مشروعك",
      stages: [
        { label: "الرؤية والتصميم", title: "نبدأ بالمساحة، لا بالقطعة.", description: "نفهم حركة الفريق واحتياجاته، ثم نرسم توزيعاً يحوّل كل متر إلى مساحة عمل هادئة وفعّالة.", detail: "دراسة الموقع · تخطيط الحركة · اختيار المجموعة" },
        { label: "الهندسة والتفصيل", title: "نحوّل الفكرة إلى نظام قابل للتنفيذ.", description: "نضبط الأبعاد ونقاط الاتصال والحركة، لتناسب كل قطعة المكان والفريق وطريقة العمل قبل بدء التصنيع.", detail: "أبعاد دقيقة · تفاصيل تنفيذية · توافق وظيفي" },
        { label: "الخامة والحرفة", title: "يأخذ التصميم شكله بين أيدي الحرفيين.", description: "نوازن بين الخشب والمعدن والتنجيد، ثم نصنع ونشطب كل سطح بدقة تمنحه حضوراً هادئاً وعُمراً أطول.", detail: "تصنيع محلي · خامات مدروسة · تشطيب دقيق" },
        { label: "التنسيق والراحة", title: "كل قطعة تكمل ما حولها.", description: "ننسّق المكاتب والمقاعد والتخزين ونختبر الراحة والحركة، حتى تبدو المجموعة واحدة وتعمل كمساحة متكاملة.", detail: "تنسيق المجموعة · اختبار الراحة · فحص نهائي" },
        { label: "التركيب والمكتب الذكي", title: "مساحة مكتملة، مستعدة للعمل بذكاء.", description: "نجمع المكاتب والمقاعد والتخزين وإدارة الأسلاك في تركيب واحد؛ قطع مكتب ذكية تكمل بعضها منذ اليوم الأول.", detail: "تركيب منسّق · إدارة تقنية · تسليم جاهز للعمل" },
      ],
    },
  },
  en: {
    metadataTitle: "HATAB | Office furniture and complete workspace solutions",
    metadataDescription: "Explore office furniture by space, then collect products and quantities in one project board for a tailored quote.",
    organizationName: "HATAB Office Furniture",
    hero: {
      eyebrow: "HATAB · Complete workspace systems",
      title: "From first line to a smarter workday.",
      body: "We design and coordinate office furniture as one system—from work surface and seating to storage and meeting spaces—around your team and the way it works.",
      catalogCta: "Explore the catalog",
      projectCta: "Start your project",
      imageCaption: "Design · make · coordinate · install a complete workspace",
      stageLabels: [
        "Understand the space",
        "Design the system",
        "Craft every detail",
        "Activate smarter work",
      ],
      stageNotes: [
        "We read how the team moves and works before choosing a single piece.",
        "The plan becomes a precise, buildable workspace system.",
        "Wood, metal and upholstery are balanced in one quiet language.",
        "Installation and technology are coordinated for a work-ready handover.",
      ],
    },
    proofPublished: ["catalog pieces to explore", "specialist office categories", "space, material and feature tags"],
    proofFallback: [
      ["By workspace", "Begin with the office need, not a long product list"],
      ["One composition", "Bring desk, chair and storage into one project board"],
      ["Tailored quote", "Send quantities and requirements for review and pricing"],
    ],
    spacesKicker: "Begin with the space",
    spacesTitle: "Not an isolated piece—a complete working scene.",
    spacesLink: "All ways to explore",
    spaceStories: [
      { title: "Executive office", eyebrow: "Visual calm, clear presence", copy: "Desks, storage and seating composed as one balanced setting for leadership and focused work." },
      { title: "Open workspaces", eyebrow: "Configurations that can grow", copy: "Workstations and accessories for compact teams or larger operational floors." },
      { title: "Meeting rooms", eyebrow: "Designed around dialogue", copy: "Tables and seating for everyday collaboration or more formal boardrooms." },
      { title: "Reception and waiting", eyebrow: "A considered first impression", copy: "Coordinated counters, seating and hospitality zones from the first step inside." },
    ],
    marquee: ["Focus", "Collaborate", "Lead", "Welcome"],
    marqueeLabel: "Solutions for focus, collaboration, leadership and hospitality spaces",
    motionKicker: "Movement is part of comfort",
    motionTitle: "A good chair never holds you in one position.",
    motionBody: "We study how the body moves through a working day, then select the mechanism, support and material that respond quietly to the person using it.",
    motionLink: "Explore task seating",
    catalogKicker: "A clear catalog",
    catalogTitle: "Choose a category, then refine the details.",
    catalogBody: "A consistent taxonomy makes comparison easier and keeps discovery short, even across a large catalog.",
    piece: "pieces",
    coordinationLabels: ["Work surface", "Seating", "Storage"],
    coordinationKicker: "Considered relationships",
    coordinationTitle: "Coordination begins with the relationship between pieces.",
    coordinationBody: "Start with the work surface, then add seating and storage in one visual language. Each edit is a clear starting point that can be adjusted to the space.",
    coordinationLink: "Explore collections",
    picksKicker: "Visual edit",
    picksTitle: "Pieces that help begin the board.",
    picksLink: "Browse every piece",
    journeyKicker: "From discovery to request",
    journeyTitle: "A shorter path to a clearer decision.",
    journeyBody: "The experience is built for projects: no conventional cart and no speculative pricing before quantity and specifications are understood.",
    journeyLink: "Start your request",
    journeySteps: [
      ["Explore", "Search and filter by space, material and feature."],
      ["Compose", "Add products and adjust quantities in the project board."],
      ["Send", "Share the space brief and requirements for team review."],
    ],
    projectKicker: "New project",
    projectTitle: "Bring the whole workspace brief into one board.",
    projectBody: "Begin with one product and develop the request as you browse; it remains on this device for up to 30 days or until it is sent.",
    backCatalog: "Back to catalog",
    openProject: "Open project board",
    process: {
      sectionLabel: "The HATAB journey from design to smart office",
      eyebrow: "The HATAB process · idea to handover",
      heading: "Watch the workspace take shape.",
      instruction: "Scroll down to drive the film",
      progressLabel: "HATAB process progress",
      stageLabel: "Stage",
      filmLabel: "HATAB process film",
      loading: "Preparing the interactive film",
      unavailable: "The film could not be loaded. Every process stage remains available to read.",
      reducedHeading: "From design to an office that works intelligently.",
      reducedDescription: "Film motion is paused to respect your reduced-motion setting. The complete process is listed below.",
      jumpTo: "Jump to stage",
      catalogCta: "Explore the catalog",
      projectCta: "Start your project",
      stages: [
        { label: "Vision & design", title: "We begin with the space, not the object.", description: "We study how the team moves and works, then shape a plan that turns every metre into a calm, productive workplace.", detail: "Site study · Flow planning · Collection selection" },
        { label: "Engineer & detail", title: "The idea becomes a buildable system.", description: "Dimensions, connections and movement are resolved so each piece fits the place, the team and the way they work before making begins.", detail: "Precise dimensions · Build details · Functional fit" },
        { label: "Material & craft", title: "The design takes shape in skilled hands.", description: "Wood, metal and upholstery are balanced, made and finished with the precision that gives every surface quiet presence and lasting value.", detail: "Local making · Considered materials · Precise finish" },
        { label: "Coordinate & comfort", title: "Every piece completes what surrounds it.", description: "Desks, seating and storage are coordinated and comfort-tested until the collection reads as one and performs as a complete workspace.", detail: "Collection coordination · Comfort testing · Final inspection" },
        { label: "Install & smart office", title: "A complete space, ready to work intelligently.", description: "Desks, seating, storage and cable management arrive as one installation—smart office pieces designed to complete one another.", detail: "Coordinated install · Technology management · Work-ready handover" },
      ],
    },
  },
};
