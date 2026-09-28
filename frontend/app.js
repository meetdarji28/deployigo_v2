function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function showPromptDialog(title, placeholder, defaultValue = '') {
  return new Promise(resolve => {
    let dialog = document.querySelector('#prompt-dialog');
    if (!dialog) {
      document.body.insertAdjacentHTML('beforeend', `
        <div id="prompt-dialog" class="modal" hidden>
          <div class="modal-card prompt-dialog-card">
            <div class="modal-head">
              <div>
                <p class="eyebrow">Deployigo Workspace</p>
                <h2 id="prompt-dialog-title">New Item</h2>
              </div>
              <button class="icon-button" id="prompt-dialog-close" type="button" aria-label="Close">×</button>
            </div>
            <form id="prompt-dialog-form">
              <input id="prompt-dialog-input" type="text" autocomplete="off" required>
              <div class="modal-actions">
                <button class="button ghost" id="prompt-dialog-cancel" type="button">Cancel</button>
                <button class="button" type="submit">Create</button>
              </div>
            </form>
          </div>
        </div>
      `);
      dialog = document.querySelector('#prompt-dialog');
    }
    const titleEl = document.querySelector('#prompt-dialog-title');
    const inputEl = document.querySelector('#prompt-dialog-input');
    const closeBtn = document.querySelector('#prompt-dialog-close');
    const cancelBtn = document.querySelector('#prompt-dialog-cancel');
    const formEl = document.querySelector('#prompt-dialog-form');

    titleEl.textContent = title;
    inputEl.placeholder = placeholder;
    inputEl.value = defaultValue;
    dialog.hidden = false;
    setTimeout(() => inputEl.focus(), 50);

    const closeHandler = (val) => {
      dialog.hidden = true;
      formEl.removeEventListener('submit', onSubmit);
      closeBtn.removeEventListener('click', onCancel);
      cancelBtn.removeEventListener('click', onCancel);
      resolve(val);
    };

    const onSubmit = (e) => {
      e.preventDefault();
      closeHandler(inputEl.value.trim());
    };

    const onCancel = () => {
      closeHandler(null);
    };

    formEl.addEventListener('submit', onSubmit);
    closeBtn.addEventListener('click', onCancel);
    cancelBtn.addEventListener('click', onCancel);
  });
}

function showConfirmDialog(title, message) {
  return new Promise(resolve => {
    let dialog = document.querySelector('#confirm-dialog');
    if (!dialog) {
      document.body.insertAdjacentHTML('beforeend', `
        <div id="confirm-dialog" class="modal" hidden style="z-index:2000">
          <div class="modal-card prompt-dialog-card" style="max-width:440px">
            <div class="modal-head">
              <div>
                <p class="eyebrow" style="color:var(--orange)">⚠️ Confirm Deletion</p>
                <h2 id="confirm-dialog-title">Delete File</h2>
              </div>
              <button class="icon-button" id="confirm-dialog-close" type="button" aria-label="Close">×</button>
            </div>
            <p id="confirm-dialog-message" class="muted" style="margin:12px 0 20px;font-size:14px;line-height:1.5"></p>
            <div class="modal-actions">
              <button class="button ghost" id="confirm-dialog-cancel" type="button">Cancel</button>
              <button class="button danger" id="confirm-dialog-ok" type="button">Delete</button>
            </div>
          </div>
        </div>
      `);
      dialog = document.querySelector('#confirm-dialog');
    }
    const titleEl = document.querySelector('#confirm-dialog-title');
    const msgEl = document.querySelector('#confirm-dialog-message');
    const closeBtn = document.querySelector('#confirm-dialog-close');
    const cancelBtn = document.querySelector('#confirm-dialog-cancel');
    const okBtn = document.querySelector('#confirm-dialog-ok');

    titleEl.textContent = title;
    msgEl.textContent = message;
    dialog.hidden = false;

    const cleanup = (result) => {
      dialog.hidden = true;
      closeBtn.removeEventListener('click', onCancel);
      cancelBtn.removeEventListener('click', onCancel);
      okBtn.removeEventListener('click', onOk);
      resolve(result);
    };

    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);

    closeBtn.addEventListener('click', onCancel);
    cancelBtn.addEventListener('click', onCancel);
    okBtn.addEventListener('click', onOk);
  });
}


async function load() {
  const response = await fetch('/api/me');
  if (!response.ok) return location.href = '/login.html';
  const data = await response.json();
  document.querySelector('#user').textContent = data.user.email;
  document.querySelector('#hello').textContent = `${data.user.name}'s projects.`;

  if (data.workspaceStats) {
    const usedMB = (data.workspaceStats.totalStorageBytes / (1024 * 1024)).toFixed(1);
    const statStorage = document.querySelector('#stat-storage');
    if (statStorage) statStorage.textContent = `${usedMB} MB / 5 GB`;
  }

  if (activePhpModulesProject) {
    const updated = data.projects.find(p => p.id === activePhpModulesProject.id);
    if (updated) {
      activePhpModulesProject = updated;
      const modal = document.querySelector('#php-modules-modal');
      if (modal && !modal.hidden) {
        renderPhpModulesGrid(activePhpModulesProject, document.querySelector('#ext-search-input')?.value || '');
      }
    }
  }

  const storedFileProjectId = sessionStorage.getItem('activeFileProjectId');
  if (storedFileProjectId) {
    const activeProj = data.projects.find(p => p.id === storedFileProjectId);
    if (activeProj) {
      const filesModal = document.querySelector('#files');
      if (!filesModal || filesModal.hidden) {
        await openFiles(activeProj);
      } else {
        activeFileProject = activeProj;
        await listFiles();
      }
    }
  }

  render(data.projects);
}

function getTabFromHash() {
  const hash = location.hash.replace('#', '');
  return ['overview', 'projects', 'create'].includes(hash) ? hash : 'overview';
}

function switchTab(tab, updateHash = true) {
  const createPanel = document.querySelector('#create-panel');
  const projectsSection = document.querySelector('#projects-section');
  const overviewContainer = document.querySelector('#overview-container');

  if (updateHash && location.hash !== `#${tab}`) {
    history.replaceState(null, '', `#${tab}`);
  }

  document.querySelectorAll('.tab-btn, .sidebar-link').forEach(btn => {
    if (btn.dataset.tab) btn.classList.toggle('active', btn.dataset.tab === tab);
  });

  if (tab === 'create') {
    if (createPanel) createPanel.hidden = false;
    if (projectsSection) projectsSection.hidden = true;
    if (overviewContainer) overviewContainer.hidden = true;
  } else if (tab === 'projects') {
    if (createPanel) createPanel.hidden = true;
    if (projectsSection) projectsSection.hidden = false;
    if (overviewContainer) overviewContainer.hidden = true;
  } else {
    if (createPanel) createPanel.hidden = true;
    if (projectsSection) projectsSection.hidden = false;
    if (overviewContainer) overviewContainer.hidden = false;
  }
}

