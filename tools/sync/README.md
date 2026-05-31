# [JJ] Platform Sync Tool

Zero-dependency Node.js CLI for managing product listing copy across Zazzle and Redbubble.

`products.json` is the single source of truth. This tool detects what's changed, generates copy formatted for each platform, and tracks which products have been pushed.

---

## Prerequisites

- Node.js 14+
- No `npm install` needed — uses only built-in modules (`fs`, `path`, `crypto`)

---

## Commands

```sh
# Show per-platform sync state
node index.js status

# Show which products have changed since last sync (NEW / CHG)
node index.js diff

# Write per-product .txt files + combined _all-listings.txt
node index.js export zazzle
node index.js export redbubble

# Record that a single product has been pushed to a platform
node index.js mark-synced <product-id> <platform>

# Record that all products have been pushed to a platform (use after bulk update)
node index.js mark-all-synced zazzle
node index.js mark-all-synced redbubble

# Wipe sync state for a platform (forces all products to show as not-yet-synced)
node index.js reset zazzle
```

---

## Typical Workflow

```
1. Edit products.json (title, description, tags, price)
2. node index.js diff          → see what changed
3. node index.js export zazzle → generate updated listing copy
4. Open each [CHG] product on Zazzle, paste in the new title/desc/tags
5. node index.js mark-all-synced zazzle
6. Repeat for redbubble if needed
```

---

## File Structure

```
tools/sync/
  index.js            — CLI entry point
  sync-state.json     — persisted hash per product per platform (committed)
  lib/
    catalog.js        — reads products.json, returns flat active-product array
    state.js          — read/write sync-state.json
  platforms/
    zazzle.js         — Zazzle formatter + tag expansion (MAX 10 tags)
    redbubble.js      — Redbubble formatter + tag expansion (MAX 15 tags)
  exports/            — generated output (gitignored)
    zazzle/
      <product-id>.txt
      _all-listings.txt
    redbubble/
      <product-id>.txt
      _all-listings.txt
```

---

## How Change Detection Works

Each product gets a SHA-256 hash of `{ title, desc, tags, price, type }`.  
The hash is stored in `sync-state.json` per product per platform.

- **Up to date** — hash matches stored value
- **Needs update** — hash has changed since last `mark-synced`
- **Not yet synced** — product has no stored hash for this platform

Products are also flagged `[listed]` or `[not listed]` based on whether they have an active vendor URL for that platform in `products.json`.

---

## Tag Expansion

Base tags in `products.json` are short (5–7 per product). The platform formatters expand them to fill each platform's tag limit using `TAG_MAP` in `platforms/zazzle.js` and `platforms/redbubble.js`.

- Zazzle limit: **10 tags**
- Redbubble limit: **15 tags**

To improve tag coverage for a product, either add more base tags to the product in `products.json`, or expand the `TAG_MAP` entries in the platform formatter.

---

## Adding a New Platform

1. Create `platforms/<platform>.js` — implement `format(product)` and `expandTags(baseTags)`
2. Add an entry to the `PLATFORMS` object in `index.js`
3. Run `node index.js export <platform>` to test

---

## Backlog

The companion backlog tool lives at `tools/backlog/`:

```sh
cd tools/backlog
node index.js         # ranked open items
node index.js next 5  # top 5 action items with detail
node index.js all     # include done + blocked
node index.js done <id>
```

---

## Related Tools

- `tools/health/` — URL liveness checker. Run before editing products.json to confirm which vendor URLs are still live. Exit code 1 on failures. See `tools/health/README.md`.
- `admin/index.html` — Browser-based sync dashboard with hash comparison and one-click mark-synced via GitHub API.
- `admin/dashboard.html` — Business overview: product counts, sync state, product ideas, maintenance checklist.
