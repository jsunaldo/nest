# Nest — View Implementation Spec

Contract for implementing the view layer of `index.html`. The engines (store, CSV,
rules, analytics, crypto, sync) are DONE and must not be modified. You implement
ONLY the functions in the `VIEWS` section (currently stubs) plus small additions
described here. Everything stays in the single `index.html` — no external libraries,
no network calls except what the sync engine already does.

## Hard conventions

- **Money is integer cents, signed: negative = money out.** Display with `fmt$(cents)`.
  Never do float math on amounts; sum cents, then format.
- **Every user-derived string rendered into HTML goes through `esc()`.** No exceptions
  (merchant names contain `&`, `'`, `<` in the wild).
- **All mutations go through `put(map, ent)` / `softDelete(map, id)`** — never assign
  into `DATA` directly (sync depends on `updatedAt`). After mutating, call
  `renderCurrent()` (and `toast(...)` for feedback).
- Render functions rebuild their container idempotently: build an HTML string, set
  `container.innerHTML`, then bind handlers with `querySelector(...).onclick = ...`.
  **No inline `onclick="..."` attributes with dynamic data** (escaping hazards).
  Use `data-id` attributes + programmatic binding or delegation.
- Keep the existing CSS design system (`.card`, `.btn`, `.list-item`, `.chip`,
  `.stat`, `.progress`, `.cat-grid`, `.seg`, modal/toast helpers). Add new CSS only
  if a spec section says so, in a clearly marked block appended to the `<style>`.
- Phone-first: everything must work at 375px wide; no horizontal page scroll
  (wide tables/charts scroll inside `.tbl-wrap`/`.chart-wrap`).

## Engine API you build on (all already implemented)

```
fmt$(cents,{signed}) fmtMonth(ym) fmtDate(iso) currentYM() shiftYM(ym,±n) ymRange(a,b)
UI.month                        // globally selected month for Home
liveTxns() liveCats() reviewTxns() catKind(id) catLabel(id)->{icon,name} groupOf(catId)
GROUPS                          // ordered groups: {id,name,kind?,excludeFromBaseline?}
buildMonthAgg() -> {ym:{spend:{catId:cents}, spendTotal, incomeTotal}}
baselineByCat(agg?) -> null | {months, total, cats:{catId:medianCents}}
budgetFor(catId, baseline) -> null | {amt, source:'set'|'baseline'}
detectRecurring() -> [{merchant,period,amt,monthly,count,last,cat}] sorted by monthly desc
suggestCats(merchant) -> [catId] best-first
matchRule(m) createRule(pattern,cat,type?) reapplyRules()->n  liveRules()
analyzeCSV(text,filename) -> {filename,headers,dataRows,hasHeader,preset,mapping}|{error}
applyMapping(dataRows,mapping) -> {parsed:[{date,desc,amt}], skipped}
importParsed(acctId,parsed,label) -> {batchId,added,dupes,review,from,to}
exportReviewDigest()->string  importRulesJSON(text)->{created,bad,resolved}|{error}
exportBackup() importBackup(text,'merge'|'replace')
enableSync(pass) disableSync() syncPull() syncPush() SYNC.status CRYPTO
settings() saveSettings(patch)   // {baselineFrom,baselineTo} as 'YYYY-MM'
modal(title,html)->{node,close} confirmDlg(msg,okLabel?)->Promise<bool> toast(msg)
openScreen(title,renderFn) popScreen() MORE_STACK showTab(name) renderCurrent()
uid() esc() el()
```

Txn shape: `{id, acct, date:'YYYY-MM-DD', amt, mraw, m, cat|null,
splits:null|[{cat,amt,note?}], status:'ok'|'review'|'excluded', note, tags[], fp, batch}`
Account: `{id, name, type:'checking'|'savings'|'credit', archived?}`.

## Chart rules (dataviz — non-negotiable)

