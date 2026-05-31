#!/usr/bin/env node
'use strict';
var fs   = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var data  = JSON.parse(fs.readFileSync(path.join(ROOT, 'products.json'), 'utf8'));
var today = new Date().toISOString().split('T')[0];
var BASE  = 'https://www.jeffjenx.com';

var urls = [{ loc: BASE + '/', changefreq: 'weekly', priority: '1.0' }];

(data.collections || []).forEach(function (col) {
  if (!col.active) return;
  (col.products || []).forEach(function (p) {
    if (!p.active) return;
    urls.push({ loc: BASE + '/products/' + p.id + '/', changefreq: 'monthly', priority: '0.8' });
  });
});

var xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
urls.forEach(function (u) {
  xml += '  <url>\n';
  xml += '    <loc>' + u.loc + '</loc>\n';
  xml += '    <lastmod>' + today + '</lastmod>\n';
  xml += '    <changefreq>' + u.changefreq + '</changefreq>\n';
  xml += '    <priority>' + u.priority + '</priority>\n';
  xml += '  </url>\n';
});
xml += '</urlset>\n';

fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml, 'utf8');
console.log('Written sitemap.xml with ' + urls.length + ' URLs');
