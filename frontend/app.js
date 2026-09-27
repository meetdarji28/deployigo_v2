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
        if (pVal < 25) textEl.textContent = 'Syncing source files...';
        else if (pVal < 65) textEl.textContent = 'Building Docker container...';
        else if (pVal < 90) textEl.textContent = 'Configuring PHP runtime router...';
        else textEl.textContent = 'Starting service...';
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
  if (action === 'edit') return openEditor(project);
  if (action === 'delete' && !confirm('Delete this project and its local files?')) return;

  const suffix = action === 'toggle' ? '/toggle' : action === 'rebuild' ? '/rebuild' : action === 'maintenance' ? '/maintenance' : '';

  if (action === 'rebuild') {
    const apiPromise = fetch(`/api/projects/${projectId}${suffix}`, { method: 'POST' });
    await showOperationProgress('Rebuilding Project...', `Re-compiling ${project.name} environment & dependencies. Please wait.`, 4000);
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
  const files = Array.from(filesList);
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
        </div>
        <div class="file-layout">
          <div class="file-sidebar">
            <div class="file-sidebar-head">
              <span>Files & Folders</span>
            </div>
            <div id="file-list" class="file-list"></div>
          </div>
          <div class="file-editor-container">
            <div class="file-editor-head">
              <span id="selected-file">No file selected</span>
              <button class="button" id="save-file" type="button" disabled>Save File</button>
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
  document.querySelector('#close-files').addEventListener('click', () => document.querySelector('#files').hidden = true);

  const fileManagerModal = document.querySelector('.file-manager');
  const dragOverlay = document.querySelector('#drag-overlay');
  let dragCounter = 0;

  fileManagerModal.addEventListener('dragenter', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter++;
    if (dragOverlay) dragOverlay.hidden = false;
    fileManagerModal.classList.add('drag-over');
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
    if (e.dataTransfer && e.dataTransfer.files) {
      await processFileUploads(e.dataTransfer.files);
    }
  });
}

async function openFiles(project) {
  ensureFileManager();
  activeFileProject = project;
  document.querySelector('#files-title').textContent = `${project.name} Workspace`;
  document.querySelector('#selected-file').textContent = 'No file selected';
  document.querySelector('#file-content').value = '';
  document.querySelector('#file-content').disabled = true;
  document.querySelector('#save-file').disabled = true;
  document.querySelector('#files').hidden = false;
  await listFiles();
}

async function listFiles() {
  const response = await fetch(`/api/projects/${activeFileProject.id}/files`);
  const data = await response.json();
  const fileList = document.querySelector('#file-list');
  if (!fileList) return;
  if (response.ok) {
    fileList.innerHTML = data.files.map(file => {
      if (file.type === 'folder') {
        return `<div class="file-item folder-item">📁 ${file.path}</div>`;
      }
      const isSelected = document.querySelector('#selected-file').textContent === file.path;
      return `<button class="file-item ${isSelected ? 'active' : ''}" data-file="${file.path}">📄 ${file.path}</button>`;
    }).join('') || '<p class="muted" style="padding:12px;font-size:12px">No files uploaded yet.</p>';
  } else {
    fileList.innerHTML = `<p class="muted" style="padding:12px;font-size:12px">${data.error}</p>`;
  }
}

async function saveActiveFile() {
  const filePath = document.querySelector('#selected-file').textContent;
  if (!filePath || filePath === 'No file selected') return;
  const response = await fetch(`/api/projects/${activeFileProject.id}/files?path=${encodeURIComponent(filePath)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: document.querySelector('#file-content').value })
  });
  const result = await response.json();
  showMessage('#file-message', response.ok ? '✅ File saved successfully.' : result.error, !response.ok);
  await listFiles();
}

document.addEventListener('click', async event => {
  const file = event.target.closest('.file-item:not(.folder-item)');
  if (file && activeFileProject) {
    document.querySelectorAll('.file-item').forEach(el => el.classList.remove('active'));
    file.classList.add('active');
    const response = await fetch(`/api/projects/${activeFileProject.id}/files?path=${encodeURIComponent(file.dataset.file)}`);
    const data = await response.json();
    if (response.ok) {
      document.querySelector('#selected-file').textContent = data.path;
      document.querySelector('#file-content').value = data.content;
      document.querySelector('#file-content').disabled = false;
      document.querySelector('#save-file').disabled = false;
    }
  }
  if (event.target.id === 'save-file' && activeFileProject) saveActiveFile();
  if (event.target.id === 'new-file' && activeFileProject) {
    const name = await showPromptDialog('Create New File', 'New file path, for example notes.txt');
    if (name) {
      document.querySelector('#selected-file').textContent = name;
      document.querySelector('#file-content').value = '';
      document.querySelector('#file-content').disabled = false;
      document.querySelector('#save-file').disabled = false;
    }
  }
  if (event.target.id === 'new-folder' && activeFileProject) {
    const name = await showPromptDialog('Create New Folder', 'New folder name, for example assets');
    if (name) {
      const response = await fetch(`/api/projects/${activeFileProject.id}/files/folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      const result = await response.json();
      showMessage('#file-message', response.ok ? 'Folder created.' : result.error, !response.ok);
      await listFiles();
    }
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
document.querySelector('#project').addEventListener('submit', async event => { event.preventDefault(); const formData = new FormData(event.currentTarget); const blank = formData.get('sourceType') === 'blank'; const response = await fetch(blank ? '/api/projects/blank' : '/api/projects', { method: blank ? 'POST' : 'POST', headers: blank ? { 'Content-Type': 'application/json' } : {}, body: blank ? JSON.stringify({ name: formData.get('name') }) : formData }); const result = await response.json(); showMessage('#message', response.ok ? 'Project created. Source files are processing.' : result.error, !response.ok); if (response.ok) { event.currentTarget.reset(); load(); switchTab('projects'); } });

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

document.querySelector('#logout').addEventListener('click', async () => { await fetch('/api/auth/logout', { method: 'POST' }); location.href = '/'; });
switchTab(getTabFromHash(), false);
window.addEventListener('hashchange', () => switchTab(getTabFromHash(), false));
load();
setInterval(load, 3000);


