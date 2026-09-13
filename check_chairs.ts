import { prisma } from './src/lib/db.js';

async function checkChairs() {
  const items = await prisma.catalogItem.findMany({
    where: { isActive: true },
    select: { id: true, images: true, nameAr: true, sku: true },
  });
  
  const validItems = [];
  for (const item of items) {
    let imgs = [];
    try { imgs = JSON.parse(item.images || '[]'); } catch(e){}
    if (imgs.length > 0) {
      validItems.push(item);
    }
  }
  
  const sliced = validItems.slice(36, 72);
  sliced.forEach((item, i) => {
    console.log('Index ' + i + ' -> ID: ' + item.id + ' | SKU: ' + item.sku + ' | Name: ' + item.nameAr);
  });
}
checkChairs().catch(console.error).finally(() => process.exit());
