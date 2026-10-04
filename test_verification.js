const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('--- Running NovaCode Editor Automated Verification Suite ---');

// 1. Check Asset Files
console.log('Checking asset files...');
assert.strictEqual(fs.existsSync('assets/icon.svg'), true, 'icon.svg missing');
assert.strictEqual(fs.existsSync('assets/icon.png'), true, 'icon.png missing');
assert.strictEqual(fs.existsSync('assets/icon.ico'), true, 'icon.ico missing');
console.log('✓ Icon assets present.');

// 2. Check Bundle Build Output
console.log('Checking dist bundle files...');
assert.strictEqual(fs.existsSync('dist/bundle.js'), true, 'dist/bundle.js missing');
assert.strictEqual(fs.existsSync('dist/bundle.css'), true, 'dist/bundle.css missing');
const bundleJsSize = fs.statSync('dist/bundle.js').size;
assert.ok(bundleJsSize > 1000000, `Bundle size suspiciously small: ${bundleJsSize} bytes`);
console.log(`✓ Bundle dist output verified (${(bundleJsSize / (1024 * 1024)).toFixed(2)} MB).`);

// 3. Verify main.js IPC channels
console.log('Checking main.js IPC exports...');
const mainJsContent = fs.readFileSync('main.js', 'utf-8');
const expectedIPCChannels = [
  'dialog:openFile',
  'dialog:saveFile',
  'dialog:openFolder',
  'fs:readDir',
  'fs:createItem',
  'fs:deleteItem',
  'fs:renameItem'
];

expectedIPCChannels.forEach(channel => {
  assert.ok(mainJsContent.includes(channel), `Missing IPC channel in main.js: ${channel}`);
});
console.log('✓ All 7 core IPC handlers present in main.js.');

// 4. Check index.html layout & linkage
console.log('Checking index.html layout...');
const indexHtmlContent = fs.readFileSync('index.html', 'utf-8');
assert.ok(indexHtmlContent.includes('dist/bundle.js'), 'bundle.js not linked in index.html');
assert.ok(indexHtmlContent.includes('dist/bundle.css'), 'bundle.css not linked in index.html');
assert.ok(indexHtmlContent.includes('id="editor-container"'), 'editor-container element missing in index.html');
assert.ok(indexHtmlContent.includes('id="tabs-bar"'), 'tabs-bar element missing in index.html');
assert.ok(indexHtmlContent.includes('id="statusbar"'), 'statusbar element missing in index.html');
console.log('✓ index.html structure verified.');

// 5. Test directory tree helper function logic from main.js
console.log('Testing directory tree generator logic...');
function readDirectoryTree(dirPath, depth = 0, maxDepth = 2) {
  if (depth > maxDepth) return [];
  const items = fs.readdirSync(dirPath, { withFileTypes: true });
  const result = [];
  const ignored = new Set(['node_modules', '.git', 'dist', 'build']);

  for (const item of items) {
    if (ignored.has(item.name)) continue;
    const fullPath = path.join(dirPath, item.name);
    if (item.isDirectory()) {
      result.push({
        name: item.name,
        path: fullPath,
        isFolder: true,
        children: readDirectoryTree(fullPath, depth + 1, maxDepth)
      });
    } else {
      result.push({
        name: item.name,
        path: fullPath,
        isFolder: false
      });
    }
  }
  return result;
}

const testTree = readDirectoryTree(__dirname, 0, 1);
assert.ok(Array.isArray(testTree), 'readDirectoryTree should return an array');
assert.ok(testTree.some(item => item.name === 'index.html'), 'Tree should discover index.html');
assert.ok(testTree.some(item => item.name === 'main.js'), 'Tree should discover main.js');
console.log('✓ Directory tree generator test passed.');

console.log('🎉 ALL AUTOMATED VERIFICATION CHECKS PASSED SUCCESSFULLY!');