let activeModalProject = null;

function openProjectModal(project) {
  activeModalProject = project;
  const modal = document.querySelector('#project-modal');
  if (!modal) return;
  document.querySelector('#modal-project-name').textContent = project.name;
  document.querySelector('#modal-detail-name').textContent = project.name;
  document.querySelector('#modal-detail-tech').textContent = project.technology || 'PHP';
  document.querySelector('#modal-detail-engine').textContent = project.phpVersion || 'PHP 8.5';
  
  let statusText = 'Active & Running';
  if (project.enabled === false) statusText = 'Disabled';
  else if (project.maintenance) statusText = 'Maintenance Mode';
  else if (project.sourceStatus && project.sourceStatus !== 'ready') statusText = project.sourceStatus;
  
  document.querySelector('#modal-detail-status').textContent = statusText;
  const urlAnchor = document.querySelector('#modal-detail-url');
  urlAnchor.textContent = project.url;
  urlAnchor.href = project.url;

  const storageElem = document.querySelector('#modal-detail-storage');
  if (storageElem) storageElem.textContent = formatBytes(project.storageBytes || 0);

  const ramElem = document.querySelector('#modal-detail-ram');
  if (ramElem) ramElem.textContent = project.ram || '1 GB';

  const cpuElem = document.querySelector('#modal-detail-cpu');
  if (cpuElem) cpuElem.textContent = project.cpu || '1 vCPU';

  document.querySelector('#modal-act-files').dataset.id = project.id;
  if (document.querySelector('#modal-act-php-config')) document.querySelector('#modal-act-php-config').dataset.id = project.id;
  if (document.querySelector('#modal-act-php-modules')) document.querySelector('#modal-act-php-modules').dataset.id = project.id;
  document.querySelector('#modal-act-edit').dataset.id = project.id;
  document.querySelector('#modal-act-rebuild').dataset.id = project.id;
  document.querySelector('#modal-act-toggle').dataset.id = project.id;
  document.querySelector('#modal-act-toggle').textContent = project.enabled === false ? 'Enable' : 'Disable';
  document.querySelector('#modal-act-maint').dataset.id = project.id;
  document.querySelector('#modal-act-maint').textContent = project.maintenance ? 'End Maintenance' : 'Maintenance Mode';
  document.querySelector('#modal-act-delete').dataset.id = project.id;

  modal.hidden = false;

}

function closeProjectModal() {
  const modal = document.querySelector('#project-modal');
  if (modal) modal.hidden = true;
}

document.querySelector('#close-project-modal')?.addEventListener('click', closeProjectModal);

let activeOpenMenuId = null;

function closeAllProjectMenus() {
  activeOpenMenuId = null;
  document.querySelectorAll('.menu-dropdown').forEach(m => m.hidden = true);
  document.querySelectorAll('.menu-trigger').forEach(t => t.classList.remove('active'));
}

function toggleProjectMenu(event, projectId) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const targetMenu = document.getElementById(`menu-${projectId}`);
  const triggerBtn = event ? event.currentTarget : null;
  const isHidden = targetMenu ? targetMenu.hidden : true;

  closeAllProjectMenus();

  if (targetMenu && isHidden) {
    activeOpenMenuId = projectId;
    targetMenu.hidden = false;
    if (triggerBtn) triggerBtn.classList.add('active');
  }
}

function showOperationProgress(title, message, durationMs = 3500) {
  return new Promise(resolve => {
    const modal = document.querySelector('#progress-modal');
    const titleEl = document.querySelector('#progress-title');
    const msgEl = document.querySelector('#progress-message');
    const barEl = document.querySelector('#progress-bar-fill');
    const textEl = document.querySelector('#progress-text');
    const percentEl = document.querySelector('#progress-percent');

    if (!modal) return resolve();
    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;

    let progress = 0;
    if (barEl) barEl.style.width = '0%';
    if (percentEl) percentEl.textContent = '0%';
    if (textEl) textEl.textContent = 'Initializing operation...';
    modal.hidden = false;

    const interval = 50;
    const step = 100 / (durationMs / interval);

    const timer = setInterval(() => {
      progress += step;
      if (progress >= 100) {
        progress = 100;
        clearInterval(timer);
        if (barEl) barEl.style.width = '100%';
        if (percentEl) percentEl.textContent = '100%';
        if (textEl) textEl.textContent = 'Complete! Finalizing...';
        setTimeout(() => {
          modal.hidden = true;
          resolve();
        }, 500);
      } else {
        const pVal = Math.round(progress);
        if (barEl) barEl.style.width = `${pVal}%`;
        if (percentEl) percentEl.textContent = `${pVal}%`;
        if (title.includes('Deleting')) {
          textEl.textContent = pVal < 50 ? 'Removing item from workspace...' : 'Syncing container environment...';
        } else if (title.includes('Uploading')) {
          textEl.textContent = pVal < 50 ? 'Uploading files...' : 'Syncing container workspace...';
        } else if (title.includes('Folder') || title.includes('File')) {
          textEl.textContent = pVal < 50 ? 'Creating workspace path...' : 'Updating environment...';
        } else {
          if (pVal < 25) textEl.textContent = 'Syncing source files...';
          else if (pVal < 65) textEl.textContent = 'Building Docker container...';
          else if (pVal < 90) textEl.textContent = 'Configuring PHP runtime router...';
          else textEl.textContent = 'Starting service...';
        }
      }
    }, interval);
  });
}

