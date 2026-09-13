// @ts-nocheck
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import prisma from '../src/lib/db';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const sourceDir = path.join(__dirname, '../src/assets/Hatab');
  const targetDir = path.join(__dirname, '../public/uploads/catalog');
  
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  function getFiles(dir) {
    const dirents = fs.readdirSync(dir, { withFileTypes: true });
    const files = dirents.map((dirent) => {
      const res = path.resolve(dir, dirent.name);
      return dirent.isDirectory() ? getFiles(res) : res;
    });
    return Array.prototype.concat(...files);
  }

  console.log('Reading files from', sourceDir);
  const allFiles = getFiles(sourceDir).filter(f => f.match(/\.(png|jpe?g|webp)$/i));
  console.log(`Found ${allFiles.length} image files to import.`);

  let categoryCounters = {};
  
  for (const file of allFiles) {
    const relPath = path.relative(sourceDir, file);
    const parts = relPath.split(path.sep);
    const fileName = parts.pop(); // remove file name
    
    let catNameEn = parts.join(' - ');
    if (!catNameEn) catNameEn = 'Uncategorized';
    
    const slug = catNameEn.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    
    let category = await prisma.category.findUnique({ where: { slug } });
    if (!category) {
      category = await prisma.category.create({
        data: {
          nameEn: catNameEn,
          nameAr: catNameEn, // Dummy name, user will edit
          slug: slug
        }
      });
      console.log(`Created category: ${catNameEn}`);
    }

    // SKU System: Prefix from category name parts
    const prefix = parts.map(p => p.replace(/[^A-Za-z]/g, '').substring(0, 3).toUpperCase()).join('-');
    const skuPrefix = prefix || 'GEN';
    
    if (categoryCounters[skuPrefix] === undefined) {
       const existing = await prisma.catalogItem.findMany({
         where: { sku: { startsWith: skuPrefix + '-' } },
         orderBy: { sku: 'desc' },
         take: 1
       });
       if (existing.length > 0) {
         const lastNum = parseInt(existing[0].sku.split('-').pop());
         categoryCounters[skuPrefix] = isNaN(lastNum) ? 0 : lastNum;
       } else {
         categoryCounters[skuPrefix] = 0;
       }
    }
    
    categoryCounters[skuPrefix]++;
    const skuNum = categoryCounters[skuPrefix].toString().padStart(4, '0');
    const sku = `${skuPrefix}-${skuNum}`;
    
    // target file
    const ext = path.extname(fileName).toLowerCase();
    const targetFile = `${sku}${ext}`;
    const targetPath = path.join(targetDir, targetFile);
    
    fs.copyFileSync(file, targetPath);
    
    // Insert into DB
    await prisma.catalogItem.create({
      data: {
        sku: sku,
        nameEn: `Product ${sku}`,
        nameAr: `منتج ${sku}`,
        categoryId: category.id,
        costPrice: 0,
        sellingPrice: 0,
        images: JSON.stringify([`/uploads/catalog/${targetFile}`]),
        isActive: true
      }
    });
    console.log(`Inserted product: ${sku} into ${catNameEn}`);
  }
  
  console.log('Import complete!');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
}).finally(() => {
  prisma.$disconnect();
});
// @ts-nocheck
