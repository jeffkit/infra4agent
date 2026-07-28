#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_FILE = path.join(__dirname, '../data/todos.json');

function loadTodos() {
  if (!fs.existsSync(DATA_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')); }
  catch { return []; }
}

function saveTodos(todos) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(todos, null, 2), 'utf-8');
}

let raw = '';
process.stdin.on('data', (d) => { raw += d; });
process.stdin.on('end', () => {
  const params = raw.trim() ? JSON.parse(raw) : {};
  if (!params.text) { console.error('text is required'); process.exit(1); }

  const todos = loadTodos();
  const todo = {
    id: crypto.randomUUID(),
    text: params.text,
    done: false,
    priority: params.priority || 'medium',
    createdAt: new Date().toISOString(),
  };
  todos.push(todo);
  saveTodos(todos);
  console.log(JSON.stringify(todo));
});
process.stdin.resume();
