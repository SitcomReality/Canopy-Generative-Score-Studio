# Canopy Song Authoring Guide

This document explains how Canopy's music system works end-to-end, precisely
enough that an LLM (or a human) can author a complete `.canopy.json` song
file without reading the source. It complements `systemArchitecture.md`
(engine/layout invariants) and `dynamicsConvention.md` (the v4 reactive
import/export contract).

The authoritative sources, if anything here seems ambiguous:

| Concern | Source of truth |
|---|---|
| Schema shape + hydration/clamping rules | `src/music/default-project.js` |
| Instrument presets (synth configs) | `src/music/instruments.js` |
| Reactive decisions (axes → parameters → events) | `src/music/dynamics.js` |
| Phrase drift + journey energy | `src/music/variation.js` |
| Keys / scales / progressions / contexts | `src/music/keys.js`, `scales.js`, `progressions.js`, `contexts.js` |

---

## 1. The big picture

A Canopy score is **two bars long** (16 eighth-note steps) and loops forever.
Everything adaptive is data-driven from the JSON — there are no hidden rules
in the playback engines. A score plays through four pipelines stacked on top
of the written notes:

1. **Reactive dynamics (v4).** Three continuous axes (`intensity`,
   `tension`, `brightness`, each 0..1) are steered by *context presets* (or by
   the game at runtime). Axes modulate tempo, velocities, densities, octaves,
   note durations, percussion behavior, and can gate whole layers on or off.
   Axis changes are eased toward the active context's targets at every bar
   boundary (rate 0.5/bar ≈ smooth over two bars), so nothing jumps.
2. **Long-form variation.** At each bar boundary, motif layers get a fresh,
   seeded drift pass (`mutateMotif`) derived from their written phrase — the
   written phrase itself never changes. Separately, a macro "journey" curve
   raises and lowers per-layer volume over many bars.
3. **Arrangement hygiene.** Per-layer rest windows force guaranteed quiet
   passes so loops breathe; an energy role biases each layer up or down as
   the journey swells.
4. **Determinism.** With a non-zero `variationSeed`, every random decision
   (drift, dropouts, hat variance, humanize offsets) replays identically.
   Seed 0 means fully random.

Transitions are musical by construction: contexts apply only at bar
boundaries (steps 0 and 8), and layers never cut mid-chord.

### The harmony guard

Every pitched note is a **scale degree 0–7** relative to the chosen key +
scale (7 = the octave). Degrees become MIDI only through `scaleMidi()` /
chord voicing helpers. Nothing you put in the JSON can produce an out-of-key
note; conversely, you should *think in degrees*, not note names.

---

## 2. Top-level schema (version 4)

```jsonc
{
  "version": 4,
  "name": "Sunlit Reaches",       // string
  "bpm": 76,                       // 48..150; the binding adds up to +26 live
  "key": "D",                      // one of: C C# D Eb E F F# G Ab A Bb B
  "scale": "Lydian",               // any scale in src/music/scales.js
  "progression": [0, 3, 5, 4],     // exactly 4 chord roots, degrees 0..6
  "progressionName": "Open sky",   // label; see PROGRESSIONS for preset names
  "reverb": 64,                    // 0..100 (% wet)
  "swing": 8,                      // 0..100 (0 = straight 8ths)
  "journey": { "shape": "arc", "length": 16, "depth": 40 },
  "variationSeed": 0,              // 0 = random; >0 = reproducible
  "axes":        { ... },          // keep the default (see §5)
  "contexts":    [ ... ],          // context presets with axis targets (§5)
  "bindings":    [ ... ],          // axis -> song parameter maps (§5)
  "layers":      [ ... ]           // 1..n layers (§3)
}
```

Hydration (`hydrateProject`) silently repairs malformed input: unknown
instruments/roles fall back to defaults, numbers are clamped into range,
steps arrays are padded/truncated to 16. A valid file round-trips losslessly.

### Steps arrays

A layer's `steps` array always has exactly 16 entries:

- **Degree layers** (roles `motif`; harmony/bass may hold degrees too after
  conversion): each entry is a degree `0..7` or `null` for a rest.
