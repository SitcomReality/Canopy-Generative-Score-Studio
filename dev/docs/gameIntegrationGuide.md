# Canopy Game Integration Guide

How to drop an exported `.score.js` into a web game and drive its adaptive
behavior. This is the counterpart to `songAuthoringGuide.md` (how songs are
authored) and `dynamicsConvention.md` (the formal v5 reactive contract). It is
written so it can be handed to an LLM or a developer who has never seen the
Canopy studio.

---

## 1. What you get

Exporting a project produces **one self-contained ES module**, `name.score.js`.
It contains:

- `export const score` — the full `.canopy.json` song data (embedded verbatim).
- The complete synth graph builder and 16-step sequencer built on Tone.js.
- The reactive-dynamics decision core (axes, contexts, gates, fills,
  automation, verses, flourishes) spliced in from the studio's shared core —
  so the game hears exactly what the studio preview heard. A parity test
  guards this.

**Dependency:** `tone` (npm). That is the only import:

```js
import * as Tone from "tone";
```

Install it once in the game project (`npm install tone`) and let your
bundler resolve it. The file must not be hand-edited below the `score`
object — regenerate it from the studio instead.

**Public API (stable, consumed by shipped games):**

| Function | Signature | Purpose |
|---|---|---|
| `startScore` | `async () => void` | Unlock audio, build the graph, start looping. Idempotent-ish: safe to call again after `stopScore`. |
| `stopScore` | `() => void` | Stop transport and reset to bar 0 (written phrases, journey position, live axes). Nodes stay alive for a fast restart. |
| `setGameMusicState` | `({ threat = 0, inCombat = false } = {}) => void` | Steer the adaptive context. Queued; applied at the next bar boundary. |
| `musicEvent` | `(name: string) => void` | One-shot flourish: `"victory"`, `"defeat"`, `"combat"`, `"calm"`, `"relief"` or `"unease"`. Plays across one bar at the next bar boundary. |
| `disposeScore` | `() => void` | Free everything. Call on scene teardown / permanent unload. |

## 2. Minimal integration

```js
import { startScore } from "./music/battlefield.score.js";

// Browsers require a user gesture before audio can start — call this from
// the first click/keypress, or your "press to start" screen.
startButton.addEventListener("click", () => {
  startScore(); // async internally; fire-and-forget is fine
});
```

That's all that's required for non-adaptive playback. The score loops its
two-bar phrase forever, follows its own journey curve, rests windows, and
seeded variation without any per-frame input from the game.

## 3. Driving adaptivity

### The state model

The music runs three continuous axes — `intensity`, `tension`, `brightness`
(0..1). You do not set them directly; you select **context presets** whose
axis targets the engine eases toward (half the remaining distance per bar, so
transitions take ~2 bars and never jump mid-chord):

| Context | Feel | Default targets (typical) |
|---|---|---|
| `explore` | calm, sparse, bright | intensity .30 / tension .25 / brightness .70 |
| `unease` | restless, denser | intensity .55 / tension .50 / brightness .55 |
| `combat` | driving, loud, dark | intensity .90 / tension .68 / brightness .35 |

(The exact targets are whatever the song author chose — read them from
`score.contexts` if you want to display them.)

### `setGameMusicState`

```js
setGameMusicState({ threat: myThreat01, inCombat: false });
```

Mapping rules inside the runtime:

- `inCombat === true` **or** `threat > 0.7` → queue `combat`
- else `threat > 0.3` → queue `unease`
- else → queue `explore`

The change lands at the **next bar boundary** — expect up to ~2 bars of
latency at slow tempos (at 76 BPM a bar is ≈ 3.2 s). This quantization is
intentional: it keeps transitions musical. Don't try to fight it by calling
every frame with rapidly changing values; instead:

**Recommended usage pattern**

```js
// Per frame (or on change): feed a smoothed 0..1 threat value.
// Add hysteresis so lingering near a threshold doesn't thrash contexts.
function updateMusic(dt, playerHealth, enemiesNearby) {
  const target = Math.min(1, enemiesNearby * 0.25 + (1 - playerHealth) * 0.4);
  smoothedThreat += (target - smoothedThreat) * Math.min(1, dt * 2);
  const band = smoothedThreat > 0.75 ? 1 : smoothedThreat > 0.35 ? 0.5 : 0;
  // Only push when the coarse band changes — the runtime queues anyway,
  // but this keeps intent readable and avoids redundant work.
  if (band !== lastBand) {
    lastBand = band;
    setGameMusicState({ threat: band, inCombat: band === 1 && inCombatFlag });
  }
}
```

