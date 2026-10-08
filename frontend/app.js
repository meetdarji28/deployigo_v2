function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// ── showMessage utility ─────────────────────────────────────────
function showMessage(selector, text, isError = false) {
  const el = document.querySelector(selector);
  if (!el) return;
  el.textContent = text || '';
  el.style.display = text ? '' : 'none';
  el.style.color = isError ? '#d9381e' : '#1a7a3c';
  el.style.background = isError ? '#fdf2f0' : '#edfaf2';
  el.style.border = isError ? '1px solid #f8c8c0' : '1px solid #b2e4c4';
  el.style.borderRadius = '6px';
  el.style.padding = text ? '10px 14px' : '0';
  el.style.font = "12px/1.4 'DM Mono',monospace";
  el.style.marginTop = '8px';
}


let _toastTimer = null;
function showComingSoon(techName) {
  const el = document.getElementById('coming-soon-toast');
  if (!el) return;
  el.innerHTML = `<span>${techName}</span> support is coming soon! We'll notify you when it's available. 🚀`;
  el.classList.add('show');
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

// ── Technology Selector ────────────────────────────────────────
function selectTech(tech) {
  document.querySelectorAll('.tech-card:not(.coming-soon)').forEach(c => c.classList.remove('selected'));
  const card = document.querySelector(`.tech-card[data-tech="${tech}"]`);
  if (card) card.classList.add('selected');
  const hidden = document.getElementById('tech-hidden');
  if (hidden) hidden.value = tech;
  // Show/hide PHP version row
  const phpRow = document.getElementById('php-version-row');
  if (phpRow) phpRow.hidden = (tech !== 'php');
  const code = document.getElementById('create-html-code-row');
  if (code) code.hidden = tech !== 'html';
}

// ── Create Source Tabs (3 tabs: Blank / ZIP / Git) ──────────────────
function initCreateSourceTabs() {
  const tabs = document.querySelectorAll('#create-source-tabs .git-tab-btn');
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      tabs.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const src = btn.dataset.src;
      document.getElementById('create-source-type').value = src;
      // Show only the relevant panel using style.display
      const zipPanel = document.getElementById('create-zip-panel');
      const gitPanel = document.getElementById('create-git-panel');
      if (zipPanel) zipPanel.style.display = src === 'zip' ? 'grid' : 'none';
      if (gitPanel) gitPanel.style.display = src === 'git' ? 'grid' : 'none';
      // Enable autobuild only when git is selected
      const ab = document.getElementById('create-autobuild-section');
      if (ab) {
        ab.style.opacity = src === 'git' ? '1' : '0.4';
        ab.style.pointerEvents = src === 'git' ? 'auto' : 'none';
      }
    });
  });
}

// ── Edit Source Tabs (2 tabs: Keep / Change Repo) ────────────────
function initEditSourceTabs() {
  const tabs = document.querySelectorAll('#edit-source-tabs .git-tab-btn');
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      tabs.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const src = btn.dataset.src;
      document.getElementById('edit-source-type').value = src;
      const gitPanel = document.getElementById('edit-git-panel');
      if (gitPanel) gitPanel.style.display = src === 'git' ? 'grid' : 'none';
    });
  });
}


// ── Provider metadata with inline SVG logos ───────────────────────────
const PROVIDER_META = {
  github: {
    name: 'GitHub', color: '#24292e', oauthUrl: '/api/oauth/github/authorize',
    svg: `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>`
  },
  gitlab: {
    name: 'GitLab', color: '#fc6d26', oauthUrl: '/api/oauth/gitlab/authorize',
    svg: `<svg viewBox="0 0 24 24" width="22" height="22" fill="#fc6d26"><path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 0 1-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 0 1 4.82 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0 1 18.6 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.51 1.22 3.75a.84.84 0 0 1-.35.94z"/></svg>`
  },
  bitbucket: {
    name: 'Bitbucket', color: '#0052cc', oauthUrl: '/api/oauth/bitbucket/authorize',
    svg: `<svg viewBox="0 0 24 24" width="22" height="22" fill="#0052cc"><path d="M.778 1.213a.768.768 0 0 0-.768.892l3.263 19.81c.084.5.515.868 1.022.873H19.95a.772.772 0 0 0 .77-.646l3.27-20.03a.768.768 0 0 0-.768-.892zm14.52 14.317h-6.46l-1.542-8.051h9.464z"/></svg>`
  },
  azure: {
    name: 'Azure DevOps', color: '#0078d4', oauthUrl: null,
    svg: `<svg viewBox="0 0 24 24" width="22" height="22" fill="#0078d4"><path d="M0 17.717l2.008-.555V6.623L.047 6.04l-.047.23v11.37zm18.48-14.08L10.8.002 4.57 5.453v2.971L18.48 3.637zm1.04.923l4.48 3.54v7.48l-4.48 1.74V4.56zm-4.48 14.95L7.2 24l-6.48-3.77v-2.32l13.32.6zm-14-5.96l2.84 1 8.56-7.08v3.56l-8.56 8.12-2.84-.88V13.55z"/></svg>`
  },
  gitea: {
    name: 'Gitea', color: '#609926', oauthUrl: '/api/oauth/gitea/authorize',
    svg: `<svg viewBox="0 0 24 24" width="22" height="22" fill="#609926"><path d="M20.302 12.548a5.184 5.184 0 0 0-.983-3.032L12.607.491a.758.758 0 0 0-1.212 0L4.683 9.516a5.207 5.207 0 0 0-.983 3.032v5.27A2.184 2.184 0 0 0 5.88 20h12.24a2.184 2.184 0 0 0 2.18-2.182zM12 17.25a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm1.5-5.75h-3l-.75-4.5h4.5z"/></svg>`
  },
  other: {
    name: 'Custom Git', color: '#526059', oauthUrl: null,
    svg: `<svg viewBox="0 0 24 24" width="22" height="22" fill="#526059"><path d="M5.559 8.855c.166 1.461 1.204 2.379 2.33 2.828l.04.013a4.978 4.978 0 0 0-.154.571c-.24 1.14-.024 2.245.737 3.114.756.862 1.927 1.234 3.019 1.105.042.44.16.883.38 1.297.877 1.624 2.846 2.228 4.476 1.349l1.56-.841A3.25 3.25 0 0 0 19.158 13l-1.56.841a1.251 1.251 0 0 1-1.723-.52 1.247 1.247 0 0 1 .519-1.698l1.56-.84A3.249 3.249 0 0 0 16.627 6l-1.56.841a1.25 1.25 0 0 1-1.204-2.192l1.56-.84A3.249 3.249 0 0 0 13.584.5a3.262 3.262 0 0 0-2.872.67L9.04 2.74A3.25 3.25 0 0 0 7.888 6.5c0 .254.031.508.092.754a5.026 5.026 0 0 0-2.42 1.601z"/></svg>`
  }
};

function selectProvider(providerKey, context) {
  // Highlight card
  document.querySelectorAll(`#${context}-git-panel .provider-card`).forEach(c => c.classList.remove('selected'));
  const card = document.querySelector(`#${context}-git-panel .provider-card[data-provider="${providerKey}"]`);
  if (card) card.classList.add('selected');
  document.getElementById(`${context}-selected-provider`).value = providerKey;

  // Show connect step
  const step = document.getElementById(`${context}-connect-step`);
  if (step) step.style.display = 'grid';

  const meta = PROVIDER_META[providerKey] || PROVIDER_META.other;

  // Update provider name in all relevant elements
  document.querySelectorAll(`[id="${context}-provider-name"], .${context}-auth-provider-name`).forEach(el => el.textContent = meta.name);
  const connectedNameEl = document.getElementById(`${context}-provider-name-connected`);
  if (connectedNameEl) connectedNameEl.textContent = meta.name;
  const repoNameEl = document.getElementById(`${context}-provider-name-repo`);
  if (repoNameEl) repoNameEl.textContent = meta.name;

  // Update SVG icon in the connect button
  const iconLg = document.getElementById(`${context}-provider-icon-lg`);
  if (iconLg) iconLg.innerHTML = meta.svg;

  // Update PAT hint for create context
  if (context === 'create') {
    const hint = document.getElementById('create-pat-hint');
    if (hint) {
      const links = {
        github:    '<a href="https://github.com/settings/tokens" target="_blank">GitHub Tokens</a>',
        gitlab:    '<a href="https://gitlab.com/-/profile/personal_access_tokens" target="_blank">GitLab Tokens</a>',
        bitbucket: '<a href="https://bitbucket.org/account/settings/app-passwords/" target="_blank">Bitbucket App Passwords</a>',
        azure:     '<a href="https://dev.azure.com" target="_blank">Azure DevOps PAT</a>',
        gitea:     'your Gitea → User Settings → Applications',
        other:     'your provider\'s developer token page'
      };
      hint.innerHTML = `Generate at: ${links[providerKey] || links.other}. Needs <strong>repo</strong> scope. Stored encrypted.`;
    }
  }

  // Azure/Other don't support OAuth — auto-switch to PAT
  if (!meta.oauthUrl) {
    setConnectMethod('token', context);
  } else {
    setConnectMethod('oauth', context);
    _setOAuthState(context, 'idle'); // reset OAuth state on provider change
  }
}

// ── Connect Method toggle ───────────────────────────────────────────────
function setConnectMethod(method, context) {
  document.getElementById(`${context}-connect-method`).value = method;
  document.querySelectorAll(`#${context}-connect-step .connect-method-btn`).forEach(b => {
    b.classList.toggle('active', b.dataset.method === method);
  });
  const panels = { oauth: 'oauth-panel', token: 'pat-panel', public: 'public-panel' };
  Object.entries(panels).forEach(([m, id]) => {
    const el = document.getElementById(`${context}-${id}`);
    if (el) el.style.display = m === method ? 'block' : 'none';
  });
}

