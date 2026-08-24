# AGENTS.md — Canopy Generative Score Studio

## Project overview

Canopy is a browser-based **generative/adaptive music studio** for game developers who are not musicians. It lets a user compose a short two-bar score (16 eighth-note steps) constrained to a key + scale, then:

- preview it live in the browser via Tone.js synthesis,
- simulate adaptive "game state" transitions (`explore` / `unease` / `combat`, plus a one-shot victory flourish) that modulate tempo, density, bass and percussion at bar boundaries,
- export the result three ways: an editable `.canopy.json` project, a standalone Tone.js runtime module (`.score.js`) to drop into a web game, or a `.mid` MIDI sketch for a DAW.

Everything lives in a single-page React app; there is no backend, no server, no database. Projects persist in `localStorage` under the key `canopy-project`. The UI language of the product is English.

## Tech stack

- **React 19** + **TypeScript 5.9** (strict mode), bundled by **Vite 7**
- **Tailwind CSS v4** via the `@tailwindcss/vite` plugin (only `@import "tailwindcss"` in `src/index.css`; nearly all styling is plain CSS custom classes defined there, not utility classes)
- **Tone.js 15** — Web Audio synth engine (PolySynth/MonoSynth/MembraneSynth/NoiseSynth, Reverb, FeedbackDelay, Limiter, Transport)
- **@tonejs/midi** — MIDI export/import
- **framer-motion** — view/tab transitions and layout animations
- **lucide-react** — icons
- **clsx + tailwind-merge** — exposed through the single helper `cn()` in `src/utils/cn.ts`
- `vite-plugin-singlefile` — production build is inlined into **one self-contained HTML file**

## Commands

```bash
npm install        # install dependencies (package-lock.json is committed)
npm run dev        # Vite dev server with HMR
npm run build      # production build → dist/ (single HTML file)
npm run preview    # serve the production build locally
```

There is **no type-check script**. To type-check manually: `npx tsc --noEmit` (the tsconfig already has `"noEmit": true`). Note that `npm run build` alone does *not* fail on TypeScript errors — it only bundles.

## Code organization

Deliberately tiny codebase:

```
index.html            # entry; loads /src/main.tsx
src/
  main.tsx            # React root (StrictMode)
  App.tsx             # ~1070 lines: ALL app logic + all three views
  index.css           # entire visual design system (plain CSS, dark green theme)
  utils/cn.ts         # clsx + tailwind-merge helper
```

Key structure inside `src/App.tsx`:

- **Types**: `Project` (versioned, `version: 1` — the serialized project schema), `AudioEngine`, `AppTab`, `MusicContext`, `TrackId`
- **Music constants**: `NOTE_NAMES`, `KEYS`, `SCALES` (Major/Minor/Dorian/Lydian/Pentatonic interval sets), `PROGRESSIONS` (named chord paths as scale degrees), `TRACKS` (chords/melody/bass/percussion layer metadata), `DEFAULT_PROJECT`
- **Pure music helpers** (module scope, easily testable): `keyToPitchClass`, `midiToNote`, `scaleMidi`, `chordNotes`, `chordLabel`, `hydrateProject` (defensive deserialization with defaults), `safeFileName`
- **Persistence/import-export**: `loadInitialProject` (localStorage, try/catch fallback to defaults), `downloadBlob`, `runtimeModule()` — this last one **generates the standalone exported `.score.js` source as a template string**, embedding the project JSON plus a self-contained vanilla Tone.js player exposing `startScore()`, `stopScore()`, `setGameMusicState({ threat, inCombat })`, `musicEvent("victory")`, `disposeScore()`
- **`App()` component**: holds project state + audio engine in refs (`engineRef`, mirrors like `projectRef`/`contextRef` so the Transport callback reads current values without re-subscribing). Audio graph is built lazily in `initializeAudio()` after `Tone.start()` (browser autoplay policy). The sequencer is a single `transport.scheduleRepeat(..., "8n")` loop over 16 steps.
- **`ParameterSlider`**: small shared presentational component at the bottom of the file.

## Conventions & style

- TypeScript strict mode with `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`; path alias `@/*` → `src/*` (configured in both tsconfig and vite.config).
- Single-file-per-concern style: new features have so far gone into `App.tsx`; if it grows, split views/components into `src/` while keeping pure music theory functions module-scope and side-effect free.
- All styling lives in `src/index.css` using semantic class names (e.g. `.transport-bar`, `.piano-roll`); Tailwind is available but barely used. Match this pattern rather than introducing inline styles or utility-class markup.
- Double quotes, semicolons, trailing commas — match surrounding code; there is no Prettier/ESLint config in the repo.
- Musical logic must respect the "harmony guard" concept: every generated note derives from `scaleMidi(project, degree)` so nothing ever leaves the chosen key/scale. Preserve that invariant when touching melody/composition code.
- Adaptive transitions are queued and applied only on bar boundaries (steps 0 and 8); keep state changes musical, never mid-chord cuts.
- The runtime module emitted by `runtimeModule()` must stay dependency-free except for `tone` and must keep its public API stable (`startScore`, `setGameMusicState`, `musicEvent`, `disposeScore`) because exported files are consumed in users' games.

## Testing

**No tests exist** (no test framework, no CI). If you add tests, place them alongside a runner of your choice and document the command here. Minimum manual verification for changes:

1. `npx tsc --noEmit` passes.
2. `npm run dev`: play/pause/stop works, step highlight advances, context switching (Explore/Unease/Combat) audibly changes tempo/density and applies at bar boundaries.
3. Export each format (JSON project, `.score.js`, MIDI) and re-import the JSON project round-trips correctly.

## Security considerations

- No backend, no network calls, no telemetry; the only I/O is `localStorage` and user-triggered file download/upload.
- Imported JSON is parsed with `JSON.parse` and normalized through `hydrateProject`; keep that normalization when changing the schema, and bump `Project.version` on breaking schema changes.
- Imported MIDI is parsed by `@tonejs/midi` from an ArrayBuffer; malformed input failures surface as toast messages via try/catch — preserve that error handling.
- Do not introduce `dangerouslySetInnerHTML` or evaluate the generated runtime string at runtime; it is only downloaded as a file.

## Deployment

Not configured anywhere in the repo. The practical deploy artifact is `dist/` after `npm run build` — thanks to `vite-plugin-singlefile` it is a single HTML file with everything inlined, so any static host works (or it can be opened from the filesystem). There is no `.gitignore` file currently; be careful not to commit `node_modules/` or `dist/`.
