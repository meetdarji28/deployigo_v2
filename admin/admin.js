'use strict';
const $ = selector => document.querySelector(selector);
const ports = window.DIG_PORTAL || { customerPort: 4300 };
$('#customer-link').href = `${location.protocol}//${location.hostname}:${ports.customerPort}/app/`;
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = String(text);
  if (className) node.className = className;
  return node;
}
function notice(value) { $('#notice').textContent = value || ''; }
async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}
async function load() {
  let data;
  try { data = await request('/api/admin/summary'); }
  catch (error) {
    if (/HTTP 401|Login required/i.test(error.message)) {
      location.replace('/login');
      return;
    }
    notice(error.message);
    return;
  }
  const stats = $('#stats'); stats.replaceChildren();
  Object.entries(data.stats).forEach(([label, raw]) => {
    const value = label.toLowerCase().includes('memory') ? `${(Number(raw) / (1024 ** 3)).toFixed(1)} GiB` : raw;
    const card = element('article', undefined, 'admin-card');
    card.append(element('strong', value), element('small', label.replace(/([a-z])([A-Z])/g, '$1 $2')));
    stats.append(card);
  });
  const activity = $('#activity'); activity.replaceChildren();
  const term=($('#project-search')?.value||'').trim().toLowerCase(), status=($('#project-status-filter')?.value||'');
  const matched=(data.projects || []).filter(p=>(!term || `${p.name} ${p.owner} ${p.status} ${p.workerHost}`.toLowerCase().includes(term)) && (!status || (status==='deploying' ? ['deploying','downloading','extracting','creating','redeploying'].includes(p.status) : p.status===status)));
  matched.forEach(project => {
    const card = element('article', undefined, 'project');
    const left = element('div'); left.append(element('strong', project.name), element('p', `${project.owner} · ${project.technology}`));
    left.append(element('small', `Worker: ${project.workerHost || 'local preview'} · ${project.deploymentReady ? 'Ready for traffic' : 'Waiting / unavailable'}`));
    if(project.error)left.append(element('p',project.error,'admin-error'));
    card.append(left, element('span', project.status || 'unknown')); activity.append(card);
  });
  if (!matched.length) activity.append(element('p', 'No projects match the selected filters.', 'muted'));
  const list = $('#workers'); list.replaceChildren();
  for (const worker of (data.workers || [])) {
    const row = element('article', undefined, 'worker');
    const title = element('div'); title.append(element('strong', `${worker.host} (${worker.user}) · ${worker.assignedProjects || 0} assigned projects`), element('p', worker.status || 'Not checked'));
    const results = element('pre', '', 'worker-metrics'); title.append(results);
    const actions = element('div', undefined, 'worker-actions');
    const refresh = element('button', 'Check health', 'button ghost'); refresh.type = 'button';
    refresh.addEventListener('click', async () => { refresh.disabled = true; try { const r = await request(`/api/admin/workers/${worker.id}/health`); const m = r.metrics || {};
        const gig = x => Number.isFinite(x) ? (x / (1024 ** 3)).toFixed(2) + ' GiB' : 'n/a';
        results.textContent = `${r.ok ? 'ONLINE' : 'OFFLINE'}\nCPU cores: ${m.cpuCores || 'n/a'}\nLoad average (1/5/15 min): ${m.loadAverage1m ?? '-'} / ${m.loadAverage5m ?? '-'} / ${m.loadAverage15m ?? '-'}\nRAM: ${gig(m.memoryUsedBytes)} used / ${gig(m.memoryAvailableBytes)} available / ${gig(m.memoryTotalBytes)} total\nStorage: ${gig(m.diskUsedBytes)} used / ${gig(m.diskFreeBytes)} free / ${gig(m.diskTotalBytes)} total\nRunning containers: ${m.runningContainers ?? 'n/a'}`; } catch (e) { results.textContent = e.message; } finally { refresh.disabled = false; } });
    actions.append(refresh);
    if (worker.id !== 'local-lan-worker') {
      const remove = element('button', 'Remove', 'button danger'); remove.type = 'button';
      remove.addEventListener('click', async () => { if (!confirm(`Remove worker ${worker.host}? Projects on the worker must be migrated first.`)) return; try { await request(`/api/admin/workers/${worker.id}`, { method: 'DELETE' }); notice('Worker removed.'); await load(); } catch (e) { notice(e.message); } });
      actions.append(remove);
    }
    row.append(title, actions); list.append(row);
  }
  if (!data.workers.length) list.append(element('p', 'No workers registered. Add a node to manage it here.'));
  try{
    const response=await request('/api/admin/users');
    const users=$('#users');users.replaceChildren();
    for(const account of response.users){
      const row=element('article',undefined,'admin-user');
      const left=element('div');left.append(element('strong',account.name||account.email),element('p',`${account.email} · ${account.projects} project(s) · ${account.isAdmin?'Admin':'Customer'} · ${account.suspended?'Suspended':'Active'}`));
      const action=element('button',account.suspended?'Reactivate':'Suspend',account.suspended?'button ghost':'button danger');action.disabled=account.isAdmin;
      action.addEventListener('click',async()=>{
        if(!confirm(`${account.suspended?'Reactivate':'Suspend'} ${account.email}?`))return;
        try{await request(`/api/admin/users/${account.id}`,{method:'PATCH',body:JSON.stringify({suspended:!account.suspended})});notice('User updated.');load();}
        catch(err){notice(err.message);}
      });
      row.append(left,action);users.append(row);
    }
  }catch(error){notice(error.message);} 
}
$('#add-worker').addEventListener('submit', async event => {
  event.preventDefault(); const fields = new FormData(event.currentTarget);
  try { await request('/api/admin/workers', { method: 'POST', body: JSON.stringify({ host: fields.get('host'), user: fields.get('user') }) }); notice('Worker registered (not yet health-checked).'); event.currentTarget.reset(); await load(); }
  catch (e) { notice(e.message); }
});
$('#logout').addEventListener('click', async () => { await fetch('/api/admin/logout', { method: 'POST' }); location.href = '/login'; });
load();

$('#project-search')?.addEventListener('input',()=>load());
$('#project-status-filter')?.addEventListener('change',()=>load());
$('#refresh-overview')?.addEventListener('click',()=>load());
