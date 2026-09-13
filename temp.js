
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const count = await prisma.catalogItem.deleteMany({
    where: { images: '[]' }
  });
  console.log('Deleted products without images:', count.count);
  
  const products = await prisma.catalogItem.findMany({ take: 8 });
  for (const p of products) {
    await prisma.catalogItem.update({
      where: { id: p.id },
      data: { isFeatured: true }
    });
  }
  console.log('Set 8 products to featured');
}
run().catch(console.error);

