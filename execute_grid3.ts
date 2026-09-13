import { prisma } from './src/lib/db.js';

async function mergeProducts(targetSku, sourceSkus, newName = null) {
  const target = await prisma.catalogItem.findUnique({ where: { sku: targetSku } });
  if (!target) { console.log('Target ' + targetSku + ' not found'); return; }
  
  let targetImages = [];
  try { targetImages = JSON.parse(target.images || '[]'); } catch(e){}
  
  for (const sku of sourceSkus) {
    const source = await prisma.catalogItem.findUnique({ where: { sku: sku } });
    if (!source) continue;
    let sourceImages = [];
    try { sourceImages = JSON.parse(source.images || '[]'); } catch(e){}
    targetImages = targetImages.concat(sourceImages);
    await prisma.projectItem.updateMany({ where: { catalogItemId: source.id }, data: { catalogItemId: target.id } });
    await prisma.catalogItem.delete({ where: { id: source.id } });
    console.log('Merged ' + sku + ' into ' + targetSku);
  }
  
  const uniqueImages = [...new Set(targetImages)];
  await prisma.catalogItem.update({
    where: { id: target.id },
    data: { images: JSON.stringify(uniqueImages), ...(newName && { nameAr: newName }) }
  });
  console.log('Updated ' + targetSku + ' successfully!');
}

async function run() {
  console.log('Merging Grid 3 items...');
  // 1. Grey Comfy Chair (Wheels, Spider, Sled bases) -> CHA-CON-0029, 30, 31
  await mergeProducts('CHA-CON-0029', ['CHA-CON-0030', 'CHA-CON-0031'], 'كرسي قماش رمادي (خيارات قاعدة متعددة)');
  
  // 2. Leather Chair (Brown/Orange, Wheels/Sled) -> CHA-CON-0039, 40, 41, 42
  await mergeProducts('CHA-CON-0039', ['CHA-CON-0040', 'CHA-CON-0041', 'CHA-CON-0042'], 'كرسي جلد فاخر (بني/برتقالي - خيارات قاعدة متعددة)');
  
  // 3. Bar Stools (Black, Yellow, Blue, Red) -> CHA-COU-0001, 0002, 0003, 0004
  await mergeProducts('CHA-COU-0001', ['CHA-COU-0002', 'CHA-COU-0003', 'CHA-COU-0004'], 'كرسي بار معدني (متعدد الألوان)');
  
  // 4. Black Low-Back Mesh (Straight and Angled) -> CHA-MES-0002, 0003
  await mergeProducts('CHA-MES-0002', ['CHA-MES-0003']);
  
  // 5. Mesh Guest Chair (Black straight, Black angled, Blue) -> CHA-MES-0004, 0005, 0006
  await mergeProducts('CHA-MES-0004', ['CHA-MES-0005', 'CHA-MES-0006'], 'كرسي زوار شبك (أسود/أزرق)');
  
  // 6. Ergonomic Headrest Chair (Grey, Black, Grey angled) -> CHA-MES-0007, 0008, 0009
  await mergeProducts('CHA-MES-0007', ['CHA-MES-0008', 'CHA-MES-0009'], 'كرسي مدير شبك طبي (أسود/رمادي)');
  
  // 7. Mesh Guest Chair Model 2 (Black, Red, Black angled) -> CHA-MES-0010, 0011, 0012
  await mergeProducts('CHA-MES-0010', ['CHA-MES-0011', 'CHA-MES-0012'], 'كرسي زوار شبك موديل 2 (أسود/أحمر)');
  
  // 8. Employee Mesh Chair (Green/Black, Orange/White, Grey/White) -> CHA-MES-0013, 0014, 0015
  await mergeProducts('CHA-MES-0013', ['CHA-MES-0014', 'CHA-MES-0015'], 'كرسي موظف شبك (أخضر/برتقالي/رمادي)');
}

run().catch(console.error).finally(() => process.exit());
