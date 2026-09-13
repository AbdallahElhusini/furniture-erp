const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(function(file) {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(file));
        } else if (file.endsWith('.tsx')) {
            results.push(file);
        }
    });
    return results;
}

const files = walk('./src/app/admin');

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    
    // Replace colors
    content = content.replace(/#1e3a5f/g, '#0f172a');
    content = content.replace(/#132847/g, '#0f172a');
    content = content.replace(/#2c5282/g, '#1e293b');
    content = content.replace(/#d4a843/g, '#c5a975');
    content = content.replace(/#b8912e/g, '#a88a53');
    content = content.replace(/#e6c875/g, '#d6c098');
    
    // Replace heavy gradients with solid elegant colors
    content = content.replace(/bg-gradient-to-[a-z]+ from-\[#0f172a\] to-\[#0f172a\]/g, 'bg-[#0f172a]');
    content = content.replace(/bg-gradient-to-[a-z]+ from-\[#c5a975\] to-\[#a88a53\]/g, 'bg-[#0f172a] hover:bg-[#c5a975] text-white');
    
    // Sharpen borders for elegance
    content = content.replace(/rounded-3xl/g, 'rounded-xl');
    content = content.replace(/rounded-2xl/g, 'rounded-lg');
    content = content.replace(/rounded-xl/g, 'rounded-md');
    
    // Remove heavy shadows
    content = content.replace(/shadow-xl/g, 'shadow-sm');
    content = content.replace(/shadow-lg/g, 'shadow-sm');
    content = content.replace(/shadow-md/g, 'shadow-sm');

    fs.writeFileSync(file, content, 'utf8');
});
console.log('Done replacing colors and styles in admin.');
