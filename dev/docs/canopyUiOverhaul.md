# Canopy UI overhaul — compose view
## What's actually wrong (diagnosis)
1. **Right rail overflows the page.** `.refine-panel` (272px) stacks 4 groups ≈ 970px of content:
   6 sliders that each burn 63px (label row + track + two micro-labels + 18px margin) and 5
   `.select-label` blocks that each burn 68px (stacked label + 34px control + 18px margin). Add the
   213px of stacked chrome (`app-header` 68 + `transport-bar` 86 + `context-ribbon` 59) and the page
   is ~1190px tall on a ~980px viewport. The panel also has `overflow: hidden`, so the page itself
   scrolls — the worst of both worlds.
2. **No contrast ramp — everything is one green.** Surfaces sit within 6 RGB points of each other
   (`#0d1411`, `#101713`, `#111914`, `#141d18`, `#151e19`), so panel boundaries read as noise, and
   the muted text tokens fail WCAG AA *badly* at the exact sizes where it matters most (8–10px):
   `#5f6c64` = 3.25:1, `#59665e` = 2.97:1, `#4f5c54` = 2.55:1, `#69766d` = 3.76:1, `#56635b` = 2.84:1.
   Saturated green is used for both *surfaces* and *accent*, so the accent has nothing to pop against.
   Five different things use serif (brand, project name, panel headings, roll title, note labels),
   so "heading" carries no meaning.
3. **Vacant space is structural, not stylistic.** Four stacked full-width bars each hold content only
   on the left (`transport-bar` ends in a decorative waveform, `context-ribbon` right side is
   near-empty, both `panel-heading`s and the 100px `sequence-heading` are half-empty), while the
   center column has ~400px of dead ground under the roll because `.piano-roll` uses fixed
   `grid-auto-rows: 42px` inside a `min-height: 667px` grid. Meanwhile 1900px of width is unused:
   `composer-grid` is `242px | 1fr | 272px`, so song-level controls are crushed into a 272px straw.
## Design direction
Keep the identity (deep forest ground, lime accent, amber notes) but make it *legible*: near-neutral
surfaces with a real elevation ramp, saturated colour reserved for meaning only. Trade vertical
stacking for horizontal spread — at 1900px the app should fit the viewport with **no page scroll**.
Target: 1900 × ~980 CSS px. Vertical budget: header 56 + deck 84 + workspace (flex, ≈720) + song bar 120.
### New shape of the compose view
```
┌ header 56 ────────── brand │ tabs │ save · import · export ─────────────────┐
├ deck 84 ──── name │ ▶ ‖ ■ bar/beat │ tempo key scale ║ [ live state: explore·unease·combat │ threat │ victory ] ┤
├ workspace (flex) ───────────────────────────────────────────────────────────┤
│ rail 320                    │ phrase editor (fills remaining width+height)  │
│  Layers (scrolls)           │  toolbar 52                                   │
│  ─────────────              │  piano roll — lanes stretch to fill height    │
│  Selected layer (pinned)    │  legend 36                                    │
├ song bar 120 ─ CHORD PATH ║ LONG FORM ║ ATMOSPHERE (3 cols, full width) ────┤
```
Moves that fix the three complaints at once:
- **Merge** `transport-bar` + `context-ribbon` into one `deck` row; the live-simulation cluster
  (context switcher, status line, threat, victory) becomes an inset panel pushed to the right edge,
  so the deck's empty middle becomes a deliberate authoring / live-state split. Saves ~60px and
  removes two half-empty bars. Drop the decorative `transport-wave` (18 fake bars of filler).
- **Move song-level controls out of the right rail** into a full-width bottom song bar: `CHORD PATH`,
  `LONG FORM`, `SHARED ATMOSPHERE`. This is where the 1900px of width earns its keep, and it removes
  ~530px from the rail — overflow gone by construction, not by cropping.
- **Fold the per-layer inspector into the left rail** under the layer list (list scrolls, inspector
  pinned below). One rail at 320px with ~590px of content beats two half-empty 270px rails, and the
  phrase editor gets ~1560px.
