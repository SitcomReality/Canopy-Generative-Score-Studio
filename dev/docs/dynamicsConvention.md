# Reactive Dynamics Convention (schema v4)

This is the **shared import/export contract** between Canopy and the games that
consume its music. It answers "how does the music *react*", not just "what does
it play". The `version: 4` project JSON carries both the composed material
(layers, steps, key/scale, progression) and the *rules* the playback engine uses
to adapt to game state.

A `.canopy.json` exports this whole contract; a `.score.js` runtime embeds the
same JSON plus a tiny player that interprets it. Consuming games steer the music
over **continuous axes**; Canopy ships three: `intensity`, `tension`,
`brightness`. The game should *translate* its own player/narrative state into a
0..1 value on each axis — it never needs to know about tempo maps, filter
cutoffs, or drum patterns.

## Core idea

1. **Axes** are the only thing the outside world touches. A context is just a
   named preset of axis targets; a game can also set arbitrary axis values
   directly.
2. **Bindings** map an axis onto a song-level parameter (currently tempo).
3. **Per-layer gates** (`activity`) decide whether a layer is audible in a
   given part of the axis space.
4. **Per-layer automation** (`automation`) map an axis onto a musical parameter
   (velocity, density, octave, duration, kick/hat velocity).
5. **Fills** (`fills`) inject extra notes when an axis crosses a threshold at
   specific steps.

## Shape

```jsonc
{
  "version": 4,
  "bpm": 76,
  "key": "D",
  "scale": "Lydian",
  "progression": [0, 3, 5, 4],
  "bindings": [                       // song-level axis -> parameter
    { "target": "tempo.offset", "axis": "intensity", "domain": [0, 26] }
  ],
  "contexts": [                       // named presets over the axes
    { "id": "explore", "label": "Sunlit exploration",
      "targets": { "intensity": 0.3, "tension": 0.25, "brightness": 0.7 } }
  ],
  "layers": [
    {
      "id": "percussion", "role": "percussion", "instrument": "Soft pluck",
      "steps": [true, ...],
      "activity": { "axis": "intensity", "range": [0.35, 1] },   // silent below 0.35 intensity
      "fills": [
        { "at": [8, 11, 14], "axis": "intensity", "threshold": 0.5 },
        { "at": [12], "axis": "intensity", "threshold": 0.7 }
      ],
      "automation": [
        { "param": "kick.velocity", "axis": "intensity", "domain": [0.25, 0.68] },
        { "param": "hat.velocity", "axis": "intensity", "domain": [0.16, 0.32] }
      ]
    }
  ]
}
```

`automation.domain` is either a two-number **linear range** (velocity, density,
octave) or a **step index** across a longer array (e.g. `["1m","2n"]` for
duration, or `[{midi:"D1"...},{midi:"C1"...}]` for kick props).

## Game integration

The game translates its own state into the three axes, then calls
`setGameMusicState`.

```js
function updateGameAudio(game) {
  setGameMusicState({
    inCombat: game.inCombat,
    threat: game.closestEnemyDistance < 5 ? 0.8 : 0.2
  });
}
```

`setGameMusicState` currently maps threat/combat back to the `contexts` presets,
but a game that wants finer control can drive the axes directly (a future
runtime method). The engine interpolates the live axis vector toward the target
each bar boundary — transitions are smooth, not snap cuts, and always at bar
boundaries (musical, never mid-chord).

## Geometry / constraints

- **Harmony guard is non-negotiable.** The decision core only ever returns
  scale *degrees* (0..7) or null; the audio engine maps degrees to pitches
  through `scaleMidi()`, the runtime through its vendored `note()`. No event
  ever leaves the chosen key/scale. All mutations / spontaneous notes /
  fills are computed in this space.
- **One source of truth.** The decision functions live in
  `src/music/dynamics.js` (pure, no Tone/DOM). The studio preview and the
  exported `.score.js` both use it — the exported file receives it spliced
  verbatim, so they can't drift. `dev/tests/dynamics-parity.test.js` is the
  anti-drift gate: it fails if the emitted copy ever differs.
- **Bar-boundary transitions** for context/axis/arrangement changes, matching
  the original design; the step loop sends events but never snaps tonal or
  tempo state mid-phrase.

## Extending axes

To add a new reactive axis:
1. Add it to `DEFAULT_AXES` in `src/music/default-project.js`.
2. Give every context a target if it should steer it.
3. Add bindings / per-layer automation against it.
`dynamics.js` iterates its known keys; new axes flow through automatically.
Bump the schema version only if the *shape* of existing fields changes (e.g.
renaming a param), not for adding hypothetical axes.