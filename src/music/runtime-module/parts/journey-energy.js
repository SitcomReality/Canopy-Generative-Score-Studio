// Emitted-source part: the local copy of journeyEnergy — supplies the one
// function the spliced dynamics core imports from variation.js.
export const JOURNEY_ENERGY_SRC = `// supply the one function dynamics.js imports from variation.js
function journeyEnergy(shape, depth, bar, length) {
  const span = Math.max(4, Math.round(length));
  const phase = (((bar % span) + span) % span) / span;
  let raw;
  if (shape === "arc") raw = phase < 0.5 ? phase * 2 : (1 - phase) * 2;
  else if (shape === "tide") raw = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);
  else return 0.5;
  return 0.5 + (raw - 0.5) * (Math.max(0, Math.min(100, depth)) / 100);
}`;
