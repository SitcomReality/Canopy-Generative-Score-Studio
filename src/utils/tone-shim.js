// The exported .score.js does `import * as Tone from "tone"`, which a browser
// cannot resolve natively. The studio page already loads Tone as a UMD global
// (vendor/tone.js), so this builds a tiny blob ES module that re-exports every
// property of that global as a named export (plus a default). A generated
// .score.js blob then swaps its "tone" specifier for this module's URL — no
// bundler or import map needed.
let shimUrl = null;

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export function createToneShimUrl() {
  if (shimUrl) return shimUrl;
  const globalTone = window.Tone;
  if (!globalTone) throw new Error("Tone.js is not loaded (expected the vendored UMD global)");
  const names = Object.keys(globalTone).filter((name) => IDENTIFIER.test(name));
  const source = `const T = window.Tone;
export default T;
${names.map((name) => `export const ${name} = T[${JSON.stringify(name)}];`).join("\n")}`;
  shimUrl = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
  return shimUrl;
}
