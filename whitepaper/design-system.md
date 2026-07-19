# Design System

The Triviu interface is one system, applied identically across every surface — the site,
the simulator, the chains page, the dashboard, the education pages. Self-contained, no
build step, brand tokens as the single source of truth.

## Tokens

**Color** — the brand palette (see [Brand](brand.md)), exposed as CSS variables:
`--papel` `--tinta` `--grafite` `--ultramar` `--lacre` `--acafrao`. Dark mode overrides
each token; a user theme toggle wins over the OS preference and persists.

**Type** — `--fd` Libre Caslon Text (display) · `--ft` Public Sans (body) · `--fm` IBM
Plex Mono (numbers/labels). Fonts load with `display=swap` so text never blocks render.

**Space & radius** — a small step scale (`--s-3…--s-7`) and two radii (`--r-m`, `--r-l`).

## Interface principles

- **Honesty in the UI.** A metric without its failure context is marketing; every number
  shows its source, and losses/reverts are shown, not hidden.
- **No dead links, no invented data.** Empty states say "no data yet · after deploy",
  never a fabricated number. Every claim links to where you can check it.
- **Motion is restrained.** Slow, low-amplitude, honoring `prefers-reduced-motion`. No
  hype animation.
- **Accessibility.** Real heading order, keyboard-operable controls (the simulator nodes
  are sliders), text labels not color-only, sufficient contrast in both themes.
- **Self-contained & fast.** Each page is a single file; Core Web Vitals stay green (CLS 0,
  fast LCP) by construction.

## Components

- **The living mark** — the three-node cycle, draggable in the simulator (each node is a
  pool price; the cycle becomes an N-gon for multi-hop).
- **Verdict pill** — reverts / profit (RARE) / negative, colored by the brand triad.
- **The seal** — the `AI-GENERATED` chip and the honesty disclosures, mono, bordered.
- **Tradeoff record card** — a decision with its cost line (a record without a cost is
  invalid).

## Rule
The design system exists to make the verifiable visible. If a component makes the
protocol look like a way to make money, it is wrong and must be redrawn — the same test
the whitepaper applies to every lesson.
