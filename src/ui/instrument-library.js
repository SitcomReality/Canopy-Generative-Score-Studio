// Instrument library: create and edit the song's own instruments (v6 data,
// project.instruments). Each custom instrument defines a pitched `voice` (used
// for motif/harmony/bass) and a `percussion` kit. Layers select custom
// instruments from the same instrument picker as the built-in catalog.
import { INSTRUMENT_NAMES } from "../music/instruments.js";

const WAVEFORMS = ["sine", "triangle", "square", "sawtooth", "square8", "triangle8"];
const NOISES = ["white", "pink", "brown"];

export function initInstrumentLibrary(store, actions) {
  const modal = document.getElementById("instrument-modal");
  const root = document.getElementById("instrument-library");
  const openButton = document.getElementById("manage-instruments-button");
  const closeButton = document.getElementById("instrument-modal-close");
  if (!modal || !root || !openButton) return;

  openButton.addEventListener("click", () => { modal.hidden = false; });
  closeButton?.addEventListener("click", () => { modal.hidden = true; });
  modal.addEventListener("click", (event) => { if (event.target === modal) modal.hidden = true; });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) modal.hidden = true;
  });

  root.addEventListener("click", (event) => {
    const remove = event.target.closest("[data-remove-inst]");
    if (remove) {
      actions.removeCustomInstrument(remove.dataset.removeInst);
      return;
    }
    if (event.target.closest("#add-instrument-button")) {
      const name = root.querySelector("#new-instrument-name")?.value.trim() || "New instrument";
      const seed = root.querySelector("#new-instrument-preset")?.value;
      const id = actions.addCustomInstrument(name, seed);
      const nameInput = root.querySelector("#new-instrument-name");
      if (nameInput) nameInput.value = "";
      render(root, store.get().project);
      const card = root.querySelector(`[data-inst="${id}"]`)?.[0] ?? root.querySelector(`.instrument-card[data-inst="${id}"]`);
      if (card) card.scrollIntoView({ block: "nearest" });
      return;
    }
  });

  root.addEventListener("change", (event) => {
    const card = event.target.closest(".instrument-card");
    if (!card) return;
    const id = card.dataset.inst;
    if (event.target.closest("[data-field]")) {
      actions.updateCustomInstrument(id, readInstrument(card));
    }
  });

  store.subscribe((changed) => {
    if (changed.includes("project")) render(root, store.get().project);
  });
  render(root, store.get().project);
}

// Reconstruct a whole custom instrument's { label, voice, percussion } from the
// card's current inputs so a single change commits a consistent object.
function readInstrument(cardEl) {
  const get = (f) => cardEl.querySelector(`[data-field="${f}"]`)?.value ?? "";
  const num = (v, fallback) => (v === "" ? fallback : Number(v));

  const voice = {};
  const family = get("voice.family");
  if (family) voice.voice = family;
  const wf = get("voice.waveform");
  if (wf) voice.oscillator = { type: wf };
  const envelope = {};
  for (const key of ["attack", "decay", "sustain", "release"]) {
    const value = get(`voice.envelope.${key}`);
    if (value !== "") envelope[key] = num(value, 0);
  }
  if (Object.keys(envelope).length) voice.envelope = envelope;
  if (family === "fm") {
    const harmonicity = get("voice.harmonicity");
    const modulationIndex = get("voice.modulationIndex");
    if (harmonicity !== "") voice.harmonicity = num(harmonicity, 0);
    if (modulationIndex !== "") voice.modulationIndex = num(modulationIndex, 0);
  }
  if (family === "pluck") {
    const pluck = {};
    for (const key of ["attackNoise", "dampening", "resonance"]) {
      const value = get(`voice.pluck.${key}`);
      if (value !== "") pluck[key] = num(value, 0);
    }
    if (Object.keys(pluck).length) voice.pluck = pluck;
  }

  const percussion = {};
  const kick = {};
  const kickPitch = get("kick.pitchDecay");
  const kickOctaves = get("kick.octaves");
  const kickDecay = get("kick.decay");
  if (kickPitch !== "") kick.pitchDecay = num(kickPitch, 0.05);
  if (kickOctaves !== "") kick.octaves = num(kickOctaves, 5);
  if (kickDecay !== "") kick.envelope = { attack: 0.001, decay: num(kickDecay, 0.3), sustain: 0, release: 0.2 };
  percussion.kick = kick;
  const hat = { noise: { type: get("hat.noise") || "white" } };
  const hatDecay = get("hat.decay");
  if (hatDecay !== "") hat.envelope = { attack: 0.001, decay: num(hatDecay, 0.06), sustain: 0, release: 0.02 };
  percussion.hat = hat;
  const snareFilter = get("snare.filter");
  if (snareFilter !== "") percussion.snareFilter = num(snareFilter, 1500);
  if (get("kit.snare") === "on") {
    const snare = { noise: { type: get("snare.noise") || "white" } };
    const snareDecay = get("snare.decay");
    if (snareDecay !== "") snare.envelope = { attack: 0.001, decay: num(snareDecay, 0.14), sustain: 0, release: 0.06 };
    percussion.snare = snare;
  }

  const label = get("label") || "New instrument";
  return { label, voice, percussion };
}

