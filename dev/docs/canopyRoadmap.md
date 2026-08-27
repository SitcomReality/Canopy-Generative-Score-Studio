# Canopy — Improvement Roadmap

Living plan for the next round of Canopy work. The "Locked decisions" section is
the agreed direction; the phases below are the implementation order. Keep this
document in sync with the code — it exists so we don't lose intent across the
ad-hoc feature additions.

## Locked design decisions

1. **Three-bank framing** — song-bar groups become clearly-labeled **SCORE /
   LIVE / ROOM** banks so a user always knows whether a control edits the fixed
   score, modulates the live performance, or shapes the room/mix.
2. **Split kind vs role** — decouple the *editor kind* (piano roll vs beat, i.e.
   degrees vs steps) from the *function* of a layer (harmony / motif / bass /
   rhythm). A role no longer hard-constrains the editing surface.
3. **Per-step percussion kit** — the percussion layer assigns kit pieces
   (kick / hat / snare / tom …) per step; fills & rolls reference the same kit
   so flairs don't sound like unrelated glitches.
4. **Instruments as data** — a project-owned, schema-versioned, round-tripped
   `instruments` map; built-in presets become just seeds songs start from.
5. **Compact Structure strip** — verses render as a chip row + toggled popover
   editor, so the song bar returns to a short fixed height (and stops clipping
   the piano roll).
6. **Loop-position seek** — the seek bar scrubs within the 2-bar loop
   (bar:step, 0..16) rather than the whole journey.
7. **Role-derived colors** — layer colors derive deterministically from the
   layer's function (one palette per function) instead of being authored
   per-layer; keep the persisted `color` field only for migration.

## The three-bank mental model

The biggest source of overwhelm is that three genuinely different kinds of
setting share a flat song bar with no visual distinction. Separate them
everywhere:

- **COMPOSE (SCORE)** — the fixed song. Steps/notes (piano roll), chord path,
  key/scale, bpm, journey/long-form, verses/structure, flourishes, variation
  seed. Edits bake into the score.
- **PERFORM (LIVE)** — the reactive layer. Axes, context targets, activity
  gates, fills, automation, bindings. Modulates a fixed score while playing;
  not written into the notes.
- **MIX / ROOM** — the space. Reverb, swing, per-layer level & send. The room,
  not the notes.

## Phase 1 — Layout & information design

1a. **Song-bar height / piano roll clip** — restore the song bar to a short,
fixed height and return the saved vertical space to the workspace. Wire the
Compact Structure strip (chip row) in place of the tall verse editor; the full
editor lives in a toggled popover. Safety net: allow `.roll-scroll` vertical
overflow with a sticky note-label so the roll never silently clips.

1b. **Three-bank SCORE / LIVE / ROOM** — re-tag the song-bar groups with a
colored badge + label (`compose-view.inc.html`); `compose.css` divider + badge
styling and the shorter bar.

1c. **Role-derived colors** — derive display color from function
(`layers-panel.js` / `default-project.js`); keep the schema field for
migration.

## Phase 2 — Sound quality (kill the drowning organ) — DONE

2a. Give pitched voices a **dry path** — the motif no longer routes through
`delay → reverb`; it lands on the glue and carries the room only as a parallel
tail (`master-chain.js`, mirrored in `runtime-module/parts/transport-api.js`).

2b. Retune the most organ-like **harmony** envelopes (`instruments.js`) so the
bed decays instead of holding an endless chord, and cut its reverb send via the
`space.bed` default.

2c. Add a song-level **`space`** config `{ lead, bed, bass, echo }` (schema-backed,
defaulted, round-trips) and expose it in the ROOM bank as compact sliders: Room
(reverb size), Lead / Bed / Bass (each role's parallel reverb send), Echo (lead
trailing delay) and Sway (rhythm). Note: we used **song-level per-role sends**
rather than per-layer for the first pass — cleaner, and matches "per-role sends
as understandable controls".

## Phase 3 — Instruments as data + kinds/roles split

3a. Add the project-level `instruments` map (id → voice spec per role/family);
built-ins become seeds. Add editor `kind` (`piano-roll` / `beat`) independent of
function; migrate `role` → function + kind. Bump the schema version once, here,
coordinated with Phase 5.

3b. Build a real instrument editor (voice family, osc, envelope, filter, FM,
pluck, percussion kit) replacing the current waveform+ADSR-only editor
(`instrument-editor.js`), which currently hides percussion & pluck voices.

3c. Per-step percussion kit assignment; fills/rolls reference the same kit.

## Phase 4 — Complete the editable surface

4a. Replace the read-only automation chips + "edit in JSON" hint
(`layer-reactive.js`) with a real param/axis/domain editor.

4b. Add a song-level `bindings` editor (currently no UI) and make `flourishes`
editable.

## Phase 5 — Score-file format refactor

- Studio exports **data-only** `export const score = {...}` (schema-versioned,
  no Tone import).
- The game owns **one** `scoreEngine.js` importing Tone once from its own
  vendored path and exporting `startScore / stopScore / setGameMusicState /
  musicEvent / disposeScore`, taking the score data as an argument.
- `musicDirector.js` imports the engine once + a small track→data registry.
- Update `dev/docs/gameIntegrationGuide.md`, `dev/scripts/check_imports.py`, and
  keep `dev/tests/dynamics-parity.test.js` green.

## Phase 6 — Small fixes

- **Journey-strip progress**: debug the playhead (`journey-strip.js`) and
  replace the faint pips with a clear "bar x / y" + marker.
- **Seek bar**: loop-position scrubber (bar:step, 0..16).

## Recommended execution order

**1 → 2 → 6 (quick wins) → 4 → 3 → 5**, with Phase 5 timed to the Phase 3 schema
bump. Commit after any completed step that makes sense to commit, so no work is
lost between sessions.