- **Piano roll fills its column**: `grid-template-rows: 30px repeat(var(--lanes), minmax(40px,1fr)) 46px`
  with `height: min(100%, calc(76px + var(--lanes) * 88px))` so lanes stretch to the available height
  but never balloon (percussion's single lane stays 88px, not 600px). Active notes become bars
  centred in the lane instead of full-height blocks.
- **Compact controls**: slider = one 38px row (`label … value` over an inline track, min/max words
  moved to `title`); select = 30px `label │ control` two-column row instead of a 68px stack.
### Token palette (contrast-checked against the panel surface)
| token | value | note |
|---|---|---|
| `--surface-0` | `#0a0d0c` | app ground, grid gutters |
| `--surface-1` | `#101512` | rails, header, song bar |
| `--surface-2` | `#151b18` | phrase editor panel |
| `--surface-3` | `#1c2420` | inputs, cells, raised |
| `--surface-4` | `#243029` | hover |
| `--line` / `--line-strong` | `#26302b` / `#33403a` | grid lines / panel edges |
| `--text-1` … `--text-4` | `#edf1ea` 16:1 · `#c3cec4` 11:1 · `#a3b0a7` 8:1 · `#8d9a92` 6.3:1 | AA-passing label floor is `--text-4` |
| `--accent` / `--accent-ink` | `#cde596` 13:1 / `#101508` | interactive + active only |
| `--note` | `#e6cb84` | written notes (unchanged in spirit) |
| `--ctx-explore` / `--ctx-unease` / `--ctx-combat` | `#a3d38d` / `#e8c877` / `#e8967c` | already the runtime-view hues; now used in the switcher, status dot and threat-slider fill so "which state am I in" is readable at a glance |
Typography: sans everywhere except brand + project name (identity) — 11px/600 for control labels,
10px `.06em` uppercase for section kickers, 12px for values, `Courier New` only for numerics
(bpm, bar/beat, chord names, percentages). No 8px text anywhere.
## Implementation steps
1. **`src/styles/tokens.css` (new)** — the table above as custom properties, plus radius/space/shadow
   and typography scale vars. Link it first in `index.template.html`.
2. **`src/partials/compose-view.inc.html`** — restructure markup, preserving *every* existing `id`
   (JS wiring in `transport-bar.js`, `context-ribbon.js`, `layers-panel.js`, `refine-panel.js`,
   `sequence-panel.js` keeps working untouched):
   - one `<section class="deck">` with `.deck-score` (identity, transport, tempo/key/scale) and
     `.deck-live` (switcher, `#context-status`, threat, `#victory-button`); delete `#transport-wave`.
   - `.workspace` grid: `<aside class="rail">` = layer list + `.inspector` (heading with
     `#refine-track-name` + `#selected-dot`, the 3 layer sliders, `#rest-window-select`, harmony-guard
     note, `#reset-project`); `<section class="editor">` = compact toolbar + roll + legend.
   - `<section class="song-bar">` with three `.song-group`s holding `#progression-select` +
     `#roman-progression`, `#journey-shape-select` + `#journey-length-select` + `#slider-depth` +
     `#variation-seed-input`, and `#slider-reverb` + `#slider-swing`.
3. **`src/styles/layout.css`** — full-height flex shell (`.app-shell { height:100vh; display:flex; flex-direction:column }`,
   `.main-view { flex:1; min-height:0 }`), header at 56px, retokenised brand/tabs/actions/export menu/toast.
4. **`src/styles/compose.css`** — new `.deck` (84px, one row, inset `.deck-live`), `.workspace`
   (`grid-template-columns: 320px minmax(0,1fr)`, `min-height:0`, children `overflow:hidden`), and the
   `.song-bar` (120px, 3 columns with dividers, `1fr 1.35fr 1fr`). Delete `.transport-wave` +
   `@keyframes waveform`.
5. **`src/styles/side-panels.css`** — rail: 52px section headers (uppercase sans, not serif), layer
   rows at 62px with legible 11px selects and a colour chip, `.layer-list { overflow-y:auto }`,
   `.inspector { flex:none }`; compact `.parameter-slider` (38px) and `.field-row` (30px label/control
   pair) shared with the song bar.
6. **`src/styles/piano-roll.css`** — editor toolbar (52px, kicker + 15px sans title + right-aligned
   tools), `--lanes`-driven `grid-template-rows`, stronger 4-step grouping (bar/beat separators at
   steps 0/4/8/12 via `--line-strong`), centred note bars, current-step column highlight that reads
   at a glance, 36px legend row.
7. **`src/ui/sequence-panel.js`** — set `roll.style.setProperty("--lanes", lanes.length)` in `render()`
   (1 for beat layers) and drop the now-unused subtitle sentence duplication into the toolbar hint.
   `src/ui/transport-bar.js` — remove the `#transport-wave` generator block.
8. **`src/styles/content.css`** — colour/contrast pass only (tokens, text ramp, 8px → 10px minimums);
   no layout redesign of the runtime tab.
9. **`src/styles/responsive.css`** — rewrite for two breakpoints that matter (`max-width: 1500px`:
   rail 280, song bar wraps to 2 cols; `max-width: 1100px`: single column, rails stack, page scroll
   allowed). Remove rules referencing deleted classes.
10. **Verify**: `python3 dev/scripts/build.py`, `npm test`, `python3 dev/scripts/check_imports.py`
    (all must exit 0), plus a grep audit that every `id` referenced from `src/ui/*.js` and `main.js`
    still exists in the generated `index.html`.
11. **`AGENTS.md`** — update the `src/ui`/`src/styles` notes to mention `tokens.css` and the new
    region names (deck / rail / inspector / song bar), since AGENTS.md documents the style layout.
## Honest caveat
There is no browser or headless Chrome on this machine (`chromium`, `firefox`, playwright, puppeteer
all absent), so I can verify structure, wiring and the test suite but **cannot see the result**. I'll
reason the layout math out (heights above) and you should eyeball it at 1900px; expect one round of
"nudge this" feedback, which is normal for visual work.
