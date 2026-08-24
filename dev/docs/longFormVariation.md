# Long-form variation — design sketch (future work)

Canopy's core promise is background music that can play indefinitely without
sounding like a loop. Today the score is a fixed 16-step phrase; the only
variation is the engine's per-step randomization (`Safe variation`, context
density). This sketch outlines the variation/dynamics system needed for
true long-form playback. It is **not implemented yet** — this document is the
plan.

## Goal

A exported `.score.js` (or the studio preview) should stay listenable for
30+ minutes by evolving four dimensions over time while always remaining
inside the chosen key/scale (the harmony guard is non-negotiable):

1. **Micro** — per-pass note variation (already partly exists: degree
   wobble, spontaneous notes).
2. **Phrase** — the written motif itself drifts: every N passes, a small
   number of steps mutate (swap, shift octave, rest), anchored so the
   motif stays recognizable. "Safe variation" slider becomes the mutation
   rate.
3. **Arrangement** — layers drop out and return (mute/unmute with musical
   transitions at bar boundaries), like a band easing in and out. Each
   layer gets an "energy budget" derived from the game context: explore
   favors motif + harmony, combat brings bass + percussion forward.
4. **Macro form** — slow-moving song-level state: an 8–16 bar "journey"
   cycle (build → peak → resolve) layered under the reactive game context,
   plus occasional fill/flourish events at phrase boundaries.

## Parameter surface

Per layer (extends schema v2's per-layer params):

- `mutation` (0–100): how far written steps may drift per pass cycle.
- `energyRole`: how the layer responds to the macro energy curve.
- `restWindow`: guaranteed quiet passes so loops breathe.

Song level:

- `journeyLength` (bars) and `journeyDepth`: strength of the macro arc.
- `variationSeed`: deterministic seeds so an exported score is reproducible
  if the game wants that; `0` = fully random.

## UI implications

- The refine panel's per-layer group gains "Drift" (mutation) and "Breathe"
  (rest window) sliders — same visual language as density/variation.
- A new "Long form" section at song level: journey shape (flat / arc /
  tide), journey length, and a "predictability" control mapping to seed.
- The phrase editor needs a "takes" concept eventually: show which pass
  variant is playing, or at minimum a "variation preview" that regenerates
  the next mutation so edits feel safe.

## Implementation notes

- All mutation must run through `scaleMidi()`/`chordNotes()` degrees — never
  absolute midi — so key/scale changes keep working.
- Mutations apply only at bar boundaries, same as context transitions in
  `audio-engine.js`.
- Schema change would be **version 3** (new per-layer and song-level fields);
  `hydrateProject` must default them for v2 saves.
- The runtime module must keep its public API stable; long-form logic should
  live in pure functions under `src/music/` (e.g. `variation.js`) so both the
  studio engine and the emitted runtime can share the generated logic via
  the template.

## Suggested phasing

1. Phrase mutation for motif layers (pure function + tests first).
2. Arrangement energy: context-driven layer ducking at bar boundaries.
3. Macro journey curve + studio UI.
4. Seeded determinism + runtime module support.
