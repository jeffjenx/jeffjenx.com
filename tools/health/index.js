#!/usr/bin/env node
'use strict';

/**
 * [JJ] URL Health Check Tool
 *
 * Reads products.json and checks whether each active vendor URL is reachable.
 * Flags dead listings (non-200, timeout, connection error) so they can be
 * investigated and deactivated in products.json.
 *
 * Usage:
 *   node index.js                       — check all active vendor URLs
 *   node index.js --platform zazzle     — check only a specific platform
 *   node index.js --quiet               — only print failures (still exits 1)
 *   node index.js --timeout 15000       — per-request timeout in ms (default 10000)
 *
 * Exit codes:
 *   0 — all URLs live
 *   1 — one or more URLs dead or unreachable
 */

var fs      = require('fs');
var path    = require('path');
var https   = require('https');
var http    = require('http');
var URL     = require('url').URL;

var PRODUCTS_JSON = path.join(__dirname, '../../products.json');

// ── CLI args ──────────────────────────────────────────────────────────────────

var args     = process.argv.slice(2);
var platform = null;
var quiet    = false;
var strict   = false;
var timeout  = 10000;

for (var i = 0; i < args.length; i++) {
  if (args[i] === '--platform' && args[i + 1]) {
    platform = args[++i];
  } else if (args[i] === '--quiet') {
    quiet = true;
  } else if (args[i] === '--strict') {
    strict = true;
  } else if (args[i] === '--timeout' && args[i + 1]) {
    timeout = parseInt(args[++i], 10) || 10000;
  } else if (args[i] === '--help') {
    printHelp();
    process.exit(0);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function printHelp() {
  console.log('\nUsage:');
  console.log('  node index.js                       Check all active vendor URLs');
  console.log('  node index.js --platform <name>     Check only one platform');
  console.log('  node index.js --quiet               Only print failures and warnings');
  console.log('  node index.js --strict              Treat 403 as a failure (exit 1)');
  console.log('  node index.js --timeout <ms>        Per-request timeout (default: 10000)\n');
  console.log('  Note: 403 responses are shown as warnings (⚠) by default.');
  console.log('  Some vendors (Zazzle) return 403 for bot requests on live products.\n');
}

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

/**
 * Load all vendor URLs from products.json.
 * Returns an array of { productId, title, collection, vendorName, url }.
 */
function loadVendorUrls(filterPlatform) {
  var raw  = fs.readFileSync(PRODUCTS_JSON, 'utf8');
  var data = JSON.parse(raw);
  var entries = [];

  (data.collections || []).forEach(function (col) {
    if (!col.active) return;
    (col.products || []).forEach(function (product) {
      if (product.active === false) return;
      (product.vendors || []).forEach(function (vendor) {
        if (vendor.active === false) return;
        if (filterPlatform && vendor.name !== filterPlatform) return;
        entries.push({
          productId:  product.id,
          title:      product.title,
          collection: col.label || col.id,
          vendorName: vendor.name,
          url:        vendor.url
        });
      });
    });
  });

  return entries;
}

/**
 * Check a single URL with a HEAD request (fallback to GET on 405/501).
 * Returns a promise resolving to { status, ok, redirected, method }.
 *
 * - ok: true if status 200–299
 * - redirected: true if final URL differs from input (we follow up to 5 redirects)
 */
function checkUrl(rawUrl, method, hops) {
  method = method || 'HEAD';
  hops   = hops   || 0;

  return new Promise(function (resolve) {
    var parsed;
    try {
      parsed = new URL(rawUrl);
    } catch (_) {
      return resolve({ status: 'INVALID_URL', ok: false });
    }

    var isHttps = parsed.protocol === 'https:';
    var lib     = isHttps ? https : http;
    var options = {
      method:   method,
      hostname: parsed.hostname,
      port:     parsed.port || (isHttps ? 443 : 80),
      path:     (parsed.pathname || '/') + (parsed.search || ''),
      headers:  {
        'User-Agent': 'jeffjenx-health-check/1.0 (url-liveness-audit)',
        'Accept':     'text/html,application/xhtml+xml,*/*'
      }
    };

    var req = lib.request(options, function (res) {
      // Drain response body to free socket
      res.resume();

      var status = res.statusCode;

      // Handle redirects
      if (status >= 300 && status < 400 && res.headers.location) {
        if (hops >= 5) {
          return resolve({ status: 'TOO_MANY_REDIRECTS', ok: false });
        }
        var nextUrl = res.headers.location;
        // Resolve relative redirects against the original URL
        try {
          nextUrl = new URL(nextUrl, rawUrl).href;
        } catch (_) { /* leave as-is if resolution fails */ }
        checkUrl(nextUrl, method, hops + 1).then(function (result) {
          resolve(Object.assign({}, result, { redirected: true }));
        });
        return;
      }

      // Some servers reject HEAD; retry with GET
      if ((status === 405 || status === 501) && method === 'HEAD') {
        checkUrl(rawUrl, 'GET', hops).then(function (result) {
          resolve(Object.assign({}, result, { method: 'GET' }));
        });
        return;
      }

      resolve({
        status:     status,
        ok:         status >= 200 && status < 300,
        redirected: hops > 0,
        method:     method
      });
    });

    req.setTimeout(timeout, function () {
      req.destroy();
      resolve({ status: 'TIMEOUT', ok: false });
    });

    req.on('error', function (err) {
      resolve({ status: 'ERROR: ' + err.message, ok: false });
    });

    req.end();
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

var entries = loadVendorUrls(platform);

if (!entries.length) {
  console.log('\n  No active vendor URLs found' + (platform ? ' for platform "' + platform + '"' : '') + '.\n');
  process.exit(0);
}

var label = platform
  ? '[JJ] URL Health Check — ' + platform.toUpperCase()
  : '[JJ] URL Health Check — All Platforms';

if (!quiet) {
  header(label);
  console.log('\n  Checking ' + entries.length + ' URL(s)...\n');
}

// Run checks sequentially to avoid hammering vendor servers
var results  = [];
var failures = 0;
var warnings = 0;

function runNext(idx) {
  if (idx >= entries.length) {
    return finish();
  }

  var entry = entries[idx];
  var displayUrl = entry.url.length > 60
    ? entry.url.slice(0, 57) + '...'
    : entry.url;

  checkUrl(entry.url).then(function (result) {
    var is403  = result.status === 403;
    var passed = result.ok;
    var isWarn = !passed && is403;
    var isFail = !passed && !is403;

    if (isFail) failures++;
    if (isWarn) warnings++;

    results.push({ entry: entry, result: result });

    if (!quiet || !passed) {
      var icon   = passed ? '✓' : (isWarn ? '⚠' : '✗');
      var status = String(result.status);
      if (result.redirected) status += ' ↳';
      if (result.method === 'GET') status += ' (GET)';
      if (isWarn) status += ' WARN';
      var line = '  ' + icon + '  ' + pad(entry.vendorName, 10)
               + pad(entry.productId, 40)
               + pad(status, 24)
               + displayUrl;
      console.log(line);
    }

    runNext(idx + 1);
  });
}

function finish() {
  if (!quiet) {
    console.log('\n' + '─'.repeat(56));
    console.log('\n  Total checked:  ' + results.length);
    console.log('  Passing (live): ' + (results.length - failures - warnings));
    if (warnings > 0) {
      console.log('  Warnings (403): ' + warnings + '  \u26a0  May be bot-blocking — verify manually');
    }
    console.log('  Failing (dead): ' + failures);
    if (failures > 0) {
      console.log('\n  \u2717  Dead URLs found. Deactivate in products.json:');
      console.log('     Set "active": false on the vendor object (not the product).\n');
    } else if (warnings > 0 && !strict) {
      console.log('\n  \u26a0  Some URLs returned 403. Use --strict to treat as failure.');
      console.log('     Open flagged URLs in a browser to confirm live/dead status.\n');
    } else {
      console.log('\n  \u2713  All URLs are live.\n');
    }
  }

  var shouldFail = failures > 0 || (strict && warnings > 0);
  if (shouldFail) process.exit(1);
}

runNext(0);
