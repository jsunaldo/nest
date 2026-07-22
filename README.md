# Nest 🪺 — Household Finances

A private, two-person expense tracker PWA. Import bank/card statements, auto-categorize
with rules, review the stragglers card-by-card, and watch spending against your
"natural budget" baseline. Local-first with end-to-end-encrypted sync between devices.

**Live:** https://jsunaldo.github.io/nest · **Sync worker:** `nest-sync` (Cloudflare)

## Two ledgers

The header chip switches between **🏠 Shared** (the household ledger you both sync)
and **🔒 Personal** (a fully separate ledger with its own storage and its own sync
passphrase — the shared room never sees it). Each ledger has its own accounts,
transactions, categories, budgets and backups. Each ledger derives its sync room
with a ledger-specific key derivation, so even the same passphrase can never land
the two ledgers in one room (the app also refuses reusing the other ledger's
passphrase outright, as a courtesy). Backups are per-ledger and workspace-stamped —
importing one into the wrong ledger is refused. Note: switching is one tap with no
lock — "personal" means *separate*, not *hidden from someone holding your unlocked
phone*.

## Privacy model

- This repo holds **code only**. Financial data never touches GitHub.
- Data lives in each device's local storage.
- Sync (optional) pushes an **AES-256-GCM encrypted blob** to a Cloudflare Worker.
  The encryption key is derived (PBKDF2-SHA256, 600k iterations for new rooms) from
  your passphrase and never leaves your devices — the server never sees plaintext or
  the passphrase. Alongside the ciphertext it does store a small amount of metadata:
  an entity **count**, a **version counter**, per-write timestamps, and a rolling ring
  of up to **10 encrypted backup snapshots** (wipe protection). All of it is useless
  without the passphrase.
- The room is claimed by the first writer's derived token; other passphrases get
  locked out. **There is no passphrase reset** — a lost passphrase means starting a
  new sync room (your local data is untouched).
- **Erasing the server copy:** More → Sync → *Disconnect & erase server copy* deletes
  the blob **and** every backup from the server (auth-gated by your passphrase). Use it
  if a passphrase may be exposed, then re-enable with a new one — that's the rotation
  path. A plain *Disconnect* leaves the encrypted copy on the server so your other
  phone keeps working.

## Getting started (both phones)

1. Open the live URL → Share → **Add to Home Screen** (installs the PWA).
2. One of you: **More → Sync** → pick a shared passphrase (4+ random words).
3. The other: same screen, **same passphrase** — the ledger appears.

## The loop

1. **Import** — download CSV from your bank/card site, drop it on More → Import.
   Chase, Amex, Capital One, Citi, Discover, BofA and Apple Card are auto-detected;
   anything else gets a column picker. Re-importing overlapping statements is safe —
   duplicates are skipped.
2. **Review** — anything without a rule lands in the Review tab. Pick a category
   once per merchant ("Always" is pre-checked → creates a rule); split mixed charges
   (looking at you, Amazon) across categories to the penny.
3. **Read the dashboard** — month spend vs budget, category progress bars,
   uncategorized banner, recurring subscriptions, trends vs your baseline.

### PDF-only statements

Ask Claude: *"Convert these statements to CSV with date, description, amount
columns"* — then import the CSV normally.

### Bulk triage with Claude

More → **Claude bulk triage** → Copy digest → paste into any Claude chat → paste the
rules JSON it returns back into the app. Clears a months-deep backlog in one pass.

## The "natural budget" baseline

More → **Budgets & Baseline** → set the window of pre-move months that reflect
normal life. Baseline = your median month per category over that window (the
**House Setup** group — furniture, renovation, moving — is excluded, so one-time
new-house spending never pollutes it). Blank budgets fall back to baseline
automatically; enter dollars to override.

## Money rules (engine invariants)

- All amounts are **integer cents**, signed (negative = money out). No float math.
- Transfers & CC payments are excluded from spend/income so paying a card never
  double-counts.
- Refunds reduce their category's spend.
- Splits must sum to the transaction total, to the penny, or Save stays disabled.
- Deleting a transaction leaves a tombstone: re-importing the same statement will
  not resurrect it.

## Backup

More → **Backup** exports a plain-JSON snapshot (keep it somewhere private).
Import supports merge (newest edit wins) or full replace.

## Development

Single-file app: `index.html` (engines + views), `sw.js` (offline cache),
`manifest.json`. Deploy = push to `main` (GitHub Pages). Sync backend:
`../nest-sync/worker.js`, deployed with `npx wrangler deploy`. View-layer contract
in `SPEC.md`. When editing `sw.js`-cached assets, bump `CACHE_NAME`.