async function handleProjectAction(event, action, projectId) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  closeAllProjectMenus();

  const response = await fetch('/api/me');
  if (!response.ok) return;
  const data = await response.json();
  const project = data.projects.find(p => p.id === projectId);
  if (!project) return;

  closeProjectModal();
  if (action === 'files') return openFiles(project);
  if (action === 'php-config') return openPhpSettings(project);
  if (action === 'php-modules') return openPhpModules(project);
  if (action === 'edit') return openEditor(project);
  if (action === 'delete' && !confirm('Delete this project and its local files?')) return;

  const suffix = action === 'toggle' ? '/toggle' : action === 'rebuild' ? '/rebuild' : action === 'maintenance' ? '/maintenance' : '';

  if (action === 'rebuild') {
    const apiPromise = fetch(`/api/projects/${projectId}${suffix}`, { method: 'POST' });
    await showOperationProgress('Rebuilding Project...', `Re-compiling ${project.name} environment & dependencies. Please wait...`, 12000);
    await apiPromise;
  } else if (action === 'toggle' || action === 'maintenance') {
    const actName = action === 'toggle' ? (project.enabled === false ? 'Enabling' : 'Disabling') : (project.maintenance ? 'Ending Maintenance' : 'Starting Maintenance');
    const apiPromise = fetch(`/api/projects/${projectId}${suffix}`, { method: 'POST' });
    await showOperationProgress(`${actName} Project...`, `Updating runtime state for ${project.name}.`, 2500);
    await apiPromise;
  } else {
    await fetch(`/api/projects/${projectId}${suffix}`, { method: action === 'delete' ? 'DELETE' : 'POST' });
  }

  load();
}

function render(projects) {
  const total = projects.length;
  const active = projects.filter(p => p.enabled !== false && !p.maintenance).length;
  const statTotal = document.querySelector('#stat-total');
  const statActive = document.querySelector('#stat-active');
  const sidebarCount = document.querySelector('#sidebar-proj-count');
  if (statTotal) statTotal.textContent = total;
  if (statActive) statActive.textContent = active;
  if (sidebarCount) sidebarCount.textContent = total;

  const currentOpenId = activeOpenMenuId;

  document.querySelector('#projects').innerHTML = projects.length ? projects.map(project => `
    <article class="project" data-project-id="${project.id}">
      <div>
        <strong>${project.name}</strong>
        <p>${project.technology} · ${project.phpVersion || 'PHP 8.5'} · 💾 ${formatBytes(project.storageBytes || 0)} · ⚡ ${project.ram || '1 GB'} / ${project.cpu || '1 vCPU'}${project.enabled === false ? ' · disabled' : ''}${project.maintenance ? ' · maintenance on' : ''}${project.sourceStatus && project.sourceStatus !== 'ready' ? ` · ${project.sourceStatus}` : ''}</p>
      </div>
      <div class="project-actions">
        <a href="${project.url}" target="_blank" onclick="event.stopPropagation()">${project.previewStatus === 'no-entry-point' ? 'View status' : 'Open preview ↗'}</a>
        <div class="menu-container">
          <button class="menu-trigger ${currentOpenId === project.id ? 'active' : ''}" type="button" aria-label="More options" onclick="toggleProjectMenu(event, '${project.id}')">⋮</button>
          <div class="menu-dropdown" id="menu-${project.id}" ${currentOpenId === project.id ? '' : 'hidden'} onclick="event.stopPropagation()">
            <button type="button" onclick="handleProjectAction(event, 'files', '${project.id}')">📁 File Manager</button>
            <button type="button" onclick="handleProjectAction(event, 'php-config', '${project.id}')">⚙️ PHP Config</button>
            <button type="button" onclick="handleProjectAction(event, 'php-modules', '${project.id}')">🧩 PHP Extensions</button>
            <button type="button" onclick="handleProjectAction(event, 'edit', '${project.id}')">✏️ Edit Settings</button>
            <button type="button" onclick="handleProjectAction(event, 'rebuild', '${project.id}')">🔄 Rebuild</button>
            <button type="button" onclick="handleProjectAction(event, 'toggle', '${project.id}')">${project.enabled === false ? '⚡ Enable' : '🛑 Disable'}</button>
            <button type="button" onclick="handleProjectAction(event, 'maintenance', '${project.id}')">${project.maintenance ? '🟢 End Maintenance' : '🛠 Maintenance Mode'}</button>
            <button type="button" class="danger" onclick="handleProjectAction(event, 'delete', '${project.id}')">🗑️ Delete</button>
          </div>

        </div>
      </div>
    </article>`).join('') : '<p class="muted">No projects yet. Create your first project above.</p>';
}

document.addEventListener('click', async event => {
  if (!event.target.closest('.menu-dropdown') && !event.target.closest('.menu-trigger')) {
    document.querySelectorAll('.menu-dropdown').forEach(m => m.hidden = true);
    document.querySelectorAll('.menu-trigger').forEach(t => t.classList.remove('active'));
  }

  const actionButton = event.target.closest('#project-modal [data-action]');
  if (actionButton) {
    const action = actionButton.dataset.action;
    const projId = actionButton.dataset.id;
    if (projId && action) {
      handleProjectAction(event, action, projId);
      return;
    }
  }

  const projectCard = event.target.closest('.project');
  if (projectCard && !event.target.closest('.project-actions')) {
    const projId = projectCard.dataset.projectId;
    const response = await fetch('/api/me');
    if (response.ok) {
      const data = await response.json();
      const proj = data.projects.find(p => p.id === projId);
      if (proj) openProjectModal(proj);
    }
  }

  const tabBtn = event.target.closest('[data-tab]');
  if (tabBtn) switchTab(tabBtn.dataset.tab);
});

async function processFileUploads(filesList) {
  if (!activeFileProject || !filesList || !filesList.length) return;
  const rawFiles = Array.from(filesList);
  // Filter out folder drop entries (0-byte items or type-less folders)
  const files = rawFiles.filter(file => file.size > 0 || (file.type && file.type !== ''));
  if (files.length < rawFiles.length) {
    showMessage('#file-message', '⚠️ Folder uploads are disabled. Only individual files can be uploaded.', true);
  }
  if (!files.length) return;
  if (files.length > 50) {
    showMessage('#file-message', '❌ Maximum 50 files allowed per upload batch.', true);
    return;
  }
  for (const file of files) {
    if (file.size > 10 * 1024 * 1024) {
      showMessage('#file-message', `❌ File "${file.name}" exceeds 10 MB limit (${formatBytes(file.size)}). Upload cancelled.`, true);
      return;
    }
  }

  let count = 0;
  const totalFiles = files.length;
  const progressPromise = showOperationProgress('Uploading Files...', `Transferring ${totalFiles} file${totalFiles > 1 ? 's' : ''} to workspace & updating container...`, Math.max(3000, totalFiles * 1000));

  for (const file of files) {
    const form = new FormData();
    form.append('file', file);
    const response = await fetch(`/api/projects/${activeFileProject.id}/files/upload`, { method: 'POST', body: form });
    if (!response.ok) {
      const result = await response.json();
      showMessage('#file-message', result.error, true);
    } else {
      count++;
    }
  }

  await progressPromise;

  if (count > 0) {
    showMessage('#file-message', `✅ Successfully uploaded ${count} file${count > 1 ? 's' : ''}.`);
  }
  await listFiles();
  load();
}