Enter/exit combat explicitly where the game has a hard state change:

```js
onCombatStart: () => { inCombatFlag = true; setGameMusicState({ threat: 1, inCombat: true }); }
onCombatEnd:   () => { inCombatFlag = false; setGameMusicState({ threat: smoothedThreat, inCombat: false }); }
```

### One-shot events

```js
musicEvent("victory");
```

Queues the victory flourish — a full-bar ascending fanfare — starting at the
next bar boundary, after which the context resolves back to `explore`. Fire it
the moment the winning blow lands — the bar-boundary timing makes it feel
placed rather than slapped on. The same pattern covers the other five
flourishes (`"defeat"`, `"combat"`, `"calm"`, `"relief"`, `"unease"`), each
resolving the context its drama implies.

## 4. Lifecycle

- **Scene start:** `await startScore()` (or fire-and-forget after a gesture).
  Reuses the existing graph after a `stopScore`, rebuilds only after
  `disposeScore`.
- **Pause menu:** there is no dedicated pause API, but the underlying
  transport is reachable: `Tone.getTransport().pause()` suspends playback and
  `.start()` resumes it **mid-loop** (the runtime keeps its own step counter
  frozen while paused). If you'd rather restart predictably from the top of
  the loop, use `stopScore()` + `startScore()` instead — deterministic when
  the song has a non-zero seed.
- **Scene teardown / level unload:** always `disposeScore()` to release Web
  Audio nodes. Starting a different song: `disposeScore()` the old module's
  score, then dynamically `import()` the next `.score.js` and `startScore()`.
- **Tab visibility:** the transport keeps scheduling while backgrounded;
  browsers may throttle timers, which manifests as rhythmic stutter, not
  breakage. Consider pausing on `document.visibilitychange` if you care.

## 5. Mixing with game audio

The score manages its own internal gain staging (per-layer volumes, glue
compression, limiter at −1 dBFS) and outputs straight to the destination.
To balance against SFX, wrap it:

```js
import * as Tone from "tone";
const musicBus = new Tone.Gain(0.8).toDestination();
Tone.Destination; // not needed — instead, after startScore:
// Route everything through one node by connecting post-hoc is NOT supported
// by the public API; simplest reliable approach is master-level control:
Tone.Destination.volume.value = -6; // dB, affects ALL audio incl. SFX if shared
```

If SFX run through their own (non-Tone) audio pipeline, put Tone's output on
its own bus by setting `Tone.Destination.volume` for ducking under dialogue
(e.g. ramp to −12 dB during voiceover, back afterward). Duck smoothly with
`Tone.Destination.volume.rampTo(-12, 0.3)`.

## 6. Determinism & testing

- If the song's `variationSeed` is > 0, every playthrough of a session is
  identical given the same sequence of `setGameMusicState` calls — useful for
  golden-path QA recordings and rhythm-sensitive sections.
- Seed 0 means each playthrough varies. Both are valid; competitive/roguelike
  games often prefer seeded.
- Because transitions are bar-quantized, automated tests should advance time
  in whole bars (or stub `Tone.getTransport()`) when asserting context
  changes.

## 7. Known limits (as of schema v5)

- Games cannot drive axes directly; only the three context presets via
  `setGameMusicState`. A future `setGameAxes({...})` method is planned —
  design your state layer around coarse bands now and it will upgrade cleanly.
- Tempo never changes during playback (v5 removed tempo modulation). If your
  old v4 song sped up with intensity, re-export it: intensity now expresses
  itself through loudness, density and percussion instead.
- Flourish names other than the six in the table are ignored by `musicEvent`.
- One score instance per page is the supported shape (module-level state).
- No pause/resume in the public API (see §4 for workarounds).
- The runtime cannot load external samples; all sounds are synthesized, so
  first `startScore()` has a short graph-build cost (a few ms) plus Tone
  Reverb impulse generation (~100 ms). Pre-warm during a loading screen by
  calling `startScore()` immediately followed by `stopScore()` if you need
  sample-accurate first notes.

---

## Quick reference card

```js
import { startScore, stopScore, setGameMusicState, musicEvent, disposeScore }
  from "./your-song.score.js";

// loading screen (pre-warm)
await startScore(); stopScore();

// gameplay start (after user gesture)
startScore();

// adaptive steering (coarse bands + hysteresis)
setGameMusicState({ threat: 0.5 });            // unease queued
setGameMusicState({ inCombat: true });         // combat queued
musicEvent("victory");                          // flourish, resolves to explore

// teardown
disposeScore();
```