- **On/off layers** (roles `harmony`, `bass`, `percussion`): each entry is
  `true` or `false`. Harmony hits sound the current chord once per hit;
  bass sounds the chord root; percussion triggers kit voices.

### Progression & chords

The 4-entry `progression` covers the two-bar loop (one chord per 4 steps /
half-bar). Chords are built by stacking scale thirds above the root degree,
so everything stays diatonic. Pick progressions whose degrees move by
step/third for smooth looping; the shipped presets in
`src/music/progressions.js` are all safe choices.

---

## 3. Layers

Each layer is one voice in the arrangement:

```jsonc
{
  "id": "melody",                  // unique string; engine voice key
  "name": "Firefly",               // display name
  "detail": "Main motif",          // short description
  "role": "motif",                 // motif | harmony | bass | percussion
  "color": "#f1c97a",
  "muted": false,
  "instrument": "Glass bell",      // must be an exact catalog name (§4)
  "density": 58,                   // 0..100 — chance written notes actually sound
  "variation": 34,                 // 0..100 — per-repeat phrase drift amount
  "humanize": 18,                  // 0..100 — micro timing looseness (up to ~35ms)
  "restWindow": 0,                 // 0=never rests; n = silent 1 bar every n+1 bars (max 8)
  "energyRole": "balanced",        // balanced | forward (+3dB) | recessive (-3dB)
  "activity": null,                // axis gate (§5) or null = always on
  "fills": null,                   // extra-hit triggers (§5) or null
  "automation": [ ... ],           // axis -> param maps (§5); [] if none
  "steps": [ ... ]                 // 16 entries per the role's kind
}
```

Parameter semantics, precisely:

- **density** — probability a written note actually sounds:
  motif plays when `rng() < density/100 + 0.24`; on/off layers treat it via
  the composer/pattern tools rather than playback. Low values (< 40) feel
  airy and ambient; high values (> 70) feel busy and driven.
- **variation** — two effects multiplied together: per-bar whole-phrase drift
  at an effective rate of `variation% × 0.35`, plus per-step micro-mutation
  during playback (±1 degree at 12% · variation/100 chance, and spontaneous
  notes appearing in rests scaled by density). Phrase anchors (steps 0 and
  15) NEVER mutate, so the loop always starts and resolves identically.
  0–20 = essentially written-loop; 30–50 = gently evolving; 60+ = fluid.
- **humanize** — deterministic-per-seed timing offset up to ~3.5% of the
  value in seconds, applied to melody/bass/hats.
- **restWindow** — every `window + 1` bars the layer drops out entirely for
  one bar. Use it on busy layers (percussion especially) so the loop has
  guaranteed space.
- **energyRole** — journey volume bias: `forward` leans in up to +3 dB,
  `recessive` pulls back up to −3 dB, `balanced` splits the difference at
  +1.5 dB, all scaled by how far the journey is from neutral.

### Role → voice mapping

- `motif` — polyphonic lead, fed through the delay send. Degree steps.
- `harmony` — polyphonic pad/chords on the reverb bus. On/off steps; each hit
  sounds the full current chord (long duration by default — automate it
  shorter for pulsing beds).
- `bass` — monophonic low voice, dry and centered. On/off steps sounding the
  chord root at octave 2.
- `percussion` — a drum kit (§4). On/off steps: downbeats (steps ≡ 0 mod 4)
  fire the kick, other active steps fire the hat; fills add kicks, snares
  and rolls.

Any instrument works on any role (every preset defines all four voices), but
voicing quality varies — see the pairing hints in §4.

---

## 4. Instruments

Exact names (hydration rejects anything else):

| Preset | Character | Best pairings |
|---|---|---|
| `Glass bell` | Pure sine bell, soft attack | motif; gentle harmony |
| `Warm reed` | Rounded square reed | harmony pads; motif with body |
| `Soft pluck` | Triangle pluck | bass; motif; light percussion |
| `Velvet pad` | Wide sawtooth pad | harmony; slow motifs |
| `Hollow mallet` | Short triangle mallet (marimba-ish) | motif; playful percussion |
| `Deep root` | Big sine low end | bass |
| `Glocken chime` | FM glockenspiel/bell, glassy | motif accents; bright kits |
| `Kalimba dusk` | Woody Karplus pluck, intimate; conga-flavored kit | motif; hand-percussion |
| `Vine guitar` | Acoustic-guitar-like pluck (Karplus); guitar-ish bass | motif; bass |
| `Jungle steel` | FM steel pan, bright; playful filtered kit | motif; vibrant percussion |

