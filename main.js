const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    title: "My Custom Code Editor",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.loadFile('index.html');
}

app.whenReady().then(createWindow);

// File Open Handler
ipcMain.handle('dialog:openFile', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile']
  });
  if (canceled || filePaths.length === 0) return null;
  const content = fs.readFileSync(filePaths[0], 'utf-8');
  return { content, filePath: filePaths[0] };
});

// File Save Handler
ipcMain.handle('dialog:saveFile', async (event, { filePath, content }) => {
  let targetPath = filePath;
  if (!targetPath) {
    const { canceled, filePath: savePath } = await dialog.showSaveDialog();
    if (canceled) return null;
    targetPath = savePath;
  }
  fs.writeFileSync(targetPath, content, 'utf-8');
  return targetPath;
});