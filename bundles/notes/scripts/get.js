#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../data/notes.json');

function loadNotes() {
  if (!fs.existsSync(DATA_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')); }
  catch { return []; }
}

let raw = '';
process.stdin.on('data', (d) => { raw += d; });
process.stdin.on('end', () => {
  const params = raw.trim() ? JSON.parse(raw) : {};
  if (!params.id) { console.error('id is required'); process.exit(1); }
  const note = loadNotes().find(n => n.id === params.id);
  if (!note) { console.error(`Note not found: ${params.id}`); process.exit(1); }
  console.log(JSON.stringify(note));
});
process.stdin.resume();