Add these CSS tokens to `:root`:
`--viz-1:#3987e5; --viz-2:#199e70; --viz-3:#c98500; --viz-4:#008300; --viz-5:#9085e9;
--viz-6:#e66767; --status-good:#0ca30c; --status-warn:#fab219; --status-crit:#d03b3b;`

- Charts are inline SVG strings, `viewBox` sized to container, inside `.chart-wrap`.
- Series colors: assign `--viz-1..6` **in fixed order by entity, never by rank**;
  a filter/re-render must not repaint a surviving series. Max 4 series per chart;
  fold the rest into "Other" (use `--dim` gray for Other).
- One y-axis only. Never two scales on one plot.
- Bars: 4px rounded top corners (path or rx on a clipped rect), anchored to the
  baseline, ≥2px gap between adjacent bars. Lines: 2px stroke, no dots except an
  8px marker on the selected/last point.
- Grid: at most 3 horizontal hairlines, `stroke=var(--line)`. Axis text 10–11px
  `fill=var(--faint)`. **All text uses ink tokens (`--text`/`--dim`/`--faint`),
  never a series color.**
- Legend (`.legend`) whenever ≥2 series; single series charts get no legend.
  Direct-label the last point of each line series (small text next to the line end).
- Interaction on touch: every bar/point column is a transparent ≥24px-wide hit
  `<rect>`; tapping selects that month and updates a caption row under the chart
  showing exact values (`fmt$`). Default selection = latest month. No hover-only UI.
- Budget progress bars use the existing `.progress` component with status colors:
  <85% `--status-good`, 85–105% `--status-warn`, >105% `--status-crit`
  (update the `.progress i` CSS colors to these tokens).
- Number-on-every-point is forbidden; label selectively (last point, selected month).

## Shared components to build once

1. **`openCatPicker(opts) -> Promise<catId|null>`** — modal with `.cat-grid`.
   Top section "Suggested" = first 6 of `suggestCats(merchant)` (when a merchant is
   given); then all live cats grouped by `GROUPS` order with `.group-label` headers,
   skipping the System group **unless** `opts.showSystem`. Each button: icon + name.
   Resolves on pick; null on dismiss.
2. **`openTxnEditor(txnId)`** — modal for one txn: header (merchant `t.m`, `tiny`
   raw `t.mraw`, date, account name, `fmt$(t.amt)` big). Actions:
   - Category row (current `catLabel`) → tap = `openCatPicker` → set `t.cat`,
     `t.status='ok'`, clear splits if user confirms (`confirmDlg`) when splits exist.
     Checkbox "Always categorize ‘<m>’ like this" (UNchecked here) → `createRule(t.m, cat)`
     + `reapplyRules()` → toast "N more auto-categorized" if n>0.
   - "Split…" → `openSplitEditor(t)`.
   - Note input (saves on change), Date input (type=date), Account select.
   - Buttons: "Mark transfer" (cat='sys-transfer', status='ok'),
     "Exclude" / "Include" toggle (status excluded↔ok),
     "Delete" (confirmDlg → `softDelete('txns', id)`).
3. **`openSplitEditor(t)`** — modal listing split parts (start from existing splits
   or 2 empty rows). Each row: category button (`openCatPicker`) + dollar input
   (positive dollars; sign inherited from `t.amt`) + remove ×. "Add part" button.
   Footer shows running remainder `fmt$`; **Save disabled until parts sum exactly
   to `|t.amt|`** (a "put remainder here" tap on a row helps). Save: `t.splits =
   [{cat, amt: sign*cents}...]`, `t.status='ok'`, `t.cat=null`, `put`, toast.
4. **`accountName(id)`** helper → `DATA.accounts[id]?.name || 'Unknown'`.
5. **`runImportFlow(files)`** — see §Import.

## §Home (`renderHome`)

