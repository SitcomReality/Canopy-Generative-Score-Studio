# System architecture

Canopy is a zero-build, plain JavaScript + CSS + HTML app. There is no
bundler, no framework, and no npm. The browser loads native ES modules
directly; `index.html` is generated from `index.template.html` plus the
partials under `src/partials/` by `dev/scripts/build.py`.

## 1. Directory map

```
index.template.html   source of index.html (include directives)
index.html            GENERATED -- do not edit by hand
vendor/               vendored UMD globals: tone.js (Tone), midi.js (Midi)
dev/scripts/
  build.py            stitches partials into index.html (--watch supported)
  check_imports.py    import resolution / symbol / boundary checker
src/
  main.js             composition root: store, actions, view wiring
  music/              pure music-theory modules (no DOM, no audio)
  audio/              Tone.js graph + sequencer
  state/              pub/sub application state + persistence
  ui/                 one module per view region; inline lucide icons
  utils/              download helpers, class-name join
  styles/             one stylesheet per visual area (+ responsive.css)
  partials/           .inc.html markup included into the template
  dynamics.js         (in music/) shared reactive-dynamics decision core:
                      axes, axis easing, bindings/atmosphere, layer activity/
                      fills/automation resolution, humanization. Pure and
                      Tone-free; consumed by audio-engine.js and spliced
                      verbatim into runtime-module.js. The barrel re-exports
                      single-purpose parts from music/dynamics/ (axes, sections,
                      gates, humanize, step-frame, arrangement); vendor_
                      dynamics.mjs concatenates those parts for the splice.
  audio/              master-chain.js (graph/buses/space sends), voices.js
                      (instrument -> Tone nodes incl. pluck velocity path),
                      sequencer.js (16-step callback); audio-engine.js is the
                      thin composition root wiring all three.
```

## 2. Layer rules

Layers not listed may import anything; `main.js` is the composition root.
`check_imports.py` reports cross-layer imports informationally and fails
only on unresolvable imports or missing exported symbols.

| Layer   | May import        |
|---------|-------------------|
| music   | music             |
| audio   | music, audio      |
| state   | music, state      |

`ui/` may import `music` (constants + pure helpers) and `utils`; it must not
import `audio/` or `state/` internals — views receive everything through
their init functions in `main.js`.

## 3. Invariants

- **Harmony guard**: every note is derived via `scaleMidi()` /
  `chordNotes()` in `src/music/scale-math.js` (studio) or the vendored
  `note()`/`chord()` in the emitted runtime. Never compute pitches outside
  those. The decision core (`dynamics.js`) only ever returns scale degrees.
- **Bar-boundary transitions**: adaptive context/axis changes are queued and
  only applied on steps 0 and 8 inside `audio-engine.js`/the runtime. Never
  mid-chord cuts.
- **One adaptive core**: `src/music/dynamics.js` is the single source of truth
  for reactive decisions; `runtime-module.js` splices it verbatim into emitted
  `.score.js` files. `dev/tests/dynamics-parity.test.js` fails if they ever
  drift.
- **Schema stability**: the project object (`version: 4`) round-trips through
  localStorage key `canopy-project`, `.canopy.json` export/import, and is
  embedded verbatim in exported `.score.js`. `hydrateProject` migrates v1/v2/v3
  to v4 defaults. Bump the version and extend `hydrateProject` before breaking
  its shape.
- **Runtime API**: generated `.score.js` files are consumed in users' games;
  their public surface (`startScore`, `stopScore`, `setGameAxes`, `disposeScore`,
  `getRuntimeInfo`) must stay stable.

## 4. Data flow

Views subscribe to the central store (`src/state/app-state.js`) with change
notifications keyed by which slice changed. The audio engine's transport
callback reads live values straight from the store, so parameter edits apply
without tearing down or re-subscribing the sequencer, and step/axis/verse
changes made inside the callback propagate back to views as ordinary store
updates.

## 5. Build

`python3 dev/scripts/build.py [--watch]`. Serve the project root with any
static server (e.g. VSCodium Live Server); run build.py with `--watch` so
partial edits restitch `index.html` while you work.