// ── OAuth 3-state flow: idle → authorizing → connected ─────────────────
const oauthConnections = {};

function _setOAuthState(context, state) {
  const idle        = document.getElementById(`${context}-oauth-idle`);
  const authorizing = document.getElementById(`${context}-oauth-authorizing`);
  const connected   = document.getElementById(`${context}-oauth-connected`);
  if (idle)        idle.style.display        = state === 'idle'        ? 'block' : 'none';
  if (authorizing) authorizing.style.display = state === 'authorizing' ? 'block' : 'none';
  if (connected)   connected.style.display   = state === 'connected'   ? 'block' : 'none';
}

function startOAuth(context) {
  const providerKey = document.getElementById(`${context}-selected-provider`)?.value || 'github';
  const meta = PROVIDER_META[providerKey] || PROVIDER_META.github;

  if (!meta.oauthUrl) {
    setConnectMethod('token', context);
    return;
  }

  // Update provider name in waiting state
  document.querySelectorAll(`.${context}-auth-provider-name`).forEach(el => el.textContent = meta.name);

  // Build OAuth URL (real backend endpoint)
  const oauthUrl = `${location.origin}${meta.oauthUrl}?return_url=${encodeURIComponent(location.href)}`;

  // Set the manual link fallback
  const manualLink = document.getElementById(`${context}-oauth-manual-link`);
  if (manualLink) manualLink.href = oauthUrl;

  // Try to open popup
  const popup = window.open(oauthUrl, `oauth_${providerKey}`, 'width=660,height=740,scrollbars=yes,status=yes,toolbar=no,menubar=no');

  // Show authorizing state (waiting for user to complete)
  _setOAuthState(context, 'authorizing');

  // Listen for message from OAuth popup window
  const handleOAuthMessage = (event) => {
    if (event.origin === location.origin && event.source === popup && event.data && event.data.type === 'OAUTH_COMPLETE' && event.data.provider === providerKey) {
      window.removeEventListener('message', handleOAuthMessage);
      completeOAuth(context, event.data.user, event.data.repos, event.data.orgs, event.data.grant);
    }
  };
  window.addEventListener('message', handleOAuthMessage);

  if (popup) {
    const checkPopup = setInterval(() => {
      try { if (popup.closed) {clearInterval(checkPopup);if(!oauthConnections[context]?.grant)_setOAuthState(context,'idle');} } catch(e) { clearInterval(checkPopup); }
    }, 600);
  }
}

function cancelOAuth(context) {
  _setOAuthState(context, 'idle');
}

function completeOAuth(context, customUser, customRepos, customOrgs, oauthGrant) {
  const providerKey = document.getElementById(`${context}-selected-provider`)?.value || 'github';
  const meta = PROVIDER_META[providerKey] || PROVIDER_META.github;

  const username = customUser || 'developer';
  oauthConnections[context] = { provider: providerKey, username, repos: customRepos || [], grant: oauthGrant || '' };

  const usernameEl = document.getElementById(`${context}-oauth-username`);
  if (usernameEl) usernameEl.textContent = `${username} (${meta.name})`;

  const connectedNameEl = document.getElementById(`${context}-provider-name-connected`);
  if (connectedNameEl) connectedNameEl.textContent = meta.name;
  const repoNameEl = document.getElementById(`${context}-provider-name-repo`);
  if (repoNameEl) repoNameEl.textContent = meta.name;

  const repoList = Array.isArray(customRepos) ? customRepos : []; // Never invent placeholder repositories.

  // Populate Organizations dropdown
  const orgSelect = document.getElementById(`${context}-oauth-org-select`);
  if (orgSelect) {
    const orgsSet = new Set([username]);
    if (customOrgs && Array.isArray(customOrgs)) customOrgs.forEach(o => orgsSet.add(o));
    repoList.forEach(r => { if (r.org) orgsSet.add(r.org); });

    orgSelect.innerHTML = '<option value="all">All Accounts & Organizations (' + repoList.length + ' repos)</option>' +
      Array.from(orgsSet).map(org => `<option value="${org}">🏢 ${org}</option>`).join('');
  }

  renderOAuthRepoOptions(context, repoList);
  _setOAuthState(context, 'connected');
}

function renderOAuthRepoOptions(context, repos) {
  const repoSelect = document.getElementById(`${context}-oauth-repo-select`);
  if (!repoSelect) return;

  if (!repos || repos.length === 0) {
    repoSelect.innerHTML = '<option value="">— No repositories found —</option><option value="custom">✏️ Enter custom URL...</option>';
    return;
  }

  repoSelect.innerHTML = '<option value="">— Select a repository (' + repos.length + ' available) —</option>' +
    repos.map(r => `<option value="${r.url}" data-branches='${JSON.stringify(r.branches)}'>📦 ${r.name}</option>`).join('') +
    '<option value="custom">✏️ Enter custom URL...</option>';
  
  repoSelect.value = repos[0].url;
  onOAuthRepoSelectChange(context);
}

function onOAuthOrgFilterChange(context) {
  const orgSelect = document.getElementById(`${context}-oauth-org-select`);
  const conn = oauthConnections[context];
  if (!orgSelect || !conn || !conn.repos) return;

  const selectedOrg = orgSelect.value;
  const filtered = (selectedOrg === 'all')
    ? conn.repos
    : conn.repos.filter(r => r.org === selectedOrg || r.name.startsWith(selectedOrg + '/'));

  renderOAuthRepoOptions(context, filtered);
}

function onOAuthRepoSelectChange(context) {
  const repoSelect = document.getElementById(`${context}-oauth-repo-select`);
  const repoUrlInput = document.getElementById(`${context}-oauth-repo-url`);
  const branchSelect = document.getElementById(`${context}-oauth-branch-select`);
  if (!repoSelect) return;

  const selectedOpt = repoSelect.options[repoSelect.selectedIndex];
  if (repoSelect.value === 'custom' || !repoSelect.value) {
    if (repoUrlInput) repoUrlInput.value = '';
    if (branchSelect) branchSelect.innerHTML = '<option value="main">main</option><option value="master">master</option><option value="dev">dev</option>';
  } else {
    if (repoUrlInput) repoUrlInput.value = repoSelect.value;
    if (selectedOpt && selectedOpt.dataset.branches && branchSelect) {
      try {
        const branches = JSON.parse(selectedOpt.dataset.branches);
        branchSelect.innerHTML = branches.map(b => `<option value="${b}">${b}</option>`).join('');
      } catch(e) {}
    }
  }
}


function disconnectOAuth(context) {
  delete oauthConnections[context];
  _setOAuthState(context, 'idle');
  const repoUrlInput = document.getElementById(`${context}-oauth-repo-url`);
  if (repoUrlInput) repoUrlInput.value = '';
}





// ── Autobuild Webhook Toggle (Edit Modal) ──────────────────────
function initEditAutobuildToggle() {
  const toggle = document.getElementById('edit-autobuild-toggle');
  if (!toggle) return;
  toggle.addEventListener('change', () => {
    const section = document.getElementById('edit-webhook-section');
    if (section) section.style.display = toggle.checked ? 'block' : 'none';
  });
  const copyBtn = document.getElementById('edit-copy-webhook');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const code = document.getElementById('edit-webhook-url');
      if (code) {
        navigator.clipboard.writeText(code.textContent).then(() => {
          copyBtn.textContent = 'Copied!';
          setTimeout(() => copyBtn.textContent = 'Copy', 2000);
        });
      }
    });
  }
}

// ── Ring Chart (per-project resource monitoring) ───────────────
function drawRingChart(canvas, pct, color) {
  const dpr = window.devicePixelRatio || 1;
  const size = 80;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = size + 'px';
  canvas.style.height = size + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const cx = size / 2, cy = size / 2, r = 30, lw = 10;
  // Track
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(23,33,29,0.08)';
  ctx.lineWidth = lw;
  ctx.stroke();
  // Fill
  const start = -Math.PI / 2;
  const end = start + (Math.PI * 2 * Math.min(pct, 1));
  ctx.beginPath();
  ctx.arc(cx, cy, r, start, end);
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.stroke();
  // Label
  ctx.fillStyle = '#17211d';
  ctx.font = 'bold 13px Space Grotesk, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(Math.round(pct * 100) + '%', cx, cy);
}

function renderRingCharts(project) {
  const container = document.getElementById('modal-ring-charts');
  if (!container) return;
  // Storage: storageBytes vs 5 GB
  const storagePct = Math.min((project.storageBytes || 0) / (5 * 1024 * 1024 * 1024), 1);
  // RAM: parse project.ram (e.g. '1 GB' => 1 GB = 1024 MB), use ramUsedMB if available
  const ramTotalMB = parseRamMB(project.ram || '1 GB');
  const ramUsedMB = project.ramUsedMB || 0;
  const ramPct = ramTotalMB > 0 ? Math.min(ramUsedMB / ramTotalMB, 1) : 0;
  // CPU: project.cpuPercent if available
  const cpuPct = Math.min((project.cpuPercent || 0) / 100, 1);

  container.innerHTML = [
    { label: 'Storage', pct: storagePct, val: formatBytes(project.storageBytes || 0) + ' / 5 GB', color: '#f06e45' },
    { label: 'RAM', pct: ramPct, val: (ramUsedMB > 0 ? ramUsedMB + ' MB' : '0 MB') + ' / ' + (project.ram || '1 GB'), color: '#17211d' },
    { label: 'CPU', pct: cpuPct, val: (project.cpuPercent || 0) + '%', color: '#d8f27b' }
  ].map((item, i) => `
    <div class="ring-chart-item">
      <canvas id="ring-canvas-${i}"></canvas>
      <div class="ring-chart-label">${item.label}</div>
      <div class="ring-chart-val">${item.val}</div>
    </div>
  `).join('');

  // Draw after render
  const colors = ['#f06e45', '#17211d', '#d8f27b'];
  const pcts = [storagePct, ramPct, cpuPct];
  setTimeout(() => {
    pcts.forEach((p, i) => {
      const canvas = document.getElementById(`ring-canvas-${i}`);
      if (canvas) drawRingChart(canvas, p, colors[i]);
    });
  }, 30);
}

