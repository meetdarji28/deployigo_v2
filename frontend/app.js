let activeFileProject = null;
const sourceFieldset = document.querySelector('input[name="sourceType"]')?.closest('fieldset');
if (sourceFieldset && !sourceFieldset.querySelector('[value="blank"]')) { sourceFieldset.insertAdjacentHTML('afterbegin', '<label><input type="radio" name="sourceType" value="blank" checked> Blank PHP project</label>'); document.querySelector('input[name="sourceType"][value="zip"]').checked = false; }
let messageTimer;
function showMessage(selector, text, isError = false) { const element = document.querySelector(selector); if (!element) return; clearTimeout(messageTimer); element.textContent = text; element.classList.toggle('message-error', isError); if (text) messageTimer = setTimeout(() => { element.textContent = ''; element.classList.remove('message-error'); }, 5000); }

async function load() {
  const response = await fetch('/api/me');
  if (!response.ok) return location.href = '/login.html';
  const data = await response.json();
  document.querySelector('#user').textContent = data.user.email;
  document.querySelector('#hello').textContent = `${data.user.name}'s projects.`;
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

function render(projects) {
  const total = projects.length;
  const active = projects.filter(p => p.enabled !== false && !p.maintenance).length;
  const statTotal = document.querySelector('#stat-total');
  const statActive = document.querySelector('#stat-active');
  const sidebarCount = document.querySelector('#sidebar-proj-count');
  if (statTotal) statTotal.textContent = total;
  if (statActive) statActive.textContent = active;
  if (sidebarCount) sidebarCount.textContent = total;
  document.querySelector('#projects').innerHTML = projects.length ? projects.map(project => `
    <article class="project">
      <div><strong>${project.name}</strong><p>${project.technology} · ${project.phpVersion || 'PHP 8.5'}${project.enabled === false ? ' · disabled' : ''}${project.maintenance ? ' · maintenance on' : ''}${project.sourceStatus && project.sourceStatus !== 'ready' ? ` · ${project.sourceStatus}` : ''}</p></div>
      <div class="project-actions">
        <a href="${project.url}" target="_blank">${project.previewStatus === 'no-entry-point' ? 'View status' : 'Open preview ↗'}</a>
        <button class="action" data-action="files" data-id="${project.id}">Files</button>
        <button class="action" data-action="edit" data-id="${project.id}">Edit</button>
        <button class="action" data-action="rebuild" data-id="${project.id}">Rebuild</button>
        <button class="action" data-action="toggle" data-id="${project.id}">${project.enabled === false ? 'Enable' : 'Disable'}</button>
        <button class="action" data-action="maintenance" data-id="${project.id}">${project.maintenance ? 'End maintenance' : 'Maintenance'}</button>
        <button class="action danger" data-action="delete" data-id="${project.id}">Delete</button>
      </div>
    </article>`).join('') : '<p class="muted">No projects yet. Create your first project above.</p>';
}

document.addEventListener('click', event => {
  const tabBtn = event.target.closest('[data-tab]');
  if (tabBtn) switchTab(tabBtn.dataset.tab);
});

function ensureFileManager() {
  if (document.querySelector('#files')) return;
  document.body.insertAdjacentHTML('beforeend', '<div id="files" class="modal" hidden><div class="modal-card file-manager"><div class="modal-head"><div><p class="eyebrow">Project files</p><h2 id="files-title">File manager</h2></div><button class="icon-button" id="close-files" type="button">×</button></div><div class="file-toolbar"><label class="file-upload">Upload files<input id="file-upload" type="file" multiple></label><button class="action" id="new-file" type="button">New text file</button><button class="action" id="new-folder" type="button">New folder</button></div><div class="file-layout"><div id="file-list" class="file-list"></div><div class="file-editor"><div class="file-editor-head"><span id="selected-file">Select a file</span><button class="button" id="save-file" type="button" disabled>Save file</button></div><textarea id="file-content" spellcheck="false" disabled placeholder="Choose a text file to edit"></textarea><p id="file-message" class="muted"></p></div></div></div></div>');
  document.querySelector('#close-files').addEventListener('click', () => document.querySelector('#files').hidden = true);
}

async function openFiles(project) { ensureFileManager(); activeFileProject = project; document.querySelector('#files-title').textContent = `${project.name} files`; document.querySelector('#files').hidden = false; await listFiles(); }
async function listFiles() { const response = await fetch(`/api/projects/${activeFileProject.id}/files`); const data = await response.json(); document.querySelector('#file-list').innerHTML = response.ok ? data.files.map(file => file.type === 'folder' ? `<div class="file-item folder-item">📁 ${file.path}</div>` : `<button class="file-item" data-file="${file.path}">📄 ${file.path}</button>`).join('') || '<p class="muted">No files uploaded yet.</p>' : `<p class="muted">${data.error}</p>`; }
async function saveActiveFile() { const filePath = document.querySelector('#selected-file').textContent; const response = await fetch(`/api/projects/${activeFileProject.id}/files?path=${encodeURIComponent(filePath)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: document.querySelector('#file-content').value }) }); const result = await response.json(); showMessage('#file-message', response.ok ? 'File saved.' : result.error, !response.ok); await listFiles(); }

document.addEventListener('click', async event => {
  const file = event.target.closest('.file-item');
  if (file && activeFileProject) { const response = await fetch(`/api/projects/${activeFileProject.id}/files?path=${encodeURIComponent(file.dataset.file)}`); const data = await response.json(); if (response.ok) { document.querySelector('#selected-file').textContent = data.path; document.querySelector('#file-content').value = data.content; document.querySelector('#file-content').disabled = false; document.querySelector('#save-file').disabled = false; } }
  if (event.target.id === 'save-file' && activeFileProject) saveActiveFile();
  if (event.target.id === 'new-file' && activeFileProject) { const name = prompt('New file path, for example notes.txt'); if (name) { document.querySelector('#selected-file').textContent = name; document.querySelector('#file-content').value = ''; document.querySelector('#file-content').disabled = false; document.querySelector('#save-file').disabled = false; } }
  if (event.target.id === 'new-folder' && activeFileProject) { const name = prompt('New folder name, for example assets'); if (name) { const response = await fetch(`/api/projects/${activeFileProject.id}/files/folder`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }); const result = await response.json(); showMessage('#file-message', response.ok ? 'Folder created.' : result.error, !response.ok); await listFiles(); } }
});
document.addEventListener('change', async event => { if (event.target.id !== 'file-upload' || !activeFileProject) return; for (const file of event.target.files) { const form = new FormData(); form.append('file', file); const response = await fetch(`/api/projects/${activeFileProject.id}/files/upload`, { method: 'POST', body: form }); if (!response.ok) { const result = await response.json(); showMessage('#file-message', result.error, true); } } event.target.value = ''; await listFiles(); });

function toggleSourceFields(selector, target) { document.querySelector(selector).hidden = target !== 'github'; }
document.querySelectorAll('input[name="sourceType"]').forEach(input => input.addEventListener('change', event => { const github = event.target.value === 'github'; const blank = event.target.value === 'blank'; document.querySelector('#github-source').hidden = !github; document.querySelector('#zip-source').hidden = github || blank; }));
document.querySelectorAll('input[name="editSourceType"]').forEach(input => input.addEventListener('change', event => toggleSourceFields('#edit-github-source', event.target.value)));
document.querySelector('#project').addEventListener('submit', async event => { event.preventDefault(); const formData = new FormData(event.currentTarget); const blank = formData.get('sourceType') === 'blank'; const response = await fetch(blank ? '/api/projects/blank' : '/api/projects', { method: blank ? 'POST' : 'POST', headers: blank ? { 'Content-Type': 'application/json' } : {}, body: blank ? JSON.stringify({ name: formData.get('name') }) : formData }); const result = await response.json(); showMessage('#message', response.ok ? 'Project created. Source files are processing.' : result.error, !response.ok); if (response.ok) { event.currentTarget.reset(); load(); switchTab('projects'); } });

function openEditor(project) { const editor = document.querySelector('#editor'); const form = document.querySelector('#edit-project'); form.elements.id.value = project.id; form.elements.name.value = project.name; form.elements.phpVersion.value = project.phpVersion || '8.5'; form.elements.repoUrl.value = project.repoUrl || ''; form.elements.editSourceType.value = 'keep'; document.querySelector('#edit-github-source').hidden = true; document.querySelector('#edit-message').textContent = ''; editor.hidden = false; form.elements.name.focus(); }
function closeEditor() { document.querySelector('#editor').hidden = true; }
document.querySelector('#close-editor').addEventListener('click', closeEditor); document.querySelector('#cancel-editor').addEventListener('click', closeEditor);
document.querySelector('#edit-project').addEventListener('submit', async event => { event.preventDefault(); const form = event.currentTarget; const data = { name: form.elements.name.value, phpVersion: form.elements.phpVersion.value }; if (form.elements.editSourceType.value === 'github') { data.sourceType = 'github'; data.repoUrl = form.elements.repoUrl.value; } const response = await fetch(`/api/projects/${form.elements.id.value}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); const result = await response.json(); if (response.ok) { await fetch(`/api/projects/${form.elements.id.value}/redeploy`, { method: 'POST' }); document.querySelector('#edit-message').textContent = 'Saved. Remote Docker is switching PHP version.'; closeEditor(); load(); } else document.querySelector('#edit-message').textContent = result.error; });

document.querySelector('#projects').addEventListener('click', async event => { const button = event.target.closest('[data-action]'); if (!button) return; const projects = (await (await fetch('/api/me')).json()).projects; const project = projects.find(item => item.id === button.dataset.id); const action = button.dataset.action; if (action === 'files') return openFiles(project); if (action === 'edit') return openEditor(project); if (action === 'delete' && !confirm('Delete this project and its local files?')) return; const suffix = action === 'toggle' ? '/toggle' : action === 'rebuild' ? '/rebuild' : action === 'maintenance' ? '/maintenance' : ''; await fetch(`/api/projects/${button.dataset.id}${suffix}`, { method: action === 'delete' ? 'DELETE' : 'POST' }); load(); });
document.querySelector('#logout').addEventListener('click', async () => { await fetch('/api/auth/logout', { method: 'POST' }); location.href = '/'; });
switchTab(getTabFromHash(), false);
window.addEventListener('hashchange', () => switchTab(getTabFromHash(), false));
load();
setInterval(load, 3000);
