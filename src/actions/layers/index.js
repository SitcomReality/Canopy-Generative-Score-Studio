// Assembles the layer action API from its single-concern parts. The public
// shape is unchanged: one createLayerActions(store, host) factory.
import { createStepEditingActions } from "./step-editing.js";
import { createComposeActions } from "./compose.js";
import { createLifecycleActions } from "./lifecycle.js";
import { createSoundActions } from "./sound.js";
import { createReactiveActions } from "./reactive.js";

export function createLayerActions(store, host) {
  return {
    ...createStepEditingActions(store, host),
    ...createComposeActions(store, host),
    ...createLifecycleActions(store, host),
    ...createSoundActions(store, host),
    ...createReactiveActions(store),
  };
}
