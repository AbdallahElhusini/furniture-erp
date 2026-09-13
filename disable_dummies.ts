import { prisma } from './src/lib/db.js';

async function disableDummies() {
  const items = await prisma.catalogItem.findMany({
    select: { id: true, images: true }
  });
  
  const dummyIds = [];
  items.forEach(item => {
    let imgs = [];
    try { imgs = JSON.parse(item.images || '[]'); } catch(e){}
    if (imgs.length === 0) dummyIds.push(item.id);
  });
  
  if (dummyIds.length > 0) {
    const res = await prisma.catalogItem.updateMany({
      where: { id: { in: dummyIds } },
      data: { isActive: false }
    });
    console.log('Disabled ' + res.count + ' dummy items.');
  } else {
    console.log('No dummy items found.');
  }
}
disableDummies().catch(console.error).finally(() => process.exit());