Internally a preset carries a config per role: default voices are
`PolySynth(Synth)` (motif/harmony) and `MonoSynth` (bass); presets may declare
`voice: "fm"` (bell/pan tones) or `voice: "pluck"` (Karplus-string tones).

Percussion config per preset includes a `MembraneSynth` kick, a noise hat
(optionally high-passed via `hatFilter`), and optionally a band-passed snare
(`snare`, `snareFilter`). Presets without a snare route fill accents to the
hat instead.

---

## 5. Reactive dynamics (the v4 core)

All reactive state flows one way: **context targets → eased live axes →
parameters/events**, resolved per step inside `computeStepFrame()`
(`src/music/dynamics.js`). Both the studio preview and the exported
`.score.js` run this same spliced core.

### Axes

Fixed to three dimensions (whitelisted; don't invent others):

```jsonc
"axes": {
  "intensity":  { "label": "Intensity" },   // drive, loudness, tempo push
  "tension":    { "label": "Tension" },     // unease, melodic activity
  "brightness": { "label": "Brightness" }   // timbral light vs shade
}
```

### Contexts

Named presets over the axes. Only the canonical ids survive hydration:
`explore`, `unease`, `combat`. Each carries 0..1 targets:

```jsonc
"contexts": [
  { "id": "explore", "label": "Explore", "targets": { "intensity": 0.3,  "tension": 0.25, "brightness": 0.7 } },
  { "id": "unease",  "label": "Unease",  "targets": { "intensity": 0.55, "tension": 0.5,  "brightness": 0.55 } },
  { "id": "combat",  "label": "Combat",  "targets": { "intensity": 0.9,  "tension": 0.68, "brightness": 0.35 } }
]
```

While a context is active, live axes ease toward its targets each bar
(half the remaining distance per bar). Shape your targets deliberately:
explore should breathe, combat should press. Brightness currently steers
feel more than a single hard-wired parameter — lean on intensity/tension for
motion.

### Bindings

Song-level axis → parameter maps. Currently one canonical target:

```jsonc
"bindings": [
  { "target": "tempo.offset", "axis": "intensity", "domain": [0, 26] }
]
```

Live BPM = `project.bpm + offset(axis value)` — so with the default binding,
full intensity adds up to +26 BPM over the base tempo.

### Layer activity gates

Silence a layer whenever the cited axis falls outside `[min, max]`:

```jsonc
"activity": { "axis": "intensity", "range": [0.35, 1] }
```

Classic use: percussion enters only once intensity ≥ ~0.35, so explore feels
sparse and combat feels full-band. Gates are checked every bar AND every
step, so crossings land cleanly on the grid.

### Fills (extra hits)

Inject extra events at listed steps while an axis is above threshold:

```jsonc
"fills": [
  { "at": [8, 11, 14], "axis": "intensity", "threshold": 0.5 }
]
```

Per-role behavior when a fill fires:

- **percussion** — extra off-beat kick on even steps, a **snare accent**
  (hat if the kit lacks a snare), a double-snare flam on odd steps, and on
  steps ≥ 13 a rising four-hit **snare roll** closing the phrase half. This
  is the "drumroll connecting verses" gesture — place fills at 8/11/14 (and
  optionally a harder one at 12 or 14 with a higher threshold) for
  build-and-drop transitions. Roll offsets are fixed, not random, so seeds
  stay deterministic.
- **bass** — pushes root notes onto even steps near the phrase edge.
- **motif** — adds a quick scale-neighbor grace note above/below the current
  note.

Fills fire *every* time the axis is above threshold — they're intensity-
gated texture, not one-shots. Use thresholds to decide which contexts show
them (e.g. threshold 0.7 ⇒ only combat).

### Automation (axis → parameter per layer)

Each entry maps an axis onto a parameter through a domain:

```jsonc
{ "param": "velocity", "axis": "intensity", "domain": [0.22, 0.3] }
```

Two domain forms:

- **Linear pair** `[low, high]` (two numbers): value interpolates with the
  axis. Use for velocity, density, octave.
- **Stepped array**: index = `round(value × (len − 1))`. Use for durations
  like `["1m", "2n"]` or kick props like
  `[{ "midi": "D1", "vel": 0.25 }, { "midi": "C1", "vel": 0.68 }]`.

Recognized params and sane ranges:

| Param | Applies to | Domain guidance |
|---|---|---|
| `velocity` | all pitched + kick/hat/snare | 0..1 (keep ≤ 0.7) |
| `duration` | chords/motif/bass | `"1m"`,`"2n"`,`"4n"`,`"8n"` |
| `density` | motif | 0..1 |
| `octave` | motif | e.g. `[4, 5]` |
| `kickProps` | percussion kick pitch+velocity | objects `{midi, vel}` |
| `kick.velocity` / `hat.velocity` / `snare.velocity` | percussion | 0..1 |
| `hat.variation` | percussion | 0..1 chance of extra hats |

Defaults when unautomated: velocity 0.22–0.3 (chords), 0.4 (motif),
0.45 (bass), 0.25 (kick), 0.16 (hat); durations `"1m"`/`"4n"`/`"16n"`.

### Journey (macro form)

```jsonc
"journey": { "shape": "flat" | "arc" | "tide", "length": 8|16|32, "depth": 0..100 }
```

Energy per bar = shape(phase) blended toward 0.5 by depth, where phase =
`(bar mod length) / length`: `arc` builds to a mid-cycle peak then resolves;
`tide` is a sine swell; `flat` ignores depth. That energy becomes the ±dB
layer gain described under `energyRole`. Depth 20–45 is tasteful; > 60 gets
dramatic. Length should be a multiple of 8 so cycles resolve on phrase
boundaries musically.

---

## 6. Authoring recipe

1. **Choose key/scale/tempo** — Major/Lydian for light, Dorian for ancient,
   Minor for shadowed; 64–84 BPM sits well under gameplay.
2. **Pick a progression** (preset names or your own 4 degrees).
3. **Write the harmony bed** — on/off steps, classically on steps 0/4/8/12.
   Automate duration shorter (`["1m","2n"]`) for movement.
4. **Write the motif** — degree steps with anchors at 0 and 15; contour by
   step (neighbors) rather than leaps; give it air with `null`s (3–6 rests
   per 16). Set variation 25–40, humanize 10–20, density 50–65.
5. **Ground it** — bass on/off steps aligned with chord changes; automate
   velocity up by intensity.
6. **Add rhythm** — kick-weighted pattern (downbeats true, some syncopation);
   set `activity` intensity ≥ 0.35; add fills with staggered thresholds
   (0.5 for accents, 0.7 for rolls). Give it `restWindow` 4–8.
7. **Shape contexts/journey/bindings** — widen the explore↔combat contrast
   through targets; bind tempo to intensity; choose journey arc/tide with
   moderate depth; set a non-zero seed if the game build must replay
   identically.
8. **Validate mentally against hydration**: instrument names exact, degrees
   0–7/null, bools for on/off layers, 4-entry progression of 0–6, domains
   well-formed.

## 7. Complete example song

A four-layer piece: kalimba motif over a soft pad, guitar-pluck bass, and a
playful jungle-percussion kit that enters with intensity and rolls into
chorus moments.

```json
{
  "version": 4,
  "name": "Vineheart Hollow",
  "bpm": 72,
  "key": "D",
  "scale": "Lydian",
  "progression": [0, 3, 5, 4],
  "progressionName": "Open sky",
  "reverb": 62,
  "swing": 10,
  "journey": { "shape": "arc", "length": 16, "depth": 38 },
  "variationSeed": 7,
  "axes": {
    "intensity": { "label": "Intensity" },
    "tension": { "label": "Tension" },
    "brightness": { "label": "Brightness" }
  },
  "contexts": [
    { "id": "explore", "label": "Explore", "targets": { "intensity": 0.3, "tension": 0.25, "brightness": 0.75 } },
    { "id": "unease", "label": "Unease", "targets": { "intensity": 0.55, "tension": 0.55, "brightness": 0.5 } },
    { "id": "combat", "label": "Combat", "targets": { "intensity": 0.9, "tension": 0.68, "brightness": 0.35 } }
  ],
  "bindings": [
    { "target": "tempo.offset", "axis": "intensity", "domain": [0, 24] }
  ],
  "layers": [
    {
      "id": "chords",
      "name": "Canopy",
      "detail": "Harmony bed",
      "role": "harmony",
      "color": "#9dc98d",
      "muted": false,
      "instrument": "Velvet pad",
      "density": 42,
      "variation": 18,
      "humanize": 10,
      "restWindow": 0,
      "energyRole": "balanced",
      "activity": null,
      "fills": null,
      "automation": [
        { "param": "velocity", "axis": "intensity", "domain": [0.22, 0.32] },
        { "param": "duration", "axis": "intensity", "domain": ["1m", "2n"] }
      ],
      "steps": [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false]
    },
    {
      "id": "melody",
      "name": "Firefly",
      "detail": "Main motif",
      "role": "motif",
      "color": "#f1c97a",
      "muted": false,
      "instrument": "Kalimba dusk",
      "density": 58,
      "variation": 34,
      "humanize": 18,
      "restWindow": 0,
      "energyRole": "forward",
      "activity": null,
      "fills": [
        { "at": [7, 15], "axis": "tension", "threshold": 0.55 }
      ],
      "automation": [
        { "param": "velocity", "axis": "intensity", "domain": [0.4, 0.58] },
        { "param": "duration", "axis": "intensity", "domain": ["4n", "8n"] },
        { "param": "density", "axis": "tension", "domain": [0.5, 0.95] },
        { "param": "octave", "axis": "intensity", "domain": [4, 5] }
      ],
      "steps": [4, null, 6, 5, 4, null, 2, null, 2, 4, null, 3, 2, 1, null, 0]
    },
    {
      "id": "bass",
      "name": "Root",
      "detail": "Low pulse",
      "role": "bass",
      "color": "#d98868",
      "muted": false,
      "instrument": "Vine guitar",
      "density": 80,
      "variation": 10,
      "humanize": 8,
      "restWindow": 0,
      "energyRole": "balanced",
      "activity": null,
      "fills": [
        { "at": [7, 15], "axis": "intensity", "threshold": 0.6 }
      ],
      "automation": [
        { "param": "velocity", "axis": "intensity", "domain": [0.32, 0.56] },
        { "param": "duration", "axis": "intensity", "domain": ["4n", "8n"] }
      ],
      "steps": [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false]
    },
    {
      "id": "percussion",
      "name": "Footfall",
      "detail": "Rhythm",
      "role": "percussion",
      "color": "#b8a5d7",
      "muted": false,
      "instrument": "Jungle steel",
      "density": 70,
      "variation": 15,
      "humanize": 12,
      "restWindow": 8,
      "energyRole": "recessive",
      "activity": { "axis": "intensity", "range": [0.35, 1] },
      "fills": [
        { "at": [8, 11, 14], "axis": "intensity", "threshold": 0.5 },
        { "at": [12], "axis": "intensity", "threshold": 0.7 }
      ],
      "automation": [
        { "param": "kickProps", "axis": "intensity", "domain": [{ "midi": "D1", "vel": 0.25 }, { "midi": "C1", "vel": 0.68 }] },
        { "param": "kick.velocity", "axis": "intensity", "domain": [0.25, 0.68] },
        { "param": "hat.velocity", "axis": "intensity", "domain": [0.16, 0.32] },
        { "param": "hat.variation", "axis": "intensity", "domain": [0.0, 0.3] },
        { "param": "snare.velocity", "axis": "intensity", "domain": [0.28, 0.5] }
      ],
      "steps": [true, false, false, true, true, false, true, false, true, false, false, true, true, false, true, false]
    }
  ]
}
```

Save it as `<name>.canopy.json`, import via the header's import button, and
preview. Export `.score.js` for the game runtime or `.mid` for a DAW sketch.
