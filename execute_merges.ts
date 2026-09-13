import { prisma } from './src/lib/db.js';

async function mergeProducts(targetSku, sourceSkus, newName = null) {
  const target = await prisma.catalogItem.findUnique({ where: { sku: targetSku } });
  if (!target) {
    console.log('Target ' + targetSku + ' not found');
    return;
  }
  
  let targetImages = [];
  try { targetImages = JSON.parse(target.images || '[]'); } catch(e){}
  
  for (const sku of sourceSkus) {
    const source = await prisma.catalogItem.findUnique({ where: { sku: sku } });
    if (!source) continue;
    
    let sourceImages = [];
    try { sourceImages = JSON.parse(source.images || '[]'); } catch(e){}
    targetImages = targetImages.concat(sourceImages);
    
    // Update project items
    await prisma.projectItem.updateMany({
      where: { catalogItemId: source.id },
      data: { catalogItemId: target.id }
    });
    
    // Delete source
    await prisma.catalogItem.delete({ where: { id: source.id } });
    console.log('Merged ' + sku + ' into ' + targetSku);
  }
  
  // Update target
  const uniqueImages = [...new Set(targetImages)];
  await prisma.catalogItem.update({
    where: { id: target.id },
    data: { 
      images: JSON.stringify(uniqueImages),
      ...(newName && { nameAr: newName })
    }
  });
  console.log('Updated ' + targetSku + ' successfully!');
}

async function run() {
  console.log('Merging Cabinet different angles...');
  await mergeProducts('CAB-0021', ['CAB-0022']);
  await mergeProducts('CAB-0031', ['CAB-0035']);
  
  console.log('Merging Chairs - Same Model, Different Colors...');
  await mergeProducts('CHA-CON-0001', ['CHA-CON-0004', 'CHA-CON-0007'], 'كرسي مدير عالي الظهر (متعدد الألوان - برتقالي/بيج/أسود)');
  await mergeProducts('CHA-CON-0002', ['CHA-CON-0005', 'CHA-CON-0008'], 'كرسي موظف ظهر منخفض (متعدد الألوان - برتقالي/بيج/أسود)');
  await mergeProducts('CHA-CON-0003', ['CHA-CON-0006', 'CHA-CON-0009'], 'كرسي زوار ثابت (متعدد الألوان - برتقالي/بيج/أسود)');
  
  await mergeProducts('CHA-CON-0013', ['CHA-CON-0016'], 'كرسي مدير جلد كلاسيك (بني/كريمي)');
  await mergeProducts('CHA-CON-0014', ['CHA-CON-0017'], 'كرسي موظف جلد كلاسيك (بني/كريمي)');
}

run().catch(console.error).finally(() => process.exit());
