import * as monaco from 'monaco-editor';

const { ipcRenderer } = require('electron');
const path = require('path');

// State Management
let editor = null;
let activeTabId = null;
let tabs = []; // { id, name, filePath, content, isDirty, language, model }
let currentFolderPath = null;
let autoSaveEnabled = false;
let autoSaveTimer = null;

// File Extension to Monaco Language Mapping
const EXTENSION_MAP = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  html: 'html', htm: 'html',
  css: 'css', scss: 'css', less: 'css',
  json: 'json',
  py: 'python', pyw: 'python',
  md: 'markdown', markdown: 'markdown',
  cpp: 'cpp', c: 'cpp', h: 'cpp', hpp: 'cpp',
  cs: 'csharp',
  java: 'java',
  rs: 'rust',
  go: 'go',
  sql: 'sql',
  sh: 'shell', bash: 'shell', zsh: 'shell',
  yaml: 'yaml', yml: 'yaml',
  xml: 'xml', svg: 'xml',
  txt: 'plaintext', log: 'plaintext'
};

// SVG Icon Helpers
const SVG_ICONS = {
  folder: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
  fileCode: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><polyline points="10 13 8 15 10 17"/><polyline points="14 13 16 15 14 17"/></svg>`,
  close: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`
};

// DOM Elements
let editorContainer, emptyState, tabsBar, fileTreeContainer;
let statusPos, statusLength, statusAutoSave, selectLanguage, selectTheme;
let modalOverlay, modalTitle, modalInput, modalCancel, modalConfirm;
let onModalSubmitCallback = null;

// Initialize Editor
function initEditor() {
  // Offline Monaco Environment Setup
  window.MonacoEnvironment = {
    getWorkerUrl: function () {
      return `data:text/javascript;charset=utf-8,${encodeURIComponent('self.onmessage = function() {};')}`;
    }
  };

  editorContainer = document.getElementById('editor-container');
  emptyState = document.getElementById('empty-state');
  tabsBar = document.getElementById('tabs-bar');
  fileTreeContainer = document.getElementById('file-tree');

  statusPos = document.getElementById('statusPos');
  statusLength = document.getElementById('statusLength');
  statusAutoSave = document.getElementById('statusAutoSave');
  selectLanguage = document.getElementById('selectLanguage');
  selectTheme = document.getElementById('selectTheme');

  modalOverlay = document.getElementById('modal-overlay');
  modalTitle = document.getElementById('modalTitle');
  modalInput = document.getElementById('modalInput');
  modalCancel = document.getElementById('modalCancel');
  modalConfirm = document.getElementById('modalConfirm');

  // Create Monaco Editor Instance
  editor = monaco.editor.create(editorContainer, {
    value: '',
    language: 'javascript',
    theme: 'vs-dark',
    fontSize: 14,
    fontFamily: "'Fira Code', 'Cascadia Code', Consolas, 'Courier New', monospace",
    automaticLayout: true,
    minimap: { enabled: true },
    scrollBeyondLastLine: false,
    smoothScrolling: true,
    cursorBlinking: 'smooth',
    cursorSmoothCaretAnimation: 'on',
    renderLineHighlight: 'all',
    bracketPairColorization: { enabled: true },
    tabSize: 2,
    insertSpaces: true,
    wordWrap: 'on'
  });

  // Track Cursor and Selection changes
  editor.onDidChangeCursorPosition((e) => {
    if (statusPos) {
      statusPos.innerText = `Ln ${e.position.lineNumber}, Col ${e.position.column}`;
    }
  });

  // Track Content changes
  editor.onDidChangeModelContent(() => {
    updateEditorStats();
    if (activeTabId) {
      const activeTab = tabs.find(t => t.id === activeTabId);
      if (activeTab) {
        activeTab.content = editor.getValue();
        if (!activeTab.isDirty) {
          activeTab.isDirty = true;
          renderTabs();
        }
      }
    }

    if (autoSaveEnabled) {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = setTimeout(() => {
        saveActiveTab();
      }, 1000);
    }
  });

  setupEventListeners();
  updateEmptyState();
}

// Update Cursor & Stats
function updateEditorStats() {
  if (!editor || !statusLength) return;
  const model = editor.getModel();
  if (!model) return;
  const lineCount = model.getLineCount();
  const charCount = model.getValueLength();
  statusLength.innerText = `${lineCount} lines, ${charCount} chars`;
}

// Tab Management
function createNewTab(title = 'Untitled', content = '', filePath = null, language = 'javascript') {
  const tabId = 'tab_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
  const detectedLanguage = filePath ? detectLanguage(filePath) : language;

  const model = monaco.editor.createModel(content, detectedLanguage);

  const tab = {
    id: tabId,
    name: title,
    filePath,
    content,
    isDirty: false,
    language: detectedLanguage,
    model
  };

  tabs.push(tab);
  switchTab(tabId);
  renderTabs();
  updateEmptyState();
}

