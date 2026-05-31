#!/usr/bin/env node
'use strict';

/**
 * [JJ] Platform Sync Tool
 *
 * Reads products.json as the source of truth and manages sync state
 * against external platforms (Zazzle, Redbubble, etc.).
 *
 * Usage:
 *   node index.js                            — show help
 *   node index.js status                     — show sync status for all platforms
 *   node index.js export                     — export all platforms
 *   node index.js export <platform>          — export one platform
 *   node index.js diff                       — show products needing updates
 *   node index.js mark-synced <id> <platform>   — mark one product as synced
 *   node index.js mark-all-synced <platform>    — mark all products as synced
 *   node index.js reset <platform>           — clear sync state for a platform
 */

var fs       = require('fs');
var path     = require('path');
var catalog  = require('./lib/catalog');
var state    = require('./lib/state');

var PLATFORMS = {
  zazzle:     require('./platforms/zazzle'),
  redbubble:  require('./platforms/redbubble')
};

var cmd  = process.argv[2];
var arg1 = process.argv[3];
var arg2 = process.argv[4];

// ── Helpers ──────────────────────────────────────────────────────────────────

function pad(str, len) {
  str = String(str);
  while (str.length < len) str += ' ';
  return str;
}

function header(text) {
  var bar = '═'.repeat(56);
  console.log('\n' + bar);
  console.log('  ' + text);
  console.log(bar);
}

function requirePlatform(name) {
  if (!name) {
    console.error('\nError: platform required. Available: ' + Object.keys(PLATFORMS).join(', '));
    process.exit(1);
  }
  if (!PLATFORMS[name]) {
    console.error('\nError: unknown platform "' + name + '". Available: ' + Object.keys(PLATFORMS).join(', '));
    process.exit(1);
  }
}

// ── Commands ──────────────────────────────────────────────────────────────────

function cmdStatus() {
  var products  = catalog.load();
  var syncState = state.load();
  var today     = new Date().toISOString().split('T')[0];

  header('[JJ] Sync Status — ' + today);

  Object.keys(PLATFORMS).forEach(function (platform) {
    var ps        = syncState[platform] || {};
    var upToDate  = [];
    var outOfSync = [];
    var untracked = [];

    products.forEach(function (product) {
      var entry       = ps[product.id];
      var currentHash = catalog.hash(product);
      if (!entry) {
        untracked.push(product);
      } else if (entry.hash !== currentHash) {
        outOfSync.push(product);
      } else {
        upToDate.push(product);
      }
    });

    console.log('\n  ' + platform.toUpperCase());
    console.log('  ' + '─'.repeat(46));
    console.log('  ' + pad('Up to date:', 16)  + upToDate.length  + ' product(s)');
    console.log('  ' + pad('Needs update:', 16) + outOfSync.length + ' product(s)');
    console.log('  ' + pad('Not yet synced:', 16) + untracked.length + ' product(s)');

    if (outOfSync.length > 0) {
      console.log('\n  ⚠  NEEDS UPDATE on ' + platform + ':');
      outOfSync.forEach(function (p) {
        console.log('     [!] ' + pad(p.id, 36) + p.title);
      });
    }

    if (untracked.length > 0) {
      console.log('\n  ○  NOT YET TRACKED on ' + platform + ':');
      untracked.forEach(function (p) {
        // Flag if this platform is listed as a vendor on the product
        var hasVendor = (p.vendors || []).some(function (v) { return v.name === platform && v.active !== false; });
        var flag      = hasVendor ? '[listed]' : '[not listed]';
        console.log('     [ ] ' + pad(p.id, 36) + flag);
      });
    }
  });

  console.log('\n  Run "node index.js diff" for a change-level breakdown.');
  console.log('  Run "node index.js export <platform>" to generate listing files.\n');
}

function cmdDiff() {
  var products  = catalog.load();
  var syncState = state.load();
  var hasWork   = false;

  header('[JJ] Sync Diff — What needs updating?');

  Object.keys(PLATFORMS).forEach(function (platform) {
    var ps = syncState[platform] || {};

    products.forEach(function (product) {
      var entry       = ps[product.id];
      var currentHash = catalog.hash(product);

      if (!entry) {
        console.log('\n  [NEW] ' + product.id + ' → ' + platform);
        console.log('        "' + product.title + '" has never been synced to ' + platform);
        hasWork = true;
      } else if (entry.hash !== currentHash) {
        console.log('\n  [CHG] ' + product.id + ' → ' + platform);
        console.log('        "' + product.title + '" changed since last sync (' + entry.synced.split('T')[0] + ')');
        hasWork = true;
      }
    });
  });

  if (!hasWork) {
    console.log('\n  ✓  All tracked products are up to date across all platforms.\n');
  } else {
    console.log('\n  Run "node index.js export <platform>" to generate updated listings.\n');
  }
}

