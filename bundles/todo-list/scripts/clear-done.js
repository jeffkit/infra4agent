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

const todos = loadTodos();
const before = todos.length;
const remaining = todos.filter(t => !t.done);
saveTodos(remaining);
console.log(JSON.stringify({ removed: before - remaining.length }));
