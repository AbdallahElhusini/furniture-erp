import { prisma } from './src/lib/db.js';

async function deleteDummies() {
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
    const res = await prisma.catalogItem.deleteMany({
      where: { id: { in: dummyIds } }
    });
    console.log('Deleted ' + res.count + ' dummy items.');
  } else {
    console.log('No dummy items found.');
  }
}
deleteDummies().catch(console.error).finally(() => process.exit());
