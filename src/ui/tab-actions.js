// Main-tab switching: swaps the compose/runtime views and drives the tab
// buttons' active state plus the one-shot view entrance animation.
export function createTabActions(store) {
  return {
    setTab(tab) {
      store.set({ tab });
      ["compose", "runtime"].forEach((id) => {
        const view = document.getElementById(`view-${id}`);
        const active = id === tab;
        view.hidden = !active;
        document.querySelectorAll("#main-tabs .main-tab").forEach((button) => {
          button.classList.toggle("active", button.dataset.tab === tab);
        });
        if (active && !view.dataset.entered) {
          view.dataset.entered = "true";
          view.classList.add("view-enter");
          view.addEventListener("animationend", () => view.classList.remove("view-enter"), { once: true });
        }
      });
    },
  };
}
