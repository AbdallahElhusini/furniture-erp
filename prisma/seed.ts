import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { createClient } from '@libsql/client';
import { randomBytes, scryptSync } from 'node:crypto';

const url = process.env.DATABASE_URL || 'file:dev.db';
const adapter = new PrismaLibSql({ url });
const prisma = new PrismaClient({ adapter });

function hashSeedPassword(password: string) {
  const salt = randomBytes(16).toString('base64url');
  const cost = 16_384;
  const blockSize = 8;
  const parallelization = 1;
  const hash = scryptSync(password, salt, 64, {
    N: cost,
    r: blockSize,
    p: parallelization,
    maxmem: 64 * 1024 * 1024,
  }).toString('base64url');

  return ['scrypt', cost, blockSize, parallelization, salt, hash].join('$');
}

async function main() {
  console.log('🌱 Seeding database...');

  // ===========================
  // SETTINGS
  // ===========================
  await prisma.setting.createMany({
    data: [
      { key: 'company_name_ar', value: 'HATAB للأثاث المكتبي' },
      { key: 'company_name_en', value: 'HATAB Office Furniture' },
      { key: 'company_phone', value: process.env.COMPANY_PHONE || '' },
      { key: 'company_email', value: process.env.COMPANY_EMAIL || '' },
      { key: 'company_address', value: process.env.COMPANY_ADDRESS || '' },
      { key: 'currency', value: 'EGP' },
      { key: 'tax_rate', value: '14' },
    ],
  });

  // ===========================
  // ADMIN USER
  // ===========================
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword || adminPassword.length < 12) {
    throw new Error('ADMIN_PASSWORD must be set to at least 12 characters before seeding');
  }

  await prisma.user.create({
    data: {
      name: process.env.ADMIN_NAME || 'HATAB Administrator',
      email: process.env.ADMIN_EMAIL || 'admin@hatab.local',
      password: hashSeedPassword(adminPassword),
      role: 'ADMIN',
      mustChangePassword: true,
    },
  });

  // ===========================
  // CATEGORIES
  // ===========================
  const categories = await Promise.all([
    prisma.category.create({ data: { nameAr: 'مكاتب', nameEn: 'Desks', slug: 'desks', sortOrder: 1 } }),
    prisma.category.create({ data: { nameAr: 'كراسي مكتبية', nameEn: 'Office Chairs', slug: 'office-chairs', sortOrder: 2 } }),
    prisma.category.create({ data: { nameAr: 'قواطع ومقسمات', nameEn: 'Partitions', slug: 'partitions', sortOrder: 3 } }),
    prisma.category.create({ data: { nameAr: 'طاولات اجتماعات', nameEn: 'Meeting Tables', slug: 'meeting-tables', sortOrder: 4 } }),
    prisma.category.create({ data: { nameAr: 'وحدات تخزين', nameEn: 'Storage Units', slug: 'storage-units', sortOrder: 5 } }),
    prisma.category.create({ data: { nameAr: 'كنب واستقبال', nameEn: 'Sofas & Reception', slug: 'sofas-reception', sortOrder: 6 } }),
    prisma.category.create({ data: { nameAr: 'كراسي انتظار', nameEn: 'Waiting Chairs', slug: 'waiting-chairs', sortOrder: 7 } }),
    prisma.category.create({ data: { nameAr: 'مكاتب تنفيذية', nameEn: 'Executive Desks', slug: 'executive-desks', sortOrder: 8 } }),
    prisma.category.create({ data: { nameAr: 'إكسسوارات مكتبية', nameEn: 'Office Accessories', slug: 'office-accessories', sortOrder: 9 } }),
    prisma.category.create({ data: { nameAr: 'أرفف ومكتبات', nameEn: 'Shelves & Bookcases', slug: 'shelves-bookcases', sortOrder: 10 } }),
  ]);

  // ===========================
  // SUPPLIERS (10 factories)
  // ===========================
  const suppliers = await Promise.all([
    prisma.supplier.create({ data: { name: 'مصنع النجار الذهبي', contactPerson: 'أحمد محمد', phone: '01001234567', email: 'golden@factory.com', specialization: 'أثاث خشبي - مكاتب وطاولات', qualityRating: 5, deliveryRating: 4, address: 'المنطقة الصناعية - أكتوبر' } }),
    prisma.supplier.create({ data: { name: 'مصنع المعادن المتحدة', contactPerson: 'خالد إبراهيم', phone: '01012345678', email: 'united.metals@factory.com', specialization: 'أثاث معدني - قواطع وأرفف', qualityRating: 4, deliveryRating: 5, address: 'العبور الصناعية' } }),
    prisma.supplier.create({ data: { name: 'مصنع الراحة للكراسي', contactPerson: 'محمود علي', phone: '01023456789', email: 'comfort@chairs.com', specialization: 'كراسي مكتبية وانتظار', qualityRating: 5, deliveryRating: 5, address: 'دمياط' } }),
    prisma.supplier.create({ data: { name: 'مصنع الأمير للتنجيد', contactPerson: 'عمر حسن', phone: '01034567890', email: 'prince@upholstery.com', specialization: 'كنب واستقبال - تنجيد', qualityRating: 4, deliveryRating: 3, address: 'دمياط الجديدة' } }),
    prisma.supplier.create({ data: { name: 'مصنع تكنو ديزاين', contactPerson: 'يوسف سمير', phone: '01045678901', email: 'techno@design.com', specialization: 'مكاتب تنفيذية فاخرة', qualityRating: 5, deliveryRating: 4, address: 'المعادي الصناعية' } }),
    prisma.supplier.create({ data: { name: 'مصنع الزجاج العربي', contactPerson: 'كريم فؤاد', phone: '01056789012', email: 'arab.glass@factory.com', specialization: 'قواطع زجاجية وأسطح', qualityRating: 4, deliveryRating: 4, address: 'العاشر من رمضان' } }),
    prisma.supplier.create({ data: { name: 'مصنع ستيل لاين', contactPerson: 'حسام نبيل', phone: '01067890123', email: 'steelline@factory.com', specialization: 'وحدات تخزين معدنية', qualityRating: 3, deliveryRating: 4, address: 'بدر الصناعية' } }),
    prisma.supplier.create({ data: { name: 'مصنع وود آرت', contactPerson: 'طارق مصطفى', phone: '01078901234', email: 'woodart@factory.com', specialization: 'أرفف ومكتبات خشبية', qualityRating: 5, deliveryRating: 3, address: 'دمياط' } }),
    prisma.supplier.create({ data: { name: 'مصنع إليجانت', contactPerson: 'سامح عادل', phone: '01089012345', email: 'elegant@factory.com', specialization: 'إكسسوارات مكتبية', qualityRating: 4, deliveryRating: 5, address: 'المنصورة' } }),
    prisma.supplier.create({ data: { name: 'مصنع المستقبل', contactPerson: 'مصطفى كمال', phone: '01090123456', email: 'future@factory.com', specialization: 'أثاث ذكي ومودرن', qualityRating: 5, deliveryRating: 4, address: 'أكتوبر الصناعية' } }),
  ]);

  // ===========================
  // CATALOG ITEMS (Sample - 30 items across categories)
  // ===========================
  const catalogData = [
    // Desks (Category 0)
    { categoryId: categories[0].id, supplierId: suppliers[0].id, nameAr: 'مكتب عمل مودرن 120سم', nameEn: 'Modern Work Desk 120cm', sku: 'DSK-001', costPrice: 2500, sellingPrice: 4500, leadTimeDays: 10, dimensions: '120x60x75 سم', material: 'خشب MDF مطلي', color: 'أبيض/رمادي', descriptionAr: 'مكتب عمل عصري بتصميم أنيق مع درج جانبي وفتحة كابلات', descriptionEn: 'Modern work desk with sleek design, side drawer and cable management', isFeatured: true },
    { categoryId: categories[0].id, supplierId: suppliers[0].id, nameAr: 'مكتب عمل بأدراج 140سم', nameEn: 'Desk with Drawers 140cm', sku: 'DSK-002', costPrice: 3200, sellingPrice: 5800, leadTimeDays: 12, dimensions: '140x70x75 سم', material: 'خشب طبيعي', color: 'بني فاتح', descriptionAr: 'مكتب عمل واسع مع 3 أدراج ورف سفلي', descriptionEn: 'Spacious desk with 3 drawers and lower shelf' },
    { categoryId: categories[0].id, supplierId: suppliers[0].id, nameAr: 'مكتب زاوية L-Shape', nameEn: 'L-Shape Corner Desk', sku: 'DSK-003', costPrice: 4000, sellingPrice: 7200, leadTimeDays: 14, dimensions: '160x140x75 سم', material: 'خشب MDF عالي الكثافة', color: 'أسود', descriptionAr: 'مكتب زاوية بتصميم L يوفر مساحة عمل كبيرة', descriptionEn: 'L-shaped corner desk providing large workspace', isFeatured: true },
    
    // Office Chairs (Category 1)
    { categoryId: categories[1].id, supplierId: suppliers[2].id, nameAr: 'كرسي مكتب شبكي', nameEn: 'Mesh Office Chair', sku: 'CHR-001', costPrice: 1800, sellingPrice: 3500, leadTimeDays: 5, dimensions: '65x65x120 سم', material: 'شبك + إطار معدني', color: 'أسود', descriptionAr: 'كرسي مكتب مريح بظهر شبكي مسامي وارتفاع قابل للتعديل', descriptionEn: 'Ergonomic mesh back office chair with adjustable height', isFeatured: true },
    { categoryId: categories[1].id, supplierId: suppliers[2].id, nameAr: 'كرسي رئاسي جلد', nameEn: 'Executive Leather Chair', sku: 'CHR-002', costPrice: 3500, sellingPrice: 6500, leadTimeDays: 7, dimensions: '70x70x130 سم', material: 'جلد طبيعي + خشب', color: 'بني غامق', descriptionAr: 'كرسي رئاسي فاخر بجلد طبيعي ومسند رأس قابل للتعديل', descriptionEn: 'Luxury executive chair with genuine leather and adjustable headrest' },
    { categoryId: categories[1].id, supplierId: suppliers[2].id, nameAr: 'كرسي مكتب بمسند ذراع', nameEn: 'Office Chair with Armrest', sku: 'CHR-003', costPrice: 1200, sellingPrice: 2200, leadTimeDays: 3, dimensions: '60x60x110 سم', material: 'قماش + بلاستيك', color: 'رمادي', descriptionAr: 'كرسي مكتب اقتصادي مع مساند ذراع ثابتة', descriptionEn: 'Budget-friendly office chair with fixed armrests' },
    
    // Partitions (Category 2)
    { categoryId: categories[2].id, supplierId: suppliers[1].id, nameAr: 'قاطع ألومنيوم وزجاج 150سم', nameEn: 'Aluminum & Glass Partition 150cm', sku: 'PRT-001', costPrice: 5000, sellingPrice: 9000, leadTimeDays: 15, dimensions: '150x180 سم', material: 'ألومنيوم + زجاج مزدوج', color: 'فضي', descriptionAr: 'قاطع مكتبي أنيق بإطار ألومنيوم وزجاج مزدوج عازل للصوت', descriptionEn: 'Elegant office partition with aluminum frame and double glazed soundproof glass', isFeatured: true },
    { categoryId: categories[2].id, supplierId: suppliers[5].id, nameAr: 'قاطع زجاجي شفاف', nameEn: 'Clear Glass Partition', sku: 'PRT-002', costPrice: 3500, sellingPrice: 6500, leadTimeDays: 12, dimensions: '120x180 سم', material: 'زجاج سيكوريت 10مم', color: 'شفاف', descriptionAr: 'قاطع زجاجي شفاف بدون إطار لمظهر مودرن', descriptionEn: 'Frameless clear glass partition for modern look' },
    { categoryId: categories[2].id, supplierId: suppliers[1].id, nameAr: 'قاطع قماش متحرك', nameEn: 'Fabric Movable Partition', sku: 'PRT-003', costPrice: 1500, sellingPrice: 2800, leadTimeDays: 7, dimensions: '100x160 سم', material: 'قماش + إطار معدني', color: 'بيج', descriptionAr: 'قاطع قماشي متحرك على عجلات - مثالي للمساحات المرنة', descriptionEn: 'Mobile fabric partition on wheels - ideal for flexible spaces' },
    
    // Meeting Tables (Category 3)
    { categoryId: categories[3].id, supplierId: suppliers[0].id, nameAr: 'طاولة اجتماعات 8 أشخاص', nameEn: 'Meeting Table 8 Person', sku: 'MTG-001', costPrice: 6000, sellingPrice: 11000, leadTimeDays: 14, dimensions: '240x120x75 سم', material: 'خشب طبيعي + MDF', color: 'بني جوزي', descriptionAr: 'طاولة اجتماعات فاخرة تتسع لـ 8 أشخاص مع فتحات كابلات مدمجة', descriptionEn: 'Premium 8-person meeting table with built-in cable ports', isFeatured: true },
    { categoryId: categories[3].id, supplierId: suppliers[0].id, nameAr: 'طاولة اجتماعات دائرية', nameEn: 'Round Meeting Table', sku: 'MTG-002', costPrice: 3500, sellingPrice: 6500, leadTimeDays: 10, dimensions: 'قطر 120x75 سم', material: 'خشب MDF', color: 'أبيض', descriptionAr: 'طاولة اجتماعات دائرية أنيقة تتسع لـ 4 أشخاص', descriptionEn: 'Elegant round meeting table for 4 persons' },
    
    // Storage Units (Category 4)
    { categoryId: categories[4].id, supplierId: suppliers[6].id, nameAr: 'دولاب ملفات 4 أدراج', nameEn: '4-Drawer Filing Cabinet', sku: 'STR-001', costPrice: 1800, sellingPrice: 3200, leadTimeDays: 7, dimensions: '47x62x132 سم', material: 'معدن مطلي', color: 'رمادي', descriptionAr: 'دولاب ملفات معدني 4 أدراج مع قفل مركزي', descriptionEn: '4-drawer metal filing cabinet with central lock' },
    { categoryId: categories[4].id, supplierId: suppliers[6].id, nameAr: 'خزانة مكتبية بأبواب', nameEn: 'Office Cabinet with Doors', sku: 'STR-002', costPrice: 2500, sellingPrice: 4500, leadTimeDays: 10, dimensions: '90x40x180 سم', material: 'خشب MDF + معدن', color: 'أبيض/رمادي', descriptionAr: 'خزانة مكتبية واسعة بأبواب وأرفف قابلة للتعديل', descriptionEn: 'Spacious office cabinet with adjustable shelves' },
    { categoryId: categories[4].id, supplierId: suppliers[6].id, nameAr: 'وحدة تخزين مفتوحة', nameEn: 'Open Storage Unit', sku: 'STR-003', costPrice: 1200, sellingPrice: 2200, leadTimeDays: 5, dimensions: '80x35x120 سم', material: 'خشب MDF', color: 'بيج', descriptionAr: 'وحدة تخزين مفتوحة بـ 4 أرفف - مثالية للكتب والملفات', descriptionEn: 'Open 4-shelf storage unit - ideal for books and files' },
    
    // Sofas & Reception (Category 5)
    { categoryId: categories[5].id, supplierId: suppliers[3].id, nameAr: 'كنبة استقبال 3 مقاعد', nameEn: '3-Seat Reception Sofa', sku: 'SFA-001', costPrice: 5000, sellingPrice: 9500, leadTimeDays: 14, dimensions: '200x80x85 سم', material: 'جلد صناعي فاخر', color: 'أسود', descriptionAr: 'كنبة استقبال فاخرة 3 مقاعد بجلد صناعي عالي الجودة', descriptionEn: 'Premium 3-seat reception sofa with high-quality faux leather', isFeatured: true },
    { categoryId: categories[5].id, supplierId: suppliers[3].id, nameAr: 'كنبة استقبال فردية', nameEn: 'Single Reception Sofa', sku: 'SFA-002', costPrice: 2200, sellingPrice: 4000, leadTimeDays: 10, dimensions: '90x80x85 سم', material: 'جلد صناعي', color: 'بني', descriptionAr: 'كنبة استقبال فردية مريحة بتصميم كلاسيكي', descriptionEn: 'Comfortable single reception sofa with classic design' },
    { categoryId: categories[5].id, supplierId: suppliers[3].id, nameAr: 'طاولة قهوة استقبال', nameEn: 'Reception Coffee Table', sku: 'SFA-003', costPrice: 800, sellingPrice: 1500, leadTimeDays: 5, dimensions: '100x60x45 سم', material: 'خشب + زجاج', color: 'أسود/شفاف', descriptionAr: 'طاولة قهوة أنيقة لمنطقة الاستقبال', descriptionEn: 'Elegant coffee table for reception area' },
    
    // Waiting Chairs (Category 6)
    { categoryId: categories[6].id, supplierId: suppliers[2].id, nameAr: 'كرسي انتظار 3 مقاعد', nameEn: '3-Seat Waiting Chair', sku: 'WCH-001', costPrice: 1500, sellingPrice: 2800, leadTimeDays: 5, dimensions: '170x55x80 سم', material: 'معدن + جلد صناعي', color: 'أسود', descriptionAr: 'كرسي انتظار 3 مقاعد متصل - مثالي للعيادات والمكاتب', descriptionEn: '3-seat connected waiting chair - ideal for clinics and offices' },
    { categoryId: categories[6].id, supplierId: suppliers[2].id, nameAr: 'كرسي انتظار فردي', nameEn: 'Single Waiting Chair', sku: 'WCH-002', costPrice: 450, sellingPrice: 850, leadTimeDays: 3, dimensions: '55x55x80 سم', material: 'بلاستيك + معدن', color: 'أبيض', descriptionAr: 'كرسي انتظار فردي خفيف وعملي قابل للتكديس', descriptionEn: 'Lightweight stackable single waiting chair' },
    
    // Executive Desks (Category 7)
    { categoryId: categories[7].id, supplierId: suppliers[4].id, nameAr: 'مكتب تنفيذي كلاسيك 180سم', nameEn: 'Classic Executive Desk 180cm', sku: 'EXD-001', costPrice: 8000, sellingPrice: 15000, leadTimeDays: 21, dimensions: '180x90x75 سم', material: 'خشب زان طبيعي', color: 'بني غامق', descriptionAr: 'مكتب تنفيذي فاخر من خشب الزان الطبيعي مع جانبية أدراج كاملة', descriptionEn: 'Luxury executive desk in natural beech wood with full pedestal', isFeatured: true },
    { categoryId: categories[7].id, supplierId: suppliers[4].id, nameAr: 'مكتب تنفيذي مودرن 200سم', nameEn: 'Modern Executive Desk 200cm', sku: 'EXD-002', costPrice: 10000, sellingPrice: 18000, leadTimeDays: 25, dimensions: '200x100x75 سم', material: 'خشب + معدن + زجاج', color: 'رمادي/فضي', descriptionAr: 'مكتب تنفيذي مودرن بتصميم معاصر يجمع بين الخشب والمعدن والزجاج', descriptionEn: 'Contemporary executive desk combining wood, metal and glass' },
    { categoryId: categories[7].id, supplierId: suppliers[9].id, nameAr: 'مكتب تنفيذي ذكي', nameEn: 'Smart Executive Desk', sku: 'EXD-003', costPrice: 12000, sellingPrice: 22000, leadTimeDays: 30, dimensions: '200x90x75 سم', material: 'خشب MDF + تقنيات ذكية', color: 'أبيض/أسود', descriptionAr: 'مكتب تنفيذي ذكي مع شاحن لاسلكي مدمج ونظام إدارة كابلات', descriptionEn: 'Smart executive desk with built-in wireless charger and cable management' },
    
    // Office Accessories (Category 8)
    { categoryId: categories[8].id, supplierId: suppliers[8].id, nameAr: 'منظم مكتب خشبي', nameEn: 'Wooden Desk Organizer', sku: 'ACC-001', costPrice: 200, sellingPrice: 450, leadTimeDays: 3, dimensions: '30x20x15 سم', material: 'خشب طبيعي', color: 'بني فاتح', descriptionAr: 'منظم مكتب خشبي أنيق بعدة أقسام للأقلام والأوراق', descriptionEn: 'Elegant wooden desk organizer with multiple compartments' },
    { categoryId: categories[8].id, supplierId: suppliers[8].id, nameAr: 'حامل شاشة قابل للتعديل', nameEn: 'Adjustable Monitor Stand', sku: 'ACC-002', costPrice: 350, sellingPrice: 700, leadTimeDays: 3, dimensions: '50x25x15 سم', material: 'ألومنيوم', color: 'فضي', descriptionAr: 'حامل شاشة من الألومنيوم قابل للتعديل مع درج تخزين', descriptionEn: 'Aluminum adjustable monitor stand with storage drawer' },
    { categoryId: categories[8].id, supplierId: suppliers[8].id, nameAr: 'سلة مهملات مكتبية', nameEn: 'Office Waste Bin', sku: 'ACC-003', costPrice: 100, sellingPrice: 200, leadTimeDays: 2, dimensions: '25x25x35 سم', material: 'معدن مطلي', color: 'أسود', descriptionAr: 'سلة مهملات مكتبية أنيقة من المعدن المطلي', descriptionEn: 'Elegant metal coated office waste bin' },
    
    // Shelves & Bookcases (Category 9)
    { categoryId: categories[9].id, supplierId: suppliers[7].id, nameAr: 'مكتبة خشبية 5 أرفف', nameEn: 'Wooden Bookcase 5 Shelves', sku: 'SHL-001', costPrice: 2000, sellingPrice: 3800, leadTimeDays: 10, dimensions: '80x35x180 سم', material: 'خشب MDF', color: 'بني جوزي', descriptionAr: 'مكتبة خشبية أنيقة بـ 5 أرفف قابلة للتعديل', descriptionEn: 'Elegant wooden bookcase with 5 adjustable shelves' },
    { categoryId: categories[9].id, supplierId: suppliers[7].id, nameAr: 'رف حائط عائم', nameEn: 'Floating Wall Shelf', sku: 'SHL-002', costPrice: 300, sellingPrice: 600, leadTimeDays: 5, dimensions: '80x25x4 سم', material: 'خشب MDF', color: 'أبيض', descriptionAr: 'رف حائط عائم بتصميم مينيمال - سهل التركيب', descriptionEn: 'Minimalist floating wall shelf - easy installation' },
    { categoryId: categories[9].id, supplierId: suppliers[7].id, nameAr: 'وحدة أرفف صناعية', nameEn: 'Industrial Shelf Unit', sku: 'SHL-003', costPrice: 2500, sellingPrice: 4500, leadTimeDays: 12, dimensions: '120x40x180 سم', material: 'خشب + معدن أسود', color: 'بني/أسود', descriptionAr: 'وحدة أرفف بتصميم صناعي (Industrial) - خشب وحديد', descriptionEn: 'Industrial style shelf unit - wood and iron', isFeatured: true },
  ];

  for (const item of catalogData) {
    await prisma.catalogItem.create({ data: item });
  }

  // ===========================
  // TECHNICIANS
  // ===========================
  await Promise.all([
    prisma.technician.create({ data: { name: 'محمود حسن', phone: '01111111111', specialization: 'تركيب أثاث مكتبي', dailyRate: 500 } }),
    prisma.technician.create({ data: { name: 'أحمد سعيد', phone: '01222222222', specialization: 'تركيب قواطع وزجاج', dailyRate: 600 } }),
    prisma.technician.create({ data: { name: 'عبدالله محمد', phone: '01333333333', specialization: 'نجارة وتشطيب', dailyRate: 550 } }),
    prisma.technician.create({ data: { name: 'حسن إبراهيم', phone: '01444444444', specialization: 'كهرباء وتوصيلات', dailyRate: 450 } }),
    prisma.technician.create({ data: { name: 'ياسر عبدالرحمن', phone: '01555555555', specialization: 'شحن وتوصيل', dailyRate: 400 } }),
  ]);

  // ===========================
  // PORTFOLIO PROJECTS
  // ===========================
  await Promise.all([
    prisma.portfolioProject.create({ data: { titleAr: 'تجهيز مقر شركة TechStart', titleEn: 'TechStart Office Fit-out', descriptionAr: 'تجهيز كامل لمقر شركة تكنولوجيا - 500 متر مربع، شمل مكاتب عمل، غرف اجتماعات، ومنطقة استقبال فاخرة', descriptionEn: 'Complete fit-out for a tech company - 500 sqm including workstations, meeting rooms, and premium reception area', clientName: 'TechStart Inc.', location: 'التجمع الخامس، القاهرة', isFeatured: true, sortOrder: 1 } }),
    prisma.portfolioProject.create({ data: { titleAr: 'تأثيث عيادة د. سمير', titleEn: 'Dr. Samir Clinic Furnishing', descriptionAr: 'تأثيث عيادة طبية كاملة - منطقة انتظار، غرف كشف، ومكتب إداري', descriptionEn: 'Complete medical clinic furnishing - waiting area, examination rooms, and admin office', clientName: 'عيادة د. سمير', location: 'المعادي، القاهرة', isFeatured: true, sortOrder: 2 } }),
    prisma.portfolioProject.create({ data: { titleAr: 'تجهيز مكاتب بنك المستقبل', titleEn: 'Future Bank Office Setup', descriptionAr: 'تجهيز فرع بنكي كامل - كاونترات خدمة، مكاتب موظفين، وغرفة مدير', descriptionEn: 'Complete bank branch setup - service counters, staff desks, and manager office', clientName: 'بنك المستقبل', location: 'مدينة نصر، القاهرة', isFeatured: true, sortOrder: 3 } }),
    prisma.portfolioProject.create({ data: { titleAr: 'تأثيث مساحة عمل مشتركة Co-Space', titleEn: 'Co-Space Coworking Furnishing', descriptionAr: 'تصميم وتأثيث مساحة عمل مشتركة - 40 محطة عمل، 3 غرف اجتماعات، كافيتريا', descriptionEn: 'Design and furnishing of coworking space - 40 workstations, 3 meeting rooms, cafeteria', clientName: 'Co-Space', location: 'الشيخ زايد', isFeatured: false, sortOrder: 4 } }),
  ]);

  // ===========================
  // SAMPLE CLIENTS & PROJECTS
  // ===========================
  const client1 = await prisma.client.create({
    data: { name: 'أحمد عبدالعزيز', company: 'شركة النور للتقنية', phone: '01098765432', email: 'ahmed@alnour.com', address: 'التجمع الخامس، القاهرة' }
  });
  
  const client2 = await prisma.client.create({
    data: { name: 'سارة محمد', company: 'عيادة الشفاء', phone: '01087654321', email: 'sara@alshifa.com', address: 'المعادي، القاهرة' }
  });

  const client3 = await prisma.client.create({
    data: { name: 'محمد كريم', phone: '01076543210', address: 'مدينة نصر، القاهرة' }
  });

  // Large Project
  const project1 = await prisma.project.create({
    data: {
      clientId: client1.id,
      title: 'تجهيز مكاتب شركة النور - الدور الثالث',
      type: 'LARGE_PROJECT',
      status: 'IN_PRODUCTION',
      inspectionDate: new Date('2026-08-10'),
      approvalDate: new Date('2026-08-15'),
      estimatedDelivery: new Date('2026-09-05'),
      totalCost: 45000,
      totalPrice: 82000,
      amountPaid: 41000,
      shippingCost: 2000,
      installationCost: 3000,
      priority: 'HIGH',
      notes: 'مشروع تجهيز الدور الثالث كامل - 15 محطة عمل + غرفة اجتماعات',
    }
  });

  // Simple Order
  const project2 = await prisma.project.create({
    data: {
      clientId: client3.id,
      title: 'طلب مكتب تنفيذي + كرسي',
      type: 'SIMPLE_ORDER',
      status: 'APPROVED',
      totalCost: 9800,
      totalPrice: 18500,
      amountPaid: 18500,
      priority: 'MEDIUM',
    }
  });

  // Another large project in design phase
  await prisma.project.create({
    data: {
      clientId: client2.id,
      title: 'تأثيث عيادة الشفاء - الفرع الجديد',
      type: 'LARGE_PROJECT',
      status: 'DESIGNING',
      inspectionDate: new Date('2026-08-18'),
      designDeadline: new Date('2026-08-25'),
      totalCost: 0,
      totalPrice: 0,
      priority: 'HIGH',
      notes: 'فرع جديد - منطقة انتظار + 3 غرف كشف + مكتب إداري',
    }
  });

  // ===========================
  // SAMPLE TASKS
  // ===========================
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  await Promise.all([
    prisma.task.create({ data: { projectId: project1.id, type: 'SUPPLIER_FOLLOWUP', title: 'تأكيد استلام خشب مشروع النور من مصنع النجار الذهبي', dueDate: today, status: 'TODO', priority: 'HIGH' } }),
    prisma.task.create({ data: { projectId: project1.id, type: 'SUPPLIER_FOLLOWUP', title: 'متابعة تصنيع الكراسي مع مصنع الراحة', dueDate: today, status: 'IN_PROGRESS', priority: 'MEDIUM' } }),
    prisma.task.create({ data: { projectId: project1.id, technicianId: 1, type: 'INSTALLATION', title: 'تجهيز القواطع الزجاجية للتركيب - مشروع النور', dueDate: new Date(today.getTime() + 86400000 * 3), status: 'TODO', priority: 'HIGH' } }),
    prisma.task.create({ data: { type: 'DESIGN', title: 'تسليم تصميم 3D لعيادة الشفاء', dueDate: today, status: 'TODO', priority: 'URGENT' } }),
    prisma.task.create({ data: { type: 'GENERAL', title: 'تحديث صور الكتالوج - فئة المكاتب التنفيذية', dueDate: new Date(today.getTime() + 86400000 * 2), status: 'TODO', priority: 'LOW' } }),
  ]);

  // ===========================
  // SAMPLE QUOTE REQUEST
  // ===========================
  const quote = await prisma.quoteRequest.create({
    data: {
      clientName: 'خالد أحمد',
      clientPhone: '01065432109',
      clientEmail: 'khaled@company.com',
      company: 'شركة البدر للاستشارات',
      message: 'نحتاج تجهيز مكتب 200 متر - 10 محطات عمل + غرفة اجتماعات + استقبال',
      status: 'NEW',
    }
  });

  await Promise.all([
    prisma.quoteItem.create({ data: { quoteId: quote.id, catalogItemId: 1, quantity: 10 } }),
    prisma.quoteItem.create({ data: { quoteId: quote.id, catalogItemId: 4, quantity: 10 } }),
    prisma.quoteItem.create({ data: { quoteId: quote.id, catalogItemId: 10, quantity: 1 } }),
    prisma.quoteItem.create({ data: { quoteId: quote.id, catalogItemId: 16, quantity: 1 } }),
  ]);

  // ===========================
  // SAMPLE PAYMENTS
  // ===========================
  await Promise.all([
    prisma.payment.create({ data: { projectId: project1.id, amount: 25000, method: 'BANK_TRANSFER', notes: 'دفعة مقدمة', date: new Date('2026-08-15') } }),
    prisma.payment.create({ data: { projectId: project1.id, amount: 16000, method: 'CASH', notes: 'دفعة ثانية', date: new Date('2026-08-20') } }),
    prisma.payment.create({ data: { projectId: project2.id, amount: 18500, method: 'BANK_TRANSFER', notes: 'سداد كامل', date: new Date('2026-08-19') } }),
  ]);

  console.log('✅ Database seeded successfully!');
  console.log('📊 Created:');
  console.log('   - 10 Categories');
  console.log('   - 10 Suppliers');
  console.log('   - 30 Catalog Items');
  console.log('   - 5 Technicians');
  console.log('   - 4 Portfolio Projects');
  console.log('   - 3 Clients');
  console.log('   - 3 Projects');
  console.log('   - 5 Tasks');
  console.log('   - 1 Quote Request');
  console.log('   - 1 Admin User (credentials supplied through environment variables)');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
