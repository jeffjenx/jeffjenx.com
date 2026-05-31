'use strict';

/**
 * [JJ] Backlog prioritization tool.
 *
 * Scoring formula: (value * 2 + alignment + urgency) / effort
 *   value:     1-5  direct revenue/quality impact
 *   alignment: 1-5  advances long-term goals (sales, brand, infra)
 *   urgency:   1-5  blocking others or time-sensitive
 *   effort:    1-5  1=<30min  2=1-2h  3=half-day  4=full-day  5=multi-day
 *
 * Commands:
 *   node index.js            — show ranked backlog (open items only)
 *   node index.js all        — show all items including done/blocked
 *   node index.js next [n]   — show top n items to work on (default: 5)
 *   node index.js done <id>  — mark item complete
 */

var fs   = require('fs');
var path = require('path');

var BACKLOG_FILE = path.join(__dirname, 'backlog.json');

function load() {
  return JSON.parse(fs.readFileSync(BACKLOG_FILE, 'utf8'));
}

function save(data) {
  fs.writeFileSync(BACKLOG_FILE, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function score(item) {
  return ((item.value * 2) + item.alignment + item.urgency) / item.effort;
}

function bar(score, max) {
  var filled = Math.round((score / max) * 12);
  return '█'.repeat(filled) + '░'.repeat(12 - filled);
}

var STATUS_ICON = { open: '○', 'in-progress': '◑', done: '✓', blocked: '✗' };
var CATEGORY_PAD = 14;

function printItem(item, rank, maxScore) {
  var s     = score(item).toFixed(1);
  var icon  = STATUS_ICON[item.status] || '?';
  var cat   = ('[' + item.category + ']').padEnd(CATEGORY_PAD);
  var b     = bar(parseFloat(s), maxScore);
  console.log('  ' + (rank ? rank + '. ' : '   ') + icon + ' ' + cat + ' ' + b + ' ' + s + '  ' + item.title);
  if (item.blocker) {
    console.log('       ↳ BLOCKED: ' + item.blocker);
  }
}

function cmdList(showAll) {
  var data  = load();
  var items = data.items.slice();

  if (!showAll) {
    items = items.filter(function (i) { return i.status === 'open' || i.status === 'in-progress'; });
  }

  items.sort(function (a, b) { return score(b) - score(a); });

  var maxScore = Math.max.apply(null, items.map(score));

  var now = new Date().toISOString().slice(0, 10);
  console.log('\n════════════════════════════════════════════════════════');
  console.log('  [JJ] Backlog — ' + now + (showAll ? ' (all)' : ''));
  console.log('════════════════════════════════════════════════════════');
  console.log('  Score = (value×2 + alignment + urgency) / effort\n');

  var open    = items.filter(function (i) { return i.status === 'open' || i.status === 'in-progress'; });
  var blocked = items.filter(function (i) { return i.status === 'blocked'; });
  var done    = items.filter(function (i) { return i.status === 'done'; });

  if (open.length) {
    console.log('  OPEN / IN PROGRESS');
    console.log('  ──────────────────────────────────────────────────────');
    open.forEach(function (item, i) { printItem(item, i + 1, maxScore); });
  }

  if (blocked.length && showAll) {
    console.log('\n  BLOCKED');
    console.log('  ──────────────────────────────────────────────────────');
    blocked.forEach(function (item) { printItem(item, null, maxScore); });
  }

  if (done.length && showAll) {
    console.log('\n  DONE');
    console.log('  ──────────────────────────────────────────────────────');
    done.forEach(function (item) { printItem(item, null, maxScore); });
  }

  if (blocked.length && !showAll) {
    console.log('\n  ' + blocked.length + ' blocked item(s) hidden. Run "node index.js all" to see them.');
  }

  console.log('\n  Run "node index.js next" to see top 5 action items.');
  console.log('  Run "node index.js done <id>" to mark an item complete.\n');
}

function cmdNext(n) {
  var data  = load();
  var items = data.items
    .filter(function (i) { return i.status === 'open' || i.status === 'in-progress'; })
    .sort(function (a, b) { return score(b) - score(a); })
    .slice(0, n);

  var maxScore = Math.max.apply(null, items.map(score));

  console.log('\n════════════════════════════════════════════════════════');
  console.log('  [JJ] Next ' + n + ' items');
  console.log('════════════════════════════════════════════════════════\n');
  items.forEach(function (item, i) {
    printItem(item, i + 1, maxScore);
    console.log('       ' + item.detail.slice(0, 100) + (item.detail.length > 100 ? '…' : ''));
    console.log('       Files: ' + (item.files.length ? item.files.join(', ') : '—'));
    console.log();
  });
}

function cmdDone(id) {
  var data  = load();
  var item  = data.items.find(function (i) { return i.id === id; });
  if (!item) {
    console.error('[JJ] No item with id: ' + id);
    process.exit(1);
  }
  item.status     = 'done';
  item.completedAt = new Date().toISOString();
  save(data);
  console.log('[JJ] Marked done: ' + item.title);
}

// ── CLI ──────────────────────────────────────────────────────────────────────

var args = process.argv.slice(2);
var cmd  = args[0];

if (!cmd || cmd === 'list') {
  cmdList(false);
} else if (cmd === 'all') {
  cmdList(true);
} else if (cmd === 'next') {
  cmdNext(parseInt(args[1], 10) || 5);
} else if (cmd === 'done') {
  if (!args[1]) { console.error('[JJ] Usage: node index.js done <id>'); process.exit(1); }
  cmdDone(args[1]);
} else {
  console.error('[JJ] Unknown command: ' + cmd);
  console.error('     Usage: node index.js [list|all|next [n]|done <id>]');
  process.exit(1);
}
