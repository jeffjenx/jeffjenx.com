#!/usr/bin/env node
'use strict';

/**
 * [JJ] Product Page Generator
 *
 * Reads products.json and generates one static HTML page per active product at:
 *   /products/{product-id}/index.html
 *
 * Each page has:
 *   - Product-specific <title>, meta description, OG/Twitter tags
 *   - JSON-LD structured data (Product schema)
 *   - Vendor buy buttons (or single-vendor direct link)
 *   - Collection context + tags
 *   - Canonical URL
 *   - Layer 0-5 progressive enhancement (matches main shop)
 *
 * Usage:
 *   node tools/generate/index.js
 *   node tools/generate/index.js --dry-run   (print paths, don't write)
 *   node tools/generate/index.js --clean      (delete /products/ dir first)
 *
 * Output: jeffjenx.com/products/{id}/index.html
 */

var fs   = require('fs');
var path = require('path');

var ROOT          = path.join(__dirname, '..', '..');
var PRODUCTS_JSON = path.join(ROOT, 'products.json');
var OUTPUT_DIR    = path.join(ROOT, 'products');
var BASE_URL      = 'https://www.jeffjenx.com';

var args    = process.argv.slice(2);
var dryRun  = args.indexOf('--dry-run') >= 0;
var clean   = args.indexOf('--clean') >= 0;

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Truncate to maxLen at a word boundary for <meta> description tags (ideal: ~155 chars)
function truncMeta(str, maxLen) {
  if (!str || str.length <= maxLen) return str || '';
  var t = str.substring(0, maxLen);
  var sp = t.lastIndexOf(' ');
  return (sp > maxLen - 20 ? t.substring(0, sp) : t) + '\u2026';
}

function escJson(obj) {
  return JSON.stringify(obj).replace(/<\/script>/gi, '<\\/script>');
}

