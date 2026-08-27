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

3a. **Song-owned instruments (schema v6) — DONE.** Add `project.instruments`
(`{ id -> { label, voice, percussion } }`); `resolveInstrumentConfig` + the
runtime `makeDrums` consult custom instruments before the catalog preset,
mirrored into the exported runtime. Unknown/untrusted configs are sanitized
away. Bumped `PROJECT_VERSION` to 6.

3b. **Instrument editor — DONE (UI).** A "Manage instruments…" modal
(`ui/instrument-library.js`) to clone a built-in preset or start blank, choose
voice family (synth/FM/pluck), waveform, ADSR, FM/pluck params, and the
percussion kit; the layer instrument picker merges custom instruments.

3c. **Split editor kind vs function + per-step percussion — DONE (schema v8).**
Decouple a layer's *editor kind* (piano roll vs beat) from its *function*
(harmony/motif/bass/rhythm). For beat-kind layers, upgrade the step format to
**hit lists** so percussion gets real complexity:

```
steps[i] = [ { "piece":"kick", "at":0 }, { "piece":"hat","at":0.5 } ]
```
- `piece` — a key into the **piece catalog** (`kick`, `rim`, `hat`, `hat-open`,
  `snare`, `tom-hi`, `tom-lo`, `bongo-hi`, `bongo-lo`, `keyed`, `steel`, `shaker`).
- `at` — onset within the 8th-note step as a fraction 0..1 (0 = on-beat,
  0.5 = double-time, 0.25/0.75 = 16ths). Editor snaps to a per-cell subdivision
  (1/2/4/8) but stores the fraction, so the format is grid-agnostic.
- `vel` — optional per-hit velocity. `pitch` — optional scale degree (0..7) for
  pitched pieces (toms/bongos/rim/keyed/steel), keeping them in the key.

This applies to **all beat layers** (subdivision everywhere; `piece` is
selected/ignored per layer). **Backward compatibility is intentionally dropped**
for this update — old songs are not a priority and old-format migration code
(`layersFromV1`, boolean-step hydration) was removed.

The **shared-dynamics-core rewrite** landed in one pass (studio
`computeStepFrame` + the runtime splice + the piece-catalog voice builders +
the beat-cell editor). The piece catalog lives at (`src/music/pieces.js`) and is
spliced into the exported engine alongside the dynamics core. Fills/rolls still
reference the same kit so flairs don't sound like unrelated glitches.

## Phase 4 — Complete the editable surface

4a. **Automation editor — DONE** (`ui/layer-reactive.js`, `actions/layers/reactive.js`).
Replaced the read-only chips + "edit in JSON" hint with a real editor: each
mapping shows its param (known-params datalist), driving axis, and a low→high
domain (number or raw text/JSON endpoints), plus add/remove. Empty domain
endpoints revert instead of corrupting the engine lookup.

4b. **Bindings editor — DONE** (v7, `ui/atmosphere-panel.js`). The song-level
`bindings` (`{ target, axis, domain }`) now drive the shared atmosphere —
`reverb`, `space.lead/bed/bass/echo`, and `swing` — and are authored inline in
the Shared Atmosphere panel (a "Bind" toggle per param reveals axis + domain).
Bound targets are resolved each bar boundary by `atmosphereBindings()` in the
dynamics core (spliced into the runtime) and applied by both the studio
sequencer and the exported engine. `DEFAULT_BINDINGS` stays empty, so the
default mix is untouched.

**Flourishes — REMOVED (v7).** One-shot musical events were dropped entirely,
along with the flourish editor and the `musicEvent` API — games play their own
SFX and nudge the axes instead.

## Phase 5 — Score-file format refactor — DONE

- **Data-only** export (`runtimeModule`) = `export const score = {...}` (schema
  v6, no Tone import, no engine).
- **Shared engine** (`scoreEngineSource`) = one `scoreEngine.js` per game,
  importing Tone once and exporting a single `createScoreEngine(score)` factory
  whose returned runtime exposes the stable API
  (`startScore/stopScore/setGameAxes/getRuntimeInfo/disposeScore`).
- A `musicDirector.js` pattern (import the engine once + a track→data registry)
  is described in `dev/docs/gameIntegrationGuide.md`.
- The studio's Runtime harness loads the data-only score + the engine and
  combines them; the Export menu offers "Song data (.score.js)" and "Score
  engine". Tests updated to assert the data/engine split; the dynamics parity
  test now checks the engine source's splice.

## Phase 6 — Small fixes — DONE

- **Journey-strip progress** (`ui/journey-strip.js`): rebuilt the strip with a
  translucent progress band up to the playhead, a brighter marker, and a
  "bar x / y" readout so long-form position reads at a glance.
- **Seek bar**: a loop-position scrubber (0..15 steps of the 2-bar loop) in the
  deck. `seek(step)` re-anchors the timing engine live (`engine.setPosition`) so
  dragging jumps mid-loop while keeping the schedule continuous; the store /
  readout / piano-roll playhead follow it. (Note: seek is a live jump while
  playing; seeking while stopped moves the playhead but `play()` still starts
  from bar 0.)

## Phase 7 — Remove "music state" — DONE

- **Schema v7**: dropped `contexts` presets and `flourishes` overrides
  (hydration silently removes both). `axes`, `bindings`, `sections` stay.
- **Runtime API**: removed `setGameMusicState` (threat/inCombat) and `musicEvent`
  (flourish). `setGameAxes` is now the single axis control (partial merge; null
  resets to neutral); live axes ease toward it each bar boundary.
  `getRuntimeInfo` drops `context`.
- **Studio**: the deck-live inset now holds steerable axis sliders (the studio's
  `setGameAxes` equivalent) with a live-value readout; the context switcher,
  threat slider and flourish controls are gone. Removed the "Reactive axes"
  song group. The Shared Atmosphere panel is a "Score" bank group with an inline
  bindings editor per param.
- **Dynamics core**: removed `contextTargets`, `FLOURISH_NAMES`, `flourishEvents`.
- **Song-level `bindings` editor (Phase 4b)** is closed by Phase 7's
  atmosphere-panel bindings editor. The **percussion hit-format rewrite**
  (Phase 3c, per-step hits + full kit) is DONE in **schema v8** — see Phase 3c.
  With that, every roadmap phase is complete.

## Recommended execution order

**1 → 2 → 6 (quick wins) → 4 → 3 → 5 → 7**, with Phase 5 timed to the Phase 3 schema
bump. Commit after any completed step that makes sense to commit, so no work is
lost between sessions.