function switchTab(tabId) {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return;

  activeTabId = tabId;
  editor.setModel(tab.model);
  if (selectLanguage) selectLanguage.value = tab.language;

  updateEditorStats();
  renderTabs();
  updateEmptyState();
  editor.focus();
}

function closeTab(tabId, e) {
  if (e) e.stopPropagation();
  const index = tabs.findIndex(t => t.id === tabId);
  if (index === -1) return;

  const tabToClose = tabs[index];
  tabToClose.model.dispose(); // Free memory
  tabs.splice(index, 1);

  if (activeTabId === tabId) {
    if (tabs.length > 0) {
      const nextTab = tabs[Math.max(0, index - 1)];
      switchTab(nextTab.id);
    } else {
      activeTabId = null;
      renderTabs();
      updateEmptyState();
    }
  } else {
    renderTabs();
  }
}

function renderTabs() {
  if (!tabsBar) return;
  tabsBar.innerHTML = '';
  tabs.forEach(tab => {
    const tabEl = document.createElement('div');
    tabEl.className = `tab ${tab.id === activeTabId ? 'active' : ''}`;

    const titleEl = document.createElement('span');
    titleEl.className = 'tab-title';
    titleEl.innerText = tab.name;

    tabEl.appendChild(titleEl);

    if (tab.isDirty) {
      const dirtyEl = document.createElement('span');
      dirtyEl.className = 'dirty-dot';
      tabEl.appendChild(dirtyEl);
    }

    const closeBtn = document.createElement('span');
    closeBtn.className = 'tab-close';
    closeBtn.innerHTML = SVG_ICONS.close;
    closeBtn.addEventListener('click', (e) => closeTab(tab.id, e));
    tabEl.appendChild(closeBtn);

    tabEl.addEventListener('click', () => switchTab(tab.id));
    tabsBar.appendChild(tabEl);
  });
}

function updateEmptyState() {
  if (!emptyState) return;
  if (tabs.length === 0) {
    emptyState.style.display = 'flex';
  } else {
    emptyState.style.display = 'none';
  }
}

// Detect language from path
function detectLanguage(filePath) {
  if (!filePath) return 'plaintext';
  const ext = path.extname(filePath).toLowerCase().replace('.', '');
  return EXTENSION_MAP[ext] || 'plaintext';
}

// Save active tab
async function saveActiveTab() {
  if (!activeTabId) return;
  const activeTab = tabs.find(t => t.id === activeTabId);
  if (!activeTab) return;

  const res = await ipcRenderer.invoke('dialog:saveFile', {
    filePath: activeTab.filePath,
    content: activeTab.content
  });

  if (res && res.filePath) {
    activeTab.filePath = res.filePath;
    activeTab.name = res.name;
    activeTab.isDirty = false;
    renderTabs();
    if (currentFolderPath) refreshWorkspaceFolder();
  }
}

// Open File Dialog
async function handleOpenFile() {
  const res = await ipcRenderer.invoke('dialog:openFile');
  if (res && !res.error) {
    const existing = tabs.find(t => t.filePath === res.filePath);
    if (existing) {
      switchTab(existing.id);
    } else {
      createNewTab(res.name, res.content, res.filePath);
    }
  }
}

// Open Folder Workspace
async function handleOpenFolder() {
  const res = await ipcRenderer.invoke('dialog:openFolder');
  if (res && res.folderPath) {
    currentFolderPath = res.folderPath;
    renderDirectoryTree(res.tree, res.folderName);
  }
}

async function refreshWorkspaceFolder() {
  if (!currentFolderPath) return;
  const res = await ipcRenderer.invoke('fs:readDir', currentFolderPath);
  if (res && res.tree) {
    renderDirectoryTree(res.tree, path.basename(currentFolderPath));
  }
}

