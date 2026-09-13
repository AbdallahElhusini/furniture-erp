import { prisma } from './src/lib/db.js';

async function check() {
  const items = await prisma.catalogItem.findMany({
    select: { id: true, nameAr: true, sku: true, images: true }
  });
  
  const sofaSets = items.filter(i => i.nameAr.includes('صوفا') || i.nameAr.includes('كرسي') || i.nameAr.includes('كنب'));
  console.log('Found ' + sofaSets.length + ' items containing صوفا or كرسي or كنب.');
  sofaSets.forEach(s => console.log('  ', s.id, s.sku, s.nameAr, s.images));
}
check().catch(console.error).finally(() => process.exit());