function slugify(str) {
  return String(str).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function vendorLabel(name) {
  var map = { zazzle: 'Buy on Zazzle', redbubble: 'Buy on Redbubble', gumroad: 'Download on Gumroad', direct: 'Buy Direct' };
  return map[name] || ('Buy on ' + name.charAt(0).toUpperCase() + name.slice(1));
}

function vendorAriaLabel(vendorName, productTitle) {
  return vendorLabel(vendorName) + ' — ' + productTitle;
}

// ── Build one product page ────────────────────────────────────────────────────

function buildPage(product, collection, siblings) {
  var isDigital   = product.type === 'digital';
  var canonicalUrl = BASE_URL + '/products/' + product.id + '/';
  var shopUrl      = BASE_URL + '/#' + collection.id;
  var activeVendors = (product.vendors || []).filter(function (v) { return v.active !== false; });

  // Structured data
  var offers = activeVendors.map(function (v) {
    return {
      '@type': 'Offer',
      'url': v.url,
      'seller': { '@type': 'Organization', 'name': v.name.charAt(0).toUpperCase() + v.name.slice(1) },
      'availability': 'https://schema.org/InStock',
      'priceCurrency': 'USD'
    };
  });
  if (product.price) { offers.forEach(function (o) { o.price = product.price.replace(/[^0-9.]/g, ''); }); }

  var productSchema = {
    '@type': 'Product',
    'name': product.title,
    'description': product.desc,
    'url': canonicalUrl,
    'brand': { '@type': 'Brand', 'name': 'Jeff Jenx' },
    'category': collection.label,
    'keywords': (product.tags || []).join(', '),
    'offers': offers.length === 1 ? offers[0] : { '@type': 'AggregateOffer', 'offers': offers }
  };
  if (product.image) productSchema['image'] = BASE_URL + product.image;

  var breadcrumb = {
    '@type': 'BreadcrumbList',
    'itemListElement': [
      { '@type': 'ListItem', 'position': 1, 'name': 'Shop', 'item': BASE_URL + '/' },
      { '@type': 'ListItem', 'position': 2, 'name': collection.label, 'item': BASE_URL + '/#' + collection.id },
      { '@type': 'ListItem', 'position': 3, 'name': product.title, 'item': canonicalUrl }
    ]
  };

  var structuredData = {
    '@context': 'https://schema.org',
    '@graph': [productSchema, breadcrumb]
  };

  // Vendor buttons HTML
  var vendorHtml = '';
  if (activeVendors.length === 0) {
    vendorHtml = '<p class="pg-unavail">Currently unavailable.</p>';
  } else if (activeVendors.length === 1) {
    vendorHtml = '<a class="pg-btn pg-btn--primary" href="' + esc(activeVendors[0].url) + '" target="_blank" rel="noopener noreferrer">'
      + esc(isDigital ? 'Download on ' + activeVendors[0].name.charAt(0).toUpperCase() + activeVendors[0].name.slice(1) : vendorLabel(activeVendors[0].name))
      + ' &rarr;</a>';
  } else {
    vendorHtml = '<div class="pg-vendors">';
    activeVendors.forEach(function (v) {
      vendorHtml += '<a class="pg-btn pg-btn--vendor" href="' + esc(v.url) + '" target="_blank" rel="noopener noreferrer" aria-label="' + esc(vendorAriaLabel(v.name, product.title)) + '">'
        + esc(isDigital ? 'Download on ' + v.name.charAt(0).toUpperCase() + v.name.slice(1) : vendorLabel(v.name))
        + '</a>';
    });
    vendorHtml += '</div>';
  }

  // Tags HTML
  var tagsHtml = (product.tags || []).map(function (t) {
    return '<span class="pg-tag">' + esc(t) + '</span>';
  }).join('');

  // Price HTML
  var priceHtml = product.price ? '<span class="pg-price">' + esc(product.price) + '</span>' : '';
  var dlBadge   = isDigital ? '<span class="pg-badge pg-badge--dl">Digital Download</span>' : '';
  var newBadge  = product['new'] ? '<span class="pg-badge pg-badge--new">New</span>' : '';

  var accentBase  = esc(collection.accent  || '#0a0a0a');
  var accentLight = esc(collection.accent_light || '#f0f0f0');
  var accentDark  = esc(collection.accent_dark  || '#222');

  // Siblings cross-sell HTML
  var siblingsHtml = '';
  if (siblings && siblings.length > 0) {
    siblingsHtml = '\n  <div class="pg-also">\n'
      + '    <span class="pg-also-label">Also in ' + esc(collection.label) + '</span>\n'
      + '    <div class="pg-also-list">';
    siblings.forEach(function (s) {
      siblingsHtml += '<a class="pg-also-link" href="' + esc(BASE_URL + '/products/' + s.id + '/') + '">' + esc(s.title) + '</a>';
    });
    siblingsHtml += '</div>\n  </div>\n';
  }

  return '<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN" "http://www.w3.org/TR/html4/loose.dtd">\n'
    + '<html lang="en">\n'
    + '<head>\n'
    + '<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">\n'
    + '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n'
    + '<title>' + esc(product.title) + ' &mdash; Jeff Jenx</title>\n'
    + '<meta name="description" content="' + esc(truncMeta(product.desc, 155)) + '">\n'
    + '<meta name="keywords" content="' + esc((product.tags || []).concat(['Jeff Jenx', 'apparel']).join(', ')) + '">\n'
    + '<meta name="robots" content="index, follow">\n'
    + '<link rel="canonical" href="' + canonicalUrl + '">\n'
    + '<meta property="og:type" content="product">\n'
    + '<meta property="og:url" content="' + canonicalUrl + '">\n'
    + '<meta property="og:title" content="' + esc(product.title) + ' &mdash; Jeff Jenx">\n'
    + '<meta property="og:description" content="' + esc(truncMeta(product.desc, 155)) + '">\n'
    + '<meta property="og:site_name" content="Jeff Jenx">\n'
    + '<meta property="og:image" content="' + (product.image ? BASE_URL + esc(product.image) : BASE_URL + '/og-image.png') + '">\n'
    + '<meta property="og:image:alt" content="' + esc(product.title + ' \u2014 Jeff Jenx') + '">\n'
    + '<meta name="theme-color" content="#f8f8f8" media="(prefers-color-scheme: light)">\n'
    + '<meta name="theme-color" content="#1a1a1a" media="(prefers-color-scheme: dark)">\n'
    + '<meta name="twitter:card" content="summary_large_image">\n'
    + '<meta name="twitter:site" content="@jeff_jenx">\n'
    + '<meta name="twitter:title" content="' + esc(product.title) + ' &mdash; Jeff Jenx">\n'
    + '<meta name="twitter:description" content="' + esc(truncMeta(product.desc, 155)) + '">\n'
    + '<meta name="twitter:image" content="' + (product.image ? BASE_URL + esc(product.image) : BASE_URL + '/og-image.png') + '">\n'
    + '<meta name="twitter:image:alt" content="' + esc(product.title + ' \u2014 Jeff Jenx') + '">\n'
    + '<link rel="icon" href="/favicon.ico" sizes="any">\n'
    + '<link rel="manifest" href="/manifest.json">\n'
    + '<script type="application/ld+json">' + escJson(structuredData) + '</script>\n'
    + '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
    + '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
    + '<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500&display=swap" rel="stylesheet">\n'
    + '\n'
    + '<style type="text/css">\n'
    + '/* Layer 1 — Base (IE5.5+) */\n'
    + '*,*::before,*::after{margin:0;padding:0;}\n'
    + 'body{background:#f8f8f8;color:#0a0a0a;font-family:"IBM Plex Sans","Helvetica Neue",Arial,sans-serif;font-size:16px;line-height:1.6;}\n'
    + 'a{color:#0a0a0a;}a:hover{opacity:.75;}\n'
    + '.wrap{max-width:760px;margin:0 auto;padding:0 20px 80px;}\n'
    + '/* Nav */\n'
    + '.jj-nav{position:sticky;top:0;z-index:10;border-bottom:1px solid #e0e0e0;padding:12px 24px;background:#f8f8f8;}\n'
    + '.jj-nav-inner{max-width:760px;margin:0 auto;}\n'
    + '.jj-nav-left{display:inline;vertical-align:middle;}\n'
    + '.jj-nav-right{float:right;vertical-align:middle;}\n'
    + '.jj-mark-sm{display:inline-block;background:#0a0a0a;color:#f8f8f8;font-family:"IBM Plex Mono","Courier New",monospace;font-weight:500;font-size:14px;width:32px;height:32px;text-align:center;line-height:32px;vertical-align:middle;margin-right:10px;text-decoration:none;}\n'
    + '.jj-brand{font-family:"IBM Plex Mono","Courier New",monospace;font-size:15px;font-weight:500;text-decoration:none;color:#0a0a0a;vertical-align:middle;}\n'
    + '.jj-nav-link{font-family:"IBM Plex Mono","Courier New",monospace;font-size:11px;letter-spacing:.06em;text-transform:uppercase;text-decoration:none;color:#666;margin-left:16px;vertical-align:middle;}\n'
    + '.jj-nav-link:hover{color:#0a0a0a;}\n'
    + '/* Breadcrumb */\n'
    + '.pg-breadcrumb{font-family:"IBM Plex Mono","Courier New",monospace;font-size:11px;letter-spacing:.04em;color:#999;margin:28px 0 24px;}\n'
    + '.pg-breadcrumb a{color:#999;text-decoration:none;}.pg-breadcrumb a:hover{color:#0a0a0a;}\n'
    + '.pg-breadcrumb .sep{margin:0 8px;}\n'
    + '/* Collection bar */\n'
    + '.pg-collection-bar{background:' + accentBase + ';color:#fff;font-family:"IBM Plex Mono","Courier New",monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;padding:8px 16px;display:inline-block;margin-bottom:20px;}\n'
    + '/* Product header */\n'
    + '.pg-header{margin-bottom:24px;}\n'
    + '.pg-title{font-family:"IBM Plex Mono","Courier New",monospace;font-size:26px;font-weight:500;letter-spacing:-.02em;line-height:1.2;margin-bottom:12px;}\n'
    + '.pg-badges{margin-bottom:12px;}\n'
    + '.pg-badge{display:inline-block;font-family:"IBM Plex Mono","Courier New",monospace;font-size:9px;letter-spacing:.12em;text-transform:uppercase;padding:2px 6px;margin-right:6px;}\n'
    + '.pg-badge--new{background:#0a0a0a;color:#f8f8f8;}\n'
    + '.pg-badge--dl{background:#166534;color:#f8f8f8;}\n'
    + '.pg-price{font-family:"IBM Plex Mono","Courier New",monospace;font-size:20px;font-weight:500;display:block;margin-bottom:16px;}\n'
    + '.pg-desc{font-size:16px;line-height:1.7;color:#333;margin-bottom:24px;max-width:600px;}\n'
    + '/* Vendor buttons */\n'
    + '.pg-vendors{margin-bottom:24px;}\n'
    + '.pg-btn{display:inline-block;font-family:"IBM Plex Mono","Courier New",monospace;font-size:12px;letter-spacing:.06em;text-transform:uppercase;text-decoration:none;padding:10px 20px;margin:0 8px 8px 0;border:2px solid #0a0a0a;color:#0a0a0a;}\n'
    + '.pg-btn--primary{background:#0a0a0a;color:#f8f8f8;}\n'
    + '.pg-btn--primary:hover{background:#333;color:#f8f8f8;}\n'
    + '.pg-btn--vendor{background:#f8f8f8;color:#0a0a0a;}\n'
    + '.pg-btn--vendor:hover{background:#0a0a0a;color:#f8f8f8;}\n'
    + '.pg-unavail{color:#999;font-family:"IBM Plex Mono","Courier New",monospace;font-size:13px;margin-bottom:24px;}\n'
    + '/* Product visual */\n'
    + '.pg-visual{height:200px;display:flex;align-items:center;justify-content:center;margin-bottom:32px;overflow:hidden;}\n'
    + '.pg-visual-mark{font-family:"IBM Plex Mono","Courier New",monospace;font-size:80px;color:#f8f8f8;line-height:1;user-select:none;}\n'
    + '.pg-visual img{width:100%;height:100%;object-fit:contain;display:block;}\n'
    + '/* Tags */\n'
    + '.pg-tags{margin-bottom:32px;}\n'
    + '.pg-tag{display:inline-block;background:#ebebeb;font-family:"IBM Plex Mono","Courier New",monospace;font-size:10px;letter-spacing:.08em;text-transform:uppercase;padding:3px 8px;margin:0 4px 4px 0;color:#666;}\n'
    + '/* Back link */\n'
    + '.pg-back{font-family:"IBM Plex Mono","Courier New",monospace;font-size:12px;letter-spacing:.05em;text-transform:uppercase;text-decoration:none;color:#666;border-bottom:1px solid #e0e0e0;padding-bottom:20px;margin-bottom:32px;display:block;}\n'
    + '.pg-back:hover{color:#0a0a0a;}\n'
    + '/* Footer */\n'
    + '.jj-footer{margin-top:60px;padding-top:20px;border-top:1px solid #e0e0e0;font-family:"IBM Plex Mono","Courier New",monospace;font-size:11px;letter-spacing:.04em;color:#999;}\n'
    + '.jj-footer a{color:#999;text-decoration:none;margin:0 6px;}.jj-footer a:hover{color:#0a0a0a;}\n'
    + '\n'
    + '/* Layer 2 — @media (IE9+) */\n'
    + '@media (max-width:600px){\n'
    + '  .pg-title{font-size:20px;}\n'
    + '  .jj-nav-right{display:none;}\n'
    + '  .pg-visual{height:140px;}\n'
    + '  .pg-visual-mark{font-size:52px;}\n'
    + '}\n'
    + '\n'
    + '/* Share button */\n'
    + '.share-btn{background:none;border:none;cursor:pointer;font-family:"IBM Plex Mono","Courier New",monospace;font-size:11px;letter-spacing:.10em;text-transform:uppercase;color:#717171;padding:0;margin:0 0 24px;display:inline-block;}\n'
    + '.share-btn:hover{color:#0a0a0a;text-decoration:none;}\n'
    + '.share-btn--copied{color:#166534;}\n'
    + '/* Theme toggle */\n'
    + '#theme-toggle{float:right;font-family:"IBM Plex Mono","Courier New",monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase;background:none;border:1px solid #c8c8c8;color:#555;padding:5px 11px;cursor:pointer;vertical-align:middle;}\n'
    + '#theme-toggle:hover{background:#e8e8e8;}\n'
    + '/* Also-in-collection */\n'
    + '.pg-also{margin-bottom:32px;padding-top:24px;border-top:1px solid #e0e0e0;}\n'
    + '.pg-also-label{font-family:"IBM Plex Mono","Courier New",monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#999;display:block;margin-bottom:12px;}\n'
    + '.pg-also-list{display:block;}\n'
    + '.pg-also-link{display:inline-block;font-family:"IBM Plex Mono","Courier New",monospace;font-size:11px;text-decoration:none;color:#0a0a0a;border:1px solid #e0e0e0;padding:6px 12px;margin:0 6px 6px 0;}\n'
    + '.pg-also-link:hover{border-color:#0a0a0a;opacity:1;}\n'
    + '\n'
    + '/* Layer 3 — CSS custom properties (Chrome 49+) */\n'
    + '@supports(--x:0){\n'
    + '  :root{--jj-bg:#f8f8f8;--jj-fg:#0a0a0a;--jj-fg-muted:#555;--jj-border-color:#e0e0e0;--jj-bg-raised:#ebebeb;}\n'
    + '  @media(prefers-color-scheme:dark){:root{--jj-bg:#0a0a0a;--jj-fg:#f0f0f0;--jj-fg-muted:#aaa;--jj-border-color:#2a2a2a;--jj-bg-raised:#1a1a1a;}}\n'
    + '  [data-theme="dark"]{--jj-bg:#0a0a0a;--jj-fg:#f0f0f0;--jj-fg-muted:#aaa;--jj-border-color:#2a2a2a;--jj-bg-raised:#1a1a1a;}\n'
    + '  [data-theme="light"]{--jj-bg:#f8f8f8;--jj-fg:#0a0a0a;--jj-fg-muted:#555;--jj-border-color:#e0e0e0;--jj-bg-raised:#ebebeb;}\n'
    + '  body{background:var(--jj-bg);color:var(--jj-fg);}\n'
    + '  .jj-nav{background:var(--jj-bg);border-color:var(--jj-border-color);}\n'
    + '  .pg-breadcrumb,.pg-breadcrumb a{color:var(--jj-fg-muted);}\n'
    + '  .pg-desc{color:var(--jj-fg-muted);}\n'
    + '  .pg-tag{background:var(--jj-bg-raised);color:var(--jj-fg-muted);}\n'
    + '  .pg-back{color:var(--jj-fg-muted);border-bottom-color:var(--jj-border-color);}\n'
    + '  .jj-footer{color:var(--jj-fg-muted);border-top-color:var(--jj-border-color);}\n'
    + '  .jj-footer a{color:var(--jj-fg-muted);}\n'
    + '  .share-btn{color:var(--jj-fg-muted);}\n'
    + '  .share-btn:hover{color:var(--jj-fg);}\n'
    + '  [data-theme="dark"] .share-btn--copied{color:#4ade80;}\n'
    + '  #theme-toggle{border-color:var(--jj-border-color);color:var(--jj-fg-muted);}\n'
    + '  #theme-toggle:hover{background:var(--jj-bg-raised);}\n'
    + '  .pg-also{border-top-color:var(--jj-border-color);}\n'
    + '  .pg-also-label{color:var(--jj-fg-muted);}\n'
    + '  .pg-also-link{color:var(--jj-fg);border-color:var(--jj-border-color);}\n'
    + '  .pg-also-link:hover{border-color:var(--jj-fg);}\n'
    + '}\n'
    + '</style>\n'
    + '<script>/* anti-FOUC */(function(){var r=document.documentElement,s,ov;try{s=localStorage.getItem(\'jj-theme\');ov=localStorage.getItem(\'jj-theme-override\')==="true";}catch(e){}var sys=window.matchMedia&&window.matchMedia(\'(prefers-color-scheme:dark)\').matches;r.setAttribute(\'data-theme\',(ov&&s)?s:(sys?\'dark\':\'light\'));})();</script>\n'
    + '</head>\n'
    + '<body>\n'
    + '\n'
    + '<div class="jj-nav">\n'
    + '  <div class="jj-nav-inner">\n'
    + '    <span class="jj-nav-left">\n'
    + '      <a class="jj-mark-sm" href="https://www.jeffjenx.com/">[JJ]</a><a class="jj-brand" href="https://www.jeffjenx.com/">Jeff Jenx</a>\n'
    + '    </span>\n'
    + '    <span class="jj-nav-right">\n'
    + '      <button id="theme-toggle" type="button" aria-label="Toggle dark mode">Dark</button>\n'
    + '      <a class="jj-nav-link" href="https://www.jeffjenx.com/">Shop</a>\n'
    + '      <a class="jj-nav-link" href="https://jeffjenx.design/">Design</a>\n'
    + '      <a class="jj-nav-link" href="https://jeffjenx.net/">Network</a>\n'
    + '    </span>\n'
    + '    <div style="clear:both"></div>\n'
    + '  </div>\n'
    + '</div>\n'
    + '\n'
    + '<div class="wrap">\n'
    + '\n'
    + '  <nav class="pg-breadcrumb" aria-label="Breadcrumb">\n'
    + '    <a href="https://www.jeffjenx.com/">Shop</a>\n'
    + '    <span class="sep" aria-hidden="true">/</span>\n'
    + '    <a href="' + esc(shopUrl) + '">' + esc(collection.label) + '</a>\n'
    + '    <span class="sep" aria-hidden="true">/</span>\n'
    + '    <span>' + esc(product.title) + '</span>\n'
    + '  </nav>\n'
    + '\n'
    + '  <div class="pg-visual" style="background:' + accentBase + '" aria-hidden="true">'
    + (product.image
        ? '<img src="' + esc(BASE_URL + product.image) + '" alt="' + esc(product.title + ' — Jeff Jenx') + '" loading="eager">'
        : '<span class="pg-visual-mark">' + esc(collection.mark || '[JJ]') + '</span>')
    + '</div>\n'
    + '\n'
    + '  <div class="pg-collection-bar">' + esc(collection.label) + '</div>\n'
    + '\n'
    + '  <div class="pg-header">\n'
    + '    <h1 class="pg-title">' + esc(product.title) + '</h1>\n'
    + (newBadge || dlBadge ? '    <div class="pg-badges">' + newBadge + dlBadge + '</div>\n' : '')
    + (priceHtml ? '    ' + priceHtml + '\n' : '')
    + '  </div>\n'
    + '\n'
    + '  <p class="pg-desc">' + esc(product.desc) + '</p>\n'
    + '\n'
    + '  ' + vendorHtml + '\n'
    + '\n'
    + '  <button class="share-btn" id="share-btn" type="button" aria-label="Copy link to this product">Share &uarr;</button>\n'
    + '\n'
    + '  <div class="pg-tags">' + tagsHtml + '</div>\n'
    + (siblingsHtml ? siblingsHtml : '')
    + '\n'
    + '  <a class="pg-back" href="' + esc(shopUrl) + '">&larr; Back to ' + esc(collection.label) + '</a>\n'
    + '\n'
    + '  <footer class="jj-footer" role="contentinfo">\n'
    + '    <div>[JJ] Jeff Jenx &nbsp;&middot;&nbsp;<a href="https://www.jeffjenx.com/">Shop</a>&nbsp;&middot;&nbsp;<a href="https://jeffjenx.design/">Design</a>&nbsp;&middot;&nbsp;<a href="https://jeffjenx.net/">Network</a></div>\n'
    + '    <div style="margin-top:6px">No tracking. No ads. No data collected.</div>\n'
    + '    <span style="display:none"><a href="https://github.com/jeffjenx" rel="me">GitHub</a> <a href="https://x.com/jeff_jenx" rel="me">X</a></span>\n'
    + '  </footer>\n'
    + '\n'
    + '</div>\n'
    + '\n'
    + '<script>\n'
    + '(function(){\n'
    + '  // Theme toggle\n'
    + '  var r=document.documentElement,btn=document.getElementById(\'theme-toggle\');\n'
    + '  if(btn){\n'
    + '    var t=r.getAttribute(\'data-theme\')||(\'light\');\n'
    + '    btn.textContent=t==="dark"?"Light":"Dark";\n'
    + '    btn.addEventListener(\'click\',function(){\n'
    + '      var next=r.getAttribute(\'data-theme\')==="dark"?"light":"dark";\n'
    + '      r.setAttribute(\'data-theme\',next);\n'
    + '      try{localStorage.setItem(\'jj-theme\',next);localStorage.setItem(\'jj-theme-override\',\'true\');}catch(e){}\n'
    + '      btn.textContent=next==="dark"?"Light":"Dark";\n'
    + '    });\n'
    + '  }\n'
    + '  // Share button\n'
    + '  var sb=document.getElementById(\'share-btn\');\n'
    + '  if(sb){\n'
    + '    sb.addEventListener(\'click\',function(){\n'
    + '      var url=window.location.href;\n'
    + '      function onCopied(){sb.textContent="Copied!";sb.classList.add(\'share-btn--copied\');setTimeout(function(){sb.textContent="Share \\u2191";sb.classList.remove(\'share-btn--copied\');},1800);}\n'
    + '      if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(url).then(onCopied,function(){fb(url);onCopied();});}else{fb(url);onCopied();}\n'
    + '      function fb(t){var ta=document.createElement(\'textarea\');ta.value=t;ta.style.position="fixed";ta.style.top="-9999px";document.body.appendChild(ta);ta.select();try{document.execCommand(\'copy\');}catch(e){}document.body.removeChild(ta);}\n'
    + '    });\n'
    + '  }\n'
    + '})();\n'
    + '</script>\n'
    + '</body>\n'
    + '</html>\n';
}

// ── Main ──────────────────────────────────────────────────────────────────────

var raw  = fs.readFileSync(PRODUCTS_JSON, 'utf8');
var data = JSON.parse(raw);

if (clean && !dryRun && fs.existsSync(OUTPUT_DIR)) {
  // Only remove generated product subdirectories, not the whole products/ folder
  var existing = fs.readdirSync(OUTPUT_DIR);
  existing.forEach(function (name) {
    var dir = path.join(OUTPUT_DIR, name);
    if (fs.statSync(dir).isDirectory()) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
  console.log('Cleaned existing product directories.');
}

if (!dryRun && !fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

var generated = 0;
var skipped   = 0;
var errors    = [];

(data.collections || []).forEach(function (col) {
  if (!col.active) return;
  var activeInCol = (col.products || []).filter(function (p) { return p.active !== false; });
  activeInCol.forEach(function (product) {
    if (!product.active) { skipped++; return; }

    // Siblings: other active products in same collection, up to 4
    var siblings = activeInCol.filter(function (p) { return p.id !== product.id; }).slice(0, 4);

    var outDir  = path.join(OUTPUT_DIR, product.id);
    var outFile = path.join(outDir, 'index.html');

    if (dryRun) {
      console.log('[dry-run] Would write: products/' + product.id + '/index.html  (' + product.title + ')');
      generated++;
      return;
    }

    try {
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
      var html = buildPage(product, col, siblings);
      fs.writeFileSync(outFile, html, 'utf8');
      console.log('  \u2713  products/' + product.id + '/index.html');
      generated++;
    } catch (e) {
      console.error('  \u2717  ' + product.id + ': ' + e.message);
      errors.push(product.id);
    }
  });
});

console.log('\n' + (dryRun ? '[dry-run] ' : '') + 'Generated: ' + generated + '  |  Skipped (draft): ' + skipped + '  |  Errors: ' + errors.length);
if (errors.length) { console.error('Errors in: ' + errors.join(', ')); process.exit(1); }
