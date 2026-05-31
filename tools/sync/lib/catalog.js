'use strict';

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const PRODUCTS_JSON = path.join(__dirname, '../../../products.json');

/**
 * Load all active products from products.json, annotated with their collection.
 * Returns a flat array — one entry per unique product.
 */
function load() {
  const raw  = fs.readFileSync(PRODUCTS_JSON, 'utf8');
  const data = JSON.parse(raw);
  const products = [];

  (data.collections || []).forEach(function (col) {
    if (!col.active) return;
    (col.products || []).forEach(function (product) {
      if (product.active === false) return;
      products.push(Object.assign({}, product, {
        _collection: { id: col.id, label: col.label, desc: col.desc }
      }));
    });
  });

  return products;
}

/**
 * Produce a short, stable hash of the fields that matter for a platform listing.
 * If title, desc, tags, or price change — the hash changes → sync required.
 */
function hash(product) {
  const key = JSON.stringify({
    title: product.title,
    desc:  product.desc,
    tags:  (product.tags || []).slice().sort(),
    price: product.price || '',
    type:  product.type  || 'physical'
  });
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
}

module.exports = { load, hash };