Top to bottom:
1. `.month-nav`: ‹ `fmtMonth(UI.month)` › (arrows shift `UI.month`, re-render; › capped at current month).
2. **Stat row** (`.stat-grid`): "Spent" = `agg[UI.month].spendTotal`; "Budget left" =
   totalBudget − spent (only when a budget/baseline exists; red text when negative,
   subtitle "of `fmt$(totalBudget)`"). totalBudget = Σ `budgetFor(cat, baseline).amt`
   over live expense cats that have one, PLUS spend in cats without budgets is still
   real: subtitle under "Spent" shows "Income `fmt$(incomeTotal)`".
3. **Review banner** (only if `reviewTxns().length`): `.card` accent-bordered:
   "🧾 N transactions need review — `fmt$(sum)` unsorted" → tap = `showTab('review')`.
4. **Budgets card**: for each cat with (spend this month > 0 or a budget), sorted by
   spend desc, max 10 rows + "All budgets →" (opens Budgets screen): icon+name,
   `.progress` bar (pct vs budget; full gray-dim track if no budget), right-aligned
   "spent / budget". Uncategorized pseudo-row (`catLabel('__uncat')`) when
   `agg.spend.__uncat` > 0 → tap goes to Review.
   If `groupOf` = House Setup group has spend this month, show a separate one-line
   callout: "🏠 House setup this month: `fmt$` (kept out of your baseline)".
5. **Recent activity card**: last 6 live non-excluded txns by date desc
   (`.list-item`: icon=cat icon, t1=m, t2=`fmtDate` · account name, amt right,
   income green `.amt-pos`) → tap = `openTxnEditor`. Footer link "All activity →"
   = `showTab('activity')`.
6. **Import button**: `.btn btn-primary btn-block` "📥 Import statements" →
   `openScreen('Import', renderImportScreen)`.
If there are zero txns at all: replace 2–5 with a friendly onboarding card
(3 steps: add passphrase later, import CSVs now, review) + the Import button.

## §Review (`renderReview`)

Queue = `reviewTxns()` (already newest-first). If empty: `.empty` "🎉 All caught up".
Show ONE card at a time (top of queue) + "N left" counter chip:
- Big: `fmt$(t.amt)`, merchant `t.m`, `.tiny` raw `t.mraw`, `fmtDate` · `accountName`.
- **Suggested grid**: first 4 of `suggestCats(t.m)` as `.cat-btn`s + "More…" (full
  `openCatPicker`). Picking a cat: checkbox above ("Always: ‘<m>’ → this category",
  CHECKED by default) decides `createRule(t.m, cat)`; then `t.cat=cat`,
  `t.status='ok'`, `put`, `reapplyRules()` (toast "+N auto-sorted" when >0),
  re-render (next card appears).
- Secondary row: "Split…" (`openSplitEditor` — saving resolves the txn),
  "Transfer" (sys-transfer + ok), "Exclude", "Skip" (moves txn to queue end:
  keep an in-memory `REVIEW_SKIPPED` Set of ids, filtered to end of queue;
  cleared when tab re-entered).
- Under the card: `.muted` line "Tip: answer once per merchant — rules do the rest."
  and a small "Bulk triage with Claude →" link → opens §Claude screen.

## §Activity (`renderActivity`)

1. Sticky-ish controls row: search input (matches `m`+`mraw`+note, case-insensitive,
   debounced 200ms), then chips row: account filter (cycles All → each account),
   category filter (opens `openCatPicker` w/ showSystem + "All" reset), month filter
   (‹ month › or "All"). Defaults: All / All / All.
2. **Select mode**: "Select" chip toggles; then each row tap toggles selection
   (checkmark), bottom action bar appears: "Categorize N" (`openCatPicker` → set all,
   optional rule checkbox per unique merchant? NO — just set cats, status ok),
   "Exclude N", "Delete N" (confirm). Exit select mode after action.
3. List grouped by month (`.group-label` headers with month total spend on the
   right), each txn a `.list-item` as in Home. Excluded txns at 45% opacity with
   "excluded" tiny tag; review txns show a red dot before the name.
   Render max 200 rows; "Show more" button extends by 200.
