const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 800,
    minHeight: 600,
    title: "NovaCode Editor",
    icon: path.join(__dirname, 'assets', 'icon.png'),
    backgroundColor: '#0f172a',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false
    }
  });

  Menu.setApplicationMenu(null);
  mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// File Open Handler (supports direct path or dialog picker)
ipcMain.handle('dialog:openFile', async (event, explicitPath) => {
  let filePath = explicitPath;
  if (!filePath) {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'All Files', extensions: ['*'] },
        { name: 'JavaScript / TypeScript', extensions: ['js', 'jsx', 'ts', 'tsx', 'mjs'] },
        { name: 'Web Files', extensions: ['html', 'css', 'scss', 'json', 'xml', 'svg'] },
        { name: 'Python', extensions: ['py'] },
        { name: 'Text & Markdown', extensions: ['txt', 'md'] }
      ]
    });
    if (canceled || filePaths.length === 0) return null;
    filePath = filePaths[0];
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const stats = fs.statSync(filePath);
    return {
      filePath,
      name: path.basename(filePath),
      content,
      size: stats.size,
      mtime: stats.mtime
    };
  } catch (err) {
    return { error: err.message };
  }
});

// File Save Handler
ipcMain.handle('dialog:saveFile', async (event, { filePath, content }) => {
  let targetPath = filePath;
  if (!targetPath) {
    const { canceled, filePath: savePath } = await dialog.showSaveDialog({
      title: 'Save File',
      defaultPath: 'untitled.txt'
    });
    if (canceled) return null;
    targetPath = savePath;
  }
  try {
    fs.writeFileSync(targetPath, content, 'utf-8');
    return { filePath: targetPath, name: path.basename(targetPath) };
  } catch (err) {
    return { error: err.message };
  }
});

// Open Folder Handler
ipcMain.handle('dialog:openFolder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  if (canceled || filePaths.length === 0) return null;
  const folderPath = filePaths[0];
  return {
    folderPath,
    folderName: path.basename(folderPath),
    tree: readDirectoryTree(folderPath)
  };
});

// Read Directory Handler
ipcMain.handle('fs:readDir', async (event, folderPath) => {
  try {
    return { tree: readDirectoryTree(folderPath) };
  } catch (err) {
    return { error: err.message };
  }
});

// Create File / Folder Handler
ipcMain.handle('fs:createItem', async (event, { parentDir, name, isFolder }) => {
  const targetPath = path.join(parentDir, name);
  try {
    if (isFolder) {
      if (!fs.existsSync(targetPath)) fs.mkdirSync(targetPath, { recursive: true });
    } else {
      if (!fs.existsSync(targetPath)) fs.writeFileSync(targetPath, '', 'utf-8');
    }
    return { success: true, targetPath };
  } catch (err) {
    return { error: err.message };
  }
});

// Delete Item Handler
ipcMain.handle('fs:deleteItem', async (event, itemPath) => {
  try {
    const stat = fs.statSync(itemPath);
    if (stat.isDirectory()) {
      fs.rmSync(itemPath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(itemPath);
    }
    return { success: true };
  } catch (err) {
    return { error: err.message };
  }
});

// Rename Item Handler
ipcMain.handle('fs:renameItem', async (event, { oldPath, newPath }) => {
  try {
    fs.renameSync(oldPath, newPath);
    return { success: true };
  } catch (err) {
    return { error: err.message };
  }
});

// Helper function to read directory contents recursively up to depth
function readDirectoryTree(dirPath, depth = 0, maxDepth = 4) {
  if (depth > maxDepth) return [];
  try {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    const result = [];

    const ignored = new Set(['node_modules', '.git', '.DS_Store', 'dist', 'build', '.idea', '.vscode']);

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

    result.sort((a, b) => {
      if (a.isFolder === b.isFolder) return a.name.localeCompare(b.name);
      return a.isFolder ? -1 : 1;
    });

    return result;
  } catch (err) {
    return [];
  }
}
