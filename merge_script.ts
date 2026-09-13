import { prisma } from './src/lib/db.js';
import fs from 'fs';
import path from 'path';

async function mergeDuplicates() {
  const items = await prisma.catalogItem.findMany({
    select: { id: true, nameAr: true, images: true, categoryId: true, sellingPrice: true, costPrice: true }
  });
  
  const sizeMap = new Map();
  items.forEach(item => {
    let imgs = [];
    try {
      imgs = JSON.parse(item.images || '[]');
    } catch(e){}
    
    if (imgs.length > 0) {
      const fullPath = path.join(process.cwd(), 'public', imgs[0]);
      if (fs.existsSync(fullPath)) {
        const size = fs.statSync(fullPath).size;
        if (!sizeMap.has(size)) sizeMap.set(size, []);
        sizeMap.get(size).push(item);
      }
    }
  });
  
  const duplicates = Array.from(sizeMap.entries()).filter(([k, v]) => v.length > 1);
  let mergedCount = 0;
  
  for (const [size, group] of duplicates) {
    const keptItem = group[0];
    const duplicatesToRemove = group.slice(1);
    
    for (const dup of duplicatesToRemove) {
      await prisma.projectItem.updateMany({
        where: { catalogItemId: dup.id },
        data: { catalogItemId: keptItem.id }
      });
      
      try {
        await prisma.catalogItem.delete({ where: { id: dup.id } });
        mergedCount++;
      } catch (e) {
        console.error('Failed to delete item', dup.id, e.message);
      }
    }
  }
  
  console.log('Merged ' + mergedCount + ' duplicate products based on image similarity.');
  
  const sofa1 = await prisma.catalogItem.findUnique({ where: { sku: 'SFA-001' } });
  const sofa2 = await prisma.catalogItem.findUnique({ where: { sku: 'SFA-002' } });
  const chair1 = await prisma.catalogItem.findUnique({ where: { sku: 'WCH-001' } });
  const chair2 = await prisma.catalogItem.findUnique({ where: { sku: 'WCH-002' } });
  
  if (sofa1 && sofa2) {
     const newSofaSet = await prisma.catalogItem.create({
       data: {
         nameAr: 'طقم كنبة استقبال (3 مقاعد + كرسي مفرد)',
         nameEn: 'Reception Sofa Set (3-Seater + Single)',
         sku: 'SFA-SET-001',
         categoryId: sofa1.categoryId,
         costPrice: sofa1.costPrice + sofa2.costPrice,
         sellingPrice: sofa1.sellingPrice + sofa2.sellingPrice,
         images: JSON.stringify([...JSON.parse(sofa1.images || '[]'), ...JSON.parse(sofa2.images || '[]')]),
       }
     });
     console.log('Created merged Sofa Set:', newSofaSet.nameAr);
  }

  if (chair1 && chair2) {
     const newChairSet = await prisma.catalogItem.create({
       data: {
         nameAr: 'طقم كراسي انتظار (3 مقاعد + فردي)',
         nameEn: 'Waiting Chairs Set (3-Seater + Single)',
         sku: 'WCH-SET-001',
         categoryId: chair1.categoryId,
         costPrice: chair1.costPrice + chair2.costPrice,
         sellingPrice: chair1.sellingPrice + chair2.sellingPrice,
         images: JSON.stringify([...JSON.parse(chair1.images || '[]'), ...JSON.parse(chair2.images || '[]')]),
       }
     });
     console.log('Created merged Chair Set:', newChairSet.nameAr);
  }
}

mergeDuplicates().catch(console.error).finally(() => process.exit());
