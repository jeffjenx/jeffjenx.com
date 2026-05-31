# [JJ] URL Health Check Tool

Zero-dependency Node.js CLI that checks whether active vendor URLs in `products.json` are reachable. Resolves blocker **B-001**: dead product links (Zazzle or Redbubble silently delisting items).

---

## What It Does

For every active product with active vendor entries, sends an HTTP HEAD request and records the response status. 2xx responses are live. 403 responses are warnings (see below). Everything else is a failure.

- Follows redirects (up to 5 hops)
- Falls back from HEAD → GET for servers that reject HEAD (405/501)
- Per-request timeout (default: 10 seconds)
- **403 = warning (⚠)** — some vendors (Zazzle) return 403 for automated requests on live products
- **Non-2xx non-403 = failure (✗)** — exits with code `1` (CI-friendly)
- Sequential requests — won't hammer vendor servers

---

## Prerequisites

- Node.js 14+
- No `npm install` needed — uses only built-in modules (`https`, `http`, `url`, `fs`, `path`)

---

## Commands

```sh
# Check all active vendor URLs
node index.js

# Check only one platform
node index.js --platform zazzle
node index.js --platform redbubble

# Only print failing URLs and warnings (suppress passing lines)
node index.js --quiet

# Treat 403 as a failure (exit 1 on bot-blocking responses)
node index.js --strict

# Extend per-request timeout (default: 10000 ms)
node index.js --timeout 20000

# Combine flags
node index.js --platform zazzle --quiet --timeout 15000
```

---

## 403 Responses (Bot-Blocking)

Some vendor platforms (confirmed: Zazzle) return `HTTP 403 Forbidden` for automated requests on **live** listings. These are displayed as warnings (⚠) and do not count as failures or affect the exit code.

To confirm a 403 is genuinely dead rather than bot-blocked: open the URL in a browser. If the listing loads, it's live.

Use `--strict` to promote 403 warnings to failures in CI contexts where you want zero ambiguity.

---

## Sample Output

```
════════════════════════════════════════════════════════
  [JJ] URL Health Check — All Platforms
════════════════════════════════════════════════════════

  Checking 26 URL(s)...

  ✓  zazzle    warez-hello-world                       200             https://www.zazzle.com/hello_world...
  ⚠  zazzle    showdown-grand-theft-army               403 WARN        https://www.zazzle.com/grand_theft...
  ✗  zazzle    www-html5-logo                          404             https://www.zazzle.com/html5_logo_...
  ✓  redbubble www-html5-logo                          200             https://www.redbubble.com/i/t-shirt...

  ────────────────────────────────────────────────────────

  Total checked:  26
  Passing (live): 24
  Warnings (403): 1  ⚠  May be bot-blocking — verify manually
  Failing (dead): 1

  ✗  Dead URLs found. Deactivate in products.json:
     Set "active": false on the vendor object (not the product).
```

---

## When to Run

| Trigger | Frequency |
|---------|-----------|
| Manual audit | Quarterly (minimum) |
| Before deploying a products.json change | Always |
| After a user reports a dead product link | Immediately |

---

## Fixing Dead URLs

When a URL fails:

1. Open `products.json`
2. Find the product by `id`
3. Set `"active": false` on the specific **vendor** entry (not the product)
4. If no other vendor is active, set the product's `"active": false` as well to hide it from the shop

**Do not delete** dead vendor entries — the `note` field can document why it was deactivated (audit trail).

---

## Related Tools

- `tools/sync/` — Platform sync state tracker (tag/description copy management)
- `admin/index.html` — Browser admin dashboard (sync + hash comparison)
