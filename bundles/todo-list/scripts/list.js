#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../data/todos.json');

function loadTodos() {
  if (!fs.existsSync(DATA_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')); }
  catch { return []; }
}

let raw = '';
process.stdin.on('data', (d) => { raw += d; });
process.stdin.on('end', () => {
  const params = raw.trim() ? JSON.parse(raw) : {};
  const filter = params.filter || 'all';
  let todos = loadTodos();
  if (filter === 'active') todos = todos.filter(t => !t.done);
  else if (filter === 'done') todos = todos.filter(t => t.done);
  console.log(JSON.stringify(todos));
});
process.stdin.resume();
