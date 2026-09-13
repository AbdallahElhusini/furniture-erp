import { prisma } from './src/lib/db.js';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

async function createGrid3() {
  const items = await prisma.catalogItem.findMany({
    where: { isActive: true },
    select: { id: true, images: true, nameAr: true },
  });
  
  const validItems = [];
  for (const item of items) {
    let imgs = [];
    try { imgs = JSON.parse(item.images || '[]'); } catch(e){}
    if (imgs.length > 0) {
      const fullPath = path.join(process.cwd(), 'public', imgs[0]);
      if (fs.existsSync(fullPath)) {
        validItems.push({ id: item.id, path: fullPath, name: item.nameAr });
      }
    }
  }
  
  // Grid 3: skip 72
  const sliced = validItems.slice(72, 108);
  if (sliced.length === 0) return;
  
  const tileSize = 200;
  const cols = 6;
  const rows = Math.ceil(sliced.length / cols);
  
  const composites = [];
  
  for (let i = 0; i < sliced.length; i++) {
    const item = sliced[i];
    const x = (i % cols) * tileSize;
    const y = Math.floor(i / cols) * tileSize;
    
    console.log('Index ' + i + ' -> ID: ' + item.id + ' | Name: ' + item.name);
    
    const resized = await sharp(item.path)
      .resize(tileSize - 10, tileSize - 10, { fit: 'contain', background: {r:255,g:255,b:255,alpha:1} })
      .flatten({ background: '#ffffff' })
      .toBuffer();
      
    composites.push({
      input: resized,
      top: y + 5,
      left: x + 5
    });
  }
  
  await sharp({
    create: {
      width: cols * tileSize,
      height: rows * tileSize,
      channels: 3,
      background: { r: 200, g: 200, b: 200 }
    }
  })
  .composite(composites)
  .toFile('grid_3.jpg');
}
createGrid3().catch(console.error).finally(() => process.exit());