function ensureFileManager() {
  if (document.querySelector('#files')) return;
  document.body.insertAdjacentHTML('beforeend', `
    <div id="files" class="modal" hidden>
      <div class="modal-card file-manager" style="position:relative">
        <div class="drag-overlay" id="drag-overlay" hidden>
          <span style="font-size:38px">📥</span>
          <h3>Drop files here to upload</h3>
          <p>Max 10 MB per file · Up to 50 files</p>
        </div>
        <div class="modal-head">
          <div>
            <p class="eyebrow">Project Explorer</p>
            <h2 id="files-title">File Manager</h2>
          </div>
          <button class="icon-button" id="close-files" type="button" aria-label="Close">×</button>
        </div>
        <div class="file-toolbar">
          <label class="file-upload">
            <span>📤 Upload Files</span>
            <input id="file-upload" type="file" multiple>
          </label>
          <button class="action" id="new-file" type="button">📄 New File</button>
          <button class="action" id="new-folder" type="button">📁 New Folder</button>
          <button class="action" id="refresh-files" type="button">🔄 Refresh</button>
          <button class="action danger" id="delete-selected" type="button" style="color:#d9381e" disabled>🗑️ Delete Selected</button>
        </div>
        <div class="file-layout">
          <div class="file-sidebar">
            <div class="file-sidebar-head">
              <span>Files & Folders</span>
            </div>
            <div id="file-list" class="file-list"></div>
          </div>
          <div class="file-editor-container" hidden>
            <div class="file-editor-head">
              <span id="selected-file">No file selected</span>
              <div style="display:flex;gap:8px;align-items:center">
                <button class="button" id="save-file" type="button" disabled>Save File</button>
                <button class="icon-button" id="close-file-editor" type="button" title="Close Editor">×</button>
              </div>
            </div>
            <textarea id="file-content" spellcheck="false" disabled placeholder="Select a text file from the sidebar to view or edit its contents."></textarea>
            <div class="file-editor-foot">
              <p id="file-message" class="muted" style="margin:0"></p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `);
  document.querySelector('#save-file').addEventListener('click', () => {
    if (activeFileProject) saveActiveFile();
  });
  document.querySelector('#close-file-editor')?.addEventListener('click', () => {
    const editorContainer = document.querySelector('.file-editor-container');
    const fileLayout = document.querySelector('.file-layout');
    if (editorContainer) editorContainer.hidden = true;
    if (fileLayout) fileLayout.classList.remove('editor-open');
  });
  document.querySelector('#close-files').addEventListener('click', () => {
    document.querySelector('#files').hidden = true;
    sessionStorage.removeItem('activeFileProjectId');
    activeFileProject = null;
  });
  const fileManagerModal = document.querySelector('.file-manager');
  const dragOverlay = document.querySelector('#drag-overlay');
  let dragCounter = 0;

  fileManagerModal.addEventListener('dragenter', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer && e.dataTransfer.types && (Array.from(e.dataTransfer.types).includes('Files') || Array.from(e.dataTransfer.types).includes('application/x-moz-file'))) {
      dragCounter++;
      if (dragOverlay) dragOverlay.hidden = false;
      fileManagerModal.classList.add('drag-over');
    }
  });

  fileManagerModal.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  fileManagerModal.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      if (dragOverlay) dragOverlay.hidden = true;
      fileManagerModal.classList.remove('drag-over');
    }
  });

  fileManagerModal.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter = 0;
    if (dragOverlay) dragOverlay.hidden = true;
    fileManagerModal.classList.remove('drag-over');
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processFileUploads(e.dataTransfer.files);
    }
  });
}

async function openFiles(project) {
  ensureFileManager();
  activeFileProject = project;
  sessionStorage.setItem('activeFileProjectId', project.id);
  const dragOverlay = document.querySelector('#drag-overlay');
  const fileManagerModal = document.querySelector('.file-manager');
  const editorContainer = document.querySelector('.file-editor-container');
  const fileLayout = document.querySelector('.file-layout');
  if (dragOverlay) dragOverlay.hidden = true;
  if (fileManagerModal) fileManagerModal.classList.remove('drag-over');
  if (editorContainer) editorContainer.hidden = true;
  if (fileLayout) fileLayout.classList.remove('editor-open');
  document.querySelector('#files-title').textContent = `${project.name} Workspace`;
  document.querySelector('#selected-file').textContent = 'No file selected';
  document.querySelector('#file-content').value = '';
  document.querySelector('#file-content').disabled = true;
  document.querySelector('#save-file').disabled = true;
  document.querySelector('#files').hidden = false;
  await listFiles();
}


const expandedFolders = new Set();
let activeSelectedItem = { path: '', type: '' };

async function listFiles() {
  const response = await fetch(`/api/projects/${activeFileProject.id}/files`);
  const data = await response.json();
  const fileList = document.querySelector('#file-list');
  if (!fileList) return;
  if (!response.ok) {
    fileList.innerHTML = `<p class="muted" style="padding:12px;font-size:12px">${data.error}</p>`;
    return;
  }

  // Build tree data structure from flat paths list
  const tree = {};
  for (const item of data.files) {
    const parts = item.path.split('/');
    let current = tree;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const currentPath = parts.slice(0, i + 1).join('/');
      if (!current[part]) {
        current[part] = {
          name: part,
          path: currentPath,
          type: isLast ? item.type : 'folder',
          children: {}
        };
      }
      current = current[part].children;
    }
  }

  function renderTreeNodes(nodeObj) {
    const keys = Object.keys(nodeObj).sort((a, b) => {
      const isAFolder = nodeObj[a].type === 'folder';
      const isBFolder = nodeObj[b].type === 'folder';
      if (isAFolder !== isBFolder) return isAFolder ? -1 : 1;
      return a.localeCompare(b);
    });

    return keys.map(key => {
      const node = nodeObj[key];
      const isFolder = node.type === 'folder';
      if (isFolder) {
        const isExpanded = expandedFolders.has(node.path);
        const isSelected = activeSelectedItem.path === node.path && activeSelectedItem.type === 'folder';
        const childHtml = isExpanded ? `<div class="folder-children">${renderTreeNodes(node.children)}</div>` : '';
        const icon = isExpanded ? '📂' : '📁';
        return `
          <div class="folder-wrapper">
            <div class="file-item folder-item ${isExpanded ? 'expanded' : ''} ${isSelected ? 'active' : ''}" data-folder="${node.path}" style="cursor:pointer">
              <span class="folder-icon">${icon}</span> <span>${node.name}</span>
            </div>
            ${childHtml}
          </div>
        `;
      } else {
        const isSelected = activeSelectedItem.path === node.path && activeSelectedItem.type === 'file';
        return `<button class="file-item ${isSelected ? 'active' : ''}" data-file="${node.path}">📄 ${node.name}</button>`;
      }
    }).join('');
  }

  fileList.innerHTML = renderTreeNodes(tree) || '<p class="muted" style="padding:12px;font-size:12px">No files uploaded yet.</p>';
}