// Render File Tree Sidebar
function renderDirectoryTree(treeItems, rootName) {
  if (!fileTreeContainer) return;
  fileTreeContainer.innerHTML = '';
  const rootHeader = document.createElement('div');
  rootHeader.style.padding = '8px 14px';
  rootHeader.style.fontWeight = 'bold';
  rootHeader.style.fontSize = '12px';
  rootHeader.style.color = '#38bdf8';
  rootHeader.style.display = 'flex';
  rootHeader.style.alignItems = 'center';
  rootHeader.style.gap = '8px';
  rootHeader.innerHTML = `${SVG_ICONS.folder} <span>${rootName}</span>`;
  fileTreeContainer.appendChild(rootHeader);

  function appendItems(items, container, depth = 0) {
    items.forEach(item => {
      const itemEl = document.createElement('div');
      itemEl.className = 'tree-item';

      const indent = document.createElement('span');
      indent.style.width = `${depth * 12}px`;
      itemEl.appendChild(indent);

      const icon = document.createElement('span');
      icon.innerHTML = item.isFolder ? SVG_ICONS.folder : SVG_ICONS.fileCode;
      itemEl.appendChild(icon);

      const label = document.createElement('span');
      label.innerText = item.name;
      itemEl.appendChild(label);

      if (!item.isFolder) {
        itemEl.addEventListener('click', async () => {
          const existing = tabs.find(t => t.filePath === item.path);
          if (existing) {
            switchTab(existing.id);
          } else {
            const fileData = await ipcRenderer.invoke('dialog:openFile', item.path);
            if (fileData && fileData.content !== undefined) {
              createNewTab(item.name, fileData.content, item.path);
            }
          }
        });
      } else {
        itemEl.addEventListener('click', () => {
          const subContainer = itemEl.nextElementSibling;
          if (subContainer && subContainer.classList.contains('folder-children')) {
            subContainer.style.display = subContainer.style.display === 'none' ? 'block' : 'none';
          }
        });
      }

      container.appendChild(itemEl);

      if (item.isFolder && item.children) {
        const subContainer = document.createElement('div');
        subContainer.className = 'folder-children';
        appendItems(item.children, subContainer, depth + 1);
        container.appendChild(subContainer);
      }
    });
  }

  appendItems(treeItems, fileTreeContainer, 1);
}

// Modal Prompt helper
function showModal(title, placeholder, defaultValue, onSubmit) {
  modalTitle.innerText = title;
  modalInput.placeholder = placeholder;
  modalInput.value = defaultValue || '';
  modalOverlay.classList.add('active');
  modalInput.focus();
  onModalSubmitCallback = onSubmit;
}

function closeModal() {
  modalOverlay.classList.remove('active');
  onModalSubmitCallback = null;
}

// Event Listeners setup
function setupEventListeners() {
  document.getElementById('btnNewFile')?.addEventListener('click', () => createNewTab());
  document.getElementById('btnOpenFile')?.addEventListener('click', handleOpenFile);
  document.getElementById('btnOpenFolder')?.addEventListener('click', handleOpenFolder);
  document.getElementById('btnSaveFile')?.addEventListener('click', saveActiveTab);

  document.getElementById('emptyBtnNew')?.addEventListener('click', () => createNewTab());
  document.getElementById('emptyBtnOpen')?.addEventListener('click', handleOpenFile);

  document.getElementById('btnRefreshFolder')?.addEventListener('click', refreshWorkspaceFolder);
  document.getElementById('btnSidebarNewFile')?.addEventListener('click', () => {
    if (!currentFolderPath) {
      createNewTab();
    } else {
      showModal('Create New File', 'filename.js', '', async (filename) => {
        if (!filename) return;
        const res = await ipcRenderer.invoke('fs:createItem', {
          parentDir: currentFolderPath,
          name: filename,
          isFolder: false
        });
        if (res && res.success) {
          refreshWorkspaceFolder();
          createNewTab(filename, '', res.targetPath);
        }
      });
    }
  });

  // Code Formatter
  document.getElementById('btnFormatCode')?.addEventListener('click', () => {
    if (editor) {
      editor.getAction('editor.action.formatDocument')?.run();
    }
  });

  // Language Selector
  selectLanguage?.addEventListener('change', (e) => {
    const lang = e.target.value;
    if (activeTabId) {
      const activeTab = tabs.find(t => t.id === activeTabId);
      if (activeTab) {
        activeTab.language = lang;
        monaco.editor.setModelLanguage(activeTab.model, lang);
      }
    }
  });

  // Theme Selector
  selectTheme?.addEventListener('change', (e) => {
    monaco.editor.setTheme(e.target.value);
  });

  // Toggle Auto-Save
  statusAutoSave?.addEventListener('click', () => {
    autoSaveEnabled = !autoSaveEnabled;
    statusAutoSave.innerText = `Auto-Save: ${autoSaveEnabled ? 'On' : 'Off'}`;
    statusAutoSave.style.color = autoSaveEnabled ? '#10b981' : '#38bdf8';
  });

  // Modal Handlers
  modalCancel?.addEventListener('click', closeModal);
  modalConfirm?.addEventListener('click', () => {
    if (onModalSubmitCallback) onModalSubmitCallback(modalInput.value);
    closeModal();
  });
  modalInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      if (onModalSubmitCallback) onModalSubmitCallback(modalInput.value);
      closeModal();
    } else if (e.key === 'Escape') {
      closeModal();
    }
  });

  // Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 'n':
          e.preventDefault();
          createNewTab();
          break;
        case 'o':
          e.preventDefault();
          handleOpenFile();
          break;
        case 's':
          e.preventDefault();
          saveActiveTab();
          break;
        case 'w':
          e.preventDefault();
          if (activeTabId) closeTab(activeTabId);
          break;
      }
    }
  });
}

// Initialize on DOM load
window.addEventListener('DOMContentLoaded', initEditor);
