#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../data/notes.json');

function loadNotes() {
  if (!fs.existsSync(DATA_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')); }
  catch { return []; }
}

function saveNotes(notes) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(notes, null, 2), 'utf-8');
}

let raw = '';
process.stdin.on('data', (d) => { raw += d; });
process.stdin.on('end', () => {
  const params = raw.trim() ? JSON.parse(raw) : {};
  if (!params.id) { console.error('id is required'); process.exit(1); }

  const notes = loadNotes();
  const note = notes.find(n => n.id === params.id);
  if (!note) { console.error(`Note not found: ${params.id}`); process.exit(1); }

  if (params.title !== undefined) note.title = params.title;
  if (params.content !== undefined) note.content = params.content;
  if (params.tags !== undefined) note.tags = params.tags;
  note.updatedAt = new Date().toISOString();

  saveNotes(notes);
  console.log(JSON.stringify(note));
});
process.stdin.resume();
