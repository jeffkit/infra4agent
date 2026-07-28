#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../data/todos.json');

function loadTodos() {
  if (!fs.existsSync(DATA_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')); }
  catch { return []; }
}

function saveTodos(todos) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(todos, null, 2), 'utf-8');
}

let raw = '';
process.stdin.on('data', (d) => { raw += d; });
process.stdin.on('end', () => {
  const params = raw.trim() ? JSON.parse(raw) : {};
  if (!params.id) { console.error('id is required'); process.exit(1); }

  const todos = loadTodos();
  const idx = todos.findIndex(t => t.id === params.id);
  if (idx === -1) { console.error(`Todo not found: ${params.id}`); process.exit(1); }

  todos.splice(idx, 1);
  saveTodos(todos);
  console.log(JSON.stringify({ success: true }));
});
process.stdin.resume();
