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
  let notes = loadNotes().sort((a, b) =>
    new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)
  );
  if (params.tag) notes = notes.filter(n => (n.tags || []).includes(params.tag));
  if (params.search) {
    const q = params.search.toLowerCase();
    notes = notes.filter(n => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q));
  }
  console.log(JSON.stringify(notes));
});
process.stdin.resume();
