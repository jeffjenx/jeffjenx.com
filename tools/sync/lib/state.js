'use strict';

const fs   = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, '../sync-state.json');

function load() {
  if (!fs.existsSync(STATE_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch (_) {
    return {};
  }
}

function save(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

module.exports = { load, save };
