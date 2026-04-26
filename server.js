const express = require('express');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());

const TOKEN = process.env.VERCEL_TOKEN;

if (!TOKEN) {
  console.error('Error: VERCEL_TOKEN environment variable is not set.');
  console.error('Run: export VERCEL_TOKEN=your_token_here');
  process.exit(1);
}

const VERCEL_API = 'https://api.vercel.com';
const HEADERS = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

// Fetch all projects (handles pagination)
async function fetchAllProjects() {
  let projects = [];
  let until = null;

  while (true) {
    const url = new URL(`${VERCEL_API}/v9/projects`);
    url.searchParams.set('limit', '100');
    if (until) url.searchParams.set('until', until);

    const res = await fetch(url.toString(), { headers: HEADERS });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error?.message || 'Failed to fetch projects');

    projects = projects.concat(data.projects || []);

    if (!data.pagination?.next) break;
    until = data.pagination.next;
  }

  return projects;
}

app.get('/api/projects', async (req, res) => {
  try {
    const projects = await fetchAllProjects();
    res.json(projects.map(p => ({ id: p.id, name: p.name, updatedAt: p.updatedAt })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/projects/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const r = await fetch(`${VERCEL_API}/v9/projects/${id}`, { method: 'DELETE', headers: HEADERS });
    if (r.status === 204 || r.ok) return res.json({ ok: true });
    const data = await r.json();
    res.status(r.status).json({ error: data.error?.message || 'Delete failed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => res.send(HTML));

const PORT = 3456;
app.listen(PORT, () => console.log(`Open http://localhost:${PORT}`));

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Vercel Project Manager</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0a; color: #ededed; min-height: 100vh; padding: 32px; }
  h1 { font-size: 22px; font-weight: 600; margin-bottom: 24px; }
  .toolbar { display: flex; gap: 12px; align-items: center; margin-bottom: 16px; flex-wrap: wrap; }
  button { cursor: pointer; border: none; border-radius: 6px; padding: 8px 16px; font-size: 14px; font-weight: 500; transition: opacity .15s; }
  button:hover { opacity: .8; }
  #btn-delete { background: #e00; color: #fff; }
  #btn-select-all { background: #333; color: #ededed; }
  #btn-deselect { background: #333; color: #ededed; }
  #btn-refresh { background: #333; color: #ededed; }
  .status { font-size: 13px; color: #888; margin-left: auto; }
  .search { background: #1a1a1a; border: 1px solid #333; border-radius: 6px; padding: 8px 12px; color: #ededed; font-size: 14px; width: 220px; }
  .search:focus { outline: none; border-color: #555; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; padding: 10px 12px; font-size: 12px; color: #888; border-bottom: 1px solid #222; font-weight: 500; }
  td { padding: 10px 12px; border-bottom: 1px solid #1a1a1a; font-size: 14px; vertical-align: middle; }
  tr:hover td { background: #111; }
  .project-name { font-weight: 500; }
  .date { color: #888; font-size: 12px; }
  input[type=checkbox] { width: 16px; height: 16px; cursor: pointer; accent-color: #e00; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 11px; background: #222; color: #888; }
  .loading { text-align: center; padding: 60px; color: #888; }
  .error { color: #f66; font-size: 13px; }
  .progress { font-size: 13px; color: #f0a500; }
</style>
</head>
<body>
<h1>Vercel Project Manager</h1>
<div class="toolbar">
  <button id="btn-select-all" onclick="selectAll()">Select All</button>
  <button id="btn-deselect" onclick="deselectAll()">Deselect All</button>
  <button id="btn-delete" onclick="deleteSelected()">Delete Selected</button>
  <button id="btn-refresh" onclick="load()">Refresh</button>
  <input class="search" id="search" placeholder="Filter projects..." oninput="render()" />
  <span class="status" id="status"></span>
</div>
<div id="root"><div class="loading">Loading projects...</div></div>

<script>
let projects = [];
let deleting = false;

async function load() {
  document.getElementById('root').innerHTML = '<div class="loading">Loading projects...</div>';
  document.getElementById('status').textContent = '';
  try {
    const res = await fetch('/api/projects');
    projects = await res.json();
    if (!Array.isArray(projects)) throw new Error(projects.error || 'Unknown error');
    projects.sort((a, b) => b.updatedAt - a.updatedAt);
    render();
  } catch (e) {
    document.getElementById('root').innerHTML = '<div class="loading error">Failed to load: ' + e.message + '</div>';
  }
}

function filter() {
  const q = document.getElementById('search').value.toLowerCase();
  return q ? projects.filter(p => p.name.toLowerCase().includes(q)) : projects;
}

function render() {
  const list = filter();
  const checked = getChecked();
  document.getElementById('status').textContent = list.length + ' project' + (list.length !== 1 ? 's' : '');
  if (!list.length) { document.getElementById('root').innerHTML = '<div class="loading">No projects found.</div>'; return; }

  const rows = list.map(p => {
    const date = new Date(p.updatedAt).toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' });
    const isChecked = checked.has(p.id);
    return '<tr><td><input type="checkbox" data-id="' + p.id + '"' + (isChecked ? ' checked' : '') + '></td>'
      + '<td class="project-name">' + esc(p.name) + '</td>'
      + '<td><span class="badge">' + esc(p.id) + '</span></td>'
      + '<td class="date">' + date + '</td></tr>';
  }).join('');

  document.getElementById('root').innerHTML =
    '<table><thead><tr><th></th><th>Name</th><th>ID</th><th>Last Updated</th></tr></thead><tbody>' + rows + '</tbody></table>';
}

function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function getChecked() {
  const ids = new Set();
  document.querySelectorAll('input[type=checkbox][data-id]:checked').forEach(el => ids.add(el.dataset.id));
  return ids;
}

function selectAll() {
  const list = filter();
  const ids = new Set(list.map(p => p.id));
  document.querySelectorAll('input[type=checkbox][data-id]').forEach(el => {
    if (ids.has(el.dataset.id)) el.checked = true;
  });
}

function deselectAll() {
  document.querySelectorAll('input[type=checkbox][data-id]').forEach(el => el.checked = false);
}

async function deleteSelected() {
  if (deleting) return;
  const ids = [...getChecked()];
  if (!ids.length) { alert('No projects selected.'); return; }

  const names = ids.map(id => projects.find(p => p.id === id)?.name).filter(Boolean);
  const confirmed = confirm('Permanently delete ' + ids.length + ' project(s)?\\n\\n' + names.join('\\n') + '\\n\\nThis cannot be undone.');
  if (!confirmed) return;

  deleting = true;
  document.getElementById('btn-delete').disabled = true;
  document.getElementById('status').className = 'status progress';

  let done = 0, failed = 0;
  for (const id of ids) {
    document.getElementById('status').textContent = 'Deleting ' + (done + failed + 1) + '/' + ids.length + '...';
    try {
      const r = await fetch('/api/projects/' + id, { method: 'DELETE' });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error); }
      projects = projects.filter(p => p.id !== id);
      done++;
    } catch (e) {
      failed++;
      console.error('Failed to delete', id, e.message);
    }
  }

  deleting = false;
  document.getElementById('btn-delete').disabled = false;
  document.getElementById('status').className = 'status';
  render();

  const msg = done + ' deleted' + (failed ? ', ' + failed + ' failed (check console)' : '') + '.';
  document.getElementById('status').textContent = msg;
}

load();
</script>
</body>
</html>`;
