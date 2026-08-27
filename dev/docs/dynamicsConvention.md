# Reactive Dynamics Convention (schema v8)

This is the **shared import/export contract** between Canopy and the games that
consume its music. It answers "how does the music *react*", not just "what does
it play". The `version: 8` project JSON carries both the composed material
(layers, steps, key/scale, progression) and the *rules* the playback engine uses
to adapt.

A `.canopy.json` exports this whole contract; a `.score.js` runtime embeds the
same JSON plus a tiny player that interprets it. Consuming games steer the
music over **continuous axes**; Canopy ships three: `intensity`, `tension`,
`brightness`. The game should *translate* its own player/narrative state into a
0..1 value on each axis — it never needs to know about loudness maps, filter
cutoffs, or drum patterns. There are no built-in mood presets: the game owns
what a "state" means and sets the axes directly.

## Core idea

1. **Axes** are the only thing the outside world touches. The game sets them
   directly via `setGameAxes` (or a wrapper of its own).
2. **Per-layer gates** (`activity`) decide whether a layer is audible in a
   given part of the axis space.
3. **Per-layer automation** (`automation`) map an axis onto a musical parameter
   (velocity, density, octave, duration, kick/hat velocity).
4. **Fills** (`fills`) inject extra notes when an axis crosses a threshold at
   specific steps.
5. **Verses** (`sections`) rotate arrangement states at bar boundaries:
   per-layer gain deltas and drop-in/out, so songs get real verse-to-verse
   variety instead of endless slight variation.
6. **Tempo is static during playback**. Intensity expresses itself through
   loudness, density, percussion, register and the shared atmosphere; the v4
   `tempo.offset` binding no longer exists and hydration drops it on migration.
7. **Song-level bindings** (`bindings`) map an axis onto a *global* (non-layer)
   parameter — the shared atmosphere — so the whole mix breathes, not just one
   voice. Applied at every bar boundary alongside the live-axis ease.

## Shape