async function saveActiveFile() {
  const filePath = document.querySelector('#selected-file').textContent;
  if (!filePath || filePath === 'No file selected') return;
  const saveBtn = document.querySelector('#save-file');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
  }
  let progressPromise = showOperationProgress('Saving File...', `Saving changes to "${filePath}" and updating environment...`, 2000);
  const response = await fetch(`/api/projects/${activeFileProject.id}/files?path=${encodeURIComponent(filePath)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: document.querySelector('#file-content').value })
  });
  const result = await response.json();
  await progressPromise;
  if (saveBtn) {
    saveBtn.disabled = false;
    saveBtn.textContent = response.ok ? 'Saved ✓' : 'Save File';
    setTimeout(() => { if (saveBtn) saveBtn.textContent = 'Save File'; }, 3000);
  }
  showMessage('#file-message', response.ok ? '✅ File saved successfully.' : result.error, !response.ok);
  await listFiles();
}

document.addEventListener('dblclick', async event => {
  const folder = event.target.closest('.file-item.folder-item');
  if (folder && activeFileProject) {
    const folderPath = folder.dataset.folder;
    if (expandedFolders.has(folderPath)) {
      expandedFolders.delete(folderPath);
    } else {
      expandedFolders.add(folderPath);
    }
    await listFiles();
  }
});

document.addEventListener('click', async event => {
  const file = event.target.closest('.file-item:not(.folder-item)');
  const folder = event.target.closest('.file-item.folder-item');
  if ((file || folder) && activeFileProject) {
    document.querySelectorAll('.file-item').forEach(el => el.classList.remove('active'));
    const targetItem = file || folder;
    const itemPath = targetItem.dataset.file || targetItem.dataset.folder;
    const itemType = file ? 'file' : 'folder';
    activeSelectedItem = { path: itemPath, type: itemType };
    targetItem.classList.add('active');
    const deleteToolbarBtn = document.querySelector('#delete-selected');
    if (deleteToolbarBtn) {
      deleteToolbarBtn.disabled = false;
      deleteToolbarBtn.dataset.path = itemPath;
      deleteToolbarBtn.dataset.type = itemType;
    }
    if (folder) {
      const folderPath = folder.dataset.folder;
      if (!expandedFolders.has(folderPath)) {
        expandedFolders.add(folderPath);
        await listFiles();
      }
    }
  }

  if (file && activeFileProject) {
    const response = await fetch(`/api/projects/${activeFileProject.id}/files?path=${encodeURIComponent(file.dataset.file)}`);
    const data = await response.json();
    if (response.ok) {
      const editorContainer = document.querySelector('.file-editor-container');
      const fileLayout = document.querySelector('.file-layout');
      if (editorContainer) editorContainer.hidden = false;
      if (fileLayout) fileLayout.classList.add('editor-open');
      document.querySelector('#selected-file').textContent = data.path;
      document.querySelector('#file-content').value = data.content;
      document.querySelector('#file-content').disabled = false;
      document.querySelector('#save-file').disabled = false;
    }
  }
  if (event.target.closest('#refresh-files') && activeFileProject) {
    showMessage('#file-message', '🔄 Refreshing workspace files...', false);
    await listFiles();
    showMessage('#file-message', '✅ File tree updated.', false);
  }
  if (event.target.closest('#delete-selected') && activeFileProject) {
    const btn = event.target.closest('#delete-selected');
    const itemPath = btn.dataset.path || document.querySelector('#selected-file').textContent;
    const itemType = btn.dataset.type || 'item';
    if (itemPath && itemPath !== 'No file selected') {
      const confirmed = await showConfirmDialog(`Delete ${itemType === 'folder' ? 'Folder' : 'File'}`, `Are you sure you want to delete "${itemPath}"? This operation cannot be undone.`);
      if (confirmed) {
        let progressPromise = showOperationProgress('Deleting Item...', `Removing "${itemPath}" from workspace and syncing runtime environment...`, 2000);
        const response = await fetch(`/api/projects/${activeFileProject.id}/files?path=${encodeURIComponent(itemPath)}`, {
          method: 'DELETE'
        });
        const result = await response.json();
        await progressPromise;
        showMessage('#file-message', response.ok ? `🗑️ ${itemType === 'folder' ? 'Folder' : 'File'} deleted successfully.` : result.error, !response.ok);
        if (document.querySelector('#selected-file').textContent === itemPath) {
          document.querySelector('#selected-file').textContent = 'No file selected';
          document.querySelector('#file-content').value = '';
          document.querySelector('#file-content').disabled = true;
          document.querySelector('#save-file').disabled = true;
        }
        btn.disabled = true;
        await listFiles();
      }
    }
  }
  if (event.target.closest('#save-file') && activeFileProject) saveActiveFile();
  if (event.target.closest('#new-file') && activeFileProject) {
    const parentFolder = activeSelectedItem.type === 'folder' ? activeSelectedItem.path : (activeSelectedItem.path ? activeSelectedItem.path.substring(0, activeSelectedItem.path.lastIndexOf('/')) : '');
    const folderPrefix = parentFolder ? `${parentFolder}/` : '';
    const name = await showPromptDialog('Create New File', 'New file path, for example notes.txt', folderPrefix);
    if (name) {
      const fullPath = (folderPrefix && !name.startsWith(folderPrefix)) ? `${folderPrefix}${name}` : name;
      let progressPromise = showOperationProgress('Creating File...', `Creating "${fullPath}" in workspace and updating environment...`, 2000);
      const response = await fetch(`/api/projects/${activeFileProject.id}/files?path=${encodeURIComponent(fullPath)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '' })
      });
      const result = await response.json();
      await progressPromise;
      if (response.ok) {
        // Expand all parent directory levels
        const parts = fullPath.split('/');
        for (let i = 1; i < parts.length; i++) {
          expandedFolders.add(parts.slice(0, i).join('/'));
        }
        activeSelectedItem = { path: fullPath, type: 'file' };
        const editorContainer = document.querySelector('.file-editor-container');
        const fileLayout = document.querySelector('.file-layout');
        if (editorContainer) editorContainer.hidden = false;
        if (fileLayout) fileLayout.classList.add('editor-open');
        document.querySelector('#selected-file').textContent = fullPath;
        document.querySelector('#file-content').value = '';
        document.querySelector('#file-content').disabled = false;
        document.querySelector('#save-file').disabled = false;
        showMessage('#file-message', '✅ File created successfully.');
      } else {
        showMessage('#file-message', result.error, true);
      }
      await listFiles();
    }
  }
  if (event.target.closest('#new-folder') && activeFileProject) {
    const parentFolder = activeSelectedItem.type === 'folder' ? activeSelectedItem.path : (activeSelectedItem.path ? activeSelectedItem.path.substring(0, activeSelectedItem.path.lastIndexOf('/')) : '');
    const promptTitle = parentFolder ? `Create Folder inside "${parentFolder}"` : 'Create New Folder';
    const name = await showPromptDialog(promptTitle, 'New folder name, for example assets');
    if (name) {
      const progressPromise = showOperationProgress('Creating Folder...', `Adding directory "${name}" to workspace...`, 2000);
      const response = await fetch(`/api/projects/${activeFileProject.id}/files/folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, parent: parentFolder })
      });
      const result = await response.json();
      await progressPromise;
      if (response.ok) {
        const createdFolderPath = parentFolder ? `${parentFolder}/${name}` : name;
        if (parentFolder) {
          const parts = parentFolder.split('/');
          for (let i = 1; i <= parts.length; i++) {
            expandedFolders.add(parts.slice(0, i).join('/'));
          }
        }
        expandedFolders.add(createdFolderPath);
        activeSelectedItem = { path: createdFolderPath, type: 'folder' };
        showMessage('#file-message', '📁 Folder created successfully.');
      } else {
        showMessage('#file-message', result.error, true);
      }
      await listFiles();
    }
  }
});

function closeFileContextMenu() {
  const existing = document.querySelector('#file-context-menu');
  if (existing) existing.remove();
}

document.addEventListener('click', () => closeFileContextMenu());

document.addEventListener('contextmenu', async event => {
  const item = event.target.closest('.file-item');
  if (item && activeFileProject) {
    event.preventDefault();
    closeFileContextMenu();
    const itemPath = item.dataset.file || item.dataset.folder;
    const isFile = !!item.dataset.file;
    const isFolder = !isFile;

    const menu = document.createElement('div');
    menu.id = 'file-context-menu';
    menu.className = 'file-context-menu';
    menu.style.left = `${Math.min(event.clientX, window.innerWidth - 190)}px`;
    menu.style.top = `${Math.min(event.clientY, window.innerHeight - 150)}px`;

    let html = '';
    if (isFile) {
      html += `<button type="button" data-action="edit">✏️ View / Edit File</button>`;
      if (activeFileProject.url) {
        const fileUrl = `${activeFileProject.url}${itemPath}`;
        html += `<button type="button" data-action="preview">🔗 Open Preview URL</button>`;
      }
    } else {
      html += `<button type="button" data-action="new-file">📄 New File Inside</button>`;
      html += `<button type="button" data-action="new-folder">📁 New Folder Inside</button>`;
    }
    html += `<button type="button" data-action="delete" class="danger">🗑️ Delete</button>`;
    menu.innerHTML = html;
    document.body.appendChild(menu);

    menu.addEventListener('click', async e => {
      e.stopPropagation();
      closeFileContextMenu();
      const actionBtn = e.target.closest('button');
      if (!actionBtn) return;
      const action = actionBtn.dataset.action;

      if (action === 'edit' && isFile) {
        const response = await fetch(`/api/projects/${activeFileProject.id}/files?path=${encodeURIComponent(itemPath)}`);
        const data = await response.json();
        if (response.ok) {
          const editorContainer = document.querySelector('.file-editor-container');
          const fileLayout = document.querySelector('.file-layout');
          if (editorContainer) editorContainer.hidden = false;
          if (fileLayout) fileLayout.classList.add('editor-open');
          document.querySelector('#selected-file').textContent = data.path;
          document.querySelector('#file-content').value = data.content;
          document.querySelector('#file-content').disabled = false;
          document.querySelector('#save-file').disabled = false;
        }
      } else if (action === 'preview' && isFile) {
        window.open(`${activeFileProject.url}${itemPath}`, '_blank');
      } else if (action === 'new-file' && isFolder) {
        const name = await showPromptDialog(`Create File in "${itemPath}"`, 'File name, e.g. script.js', `${itemPath}/`);
        if (name) {
          const fullPath = !name.startsWith(`${itemPath}/`) ? `${itemPath}/${name}` : name;
          let progressPromise = showOperationProgress('Creating File...', `Creating "${fullPath}"...`, 2000);
          const response = await fetch(`/api/projects/${activeFileProject.id}/files?path=${encodeURIComponent(fullPath)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: '' })
          });
          const result = await response.json();
          await progressPromise;
          if (response.ok) {
            document.querySelector('#selected-file').textContent = fullPath;
            document.querySelector('#file-content').value = '';
            document.querySelector('#file-content').disabled = false;
            document.querySelector('#save-file').disabled = false;
            showMessage('#file-message', '✅ File created successfully.');
          } else {
            showMessage('#file-message', result.error, true);
          }
          await listFiles();
        }
      } else if (action === 'new-folder' && isFolder) {
        const name = await showPromptDialog(`Create Folder in "${itemPath}"`, 'Folder name, e.g. subfolder');
        if (name) {
          const progressPromise = showOperationProgress('Creating Folder...', `Adding directory...`, 2000);
          const response = await fetch(`/api/projects/${activeFileProject.id}/files/folder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, parent: itemPath })
          });
          const result = await response.json();
          await progressPromise;
          showMessage('#file-message', response.ok ? '📁 Folder created successfully.' : result.error, !response.ok);
          await listFiles();
        }
      } else if (action === 'delete') {
        const confirmed = await showConfirmDialog(`Delete ${isFolder ? 'Folder' : 'File'}`, `Are you sure you want to delete "${itemPath}"?`);
        if (confirmed) {
          let progressPromise = showOperationProgress('Deleting Item...', `Removing "${itemPath}"...`, 2000);
          const response = await fetch(`/api/projects/${activeFileProject.id}/files?path=${encodeURIComponent(itemPath)}`, {
            method: 'DELETE'
          });
          const result = await response.json();
          await progressPromise;
          showMessage('#file-message', response.ok ? `🗑️ ${isFolder ? 'Folder' : 'File'} deleted successfully.` : result.error, !response.ok);
          if (document.querySelector('#selected-file').textContent === itemPath) {
            const editorContainer = document.querySelector('.file-editor-container');
            const fileLayout = document.querySelector('.file-layout');
            if (editorContainer) editorContainer.hidden = true;
            if (fileLayout) fileLayout.classList.remove('editor-open');
            document.querySelector('#selected-file').textContent = 'No file selected';
            document.querySelector('#file-content').value = '';
          }
          await listFiles();
        }
      }
    });
  }
});

document.addEventListener('change', async event => {
  if (event.target.id !== 'file-upload' || !activeFileProject) return;
  await processFileUploads(event.target.files);
  event.target.value = '';
});

function toggleSourceFields(selector, target) { document.querySelector(selector).hidden = target !== 'github'; }
document.querySelectorAll('input[name="sourceType"]').forEach(input => input.addEventListener('change', event => { const github = event.target.value === 'github'; const blank = event.target.value === 'blank'; document.querySelector('#github-source').hidden = !github; document.querySelector('#zip-source').hidden = github || blank; }));
document.querySelectorAll('input[name="editSourceType"]').forEach(input => input.addEventListener('change', event => toggleSourceFields('#edit-github-source', event.target.value)));
document.querySelector('#project').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const blank = formData.get('sourceType') === 'blank';
  const name = formData.get('name');

  let progressPromise = null;
  if (blank) {
    progressPromise = showOperationProgress('Creating Blank PHP Project', `Provisioning workspace and compiling default index.php container...`, 3000);
  }

  try {
    const response = await fetch(blank ? '/api/projects/blank' : '/api/projects', {
      method: 'POST',
      headers: blank ? { 'Content-Type': 'application/json' } : {},
      body: blank ? JSON.stringify({ name }) : formData
    });

    const result = await response.json();
    if (progressPromise) await progressPromise;

    showMessage('#message', response.ok ? 'Project created successfully.' : result.error, !response.ok);
    if (response.ok) {
      form.reset();
      await load();
      switchTab('projects');
    }
  } catch (err) {
    document.querySelector('#progress-modal').hidden = true;
    showMessage('#message', err.message || 'Failed to create project.', true);
  }
});

function openEditor(project) {
  const editor = document.querySelector('#editor');
  const form = document.querySelector('#edit-project');
  if (!editor || !form) return;
  form.elements.id.value = project.id;
  form.elements.name.value = project.name;
  form.elements.phpVersion.value = project.phpVersion || '8.5';
  form.elements.repoUrl.value = project.repoUrl || '';
  form.elements.editSourceType.value = 'keep';
  document.querySelector('#edit-github-source').hidden = true;
  document.querySelector('#edit-message').textContent = '';
  editor.hidden = false;
  setTimeout(() => form.elements.name.focus(), 50);
}

function closeEditor() {
  const editor = document.querySelector('#editor');
  if (editor) editor.hidden = true;
}

document.querySelector('#close-editor')?.addEventListener('click', closeEditor);
document.querySelector('#cancel-editor')?.addEventListener('click', closeEditor);
document.querySelector('#edit-project').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const projId = form.elements.id.value;
  const projName = form.elements.name.value;
  const data = { name: form.elements.name.value, phpVersion: form.elements.phpVersion.value };
  if (form.elements.editSourceType.value === 'github') {
    data.sourceType = 'github';
    data.repoUrl = form.elements.repoUrl.value;
  }
  closeEditor();
  const apiPromise = (async () => {
    const response = await fetch(`/api/projects/${projId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (response.ok) {
      await fetch(`/api/projects/${projId}/redeploy`, { method: 'POST' });
    }
  })();
  await showOperationProgress('Updating Project Settings...', `Re-deploying ${projName} with updated settings.`, 3500);
  await apiPromise;
  load();
});