function numInput(field, value, step = "any") {
  const v = (value ?? "").toString();
  return `<input type="number" step="${step}" value="${v}" data-field="${field}" />`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function voiceEditor(inst) {
  const voice = inst.voice ?? {};
  const envelope = voice.envelope ?? {};
  const family = voice.voice ?? "";
  const pluck = voice.pluck ?? {};
  return `
    <div class="inst-sub">
      <span class="inst-sub-label">Voice</span>
      <div class="inst-fields">
        <label>Waveform<select data-field="voice.waveform">${WAVEFORMS.map((w) => `<option${voice.oscillator?.type === w ? " selected" : ""}>${w}</option>`).join("")}</select></label>
        <label>Family<select data-field="voice.family">
          <option value=""${family === "" ? " selected" : ""}>Synth</option>
          <option value="fm"${family === "fm" ? " selected" : ""}>FM</option>
          <option value="pluck"${family === "pluck" ? " selected" : ""}>Pluck (acoustic)</option>
        </select></label>
        <label>Attack${numInput("voice.envelope.attack", envelope.attack)}</label>
        <label>Decay${numInput("voice.envelope.decay", envelope.decay)}</label>
        <label>Sustain${numInput("voice.envelope.sustain", envelope.sustain)}</label>
        <label>Release${numInput("voice.envelope.release", envelope.release)}</label>
        ${family === "fm" ? `<label>Harmonicity${numInput("voice.harmonicity", voice.harmonicity)}</label><label>Mod index${numInput("voice.modulationIndex", voice.modulationIndex)}</label>` : ""}
        ${family === "pluck" ? `<label>Attack noise${numInput("voice.pluck.attackNoise", pluck.attackNoise)}</label><label>Dampening${numInput("voice.pluck.dampening", pluck.dampening)}</label><label>Resonance${numInput("voice.pluck.resonance", pluck.resonance)}</label>` : ""}
      </div>
    </div>`;
}

function kitEditor(inst) {
  const kit = inst.percussion ?? {};
  const kick = kit.kick ?? {};
  const hat = kit.hat ?? {};
  const snare = kit.snare;
  return `
    <div class="inst-sub">
      <span class="inst-sub-label">Percussion kit</span>
      <div class="inst-fields">
        <label>Kick pitch-decay${numInput("kick.pitchDecay", kick.pitchDecay)}</label>
        <label>Kick octaves${numInput("kick.octaves", kick.octaves)}</label>
        <label>Kick decay${numInput("kick.decay", kick.envelope?.decay)}</label>
        <label>Hat noise<select data-field="hat.noise">${NOISES.map((n) => `<option${hat.noise?.type === n ? " selected" : ""}>${n}</option>`).join("")}</select></label>
        <label>Hat decay${numInput("hat.decay", hat.envelope?.decay)}</label>
        <label>Hat filter${numInput("hat.filter", kit.hatFilter)}</label>
        <label>Snare<select data-field="kit.snare"><option value=""${snare ? "" : " selected"}>Off</option><option value="on"${snare ? " selected" : ""}>On</option></select></label>
        ${snare ? `<label>Snare noise<select data-field="snare.noise">${NOISES.map((n) => `<option${snare.noise?.type === n ? " selected" : ""}>${n}</option>`).join("")}</select></label><label>Snare decay${numInput("snare.decay", snare.envelope?.decay)}</label><label>Snare filter${numInput("snare.filter", kit.snareFilter)}</label>` : ""}
      </div>
    </div>`;
}

function card(inst) {
  return `
    <div class="instrument-card" data-inst="${inst.id}">
      <div class="inst-head">
        <input class="inst-label" value="${escapeHtml(inst.label)}" data-field="label" title="Instrument name" />
        <button class="fill-remove" data-remove-inst="${inst.id}" aria-label="Delete instrument"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
      </div>
      ${voiceEditor(inst)}
      ${kitEditor(inst)}
    </div>`;
}

function render(root, project) {
  const instruments = project.instruments ?? {};
  const ids = Object.keys(instruments);
  root.innerHTML = `
    <div class="inst-add">
      <input id="new-instrument-name" type="text" placeholder="New instrument name" />
      <select id="new-instrument-preset" title="Clone a built-in preset to start from">
        <option value="">Blank pluck</option>
        ${INSTRUMENT_NAMES.map((name) => `<option value="${name}">Clone ${name}</option>`).join("")}
      </select>
      <button class="event-button" id="add-instrument-button">+ Add instrument</button>
    </div>
    <div class="inst-list">
      ${ids.length === 0 ? `<p class="inst-empty">No custom instruments yet — the song uses the built-in presets. Add one to define your own sound.</p>` : ids.map((id) => card({ ...instruments[id], id })).join("")}
    </div>`;
}