```jsonc
{
  "version": 8,
  "bpm": 76,
  "key": "D",
  "scale": "Lydian",
  "progression": [0, 3, 5, 4],
  "bindings": [],                     // axis -> shared-atmosphere param; no tempo target
  "sections": [                       // verses, rotating in order
    { "id": "a", "label": "Verse A", "length": 4,
      "layers": {
        "melody":     { "gain": 2 },            // dB delta (-24..24)
        "percussion": { "active": false }       // drop out of this verse
      }
    },
    { "id": "b", "label": "Verse B", "length": 4, "layers": {} }
  ],
  "layers": [
    {
      "id": "percussion", "role": "percussion", "instrument": "Soft pluck",
      "steps": [ [ { "piece": "kick", "at": 0 } ], [], [] ],
      "level": 0,                     // static trim in dB (-24..6), default 0
      "activity": { "axis": "intensity", "range": [0.35, 1] },
      "fills": [
        { "at": [8, 11, 14], "axis": "intensity", "threshold": 0.4 },
        { "at": [12], "axis": "intensity", "threshold": 0.6 }
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

## Song-level atmosphere bindings

Per-layer `automation` drives *layer-owned* parameters. Song-level `bindings`
drive the **shared atmosphere** — global params no single layer owns. They map
an axis onto one of these targets:

```jsonc
"bindings": [
  { "target": "reverb",      "axis": "tension",    "domain": [30, 75] },   // room wet, 0..100 (%)
  { "target": "space.lead",  "axis": "intensity",  "domain": [0.2, 0.7] }, // lead reverb send, 0..1
  { "target": "space.bed",   "axis": "brightness", "domain": [0.1, 0.6] },
  { "target": "space.bass",  "axis": "intensity",  "domain": [0.05, 0.4] },
  { "target": "space.echo",  "axis": "tension",    "domain": [0.05, 0.45] },
  { "target": "swing",       "axis": "brightness", "domain": [0, 30] }     // off-beat sway, 0..100 (%)
]
```

- **Units match the project fields**: `reverb` and `swing` are percentages
  (0..100); `space.*` are 0..1 parallel reverb/echo sends.
- Resolved each **bar boundary** (steps 0 and 8) after the live axes ease, in
  both the studio preview and the exported runtime. Only the params that have a
  binding are applied; unbound atmosphere params keep the song's static
  baseline, so an added binding never drags the rest of the mix with it.
- `target` is only meaningful for the six atmosphere params above. Any other
  target is inert, and a `tempo.offset` target is dropped on hydration.

## Beat-layer steps (hit lists)

From schema v8 every non-degree layer (`harmony`, `bass`, `percussion`) stores
a **per-step hit list** instead of a boolean on/off grid:

```jsonc
"steps": [
  [ { "piece": "kick", "at": 0, "vel": 0.8 }, { "piece": "hat", "at": 0.5 } ],
  [],
  [ { "piece": "tom-hi", "at": 0.25, "pitch": 4 } ]
]
```

- `piece` — a key into the **kit catalog** (`src/music/pieces.js`): `kick`, `rim`,
  `hat`, `hat-open`, `snare`, `tom-hi`, `tom-lo`, `bongo-hi`, `bongo-lo`,
  `keyed`, `steel`, `shaker`. Meaningful only for `percussion`; for
  `harmony`/`bass` the layer's role decides the voice and `piece` is dropped.
- `at` — onset as a fraction of the 8th-note step (0 = on-beat, 0.5 = the
  halfway 16th, 0.25/0.75 = 16ths). Grid-agnostic: the editor snaps to a
  1/2/4/8 subdivision but stores the fraction.
- `vel` — optional per-hit velocity (0..1; else the piece default).
- `pitch` — optional scale **degree** (0..7) for the pitched pieces
  (toms/bongos/rim/keyed/steel). Mapped through the song's scale, so these stay
  in-key (harmony guard).

Reactive fills and rolls still reference the same kit, so a flair never sounds
like an unrelated glitch: `computeStepFrame` emits one routed event per authored
piece (positioned by `at`), and fills/rolls/hat-variation layer on top.

## Verses (sections)

Sections rotate strictly in order, each lasting its `length` bars, cycling
forever. At each bar boundary every layer resolves:

- `active: false` — layer is silent for the whole section (drop in/out);
- `gain` — a dB delta (-24..24) added to the layer's loudness bias on top of
  its journey role and its static `level`.

An empty/missing `sections` list means one implicit full-song section (v4
behavior). Lengths clamp to 1..16 bars; ids are free-form strings.

## Layer loudness

Three stacked components decide a layer's volume at any bar boundary:

1. **`level`** (new in v5) — the layer's static base trim, -24..6 dB,
   default 0. This is *the* general per-layer loudness property.
2. **Journey energyRole bias** — ±3 dB scaled by the macro journey curve.
3. **Section gain** — the active verse's per-layer dB delta.

Dynamic variation on top comes from existing machinery: per-layer `automation`
of `velocity` (and percussion velocities) against any axis, plus fills. To
make a verse swell, give it positive gains on forward layers and negative on
recessive ones rather than relying on tempo (which no longer moves).

## Game integration

The game translates its own state into the three axes, then sets them directly
via `setGameAxes` (merging a partial object; `null` resets to neutral). Games
wrap it in their own state vocabulary:

```js
function updateGameAudio(game) {
  // A combat-heavy game: map proximity/health to tension + intensity.
  game.music.setGameAxes({
    intensity: 0.3 + 0.7 * (1 - game.playerHealth),
    tension: game.closestEnemyDistance < 5 ? 0.8 : 0.2
  });
}
```

The engine interpolates the live axis vector toward the target at every bar
boundary — transitions are smooth, not snap cuts, always at bar boundaries
(musical, never mid-chord). The game triggers its own one-shot SFX; the engine
has no flourish API.

## Migration from v4/v5/v6/v7

Hydration accepts older projects directly (schema v8 intentionally drops
backward compatibility for the old boolean-step / flat-v1 format):

- `version` becomes 8;
- every layer gains `level: 0` (if absent) and keeps `sections`/`bindings`;
- the legacy `contexts` presets and `flourishes` overrides are **dropped** (no
  built-in states / one-shot events from v7 on);
- any `{ target: "tempo.offset", ... }` binding is dropped (tempo no longer
  modulates). Songs that relied on tempo lift should instead raise velocity /
  density automation ranges and percussion activity at high intensity.

## Geometry / constraints

- **Harmony guard is non-negotiable.** The decision core only ever returns
  scale *degrees* (0..7) or null; the audio engine maps degrees to pitches
  through `scaleMidi()`, the runtime through its vendored `note()`. No event
  ever leaves the chosen key/scale.
- **One source of truth.** The decision functions live in
  `src/music/dynamics.js`, a barrel over the single-purpose parts in
  `src/music/dynamics/` (pure, no Tone/DOM). The studio preview and the
  exported `.score.js` both use it — the exported file receives the parts
  concatenated and spliced verbatim, so they can't drift.
  `dev/tests/dynamics-parity.test.js` is the anti-drift gate: it fails if the
  emitted copy ever differs.
- **Bar-boundary transitions** for axis/arrangement changes, matching the
  original design; the step loop sends events but never snaps tonal state
  mid-phrase.

## Extending axes

To add a new reactive axis:
1. Add it to `DEFAULT_AXES` in `src/music/default-project.js`.
2. Add bindings / per-layer automation against it.
`dynamics.js` iterates its known keys; new axes flow through automatically.
Bump the schema version only if the *shape* of existing fields changes (e.g.
renaming a param), not for adding hypothetical axes.