function parseRamMB(ramStr) {
  if (!ramStr) return 1024;
  const m = ramStr.match(/([\d.]+)\s*(GB|MB)/i);
  if (!m) return 1024;
  const val = parseFloat(m[1]);
  return m[2].toUpperCase() === 'GB' ? val * 1024 : val;
}

// ── Overview Stats Update ──────────────────────────────────────
function updateOverviewStats(projects, workspaceStats) {
  const totalStorageBytes = workspaceStats ? workspaceStats.totalStorageBytes : 0;
  const quotaBytes = 5 * 1024 * 1024 * 1024; // 5 GB
  const storageMB = (totalStorageBytes / (1024 * 1024)).toFixed(1);
  const storageGB = (totalStorageBytes / (1024 * 1024 * 1024)).toFixed(2);
  const storagePct = Math.min((totalStorageBytes / quotaBytes) * 100, 100);

  const statStorageEl = document.getElementById('stat-storage');
  const storageBar = document.getElementById('stat-storage-bar');
  const storageSub = document.getElementById('stat-storage-sub');
  if (statStorageEl) statStorageEl.textContent = storageMB + ' MB';
  if (storageSub) storageSub.textContent = storageGB + ' GB / 5 GB quota (' + storagePct.toFixed(1) + '%)';
  if (storageBar) requestAnimationFrame(() => { storageBar.style.width = storagePct + '%'; });

  // vCPU: sum cpuPercent across projects scaled to 1 vCPU
  const totalCpuPct = projects.reduce((sum, p) => sum + (p.cpuPercent || 0), 0);
  const cpuUsed = (totalCpuPct / 100).toFixed(2);
  const cpuPct = Math.min(totalCpuPct, 100);
  const vcpuEl = document.getElementById('stat-vcpu');
  const vcpuBar = document.getElementById('stat-vcpu-bar');
  const vcpuSub = document.getElementById('stat-vcpu-sub');
  if (vcpuEl) vcpuEl.textContent = cpuUsed + ' vCPU';
  if (vcpuSub) vcpuSub.textContent = 'of 1 vCPU allocated (' + totalCpuPct.toFixed(1) + '%)';
  if (vcpuBar) requestAnimationFrame(() => { vcpuBar.style.width = cpuPct + '%'; });

  // RAM: sum ramUsedMB across projects
  const totalRamUsedMB = projects.reduce((sum, p) => sum + (p.ramUsedMB || 0), 0);
  const ramQuotaMB = 1024;
  const ramPct = Math.min((totalRamUsedMB / ramQuotaMB) * 100, 100);
  const ramEl = document.getElementById('stat-ram');
  const ramBar = document.getElementById('stat-ram-bar');
  const ramSub = document.getElementById('stat-ram-sub');
  if (ramEl) ramEl.textContent = totalRamUsedMB > 0 ? totalRamUsedMB + ' MB' : '0 MB';
  if (ramSub) ramSub.textContent = 'of 1 GB allocated (' + ramPct.toFixed(1) + '%)';
  if (ramBar) requestAnimationFrame(() => { ramBar.style.width = ramPct + '%'; });
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

function showServerErrorDialog(message, title = 'Worker Server Error') {
  return new Promise(resolve => {
    let dialog = document.querySelector('#server-error-dialog');
    if (!dialog) {
      document.body.insertAdjacentHTML('beforeend', `
        <div id="server-error-dialog" class="modal" hidden style="z-index:9999">
          <div class="modal-card" style="max-width:500px;border-top:5px solid #f06e45;background:#161b22;color:#c9d1d9;padding:28px;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,0.7)">
            <div class="modal-head" style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px">
              <div>
                <p class="eyebrow" style="color:#f06e45;font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin:0 0 4px">⚠️ Action Blocked</p>
                <h2 id="server-error-title" style="margin:0;font-size:22px;color:#ffffff;font-weight:700">Worker Server Down</h2>
              </div>
              <button class="icon-button" id="server-error-close" type="button" aria-label="Close" style="background:none;border:none;color:#8b949e;font-size:24px;cursor:pointer;line-height:1">×</button>
            </div>
            <div style="margin:16px 0 24px">
              <p id="server-error-message" style="color:#ff7b72;font-weight:600;font-size:14px;line-height:1.5;margin:0 0 16px;background:rgba(255,123,114,0.1);padding:12px;border-radius:6px;border-left:3px solid #ff7b72"></p>
              <div style="background:rgba(240,110,69,0.08);border:1px dashed #f06e45;padding:14px 16px;border-radius:8px;font-size:13px;line-height:1.6;color:#8b949e">
                <strong style="color:#f06e45">Why is this action blocked?</strong><br>
                The worker system server (167) is currently offline, stopped, or unreachable.<br><br>
                To prevent orphan containers or corrupted project state, modifications are temporarily disabled.<br><br>
                📞 <strong style="color:#ffffff">Please connect to support for assistance.</strong>
              </div>
            </div>
            <div class="modal-actions" style="display:flex;justify-content:flex-end">
              <button class="button danger" id="server-error-ok" type="button" style="background:#f06e45;color:#ffffff;border:none;padding:10px 20px;border-radius:6px;font-weight:600;cursor:pointer;font-size:14px">OK, I Understand</button>
            </div>
          </div>
        </div>
      `);
      dialog = document.querySelector('#server-error-dialog');
    }
    const titleEl = document.querySelector('#server-error-title');
    const msgEl = document.querySelector('#server-error-message');
    const closeBtn = document.querySelector('#server-error-close');
    const okBtn = document.querySelector('#server-error-ok');

    titleEl.textContent = title;
    msgEl.textContent = message || 'Worker server is down or experiencing issues. Please contact support.';
    dialog.hidden = false;

    const cleanup = () => {
      dialog.hidden = true;
      closeBtn.removeEventListener('click', cleanup);
      okBtn.removeEventListener('click', cleanup);
      resolve();
    };

    closeBtn.addEventListener('click', cleanup);
    okBtn.addEventListener('click', cleanup);
  });
}


async function load() {
  const response = await fetch('/api/me');
  if (!response.ok) return location.href = '/login.html';
  const data = await response.json();
  document.querySelector('#user').textContent = data.user.email;
  document.querySelector('#hello').textContent = `${data.user.name}'s projects.`;
  // The admin console is a separate route, only advertised to admins.
  if (data.user.isAdmin === true && !document.querySelector('#admin-console-link')) {
    const link = document.createElement('a');
    link.id = 'admin-console-link';
    link.className = 'nav-btn';
    link.href = `${location.protocol}//${location.hostname}:${window.DIG_PORTAL?.adminPort || 4301}/admin/`;
    link.textContent = '⚙ Admin Console';
    document.querySelector('#logout').before(link);
  }

  // Update overview stats with progress bars
  updateOverviewStats(data.projects || [], data.workspaceStats || null);

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
  const hash = location.hash.replace(/^#\/?/, '').split('/')[0].trim();
  return ['overview', 'projects', 'create'].includes(hash) ? hash : 'overview';
}

function switchTab(tab, updateHash = true) {
  const targetTab = ['overview', 'projects', 'create'].includes(tab) ? tab : 'overview';
  const createPanel = document.getElementById('create-panel');
  const projectsSection = document.getElementById('projects-section');
  const overviewContainer = document.getElementById('overview-container');

  if (updateHash) {
    const currentHash = location.hash.replace(/^#\/?/, '').split('/')[0].trim();
    if (currentHash !== targetTab) {
      try {
        history.replaceState(null, '', `#${targetTab}`);
      } catch (e) {
        location.hash = targetTab;
      }
    }
  }

  document.querySelectorAll('[data-tab]').forEach(btn => {
    const isTarget = btn.getAttribute('data-tab') === targetTab;
    if (isTarget) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  if (targetTab === 'create') {
    if (createPanel) { createPanel.hidden = false; createPanel.style.display = 'block'; }
    if (projectsSection) { projectsSection.hidden = true; projectsSection.style.display = 'none'; }
    if (overviewContainer) { overviewContainer.hidden = true; overviewContainer.style.display = 'none'; }
  } else if (targetTab === 'projects') {
    if (createPanel) { createPanel.hidden = true; createPanel.style.display = 'none'; }
    if (projectsSection) { projectsSection.hidden = false; projectsSection.style.display = 'block'; }
    if (overviewContainer) { overviewContainer.hidden = true; overviewContainer.style.display = 'none'; }
  } else {
    if (createPanel) { createPanel.hidden = true; createPanel.style.display = 'none'; }
    if (projectsSection) { projectsSection.hidden = false; projectsSection.style.display = 'block'; }
    if (overviewContainer) { overviewContainer.hidden = false; overviewContainer.style.display = 'block'; }
  }
}
window.switchTab = switchTab;

let activeModalProject = null;

function openProjectModal(project) {
  activeModalProject = project;
  const modal = document.querySelector('#project-modal');
  if (!modal) return;
  document.querySelector('#modal-project-name').textContent = project.name;
  document.querySelector('#modal-detail-name').textContent = project.name;
  document.querySelector('#modal-detail-tech').textContent = project.technology || 'PHP';
  document.querySelector('#modal-detail-engine').textContent = (project.technology || 'PHP').toLowerCase() === 'html' ? 'Static HTML' : `PHP ${project.phpVersion || '8.5'}`;
  
  let statusText = 'Active & Running';
  if (project.enabled === false) statusText = 'Disabled';
  else if (project.maintenance) statusText = 'Maintenance Mode';
  else if (project.sourceStatus && project.sourceStatus !== 'ready') statusText = project.sourceStatus;
  
  document.querySelector('#modal-detail-status').textContent = statusText;
  const errBox = document.querySelector('#modal-source-error');
  if (errBox) { errBox.hidden = !project.sourceError; errBox.textContent = project.sourceError ? `Deployment error: ${project.sourceError}` : ''; }
  const notesBox = document.querySelector('#modal-source-notes');
  if (notesBox) { const notes = project.sourceAnalysis?.recommendations || []; notesBox.hidden = notes.length === 0; notesBox.textContent = notes.join(' • '); }
  for (const action of ['composer', 'php-config', 'php-modules', 'verify-runtime']) { const button = document.querySelector(`#modal-act-${action}`); if (button) button.hidden = (project.technology || 'PHP').toLowerCase() === 'html'; }
  const urlAnchor = document.querySelector('#modal-detail-url');
  const previewReady = project.deploymentReady !== false && !!project.url && !['creating','downloading','extracting','deploying','redeploying','error'].includes(project.sourceStatus);
  urlAnchor.textContent = previewReady ? project.url : (project.sourceStatus === 'error' ? 'Deployment failed — see error above' : 'Deployment in progress — live URL will appear when ready');
  urlAnchor.href = previewReady ? project.url : '#';
  urlAnchor.style.pointerEvents = previewReady ? '' : 'none';

  const storageElem = document.querySelector('#modal-detail-storage');
  if (storageElem) storageElem.textContent = formatBytes(project.storageBytes || 0);

  const ramElem = document.querySelector('#modal-detail-ram');
  if (ramElem) ramElem.textContent = project.ram || '1 GB';

  const cpuElem = document.querySelector('#modal-detail-cpu');
  if (cpuElem) cpuElem.textContent = project.cpu || '1 vCPU';

  // Autobuild status
  const abElem = document.querySelector('#modal-detail-autobuild');
  if (abElem) abElem.textContent = project.webhookConfigured ? 'Signed GitHub webhook enabled' : 'Manual deploy only';

  // Repo row
  const repoRow = document.getElementById('modal-repo-row');
  const repoSpan = document.getElementById('modal-detail-repo');
  const repoUrl = project.repoUrl || project.privateRepoUrl || '';
  if (repoRow && repoSpan) {
    if (repoUrl) {
      repoSpan.textContent = repoUrl + (project.repoBranch || project.privateRepoBranch ? ' @ ' + (project.repoBranch || project.privateRepoBranch) : '');
      repoRow.style.display = '';
    } else {
      repoRow.style.display = 'none';
    }
  }

  document.querySelector('#modal-act-files').dataset.id = project.id;
  if (document.querySelector('#modal-act-logs')) document.querySelector('#modal-act-logs').dataset.id = project.id;
  if (document.querySelector('#modal-act-env')) document.querySelector('#modal-act-env').dataset.id = project.id;
  if (document.querySelector('#modal-act-database')) document.querySelector('#modal-act-database').dataset.id = project.id;
  if (document.querySelector('#modal-act-cicd')) document.querySelector('#modal-act-cicd').dataset.id = project.id;
  if (document.querySelector('#modal-act-php-config')) document.querySelector('#modal-act-php-config').dataset.id = project.id;
  if (document.querySelector('#modal-act-php-modules')) document.querySelector('#modal-act-php-modules').dataset.id = project.id;
  if (document.querySelector('#modal-act-composer')) document.querySelector('#modal-act-composer').dataset.id = project.id;
  const webhookButton = document.querySelector('#modal-act-webhook');
  if (webhookButton) webhookButton.hidden = !['github-public','oauth','private'].includes(project.sourceType);
  for (const key of ['terminal', 'verify-runtime', 'webhook']) { const button = document.querySelector(`#modal-act-${key}`); if (button) button.dataset.id = project.id; }
  if (document.querySelector('#modal-act-restart')) document.querySelector('#modal-act-restart').dataset.id = project.id;
  document.querySelector('#modal-act-edit').dataset.id = project.id;
  document.querySelector('#modal-act-rebuild').dataset.id = project.id;
  document.querySelector('#modal-act-toggle').dataset.id = project.id;
  document.querySelector('#modal-act-toggle').textContent = project.enabled === false ? 'Enable' : 'Disable';
  document.querySelector('#modal-act-maint').dataset.id = project.id;
  document.querySelector('#modal-act-maint').textContent = project.maintenance ? 'End Maintenance' : 'Maintenance Mode';
  document.querySelector('#modal-act-delete').dataset.id = project.id;


  // Render resource ring charts
  renderRingCharts(project);

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
  if (action === 'terminal') return openCommandConsole(project);
  if (action === 'webhook') return configureProjectWebhook(project);
  if (action === 'verify-runtime') { const response = await fetch(`/api/projects/${project.id}/runtime`); const details = await response.json(); alert(response.ok ? details.output : details.error); return; }
  if (action === 'logs') return openLogs(project);
  if (action === 'env') return openEnvModal(project);
  if (action === 'database') return openDatabaseModal(project);
  if (action === 'cicd') return openCicdModal(project);
  if (action === 'composer') {
    const apiPromise = fetch(`/api/projects/${projectId}/composer`, { method: 'POST' });
    await showOperationProgress('Running Composer Install...', `Installing dependencies for ${project.name}. Please wait...`, 10000);
    const res = await apiPromise;
    const resData = await res.json();
    if (!res.ok) {
      alert(`⚠️ Composer Install Result:\n\n${resData.error || resData.output || 'Composer binary missing in container. Please click "🔄 Rebuild" first so the updated container image installs Composer.'}`);
    } else {
      alert(`✅ Composer Install Succeeded:\n\n${resData.output || 'Dependencies installed successfully.'}`);
    }
    load();
    return;
  }
  if (action === 'php-config') return openPhpSettings(project);
  if (action === 'php-modules') return openPhpModules(project);
  if (action === 'edit') return openEditor(project);
  if (action === 'delete' && !confirm('Delete this project and its local files?')) return;


  const suffix = action === 'toggle' ? '/toggle' : action === 'rebuild' ? '/rebuild' : action === 'maintenance' ? '/maintenance' : '';

  let actionResponse;
  if (action === 'restart') {
    const apiPromise = fetch(`/api/projects/${projectId}/restart`, { method: 'POST' });
    await showOperationProgress('Restarting Container...', `Restarting ${project.name} Docker container instance...`, 4000);
    actionResponse = await apiPromise;
  } else if (action === 'rebuild') {
    const apiPromise = fetch(`/api/projects/${projectId}${suffix}`, { method: 'POST' });
    await showOperationProgress('Rebuilding Project...', `Re-compiling ${project.name} environment & dependencies. Please wait...`, 12000);
    actionResponse = await apiPromise;
  } else if (action === 'toggle' || action === 'maintenance') {
    const actName = action === 'toggle' ? (project.enabled === false ? 'Enabling' : 'Disabling') : (project.maintenance ? 'Ending Maintenance' : 'Starting Maintenance');
    const apiPromise = fetch(`/api/projects/${projectId}${suffix}`, { method: 'POST' });
    await showOperationProgress(`${actName} Project...`, `Updating runtime state for ${project.name}.`, 2500);
    actionResponse = await apiPromise;
  } else {
    actionResponse = await fetch(`/api/projects/${projectId}${suffix}`, { method: action === 'delete' ? 'DELETE' : 'POST' });
  }

  if (actionResponse && !actionResponse.ok) {
    const data = await actionResponse.json().catch(() => ({}));
    await showServerErrorDialog(data.error || 'Worker server is down or experiencing issues. Please contact support.');
    load();
    return;
  }

  load();
}

let activeLogsProject = null;

async function openLogs(project) {
  activeLogsProject = project;
  const modal = document.querySelector('#logs-modal');
  const title = document.querySelector('#logs-modal-title');
  const consoleEl = document.querySelector('#logs-console');
  if (title) title.textContent = `${project.name} — Web Logs`;
  if (consoleEl) consoleEl.textContent = 'Fetching application stdout and stderr logs...';
  if (modal) modal.hidden = false;

  await fetchAndDisplayLogs();
}


async function fetchAndDisplayLogs() {
  if (!activeLogsProject) return;
  const consoleEl = document.querySelector('#logs-console');
  try {
    const res = await fetch(`/api/projects/${activeLogsProject.id}/logs`);
    const data = await res.json();
    if (consoleEl) consoleEl.textContent = data.logs || 'No logs recorded.';
  } catch (err) {
    if (consoleEl) consoleEl.textContent = `Failed to retrieve logs: ${err.message}`;
  }
}

document.querySelector('#close-logs-modal')?.addEventListener('click', () => {
  const modal = document.querySelector('#logs-modal');
  if (modal) modal.hidden = true;
});

document.querySelector('#close-logs-btn')?.addEventListener('click', () => {
  const modal = document.querySelector('#logs-modal');
  if (modal) modal.hidden = true;
});

document.querySelector('#refresh-logs-btn')?.addEventListener('click', () => {
  fetchAndDisplayLogs();
});

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

  document.querySelector('#projects').innerHTML = projects.length ? projects.map(project => {
    const tech = project.technology || 'PHP';
    const ver = tech.toLowerCase() === 'php' ? (project.phpVersion || 'PHP 8.5') : tech;
    const abBadge = project.webhookConfigured ? '<span class="autobuild-badge">⚡ Webhook enabled</span>' : '';
    const repoUrl = project.repoUrl || project.privateRepoUrl || '';
    const repoInfo = repoUrl ? ` · 🔗 ${repoUrl.replace('https://github.com/', '').replace('https://gitlab.com/', '')}` : '';
    return `
    <article class="project" data-project-id="${project.id}">
      <div>
        <strong>${project.name}${abBadge}</strong>
        <p>${tech} · ${ver} · 💾 ${formatBytes(project.storageBytes || 0)} · ⚡ ${project.ram || '1 GB'} / ${project.cpu || '1 vCPU'}${repoInfo}${project.enabled === false ? ' · disabled' : ''}${project.maintenance ? ' · maintenance on' : ''}${project.sourceStatus && project.sourceStatus !== 'ready' ? ` · ${project.sourceStatus === 'error' ? 'Deployment failed — open details' : project.sourceStatus}` : ''}</p>
      </div>
      <div class="project-actions">
        ${project.url && project.deploymentReady !== false && project.sourceStatus === 'ready' ? `<a href="${project.url}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">${project.previewStatus === 'no-entry-point' ? 'View status' : 'Open preview ↗'}</a>` : `<span class="deploy-state">${project.sourceStatus === 'error' ? '⚠ Build failed' : '⏳ Deploying — preview pending'}</span>`}
        <div class="menu-container">
          <button class="menu-trigger ${currentOpenId === project.id ? 'active' : ''}" type="button" aria-label="More options" onclick="toggleProjectMenu(event, '${project.id}')">⋮</button>
          <div class="menu-dropdown" id="menu-${project.id}" ${currentOpenId === project.id ? '' : 'hidden'} onclick="event.stopPropagation()">
            <button type="button" onclick="handleProjectAction(event, 'files', '${project.id}')">📁 File Manager</button>
            <button type="button" onclick="handleProjectAction(event, 'logs', '${project.id}')">📋 Web Logs</button>
            <button type="button" onclick="handleProjectAction(event, 'terminal', '${project.id}')">⌨️ Command Console</button>
            ${['github-public','oauth','private'].includes(project.sourceType) ? `<button type="button" onclick="handleProjectAction(event, 'webhook', '${project.id}')">⚡ Configure GitHub Webhook</button>` : ''}
            <button type="button" onclick="handleProjectAction(event, 'env', '${project.id}')">🔑 Environment (.env)</button>
            <button type="button" onclick="handleProjectAction(event, 'database', '${project.id}')">🗄️ Database Manager</button>
            <button type="button" onclick="handleProjectAction(event, 'cicd', '${project.id}')">⚙️ Build Steps (CI/CD)</button>
            <button type="button" onclick="handleProjectAction(event, 'composer', '${project.id}')">📦 Composer Install</button>
            <button type="button" onclick="handleProjectAction(event, 'php-config', '${project.id}')">⚙️ PHP Config</button>
            <button type="button" onclick="handleProjectAction(event, 'php-modules', '${project.id}')">🧩 PHP Extensions</button>
            <button type="button" onclick="handleProjectAction(event, 'restart', '${project.id}')">🔁 Restart Container</button>
            <button type="button" onclick="handleProjectAction(event, 'edit', '${project.id}')">✏️ Edit Settings</button>
            <button type="button" onclick="handleProjectAction(event, 'rebuild', '${project.id}')">🔄 Rebuild</button>
            <button type="button" onclick="handleProjectAction(event, 'toggle', '${project.id}')">${project.enabled === false ? '⚡ Enable' : '🛑 Disable'}</button>
            <button type="button" onclick="handleProjectAction(event, 'maintenance', '${project.id}')">${project.maintenance ? '🟢 End Maintenance' : '🛠 Maintenance Mode'}</button>
            <button type="button" class="danger" onclick="handleProjectAction(event, 'delete', '${project.id}')">🗑️ Delete</button>
          </div>
        </div>
      </div>
    </article>`;

  }).join('') : '<p class="muted">No projects yet. Create your first project above.</p>';
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

  const tabBtn = event.target.closest('[data-tab]');
  if (tabBtn) {
    event.preventDefault();
    switchTab(tabBtn.dataset.tab);
    return;
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
  document.querySelector('#save-file')?.addEventListener('click', () => {
    if (activeFileProject) saveActiveFile();
  });
  document.querySelector('#close-file-editor')?.addEventListener('click', () => {
    const editorContainer = document.querySelector('.file-editor-container');
    const fileLayout = document.querySelector('.file-layout');
    if (editorContainer) editorContainer.hidden = true;
    if (fileLayout) fileLayout.classList.remove('editor-open');
  });
  document.querySelector('#close-files')?.addEventListener('click', () => {
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

// Initialize new tab-based source selectors
initCreateSourceTabs();
initEditSourceTabs();
initEditAutobuildToggle();
// Tech selector default
selectTech('php');
document.querySelector('#project')?.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const sourceType  = document.getElementById('create-source-type').value; // blank | zip | git
  const technology  = document.getElementById('tech-hidden').value;
  const autoBuild   = document.getElementById('create-autobuild-toggle')?.checked || false;
  const name        = formData.get('name');
  const connectMethod = document.getElementById('create-connect-method')?.value || 'public';
  const providerKey   = document.getElementById('create-selected-provider')?.value || '';

  let payload = null;
  let isJson = false;
  let endpoint = '/api/projects';

  if (sourceType === 'blank') {
    isJson = true;
    endpoint = '/api/projects/blank';
    payload = { name, technology, phpVersion: formData.get('phpVersion') || '8.5', autoBuild, initialHtml: technology === 'html' ? (document.getElementById('create-html-code')?.value || '') : undefined };

  } else if (sourceType === 'zip') {
    formData.set('technology', technology);
    formData.set('autoBuild', autoBuild);
    payload = formData;

  } else if (sourceType === 'git') {
    isJson = true;
    if (connectMethod === 'oauth') {
      const conn = oauthConnections['create'];
      const repoUrlInput = document.getElementById('create-oauth-repo-url');
      const branchSel = document.getElementById('create-oauth-branch-select');
      payload = {
        name, technology, phpVersion: formData.get('phpVersion') || '8.5', autoBuild,
        sourceType: 'oauth',
        provider: providerKey,
        repoUrl: repoUrlInput ? repoUrlInput.value : '',
        repoBranch: branchSel ? branchSel.value : 'main',
        oauthUser: conn ? conn.username : '',
        oauthGrant: conn ? conn.grant : ''
      };

    } else if (connectMethod === 'token') {
      payload = {
        name, technology, phpVersion: formData.get('phpVersion') || '8.5', autoBuild,
        sourceType: 'private',
        provider: providerKey,
        repoUrl: formData.get('repoUrl'),
        repoBranch: formData.get('repoBranch') || 'main',
        repoToken: formData.get('repoToken')
      };
    } else { // public
      payload = {
        name, technology, phpVersion: formData.get('phpVersion') || '8.5', autoBuild,
        sourceType: 'github',
        provider: providerKey,
        repoUrl: formData.get('publicRepoUrl'),
        repoBranch: formData.get('publicRepoBranch') || 'main'
      };
    }
  }

  const techLabel = technology === 'php' ? 'PHP' : 'HTML';
  const progressPromise = showOperationProgress(
    `Creating ${techLabel} Project`,
    `Provisioning workspace and compiling ${name} container...`,
    sourceType === 'blank' ? 3000 : 8000
  );

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: isJson ? { 'Content-Type': 'application/json' } : {},
      body: isJson ? JSON.stringify(payload) : payload
    });
    const result = await response.json();
    await progressPromise;
    if (!response.ok) {
      await showServerErrorDialog(result.error || 'Failed to create project.');
      showMessage('#message', result.error || 'Failed to create project.', true);
      return;
    }
    showMessage('#message', 'Project created successfully.', false);
    form.reset();
    selectTech('php');
    // Reset source to blank
    const blankTab = document.querySelector('#create-source-tabs [data-src="blank"]');
    if (blankTab) blankTab.click();
    await load();
    switchTab('projects');
  } catch (err) {
    const pm = document.querySelector('#progress-modal');
    if (pm) pm.hidden = true;
    showMessage('#message', err.message || 'Failed to create project.', true);
  }
});

function openEditor(project) {
  const editor = document.querySelector('#editor');
  const form = document.querySelector('#edit-project');
  if (!editor || !form) return;
  form.elements.id.value = project.id;
  form.elements.name.value = project.name;
  if (form.elements.phpVersion) form.elements.phpVersion.value = project.phpVersion || '8.5';

  // PHP version row visibility
  const phpVerRow = document.getElementById('edit-php-version-row');
  if (phpVerRow) phpVerRow.style.display = (project.technology || 'php').toLowerCase() === 'php' ? '' : 'none';

  // Reset source tabs to 'keep'
  const editTabs = document.querySelectorAll('#edit-source-tabs .git-tab-btn');
  editTabs.forEach(b => b.classList.remove('active'));
  const keepTab = document.querySelector('#edit-source-tabs [data-src="keep"]');
  if (keepTab) keepTab.classList.add('active');
  const editSrcType = document.getElementById('edit-source-type');
  if (editSrcType) editSrcType.value = 'keep';
  const gitPanel = document.getElementById('edit-git-panel');
  if (gitPanel) gitPanel.style.display = 'none';
  const editConnectStep = document.getElementById('edit-connect-step');
  if (editConnectStep) editConnectStep.style.display = 'none';
  // Reset provider cards
  document.querySelectorAll('#edit-git-panel .provider-card').forEach(c => c.classList.remove('selected'));
  document.getElementById('edit-selected-provider').value = '';
  // Panels hidden
  const ep = document.getElementById('edit-oauth-panel');
  const epp = document.getElementById('edit-pat-panel');
  const epb = document.getElementById('edit-public-panel');
  if (ep) ep.style.display = 'block'; // default is oauth
  if (epp) epp.style.display = 'none';
  if (epb) epb.style.display = 'none';
  // Reset OAuth connected state
  const editOauthStatus = document.getElementById('edit-oauth-status');
  const editOauthConnected = document.getElementById('edit-oauth-connected');
  if (editOauthStatus) editOauthStatus.style.display = 'block';
  if (editOauthConnected) editOauthConnected.style.display = 'none';
  delete oauthConnections['edit'];

  // Pre-fill existing repo info
  if (form.elements.repoUrl) form.elements.repoUrl.value = project.repoUrl || '';
  if (form.elements.repoBranch) form.elements.repoBranch.value = project.repoBranch || '';
  if (form.elements.privateRepoUrl) form.elements.privateRepoUrl.value = project.privateRepoUrl || '';
  if (form.elements.privateRepoBranch) form.elements.privateRepoBranch.value = project.privateRepoBranch || '';

  // Autobuild
  const abToggle = document.getElementById('edit-autobuild-toggle');
  if (abToggle) {
    abToggle.checked = !!project.autoBuild;
    const webhookSection = document.getElementById('edit-webhook-section');
    if (webhookSection) webhookSection.style.display = project.autoBuild ? 'block' : 'none';
    const webhookUrl = document.getElementById('edit-webhook-url');
    if (webhookUrl) webhookUrl.textContent = `${location.protocol}//${location.hostname}:${window.DIG_PORTAL?.customerPort || 4300}/api/webhooks/github/${project.id}`;
  }

  const editMsg = document.querySelector('#edit-message');
  if (editMsg) editMsg.textContent = '';
  editor.hidden = false;
  setTimeout(() => form.elements.name.focus(), 50);
}

function closeEditor() {
  const editor = document.querySelector('#editor');
  if (editor) editor.hidden = true;
}

document.querySelector('#close-editor')?.addEventListener('click', closeEditor);
document.querySelector('#cancel-editor')?.addEventListener('click', closeEditor);
document.querySelector('#edit-project')?.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const projId = form.elements.id.value;
  const projName = form.elements.name.value;
  const editSrcType = document.getElementById('edit-source-type')?.value || 'keep';
  const autoBuild = document.getElementById('edit-autobuild-toggle')?.checked || false;

  const data = {
    name: projName,
    phpVersion: form.elements.phpVersion ? form.elements.phpVersion.value : undefined,
    autoBuild
  };

  if (editSrcType === 'github') {
    data.sourceType = 'github';
    data.repoUrl = form.elements.repoUrl?.value || '';
    data.repoBranch = form.elements.repoBranch?.value || 'main';
  } else if (editSrcType === 'private') {
    data.sourceType = 'private';
    data.repoUrl = form.elements.privateRepoUrl?.value || '';
    data.repoBranch = form.elements.privateRepoBranch?.value || 'main';
    if (form.elements.repoToken?.value) data.repoToken = form.elements.repoToken.value;
  }

  closeEditor();
  const apiPromise = (async () => {
    const response = await fetch(`/api/projects/${projId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
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
      const resData = await response.json().catch(() => ({}));
      await showServerErrorDialog(resData.error || 'Failed to update PHP settings');
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
  } else {
    const resData = await response.json().catch(() => ({}));
    await showServerErrorDialog(resData.error || 'Failed to update PHP modules.');
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

// ===================== DATABASE MANAGER LOGIC =====================
let activeDbProject = null;

function onDbModeChange() {
  const isExisting = document.querySelector('#db-mode-existing')?.checked;
  const verLabel = document.querySelector('#db-version-label');
  const hostLabel = document.querySelector('#db-host-label');
  if (verLabel) verLabel.style.display = isExisting ? 'none' : 'grid';
  if (hostLabel) hostLabel.style.display = isExisting ? 'grid' : 'none';
}

function onDbTypeChange() {
  const type = document.querySelector('#db-type-select').value;
  const verSelect = document.querySelector('#db-version-select');
  if (type === 'mysql') {
    verSelect.innerHTML = '<option value="8">MySQL 8.0 (Recommended)</option><option value="5.7">MySQL 5.7</option><option value="9">MySQL 9.0 (Latest)</option>';
  } else {
    verSelect.innerHTML = '<option value="17">PostgreSQL 17 (Latest)</option><option value="18">PostgreSQL 18 (Beta/Dev)</option>';
  }
}

function openDatabaseModal(project) {
  activeDbProject = project;
  const modal = document.querySelector('#database-modal');
  const db = project.database || {};
  
  if (db.isExternal) {
    document.querySelector('#db-mode-existing').checked = true;
  } else {
    document.querySelector('#db-mode-new').checked = true;
  }
  onDbModeChange();

  document.querySelector('#db-type-select').value = db.type || 'mysql';
  onDbTypeChange();
  if (db.version) document.querySelector('#db-version-select').value = db.version;
  if (document.querySelector('#db-host-input')) document.querySelector('#db-host-input').value = db.host || '192.168.1.167';
  document.querySelector('#db-name-input').value = db.dbName || project.name.replace(/[^a-zA-Z0-9_]/g, '_');
  document.querySelector('#db-user-input').value = db.dbUser || 'app_user';
  document.querySelector('#db-pass-input').value = ''; // Empty: API securely generates a password for new databases.
  if (modal) modal.hidden = false;
  showDatabaseDetails(project);
}

document.querySelector('#close-db-modal')?.addEventListener('click', () => { document.querySelector('#database-modal').hidden = true; });
document.querySelector('#close-db-btn')?.addEventListener('click', () => { document.querySelector('#database-modal').hidden = true; });

document.querySelector('#db-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!activeDbProject) return;
  const isExisting = document.querySelector('#db-mode-existing')?.checked;
  const data = {
    mode: isExisting ? 'existing' : 'new',
    type: document.querySelector('#db-type-select').value,
    version: document.querySelector('#db-version-select').value,
    host: isExisting ? (document.querySelector('#db-host-input').value.trim() || '192.168.1.167') : null,
    dbName: document.querySelector('#db-name-input').value,
    dbUser: document.querySelector('#db-user-input').value,
    dbPassword: document.querySelector('#db-pass-input').value,
    autoInjectEnv: document.querySelector('#db-auto-inject').checked
  };
  const apiPromise = fetch(`/api/projects/${activeDbProject.id}/database`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const opTitle = isExisting ? 'Connecting Existing Database...' : 'Provisioning Database Container...';
  const opMsg = isExisting ? `Configuring permissions & credentials for database "${data.dbName}"...` : `Spinning up dedicated ${data.type.toUpperCase()} container on internal network...`;
  await showOperationProgress(opTitle, opMsg, isExisting ? 3000 : 8000);
  const response = await apiPromise;
  const dataOut = await response.json().catch(() => ({}));
  if (!response.ok) {
    document.querySelector('#database-modal').hidden = false;
    showMessage('#db-feedback', dataOut.error || 'Database operation failed.', true);
  } else {
    showMessage('#db-feedback', dataOut.message || 'Database is provisioning, check deployment status.');
    activeDbProject = dataOut.project || activeDbProject;
    showDatabaseDetails(activeDbProject);
  }
  load();
});

// ===================== ENVIRONMENT VARIABLES LOGIC =====================
let activeEnvProject = null;

async function openEnvModal(project) {
  activeEnvProject = project;
  const modal = document.querySelector('#env-modal');
  const container = document.querySelector('#env-rows-container');
  container.innerHTML = '';
  const envResponse = await fetch(`/api/projects/${project.id}/env`, { cache: 'no-store' });
  const envData = await envResponse.json().catch(() => ({}));
  if (!envResponse.ok) { alert(envData.error || 'Unable to fetch ENV values'); return; }
  const envs = envData.envVars || {};
  const entries = Object.entries(envs);
  if (entries.length === 0) {
    addEnvRow('APP_ENV', 'production');
    addEnvRow('APP_DEBUG', 'false');
  } else {
    entries.forEach(([k, v]) => addEnvRow(k, v));
  }
  if (modal) modal.hidden = false;
}

function addEnvRow(key = '', val = '') {
  const container = document.querySelector('#env-rows-container');
  const div = document.createElement('div');
  div.className = 'env-row';
  div.style.cssText = 'display:flex;gap:8px;align-items:center';
  div.innerHTML = `
    <input type="text" class="env-key" placeholder="KEY" value="" style="flex:1;font:13px 'DM Mono',monospace;padding:8px 10px;border:1px solid #adb3a5;border-radius:4px">
    <input type="password" class="env-val" placeholder="VALUE" value="" style="flex:1.5;font:13px 'DM Mono',monospace;padding:8px 10px;border:1px solid #adb3a5;border-radius:4px">
    <button type="button" class="button danger" style="padding:6px 10px;font-size:12px" onclick="this.parentElement.remove()">✕</button>
  `;
  div.querySelector('.env-key').value = key;
  div.querySelector('.env-val').value = val;
  container.appendChild(div);
}

document.querySelector('#add-env-row-btn')?.addEventListener('click', () => addEnvRow());
document.querySelector('#close-env-modal')?.addEventListener('click', () => { document.querySelector('#env-modal').hidden = true; });
document.querySelector('#close-env-btn')?.addEventListener('click', () => { document.querySelector('#env-modal').hidden = true; });

document.querySelector('#save-env-btn')?.addEventListener('click', async () => {
  if (!activeEnvProject) return;
  const envVars = {};
  document.querySelectorAll('#env-rows-container .env-row').forEach(row => {
    const k = row.querySelector('.env-key').value.trim();
    const v = row.querySelector('.env-val').value.trim();
    if (k) envVars[k] = v;
  });
  document.querySelector('#env-modal').hidden = true;
  const apiPromise = fetch(`/api/projects/${activeEnvProject.id}/env`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ envVars })
  });
  await showOperationProgress('Updating Environment...', `Syncing workspace .env configuration...`, 4000);
  const response = await apiPromise;
  if (!response.ok) {
    const resData = await response.json().catch(() => ({}));
    await showServerErrorDialog(resData.error || 'Failed to update environment variables.');
  }
  load();
});

// ===================== CI/CD BUILD STEPS LOGIC =====================
let activeCicdProject = null;

function openCicdModal(project) {
  activeCicdProject = project;
  const modal = document.querySelector('#cicd-modal');
  refreshPipeline(project);
  const container = document.querySelector('#cicd-steps-container');
  container.innerHTML = '';
  const steps = project.buildSteps || [];
  if (steps.length === 0) {
    if (project.technology === 'PHP') addCicdStep('composer install --no-dev --no-interaction');
  } else {
    steps.forEach(s => addCicdStep(s));
  }
  if (modal) modal.hidden = false;
}

function addCicdStep(cmdStr = '') {
  const container = document.querySelector('#cicd-steps-container');
  const div = document.createElement('div');
  div.className = 'cicd-step-row';
  div.style.cssText = 'display:flex;gap:8px;align-items:center';
  div.innerHTML = `
    <span style="font:12px 'DM Mono',monospace;color:#68716a">>$</span>
    <input type="text" class="cicd-cmd" placeholder="e.g. php artisan migrate --force" style="flex:1;font:13px 'DM Mono',monospace;padding:8px 10px;border:1px solid #adb3a5;border-radius:4px">
    <button type="button" class="button danger" style="padding:6px 10px;font-size:12px" onclick="this.parentElement.remove()">✕</button>
  `;
  div.querySelector('.cicd-cmd').value = cmdStr;
  container.appendChild(div);
}

function addCicdPreset(cmdStr) {
  addCicdStep(cmdStr);
}

document.querySelector('#add-cicd-step-btn')?.addEventListener('click', () => addCicdStep());
document.querySelector('#close-cicd-modal')?.addEventListener('click', () => { document.querySelector('#cicd-modal').hidden = true; });
document.querySelector('#close-cicd-btn')?.addEventListener('click', () => { document.querySelector('#cicd-modal').hidden = true; });

document.querySelector('#save-cicd-btn')?.addEventListener('click', async () => {
  if (!activeCicdProject) return;
  const buildSteps = [];
  document.querySelectorAll('#cicd-steps-container .cicd-step-row').forEach(row => {
    const cmd = row.querySelector('.cicd-cmd').value.trim();
    if (cmd) buildSteps.push(cmd);
  });
  document.querySelector('#cicd-modal').hidden = true;
  const apiPromise = fetch(`/api/projects/${activeCicdProject.id}/cicd`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ buildSteps })
  });
  await showOperationProgress('Saving CI/CD Pipeline...', `Updating build steps & restarting container...`, 6000);
  const response = await apiPromise;
  if (!response.ok) {
    const resData = await response.json().catch(() => ({}));
    await showServerErrorDialog(resData.error || 'Failed to save CI/CD build steps.');
  }
  load();
});

document.querySelector('#logout')?.addEventListener('click', async () => { await fetch('/api/auth/logout', { method: 'POST' }); location.href = '/'; });
switchTab(getTabFromHash(), false);
window.addEventListener('hashchange', () => switchTab(getTabFromHash(), false));
load();
setInterval(load, 3000);



// Command console MVP: runs one request per command in an authenticated project's
// remote container. It does not expose FTP/SSH credentials or provide a PTY.
let currentTerminalProject = null;
function openCommandConsole(project) {
  currentTerminalProject = project;
  const modal = document.querySelector('#terminal-modal');
  if (!modal) return;
  document.querySelector('#terminal-project-name').textContent = `${project.name} — Docker command console`;
  document.querySelector('#terminal-output').textContent = 'Commands run inside this project container only. No direct SSH or FTP access.\n';
  modal.hidden = false;
  document.querySelector('#terminal-input')?.focus();
}
function closeCommandConsole() { document.querySelector('#terminal-modal').hidden = true; currentTerminalProject = null; }
document.querySelector('#terminal-close')?.addEventListener('click', closeCommandConsole);
document.querySelector('#terminal-form')?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!currentTerminalProject) return;
  const input = document.querySelector('#terminal-input');
  const button = document.querySelector('#terminal-run');
  const output = document.querySelector('#terminal-output');
  const cmd = input.value.trim();
  if (!cmd) return;
  button.disabled = true;
  input.value = '';
  output.textContent += `\n$ ${cmd}\n`;
  try {
    const res = await fetch(`/api/projects/${currentTerminalProject.id}/terminal/exec`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: cmd }) });
    const data = await res.json();
    output.textContent += res.ok ? `${data.output || '(no output)'}\n[exit ${data.exitCode}]\n` : `${data.error || 'Command failed'}\n`;
  } catch (error) { output.textContent += `Network error: ${error.message}\n`; }
  output.scrollTop = output.scrollHeight;
  button.disabled = false;
  input.focus();
});

async function configureProjectWebhook(project) {
  if (!confirm('Generate or ROTATE the GitHub webhook secret for this project? Existing webhook deliveries will stop working until GitHub is updated with the new secret.')) return;
  const response = await fetch(`/api/projects/${project.id}/webhook/configure`, { method: 'POST' });
  const data = await response.json();
  if (!response.ok) return alert(data.error || 'Unable to configure webhook');
  const modal = document.querySelector('#webhook-modal');
  const details = `Payload URL: ${location.protocol}//${location.hostname}:${window.DIG_PORTAL?.customerPort || 4300}${data.path}\nContent type: application/json\nSecret: ${data.secret}\nEvent: Push\nBranch: ${project.repoBranch || 'main'}\n\n${data.instructions}\n\nStore this secret in GitHub now. This dialog will not show it again.`;
  document.querySelector('#webhook-details').textContent = details;
  modal.hidden = false;
}
document.querySelector('#webhook-close')?.addEventListener('click', () => {
  document.querySelector('#webhook-modal').hidden = true;
  document.querySelector('#webhook-details').textContent = '';
  load();
});


// ─── Project workspace shell + navigation (full page modal surfaces) ───
const WORKSPACE_PAGES = [
  ['overview', '📊 Overview', 'project-modal'],
  ['files', '📁 File Manager', 'files'],
  ['terminal', '⌨️ Terminal', 'terminal-modal'],
  ['logs', '📋 Logs', 'logs-modal'],
  ['database', '🗄 Database', 'database-modal'],
  ['env', '🔑 Environment', 'env-modal'],
  ['cicd', '⚡ CI/CD', 'cicd-modal'],
  ['php-config', '⚙️ PHP Settings', 'php-settings-modal'],
  ['php-modules', '🧩 PHP Extensions', 'php-modules-modal'],
  ['edit', '✏️ Project Settings', 'editor']
];
let workspaceProjectId = null;
let workspaceProjectName = '';
let workspaceProjectTech = '';
const originalOpenProjectModal = openProjectModal;
openProjectModal = function(project) {
  workspaceProjectId = project.id;
  workspaceProjectName = project.name;
  workspaceProjectTech = project.technology;
  originalOpenProjectModal(project);
  syncWorkspaceShells();
};
function syncWorkspaceShells() {
  for (const [action, label, modalId] of WORKSPACE_PAGES) {
    const modal = document.getElementById(modalId);
    if (!modal) continue;
    modal.classList.add('workspace-modal');
    let rail = modal.querySelector('.workspace-rail');
    if (!rail) {
      rail = document.createElement('aside');
      rail.className = 'workspace-rail';
      rail.setAttribute('aria-label', 'Project navigation');
      rail.appendChild(Object.assign(document.createElement('div'), {className:'workspace-brand',textContent:'⚡ deployigo.'}));
      const back = document.createElement('button'); back.className = 'workspace-back'; back.textContent = '← All projects';
      back.addEventListener('click', () => {
        document.querySelectorAll('.workspace-modal').forEach(el => {el.hidden = true;});
        switchTab('projects');
      });
      rail.appendChild(back);
      const name = document.createElement('div'); name.className = 'workspace-project-name'; rail.appendChild(name);
      rail.appendChild(Object.assign(document.createElement('div'),{className:'workspace-label',textContent:'Project navigation'}));
      const nav = document.createElement('nav');nav.className='workspace-nav';
      for(const [key,title] of WORKSPACE_PAGES) {
        const btn=document.createElement('button');btn.type='button';btn.dataset.workspaceAction=key;btn.textContent=title;
        btn.addEventListener('click',async () => {
          if(!workspaceProjectId) return;
          document.querySelectorAll('.workspace-modal').forEach(el=>{el.hidden=true;});
          if(key==='overview') {
            try {const res=await fetch('/api/me');if(res.ok){const body=await res.json();const prj=body.projects.find(p=>p.id===workspaceProjectId);if(prj) openProjectModal(prj);}}catch(error){alert(error.message);}
          } else await handleProjectAction(null,key,workspaceProjectId);
          syncWorkspaceShells();
        });
        nav.appendChild(btn);
      }
      rail.appendChild(nav);
      rail.appendChild(Object.assign(document.createElement('p'),{className:'workspace-help',textContent:'Changes to files, environment or build steps may trigger a new Docker deployment. Preview is enabled only after deployment succeeds.'}));
      modal.insertBefore(rail,modal.firstChild);
    }
    const nameEl=rail.querySelector('.workspace-project-name');if(nameEl) nameEl.textContent=workspaceProjectName||'Project workspace';
    rail.querySelectorAll('[data-workspace-action]').forEach(btn => {
      btn.classList.toggle('current',btn.dataset.workspaceAction===action);
      btn.hidden = workspaceProjectTech === 'HTML' && ['php-config','php-modules'].includes(btn.dataset.workspaceAction);
    });
  }
}
const originalHandleProjectAction=handleProjectAction;
handleProjectAction=async function(event,action,projectId) {
  if(projectId) {
    workspaceProjectId=projectId;
    // Actions may start from the project list without opening Overview first.
    // Resolve the label/technology so every workspace page has the right rail.
    try {
      const response=await fetch('/api/me');
      if(response.ok) {
        const payload=await response.json();
        const selected=payload.projects.find(item=>item.id===projectId);
        if(selected){ workspaceProjectName=selected.name; workspaceProjectTech=selected.technology; }
      }
    } catch (_) { /* The action's own API call will report errors. */ }
  }
  const result=await originalHandleProjectAction(event,action,projectId);
  syncWorkspaceShells();
  return result;
};
const workspaceObserver=new MutationObserver(changes=>{
  if(changes.some(change=>change.attributeName==='hidden' && change.target.classList?.contains('modal'))) {
    if(document.querySelector('.workspace-modal:not([hidden])')) syncWorkspaceShells();
  }
});
workspaceObserver.observe(document.body,{subtree:true,attributes:true,attributeFilter:['hidden']});
syncWorkspaceShells();

// ─── Database overview, credential visibility and read-only row browser ───
function setDatabaseState(text){const target=document.getElementById('db-browser-state');if(target)target.textContent=text;}
function dbCell(text,tag='td'){const node=document.createElement(tag);node.textContent=text==null?'NULL':String(text);return node;}
async function showDatabaseDetails(project){
  const panel=document.getElementById('db-existing-panel');
  const form=document.getElementById('db-form');
  const summary=document.getElementById('db-connection-summary');
  const d=project.database;
  if(!panel || !form || !summary)return;
  panel.hidden=!d;form.hidden=!!d;form.style.display=d?'none':'grid';
  if(!d)return;
  summary.replaceChildren();
  for(const [label,text] of [['Engine',(d.type||'').toUpperCase()+' '+(d.version||'')],['Database',d.dbName],['Username',d.dbUser],['Internal host',d.host],['Port',d.dbPort],['Connection type',d.isExternal?'External':'Managed / private network']]){
    const box=document.createElement('div');const small=dbCell(label,'small');const strong=dbCell(text,'strong');box.append(small,strong);summary.append(box);
  }
  const status=document.getElementById('db-connection-status');if(status)status.textContent=project.deploymentReady===false?'Deploying — wait':'Configured';
  const secret=document.getElementById('db-secret-details');if(secret){secret.hidden=true;secret.textContent='';}
  document.getElementById('db-browser-tables')?.replaceChildren();document.getElementById('db-browser-result')?.replaceChildren();
  setDatabaseState('Click Load tables after project deployment is ready.');
}
async function dbApi(suffix, opts) {
  if(!activeDbProject)throw new Error('Select a project first.');
  const resp=await fetch(`/api/projects/${encodeURIComponent(activeDbProject.id)}/database/${suffix}`,opts);
  const result=await resp.json().catch(()=>({}));
  if(!resp.ok)throw new Error(result.error||`Database request failed: ${resp.status}`);
  return result;
}
document.getElementById('db-reveal-credentials')?.addEventListener('click',async()=>{
  const out=document.getElementById('db-secret-details');const btn=document.getElementById('db-reveal-credentials');
  if(!out.hidden){out.hidden=true;out.textContent='';btn.textContent='🔐 Reveal connection details & password';return;}
  try {const result=await dbApi('details');const d=result.database;
    out.textContent=`DB_HOST=${d.host}\nDB_PORT=${d.port}\nDB_DATABASE=${d.dbName}\nDB_USERNAME=${d.dbUser}\nDB_PASSWORD=${d.dbPassword}\n\n${d.remoteAccess}`;
    out.hidden=false;btn.textContent='🙈 Hide password';
  } catch(error){showMessage('#db-feedback',error.message,true);}
});
document.getElementById('db-rotate-password')?.addEventListener('click',async()=>{
  const pass=await showPromptDialog('Change Database Password','New password (12+ characters)');
  if(!pass)return;
  if(!await showConfirmDialog('Rotate database password','This changes the password in the managed database and redeploys your application. Keep backups. Proceed?'))return;
  try{const result=await dbApi('rotate-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:pass})});showMessage('#db-feedback',result.message);const secret=document.getElementById('db-secret-details');secret.hidden=true;secret.textContent='';}
  catch(error){showMessage('#db-feedback',error.message,true);}
});
document.getElementById('db-list-tables')?.addEventListener('click',async()=>{
  const container=document.getElementById('db-browser-tables');container.replaceChildren();setDatabaseState('Loading tables…');
  try{const result=await dbApi('tables');setDatabaseState(`${result.tables.length} table(s) found.`);
    for(const table of result.tables){const button=document.createElement('button');button.type='button';button.textContent='▤ '+table;button.addEventListener('click',()=>showDatabaseRows(table));container.appendChild(button);}
    if(!result.tables.length)setDatabaseState('Database is empty. No tables created yet.');
  }catch(error){setDatabaseState(error.message);}
});
async function showDatabaseRows(table){
  const container=document.getElementById('db-browser-result');container.replaceChildren();setDatabaseState(`Loading ${table}…`);
  try{const result=await dbApi('rows?table='+encodeURIComponent(table));const rows=result.rows||[];
    const columns=result.columns||(rows.length?Object.keys(rows[0]):[]);
    if(!columns.length){setDatabaseState(`${table}: no rows to display.`);return;}
    const list=document.createElement('table');const head=document.createElement('thead');const tr=document.createElement('tr');columns.forEach(col=>tr.append(dbCell(col,'th')));head.append(tr);list.append(head);
    const tbody=document.createElement('tbody');for(const row of rows){const tr=document.createElement('tr');columns.forEach(col=>tr.append(dbCell(row[col])));tbody.append(tr);}list.append(tbody);container.appendChild(list);
    setDatabaseState(`${table}: showing ${rows.length} row(s), up to 50.`);
  }catch(error){setDatabaseState(error.message);}
}

async function refreshPipeline(project){
  const status=document.getElementById('pipeline-current-state');
  const list=document.getElementById('pipeline-deployments');if(!status||!list)return;
  try{
    const resp=await fetch('/api/me');if(!resp.ok)throw new Error('Unable to load projects');
    const body=await resp.json();const fresh=body.projects.find(p=>p.id===project.id)||project;
    activeCicdProject=fresh;
    status.textContent=`Current: ${fresh.sourceStatus || 'unknown'}${fresh.sourceError ? ' — '+fresh.sourceError : ''} · ${fresh.deploymentReady===true?'Preview ready':'Preview not yet available'}`;
    list.replaceChildren();
    for(const item of [...(fresh.deploymentHistory||[])].reverse().slice(0,8)){
      const div=document.createElement('div');div.className='pipeline-history-item';div.textContent=`${new Date(item.at).toLocaleString()} · ${item.state} · ${item.message}`;list.appendChild(div);
    }
  }catch(error){status.textContent=error.message;}
}
document.getElementById('pipeline-refresh')?.addEventListener('click',()=>{if(activeCicdProject) refreshPipeline(activeCicdProject);});
document.getElementById('pipeline-show-webhook')?.addEventListener('click',()=>{if(activeCicdProject)configureProjectWebhook(activeCicdProject);});

document.getElementById('db-export-sql')?.addEventListener('click',async()=>{
  setDatabaseState('Preparing SQL backup…');
  try{const result=await dbApi('export');const blob=new Blob([result.sql],{type:'application/sql'});
    const href=URL.createObjectURL(blob);const link=document.createElement('a');link.href=href;link.download=(result.name||'database.sql').replace(/[^a-zA-Z0-9._-]/g,'_');document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(href),3000);setDatabaseState('SQL backup downloaded.');
  }catch(error){setDatabaseState(error.message);}
});
document.getElementById('db-import-sql')?.addEventListener('change',async(event)=>{
  const file=event.currentTarget.files?.[0];event.currentTarget.value='';if(!file)return;
  if(file.size>1024*1024){setDatabaseState('Only SQL files up to 1 MB are supported.');return;}
  if(!await showConfirmDialog('Import SQL database',`Import ${file.name}? SQL files can modify or delete existing data. Create a backup first.`))return;
  setDatabaseState('Running SQL import…');
  try{const result=await dbApi('import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sql:await file.text()})});setDatabaseState(result.message);document.getElementById('db-browser-tables').replaceChildren();document.getElementById('db-browser-result').replaceChildren();}
  catch(error){setDatabaseState(error.message);}
});
