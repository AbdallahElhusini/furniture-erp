const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const items = await prisma.catalogItem.findMany({
    select: { id: true, nameAr: true, nameEn: true, images: true, category: { select: { nameAr: true } } }
  });
  console.log('Total items:', items.length);
  
  // Try to find items with exact same names
  const nameMap = new Map();
  items.forEach(item => {
    if (!nameMap.has(item.nameAr)) nameMap.set(item.nameAr, []);
    nameMap.get(item.nameAr).push(item.id);
  });
  
  const duplicates = Array.from(nameMap.entries()).filter(([k, v]) => v.length > 1);
  console.log('Found ' + duplicates.length + ' names that are duplicated.');
  if (duplicates.length > 0) {
    console.log(duplicates.slice(0, 5));
  }
  
  // Try to find sets
  const sofaSets = items.filter(i => i.nameAr.includes('صوفا') || i.nameAr.includes('كرسي') || i.nameAr.includes('كنب'));
  console.log('Found ' + sofaSets.length + ' items containing صوفا or كرسي or كنب.');
}
check().catch(console.error).finally(() => process.exit());
