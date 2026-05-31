'use strict';

/**
 * Zazzle platform formatter.
 *
 * Zazzle SEO notes:
 *   - Title: up to 160 chars; keyword-rich; avoid filler words
 *   - Description: plain text; Zazzle shows ~500 chars before truncation
 *   - Tags: comma-separated; up to 10 per product; no quotes; single words or short phrases
 *   - "gift" keyword family consistently outperforms generic terms on Zazzle search
 */

const MAX_TAGS = 10;

// Maps base tags → additional Zazzle-appropriate tags.
// Entries ordered by priority; fill stops at MAX_TAGS.
var TAG_MAP = {
  'apparel':      ['clothing', 'gift', 'wearable'],
  't-shirt':      ['shirt', 'tee', 'unisex'],
  'hoodie':       ['sweatshirt', 'pullover', 'cozy'],
  'dos':          ['ms-dos', 'command-line', 'vintage-tech'],
  'retro':        ['vintage', 'throwback', 'classic', 'nostalgic'],
  'computing':    ['tech', 'geek', 'computer'],
  'programming':  ['developer', 'coder', 'programmer', 'software-engineer'],
  'web':          ['web-developer', 'internet', 'frontend'],
  'html':         ['html5', 'markup', 'web-developer'],
  'css':          ['css3', 'stylesheet', 'frontend'],
  'javascript':   ['js', 'nodejs', 'frontend'],
  'typescript':   ['ts', 'typed-javascript', 'type-safety', 'microsoft'],
  'nodejs':       ['node', 'javascript-runtime', 'backend', 'server-side'],
  'standards':    ['web-standards', 'developer'],
  'math':         ['mathematics', 'stem', 'pi-day', 'math-teacher'],
  'pi':           ['pi-day', 'mathematics', 'geometry', 'irrational'],
  'love':         ['heart', 'gift', 'i-love'],
  'greek':        ['letter', 'symbol', 'mathematics', 'stem'],
  'trigonometry': ['sine', 'cosine', 'tangent', 'math'],
  'euler':        ['eulers-number', 'calculus', 'mathematics', 'natural-log'],
  'calculus':     ['derivatives', 'integrals', 'limits', 'math'],
  'education':    ['student', 'teacher', 'school', 'learning'],
  'gaming':       ['gamer', 'video-games', 'game'],
  'nintendo':     ['nes', 'super-mario', 'retrogaming'],
  'github':       ['git', 'open-source', 'developer', 'version-control'],
  'discord':      ['gaming', 'community', 'server-admin'],
  'twitch':       ['streaming', 'live-stream', 'content-creator'],
  'patreon':      ['creator', 'crowdfunding', 'supporter'],
  'baseball':     ['softball', 'rec-league', 'team-sports'],
  'sports':       ['athletic', 'team', 'league'],
  'jersey':       ['sports', 'team', 'uniform'],
  'emoji':        ['emoticon', 'unicode', 'smiley'],
  'emotion':      ['emoticon', 'feeling', 'smiley'],
  'expression':   ['emoticon', 'fun', 'personality'],
  'humor':        ['funny', 'gag-gift', 'comedy'],
  'bsod':         ['windows', 'crash', 'error-screen', 'microsoft'],
  'windows':      ['microsoft', 'operating-system', 'pc'],
  'parody':       ['humor', 'funny', 'parody-design'],
  'showdown':     ['skateboard', 'snowboard', 'detroit'],
  'mythology':    ['fantasy', 'mythical', 'rpg'],
  'adventure':    ['fantasy', 'quest', 'epic'],
  'copyright':    ['rights', 'legal', 'customizable'],
  'rights':       ['justice', 'liberty', 'freedom'],
  'customizable': ['personalized', 'custom', 'your-name'],
  'smpte':        ['broadcast', 'television', 'engineering'],
  'tv':           ['television', 'broadcast', 'test-pattern'],
  'engineering':  ['engineer', 'tech', 'av'],
  'vintage':      ['retro', 'classic', 'throwback'],
  'ai-generated': ['ai-art', 'generative', 'machine-learning'],
  'icon':         ['logo', 'brand', 'profile'],
  'signature':    ['personal', 'branded', 'qr-code'],
  'qr-code':      ['scan', 'link', 'profile'],
  'zazzle':       ['creator', 'custom-design', 'marketplace'],
  'redbubble':    ['creator', 'artist', 'indie-design'],
  'creator':      ['content-creator', 'indie-designer', 'artist']
};

function expandTags(baseTags) {
  var tagSet = [];
  var seen   = {};

  baseTags.forEach(function (t) {
    var lower = t.toLowerCase();
    if (!seen[lower]) { seen[lower] = true; tagSet.push(lower); }
  });

  // Expand in reverse order so topic-specific tags (last in the array) fill
  // slots before generic product-type tags (t-shirt, apparel), which are
  // already implied by the product category and least valuable for discovery.
  baseTags.slice().reverse().forEach(function (t) {
    var extras = TAG_MAP[t.toLowerCase()];
    if (!extras) return;
    extras.forEach(function (extra) {
      if (tagSet.length >= MAX_TAGS) return;
      if (!seen[extra]) { seen[extra] = true; tagSet.push(extra); }
    });
  });

  // Brand tag as last resort
  if (tagSet.length < MAX_TAGS && !seen['jeffjenx']) {
    tagSet.push('jeffjenx');
  }

  return tagSet.slice(0, MAX_TAGS);
}

function format(product) {
  var tags      = expandTags(product.tags || []);
  var vendor    = (product.vendors || []).find(function (v) { return v.name === 'zazzle' && v.active !== false; });
  var vendorUrl = vendor ? vendor.url : '[not yet listed on Zazzle — add to products.json vendors array]';

  var lines = [
    '══════════════════════════════════════════════════',
    'PLATFORM : Zazzle',
    'PRODUCT  : ' + product.id,
    'COLLECT  : ' + product._collection.label,
    '══════════════════════════════════════════════════',
    '',
    'TITLE',
    '──────────────────────────────────────────────────',
    product.title,
    '',
    'DESCRIPTION',
    '──────────────────────────────────────────────────',
    product.desc,
    '',
    'TAGS  [' + tags.length + '/' + MAX_TAGS + ']',
    '──────────────────────────────────────────────────',
    tags.join(', '),
    '',
    'LISTING URL',
    '──────────────────────────────────────────────────',
    vendorUrl,
    ''
  ];

  return lines.join('\n');
}

module.exports = { format: format, expandTags: expandTags, MAX_TAGS: MAX_TAGS };
