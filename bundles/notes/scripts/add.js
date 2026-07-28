#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_FILE = path.join(__dirname, '../data/notes.json');

function loadNotes() {
  if (!fs.existsSync(DATA_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')); }
  catch { return []; }
}

function saveNotes(notes) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(notes, null, 2), 'utf-8');
}

let raw = '';
process.stdin.on('data', (d) => { raw += d; });
process.stdin.on('end', () => {
  const params = raw.trim() ? JSON.parse(raw) : {};
  if (!params.title) { console.error('title is required'); process.exit(1); }
  if (params.content === undefined) { console.error('content is required'); process.exit(1); }

  const notes = loadNotes();
  const now = new Date().toISOString();
  const note = {
    id: crypto.randomUUID(),
    title: params.title,
    content: params.content,
    tags: params.tags || [],
    createdAt: now,
    updatedAt: now,
  };
  notes.push(note);
  saveNotes(notes);
  console.log(JSON.stringify(note));
});
process.stdin.resume();
