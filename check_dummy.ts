import { prisma } from './src/lib/db.js';

async function check() {
  const items = await prisma.catalogItem.findMany({
    select: { id: true, nameAr: true, images: true, sku: true }
  });
  
  let dummyCount = 0;
  items.forEach(item => {
    let imgs = [];
    try { imgs = JSON.parse(item.images || '[]'); } catch(e){}
    if (imgs.length === 0) dummyCount++;
  });
  
  console.log('Found ' + dummyCount + ' dummy items with no images.');
  
  console.log('Sample items:');
  items.slice(50, 70).forEach(i => {
    console.log(i.id + ' | ' + i.sku + ' | ' + i.nameAr + ' | ' + i.images);
  });
}
check().catch(console.error).finally(() => process.exit());