4. Tap row (not in select mode) → `openTxnEditor`.

## §Trends (`renderTrends`)

Data: `agg = buildMonthAgg()`, months = last 12 `ym`s that exist in agg (ordered).
`baseline = baselineByCat(agg)`.
1. **Card "Spending vs income"**: grouped bar chart, 2 series
   (Spending = `--viz-1`, Income = `--viz-2`), per month; legend; tap column →
   caption "Jul 2026 — Spent $X · Income $Y · Net ±$Z". If baseline exists, draw a
   dashed hairline at `baseline.total` labeled "baseline" (`--faint` text).
2. **Card "Where it goes"**: top 4 expense cats by 12-month spend as 2px line
   series (fixed slot order by that ranking, computed ONCE per render), others
   folded into gray "Other" line. Direct-label line ends with cat name. Tap column
   → caption listing the 5 values for that month.
3. **Card "vs your baseline"** (only when baseline): table (`.tbl-wrap`) — rows =
   cats with baseline or spend in `UI-selected trends month` (default latest);
   cols: Category | This month | Baseline | Δ (Δ colored `--status-good` when under,
   `--status-crit` when >105%). Month selectable via the tap-selection from card 1/2
   (share one selected-month state variable). Footer totals row.
4. **Card "Recurring"** teaser: top 3 of `detectRecurring()` with monthly cost +
   "All recurring →" → `openScreen('Recurring', renderRecurringScreen)`.

## §More (`renderMore`)

If `MORE_STACK.length`: render `.screen-head` (back `.back-btn` ‹ → `popScreen()`,
`h2` = top.title) then create a body div and call `top.render(bodyDiv)`.
Else the root menu — `.card` with `.list-item`s (icon, name, chevron):
📥 Import statements · 🎯 Budgets & Baseline · 🔁 Recurring · 🏷️ Categories & Rules ·
🏦 Accounts · 🤖 Claude bulk triage · ☁️ Sync (subtitle: current `SYNC.status`) ·
💾 Backup · then `.tiny` footer "Nest v1 — local-first, E2E-encrypted sync".
Each opens `openScreen(title, renderXScreen)` (all render functions below receive
the body container element).

### Import screen (`renderImportScreen(c)`)
1. `.drop` zone ("Drop bank CSV files here, or tap to choose") wired to
   `#file-input` (click → `.click()`; change + drop → `runImportFlow(files)`;
   dragover toggles `.over`).
2. `.muted` note: "PDF statements? Ask Claude to convert them to CSV first —
   see README."
3. `runImportFlow(files)`: for each file sequentially: `text = await file.text()`,
   `a = analyzeCSV(text, file.name)`; if `a.error` toast+continue. Modal per file:
   - Title = filename. Account select (live accounts + "＋ New account…" → inline
     name+type inputs). Remember last-used account in a session variable; if a
     previous import used this exact header signature, preselect that account
     (store `sigKey = headers.join('|')` → acctId map in `DATA.kv` entity
     `{id:'importPrefs', sigs:{}}`).
   - Preset chip: detected `a.preset.label` or "Custom mapping". When custom (or
     user taps the chip): selects for Date / Description / Amount (or Debit+Credit
     toggle) columns from `a.headers`.
   - **Sanity preview**: table of first 5 of `applyMapping(...).parsed`
     (date | desc | `fmt$(amt)`) + line "X rows · Y look like money OUT, Z money IN"
     + a "Purchases show as money in? Flip signs" checkbox (`mapping.flip=!flip`,
     re-preview live).
   - Import button: `applyMapping` full → `importParsed(acctId, parsed, filename)`
     → save `sigKey` pref → result card in modal: "Added N · skipped D duplicates ·
     P parse-skips · R need review [Review now →]". Then next file.
4. After flow: `renderCurrent()`.