let activePhpProject = null;

function openPhpSettings(project) {
  activePhpProject = project;
  const modal = document.querySelector('#php-settings-modal');
  const form = document.querySelector('#php-settings-form');
  const title = document.querySelector('#php-modal-title');
  if (!modal || !form) return;

  if (title) title.textContent = `Configure PHP for ${project.name}`;
  form.elements.id.value = project.id;
  const s = project.phpSettings || {};
  form.elements.memory_limit.value = s.memory_limit || '128M';
  form.elements.max_execution_time.value = s.max_execution_time || 60;
  form.elements.upload_max_filesize.value = s.upload_max_filesize || '16M';
  form.elements.post_max_size.value = s.post_max_size || '32M';
  form.elements.display_errors.value = s.display_errors || 'Off';
  form.elements.date_timezone.value = s.date_timezone || 'UTC';
  form.elements.max_input_vars.value = s.max_input_vars || 1000;
  form.elements.session_gc_maxlifetime.value = s.session_gc_maxlifetime || 1440;

  const msg = document.querySelector('#php-settings-message');
  if (msg) msg.textContent = '';
  modal.hidden = false;
}

function closePhpSettings() {
  const modal = document.querySelector('#php-settings-modal');
  if (modal) modal.hidden = true;
  activePhpProject = null;
}

