'use strict';

/**
 * Redbubble platform formatter.
 *
 * Redbubble SEO notes:
 *   - Title: up to 60 chars shown; descriptive; keyword at front
 *   - Description: supports basic markdown; search indexes full text
 *   - Tags: up to 15 per work; comma-separated; multi-word tags are fine (quoted)
 *   - Redbubble search weights title > tags > description
 *   - Products available on Redbubble but not in products.json are flagged
 */

var MAX_TAGS = 15;

var TAG_MAP = {
  'apparel':      ['clothing', 'gift', 'fashion'],
  't-shirt':      ['shirt', 'tee', 'graphic-tee'],
  'hoodie':       ['sweatshirt', 'pullover', 'warm'],
  'dos':          ['ms-dos', 'command-line', 'retro-computing', 'vintage-pc'],
  'retro':        ['vintage', 'classic', 'throwback', 'nostalgia'],
  'computing':    ['computer', 'technology', 'geek'],
  'programming':  ['developer', 'coder', 'programmer', 'software-engineer', 'coding'],
  'web':          ['web-developer', 'internet', 'frontend-dev'],
  'html':         ['html5', 'markup', 'web-dev'],
  'css':          ['css3', 'stylesheet', 'web-design'],
  'javascript':   ['js', 'typescript', 'frontend'],
  'standards':    ['web-standards', 'developer'],
  'math':         ['mathematics', 'stem', 'pi-day', 'math-gift'],
  'pi':           ['pi-day', 'irrational-number', 'geometry', 'pi-symbol'],
  'love':         ['heart-gift', 'i-love', 'valentines'],
  'greek':        ['greek-letter', 'mathematics', 'science', 'stem-gift'],
  'trigonometry': ['sine-cosine-tangent', 'soh-cah-toa', 'right-triangle'],
  'education':    ['math-teacher', 'student', 'school', 'learning'],
  'gaming':       ['gamer', 'video-games', 'gaming-culture'],
  'nintendo':     ['nes', 'super-mario', 'retro-gaming', 'nintendo-fan'],
  'github':       ['git', 'open-source', 'coding', 'version-control'],
  'discord':      ['discord-server', 'gaming-community', 'gamer'],
  'twitch':       ['twitch-streamer', 'live-streaming', 'content-creator'],
  'patreon':      ['creator-support', 'crowdfunding', 'art'],
  'baseball':     ['softball', 'rec-league', 'team-sports', 'kickball'],
  'sports':       ['athletic', 'team', 'recreational'],
  'jersey':       ['sports-jersey', 'team-shirt', 'athletic'],
  'emoji':        ['emoticon', 'unicode-emoji', 'smiley-face'],
  'emotion':      ['expressive', 'emoji-art', 'fun-gift'],
  'expression':   ['emoji', 'mood', 'unicode-art'],
  'humor':        ['funny-gift', 'gag-gift', 'comedy-shirt'],
  'parody':       ['funny', 'humor', 'parody-design', 'gag-gift'],
  'showdown':     ['skateboarding', 'snowboarding', 'detroit', 'michigan'],
  'mythology':    ['fantasy-art', 'mythical-creature', 'folklore'],
  'adventure':    ['fantasy', 'epic-quest', 'rpg'],
  'copyright':    ['copyright-symbol', 'customizable', 'personalized'],
  'rights':       ['justice-gift', 'freedom', 'civil-rights'],
  'smpte':        ['tv-test-pattern', 'broadcast', 'color-bars'],
  'engineering':  ['engineer', 'av-tech', 'broadcast-engineering'],
  'vintage':      ['retro-aesthetic', 'classic', 'old-school'],
  'ai-generated': ['ai-art', 'generative-art', 'machine-learning'],
  'icon':         ['logo', 'brand-icon', 'profile'],
  'signature':    ['personal-brand', 'qr-code', 'creator'],
  'qr-code':      ['scan-me', 'link', 'profile-link'],
  'zazzle':       ['custom-merch', 'creator-design', 'print-on-demand'],
  'redbubble':    ['indie-art', 'artist-merch', 'creator']
};

function expandTags(baseTags) {
  var tagSet = [];
  var seen   = {};

  baseTags.forEach(function (t) {
    var lower = t.toLowerCase();
    if (!seen[lower]) { seen[lower] = true; tagSet.push(lower); }
  });

  // Expand in reverse order so topic-specific tags (last in the array) fill
  // slots before generic product-type tags (t-shirt, apparel).
  baseTags.slice().reverse().forEach(function (t) {
    var extras = TAG_MAP[t.toLowerCase()];
    if (!extras) return;
    extras.forEach(function (extra) {
      if (tagSet.length >= MAX_TAGS) return;
      if (!seen[extra]) { seen[extra] = true; tagSet.push(extra); }
    });
  });

  if (tagSet.length < MAX_TAGS && !seen['jeffjenx']) {
    tagSet.push('jeffjenx');
  }

  return tagSet.slice(0, MAX_TAGS);
}

function format(product) {
  var tags      = expandTags(product.tags || []);
  var vendor    = (product.vendors || []).find(function (v) { return v.name === 'redbubble' && v.active !== false; });
  var vendorUrl = vendor ? vendor.url : '[not yet listed on Redbubble — consider adding]';

  var lines = [
    '══════════════════════════════════════════════════',
    'PLATFORM : Redbubble',
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
