# Repo hygiene — secret scan (both repositories)

**Auditor:** Tubarão-branco (Predators Protocol · Hunter, Lei do Sangue).
**Date:** 2026-07-20. **Scope:** working tree **and full Git history** of the
public repo (`Triviu-Protocol/Triviu-Protocol`) and the private vault
(`Triviu-Protocol/triviu-adm`). **Verdict: clean — no secret found; no history
rewrite required.**

## Why this exists

The repo is public and strangers audit it line by line. Before that is safe, the
history — every commit, not just `HEAD` — must be free of committed secrets,
with specific attention to the Telegram bot token, private keys and `.env` files.

## Method

`gitleaks` and `trufflehog` are not installed in this environment. An equivalent
scan was run by hand with Git's pickaxe over **all refs** (`--all`), so this is a
manual equivalent, stated plainly — not a claim that those tools ran.

| Check | Command (per repo) | Result |
|---|---|---|
| Telegram token (exact id) | `git log --all -S '<telegram-bot-id>' --oneline` | 0 commits |
| Telegram token (shape) | `git log --all -G '[0-9]{8,10}:AA[A-Za-z0-9_-]{20,}'` | 0 commits |
| PEM private keys | `git log --all -G 'BEGIN [A-Z ]*PRIVATE KEY'` | 0 commits |
| AWS access keys | `git log --all -G 'AKIA[0-9A-Z]{16}'` | 0 commits |
| `.env` ever tracked | `git log --all -- '**/.env' '.env'` + `git ls-files` | none, ever |

All five checks returned empty on **both** repositories.

## Findings

- **No secret is present in the tree or the history of either repo.** No
  `git-filter-repo`, no force-push, no rewrite is needed.
- **The Telegram token was never committed.** It lives only in
  `triviu-internal/social/telegram-bot/.env`, which is gitignored and confirmed
  never tracked.
- **`LICENSE`** is the full, verbatim AGPL-3.0 (661 lines; the AGPL-specific §13
  "Remote Network Interaction" and the "How to Apply" appendix are present) —
  not a stub.
- **`SECURITY.md`** no longer names a mailbox that does not exist: disclosure is
  routed to GitHub private vulnerability reporting (live now), with
  `security@<domain>` activating from the domain config once the domain is live.

## Standing recommendation (does not change the clean verdict)

The Telegram bot token was **exposed in a chat message** earlier (outside any
repo). Repository history is clean, but under the rule *exposed = compromised*,
the token should still be **revoked and regenerated** via `@BotFather`
(`/revoke`), and only the new value placed in the gitignored `.env`. This is a
credential-rotation action for the founder, not a repo remediation.

## Re-verification

The clean state is reproducible: re-run the five commands above on either repo
and each returns empty. Don't trust this report — run them.