document.querySelector('#close-php-settings')?.addEventListener('click', closePhpSettings);
document.querySelector('#cancel-php-settings')?.addEventListener('click', closePhpSettings);

document.querySelector('#php-settings-form')?.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const projId = form.elements.id.value;
  const data = {
    memory_limit: form.elements.memory_limit.value,
    max_execution_time: Number(form.elements.max_execution_time.value),
    upload_max_filesize: form.elements.upload_max_filesize.value,
    post_max_size: form.elements.post_max_size.value,
    display_errors: form.elements.display_errors.value,
    date_timezone: form.elements.date_timezone.value,
    max_input_vars: Number(form.elements.max_input_vars.value),
    session_gc_maxlifetime: Number(form.elements.session_gc_maxlifetime.value)
  };

  const projName = activePhpProject ? activePhpProject.name : 'Project';
  closePhpSettings();

  const apiPromise = (async () => {
    let response = await fetch(`/api/projects/${projId}/php-settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) {
      response = await fetch(`/api/projects/${projId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: projName, phpSettings: data })
      });
    }

    if (!response.ok) {
      const resData = await response.json();
      alert(resData.error || 'Failed to update PHP settings');
    }
  })();


  await showOperationProgress('Applying PHP Configuration...', `Updating php.ini directives & restarting ${projName}.`, 3000);
  await apiPromise;
  load();
});