function cmdExport(platform) {
  var targets = platform ? [platform] : Object.keys(PLATFORMS);
  targets.forEach(function (p) { requirePlatform(p); });

  var products = catalog.load();

  targets.forEach(function (p) {
    var formatter = PLATFORMS[p];
    var outputDir = path.join(__dirname, 'exports', p);
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    var allParts = [];

    products.forEach(function (product) {
      var formatted = formatter.format(product);
      var outFile   = path.join(outputDir, product.id + '.txt');
      fs.writeFileSync(outFile, formatted, 'utf8');
      allParts.push(formatted);
    });

    var combinedFile = path.join(outputDir, '_all-listings.txt');
    fs.writeFileSync(combinedFile, allParts.join('\n'), 'utf8');

    console.log('\n[JJ] Export → ' + p);
    console.log('     ' + products.length + ' product files: ' + outputDir);
    console.log('     Combined:  ' + combinedFile);
  });

  console.log('\n  After manually updating the platform, run:');
  console.log('  node index.js mark-all-synced <platform>');
  console.log('  to record the sync state.\n');
}

function cmdMarkSynced(productId, platform) {
  if (!productId || !platform) {
    console.error('\nUsage: node index.js mark-synced <product-id> <platform>');
    process.exit(1);
  }
  requirePlatform(platform);

  var products = catalog.load();
  var product  = products.filter(function (p) { return p.id === productId; })[0];
  if (!product) {
    console.error('\nError: product not found: ' + productId);
    console.error('Available IDs:');
    products.forEach(function (p) { console.error('  ' + p.id); });
    process.exit(1);
  }

  var syncState = state.load();
  if (!syncState[platform]) syncState[platform] = {};
  syncState[platform][productId] = {
    hash:   catalog.hash(product),
    synced: new Date().toISOString(),
    title:  product.title
  };
  state.save(syncState);

  console.log('\n[JJ] Marked synced: ' + productId + ' on ' + platform + '\n');
}

function cmdMarkAllSynced(platform) {
  requirePlatform(platform);

  var products  = catalog.load();
  var syncState = state.load();
  if (!syncState[platform]) syncState[platform] = {};

  var now = new Date().toISOString();
  products.forEach(function (product) {
    syncState[platform][product.id] = {
      hash:   catalog.hash(product),
      synced: now,
      title:  product.title
    };
  });
  state.save(syncState);

  console.log('\n[JJ] Marked all ' + products.length + ' products as synced on ' + platform + '\n');
}

function cmdReset(platform) {
  requirePlatform(platform);
  var syncState = state.load();
  delete syncState[platform];
  state.save(syncState);
  console.log('\n[JJ] Sync state cleared for ' + platform + '\n');
}

function cmdHelp() {
  console.log('\n[JJ] Platform Sync Tool — jeffjenx.com/tools/sync');
  console.log('\nReads products.json as source of truth. Tracks sync state per platform.');
  console.log('\nCommands:');
  console.log('  node index.js status                          — sync status for all platforms');
  console.log('  node index.js diff                            — show exactly what needs updating');
  console.log('  node index.js export                          — export listings for all platforms');
  console.log('  node index.js export <platform>               — export listings for one platform');
  console.log('  node index.js mark-synced <id> <platform>     — mark one product as synced');
  console.log('  node index.js mark-all-synced <platform>      — mark all products as synced');
  console.log('  node index.js reset <platform>                — clear sync state for a platform');
  console.log('\nPlatforms: ' + Object.keys(PLATFORMS).join(', '));
  console.log('\nWorkflow:');
  console.log('  1. Edit products.json');
  console.log('  2. node index.js diff           (see what changed)');
  console.log('  3. node index.js export zazzle  (generate updated listings)');
  console.log('  4. Update the platform manually (or via future API integration)');
  console.log('  5. node index.js mark-all-synced zazzle');
  console.log('');
}

// ── Router ────────────────────────────────────────────────────────────────────

switch (cmd) {
  case 'status':          cmdStatus();                  break;
  case 'diff':            cmdDiff();                    break;
  case 'export':          cmdExport(arg1);              break;
  case 'mark-synced':     cmdMarkSynced(arg1, arg2);    break;
  case 'mark-all-synced': cmdMarkAllSynced(arg1);       break;
  case 'reset':           cmdReset(arg1);               break;
  default:                cmdHelp();                    break;
}
