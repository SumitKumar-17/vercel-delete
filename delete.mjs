#!/usr/bin/env node
import checkbox from '@inquirer/checkbox';
import confirm from '@inquirer/confirm';
import chalk from 'chalk';

const TOKEN = process.env.VERCEL_TOKEN;
if (!TOKEN) {
  console.error(chalk.red('Error: VERCEL_TOKEN is not set.'));
  console.error('Run: export VERCEL_TOKEN=your_token_here');
  process.exit(1);
}

const API = 'https://api.vercel.com';
const h = { Authorization: `Bearer ${TOKEN}` };

async function fetchProjects() {
  let all = [], until = null;
  while (true) {
    const url = new URL(`${API}/v9/projects`);
    url.searchParams.set('limit', '100');
    if (until) url.searchParams.set('until', until);
    const res = await fetch(url, { headers: h });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Failed to fetch');
    all.push(...(data.projects ?? []));
    if (!data.pagination?.next) break;
    until = data.pagination.next;
  }
  return all;
}

async function deleteProject(id) {
  const res = await fetch(`${API}/v9/projects/${id}`, { method: 'DELETE', headers: h });
  if (res.status === 204 || res.ok) return;
  const data = await res.json().catch(() => ({}));
  throw new Error(data.error?.message || `HTTP ${res.status}`);
}

console.log(chalk.bold('\nFetching Vercel projects...\n'));
let projects;
try {
  projects = await fetchProjects();
} catch (e) {
  console.error(chalk.red('Error: ' + e.message));
  process.exit(1);
}

if (!projects.length) {
  console.log('No projects found.');
  process.exit(0);
}

const pad = (s, n) => String(s).padEnd(n);
const maxName = Math.max(...projects.map(p => p.name.length), 12);

const choices = projects
  .sort((a, b) => b.updatedAt - a.updatedAt)
  .map(p => {
    const url = p.targets?.production?.url ? `https://${p.targets.production.url}` : '--';
    const age = Math.round((Date.now() - p.updatedAt) / 86400000);
    const ageStr = age === 0 ? 'today' : age === 1 ? '1d ago' : `${age}d ago`;
    return {
      name: chalk.white(pad(p.name, maxName + 2)) + chalk.gray(pad(url, 55)) + chalk.dim(ageStr),
      value: { id: p.id, name: p.name },
      short: p.name,
    };
  });

const selected = await checkbox({
  message: 'Select projects to delete (space to select, enter to confirm):',
  choices,
  pageSize: 20,
  instructions: chalk.dim('  ↑↓ move  space select  a toggle all  enter confirm  ctrl+c cancel'),
});

if (!selected.length) {
  console.log('\nNothing selected. Exiting.');
  process.exit(0);
}

console.log('\nYou selected:');
selected.forEach(p => console.log(chalk.yellow('  • ' + p.name)));

const ok = await confirm({
  message: chalk.red(`Permanently delete ${selected.length} project(s)? This cannot be undone.`),
  default: false,
});

if (!ok) {
  console.log('Cancelled.');
  process.exit(0);
}

console.log();
let done = 0, failed = 0;
for (const p of selected) {
  process.stdout.write(`  Deleting ${chalk.cyan(p.name)}... `);
  try {
    await deleteProject(p.id);
    console.log(chalk.green('done'));
    done++;
  } catch (e) {
    console.log(chalk.red('failed: ' + e.message));
    failed++;
  }
}

console.log(`\n${chalk.green(done + ' deleted')}${failed ? chalk.red(', ' + failed + ' failed') : ''}`);
