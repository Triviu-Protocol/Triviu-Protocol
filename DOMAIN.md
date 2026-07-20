# Domain — ready to adopt, decision not locked

The public domain is not decided yet, and nothing in the project hardcodes one in
more than a single place. Everything is staged so that adopting a domain is a
few-minute change, not a code-wide hunt. Do not find-and-replace a domain by hand.

## Single source of truth

The domain lives in exactly one place:

- **[`site/domain.config.json`](site/domain.config.json)** → the `domain` field.

The site's SEO tags (canonical, `og:url`, `sitemap.xml`, `robots.txt`) must carry
the domain as static text — crawlers read the raw HTML, so it cannot be a runtime
variable. **[`scripts/set-domain.mjs`](scripts/set-domain.mjs)** bridges that: it
propagates the one config value to every file, safely.

```bash
node scripts/set-domain.mjs            # dry-run: report what would change
node scripts/set-domain.mjs --apply    # write it, and record the new host
```

The script only rewrites hosts it knows (the Vercel hosts + any domain applied
before). It never touches the GitBook whitepaper host
(`triviu-protocol.gitbook.io`) — that is a separate service and stays.

## Availability (checked 2026-07-20 · RDAP)

| Domain | Status |
|---|---|
| `triviu.org` | **free** |
| `triviu.io` | **free** |
| `triviu.xyz` | **free** |
| `triviu.dev` | **free** |

Recommendation, not a decision: **`triviu.org`** fits an open, non-custodial,
no-token public-good protocol under AGPL — `.org` reads as a project, not a
company. `.xyz` is common in web3 and cheap; `.io`/`.dev` read as dev/startup and
`.dev` forces HTTPS. Your call — the config makes any of them a one-line change.

## When the domain is chosen — do this

1. **Register it** (founder). Nothing here registers a domain.
2. Edit `site/domain.config.json` → set `domain` to the chosen host.
3. Run `node scripts/set-domain.mjs --apply` from the repo root.
4. Attach the domain to the host (templates below).
5. Redeploy the site; confirm `canonical`/`og:url`/`sitemap.xml` show the new host.
6. Optional: once mail is set up, `security@<domain>` becomes the disclosure inbox
   in `SECURITY.md` (until then, GitHub private reporting is the live channel).

## Host attach — the two ready paths

### A · Vercel (current host — fastest)
The site is deployed on Vercel today (`triviu` project). To use a custom domain:

1. Vercel → project `triviu` → Settings → Domains → add `<domain>`.
2. Vercel shows the exact records. Typical:

```
# apex domain
A     @      76.76.21.21
# www subdomain
CNAME www    cname.vercel-dns.com
```

3. Add those at your registrar's DNS. Vercel issues the TLS cert automatically.

### B · Cloudflare Pages (alternative — DNS + CDN in one place)
If you'd rather host on Cloudflare Pages:

1. Cloudflare → Pages → Create project → connect the `Triviu-Protocol` repo.
   Build command: none (static). Output directory: `site`.
2. Pages → your project → Custom domains → add `<domain>`.
3. If the domain's nameservers are on Cloudflare, the record is created for you:

```
# managed by Cloudflare Pages
CNAME @      <project>.pages.dev     (proxied)
```

4. TLS is automatic. Then point deploys at Pages instead of Vercel.

> Pick one host; don't split the apex across both. The domain config and the
> `set-domain.mjs` script are identical either way — only the attach step differs.

## What stays untouched by all of this
- The GitBook whitepaper (`triviu-protocol.gitbook.io`) — its own service.
- Internal/vault references — the vault is private and not part of this flow.