const EXT_INFO = {
  pdo_mysql: { label: 'PDO MySQL', desc: 'Driver for MySQL & MariaDB' },
  mysqli: { label: 'MySQLi', desc: 'Improved MySQL extension' },
  pdo_pgsql: { label: 'PDO PostgreSQL', desc: 'PDO driver for PostgreSQL (PSQL)' },
  pgsql: { label: 'PostgreSQL (pgsql)', desc: 'PostgreSQL database driver' },
  mongodb: { label: 'MongoDB', desc: 'Official MongoDB driver' },
  pdo_sqlite: { label: 'PDO SQLite', desc: 'Lightweight SQLite database driver' },
  redis: { label: 'Redis', desc: 'High-performance Redis cache & store' },
  memcached: { label: 'Memcached', desc: 'Distributed memory caching system' },
  imagick: { label: 'Imagick', desc: 'ImageMagick graphic manipulation' },
  gd: { label: 'GD Library', desc: 'Image processing and dynamic charts' },
  curl: { label: 'cURL', desc: 'HTTP client for external APIs' },
  mbstring: { label: 'mbstring', desc: 'Multibyte string support' },
  zip: { label: 'ZIP Archive', desc: 'Zip compression and extraction' },
  intl: { label: 'Intl', desc: 'Internationalization extension' },
  bcmath: { label: 'BCMath', desc: 'Arbitrary precision mathematics' },
  xml: { label: 'XML', desc: 'DOM, SimpleXML, and XML parsing' },
  opcache: { label: 'Zend OPcache', desc: 'PHP opcode caching for maximum speed' },
  soap: { label: 'SOAP Client', desc: 'Web services and SOAP protocol' },
  sockets: { label: 'Sockets', desc: 'Low-level socket communication' },
  exif: { label: 'Exif', desc: 'Image metadata extraction' },
  fileinfo: { label: 'FileInfo', desc: 'MIME type identification' }
};

let activePhpModulesProject = null;

function openPhpModules(project) {
  activePhpModulesProject = project;
  const modal = document.querySelector('#php-modules-modal');
  const title = document.querySelector('#php-modules-title');
  if (!modal) return;

  if (title) title.textContent = `PHP Extensions for ${project.name}`;
  renderPhpModulesGrid(project);

  const searchInput = document.querySelector('#ext-search-input');
  if (searchInput) {
    searchInput.value = '';
    searchInput.focus();
  }

  modal.hidden = false;
}

function renderPhpModulesGrid(project, filterText = '') {
  const grid = document.querySelector('#php-modules-grid');
  if (!grid) return;

  const currentModules = project.phpModules || {};
  const query = filterText.toLowerCase().trim();

  const entries = Object.keys(EXT_INFO).filter(key => {
    if (!query) return true;
    const info = EXT_INFO[key];
    return key.toLowerCase().includes(query) || info.label.toLowerCase().includes(query) || info.desc.toLowerCase().includes(query);
  });

  if (entries.length === 0) {
    grid.innerHTML = '<div style="grid-column:1/-1;padding:20px;text-align:center;color:#68716a">No matching extensions found.</div>';
    return;
  }

  grid.innerHTML = entries.map(key => {
    const info = EXT_INFO[key];
    const isEnabled = currentModules[key] === true;
    return `
      <div class="ext-card" style="background:#fff;border:1px solid var(--line);border-radius:6px;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px">
        <div>
          <strong style="font-size:14px;display:block;color:var(--ink)">${info.label}</strong>
          <span style="font:11px 'DM Mono',monospace;color:#68716a;display:block;margin-top:2px">${info.desc}</span>
        </div>
        <button type="button" class="button ${isEnabled ? 'ghost' : ''}" style="padding:6px 12px;font-size:12px;min-width:85px;${isEnabled ? 'background:var(--acid);color:var(--ink);border-color:var(--ink)' : 'background:#e0ded6;color:#555;border-color:#ccc'}" onclick="togglePhpExtension('${key}')">
          ${isEnabled ? '✓ Installed' : '+ Install'}
        </button>
      </div>
    `;
  }).join('');
}

async function togglePhpExtension(extKey) {
  if (!activePhpModulesProject) return;

  const currentModules = { ...(activePhpModulesProject.phpModules || {}) };
  const targetState = !(currentModules[extKey] === true);
  currentModules[extKey] = targetState;
  activePhpModulesProject.phpModules = currentModules;

  renderPhpModulesGrid(activePhpModulesProject, document.querySelector('#ext-search-input')?.value || '');

  const projId = activePhpModulesProject.id;
  const projName = activePhpModulesProject.name;
  const extLabel = EXT_INFO[extKey] ? EXT_INFO[extKey].label : extKey;
  const actName = targetState ? `Installing ${extLabel}...` : `Uninstalling ${extLabel}...`;

  const apiPromise = fetch(`/api/projects/${projId}/php-modules`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phpModules: currentModules })
  });

  await showOperationProgress(actName, `Compiling PHP extension binaries & building container image for ${projName}.`, 7000);
  const response = await apiPromise;

  if (response.ok) {
    const resData = await response.json();
    if (resData.project) {
      activePhpModulesProject = resData.project;
    }
  }

  await load();
  renderPhpModulesGrid(activePhpModulesProject, document.querySelector('#ext-search-input')?.value || '');
}

function closePhpModules() {
  const modal = document.querySelector('#php-modules-modal');
  if (modal) modal.hidden = true;
  activePhpModulesProject = null;
}

document.querySelector('#close-php-modules')?.addEventListener('click', closePhpModules);
document.querySelector('#close-php-modules-btn')?.addEventListener('click', closePhpModules);
document.querySelector('#ext-search-input')?.addEventListener('input', (e) => {
  if (activePhpModulesProject) renderPhpModulesGrid(activePhpModulesProject, e.target.value);
});

document.querySelector('#logout').addEventListener('click', async () => { await fetch('/api/auth/logout', { method: 'POST' }); location.href = '/'; });
switchTab(getTabFromHash(), false);
window.addEventListener('hashchange', () => switchTab(getTabFromHash(), false));
load();
setInterval(load, 3000);