### Budgets & Baseline screen (`renderBudgetsScreen(c)`)
1. **Baseline card**: two `input[type=month]`s (From / To) bound to `settings()`,
   `saveSettings` on change; explainer `.muted`: "Your natural budget = typical
   month across this window (House Setup excluded)." Show computed
   `baseline.total` + months counted when available.
2. **Budgets card**: expense cats grouped by GROUPS order; each row: icon+name,
   baseline `fmt$` (`.tiny`, "—" if none), dollar input (value = explicit budget
   in dollars or placeholder = baseline dollars). On change: number>0 →
   `put('budgets',{id:catId, amt:cents})`; empty → `softDelete('budgets',catId)`.
   Footer: totals (explicit+baseline mix via `budgetFor`).

### Recurring screen (`renderRecurringScreen(c)`)
`detectRecurring()` list: `.list-item` icon=cat icon, t1=merchant, t2="period ·
last `fmtDate(last)` · seen count×", right = `fmt$(monthly)`+"/mo". Header stat:
"Σ `fmt$(total monthly)` per month in recurring charges". Empty state text.

### Categories & Rules screen (`renderCatsScreen(c)`)
1. Cats card: grouped; each row name+icon, tap → modal: rename input, icon input
   (1 emoji), archive button (`softDelete('cats',id)` after confirm — warn it
   hides, txns keep the id). "＋ Add category" per group → modal (name, icon).
   New cat id = `uid()`, kind from group (`g-inc`→income, `g-sys` blocked).
2. Rules card: `liveRules()` sorted by pattern; row: `code` pattern → cat name,
   type tag, delete ×. "＋ Add rule" → modal (pattern text, type seg exact/contains,
   category via `openCatPicker(showSystem)`) → `createRule` + `reapplyRules` toast.

### Accounts screen (`renderAccountsScreen(c)`)
List + add form (name, type select checking/savings/credit). Row tap → modal:
rename, type, archive (confirm; archived hidden from pickers, txns retained).
Show per-account live txn count `.tiny`.

### Claude triage screen (`renderClaudeScreen(c)`)
1. Step 1 card: "Copy the review digest, paste it to Claude." Button "📋 Copy
   digest" → `navigator.clipboard.writeText(exportReviewDigest())` → toast.
   Show `.tiny` count of distinct merchants in queue.
2. Step 2 card: textarea "Paste Claude's rules JSON here" + Apply button →
   `importRulesJSON(text)` → toast "Rules: N added · resolved R txns" or error;
   `renderCurrent()`.

### Sync screen (`renderSyncScreen(c)`)
- Status card: `SYNC.status` + explainer: "End-to-end encrypted. The passphrase
  never leaves your devices; the server stores only ciphertext. Use the same
  passphrase on both phones."
- If no `CRYPTO`: passphrase input (type=password, `autocomplete=off`) + confirm
  input + "Enable sync" btn (min 8 chars, must match; suggest a 4-word phrase in
  `.muted`). Calls `enableSync(pass)` (async — disable btn while running) →
  toast + rerender.
- If `CRYPTO`: room fingerprint (`CRYPTO.roomId.slice(0,8)` as `.tiny` code),
  "Sync now" btn (`syncPush()` then rerender), "Disconnect" (confirmDlg — local
  data stays) → `disableSync()`.

### Backup screen (`renderBackupScreen(c)`)
"⬇️ Export backup file" → `exportBackup()`. Import: file input (.json) → read text →
seg choice Merge / Replace (Replace behind `confirmDlg`) → `importBackup` →
toast + `renderCurrent()`.

## Acceptance checklist (verify before finishing)

- App boots with zero data: Home onboarding renders, no console errors.
- Every stubbed render function replaced; no `TODO` strings remain.
- All taps work without a keyboard; modals close on backdrop tap.
- `esc()` used on every merchant/note/account/category name render.
- No engine function bodies were edited; no new globals collide with engine names.
- Charts follow every rule in "Chart rules" (fixed slot order, one axis, gaps,
  ink-token text, tap captions, legend for 2+ series).
