// Timer service: the general one-shot/repeating task queue half of the
// studio's single timing authority. Follows the timerQueue reference pattern
// (see dev/timingUpdate/timerQueue.js): tasks carry an ABSOLUTE fire time,
// cancellation is by flag (never splice mid-iteration), sorting happens
// lazily right before expiry selection, and reschedule() produces the next
// cycle. It is injected-clock driven and Tone/DOM-free.
//
// The host (./index.js) owns the one coarse ticker and calls `fireDue(now)`
// each pass; this module keeps only bookkeeping. Errors in a task are caught
// by the host (per-callback isolation), never here.

export function createTimerService(now) {
  let tasks = [];
  let idCounter = 1;

  function add(task) {
    tasks.push(task);
    return task.id;
  }

  // Remove a task (by id) via flag; it is skipped on the next expiry sweep.
  function remove(id) {
    for (const task of tasks) {
      if (task.id === id) {
        task.cancelled = true;
        return true;
      }
    }
    return false;
  }

  // Return all non-cancelled tasks whose fireTime <= now, in fire-time order,
  // leaving the remaining (future) tasks in the queue. Lazy sort each sweep.
  function fireDue(nowMs) {
    tasks.sort((a, b) => a.fireTime - b.fireTime);
    const due = [];
    const remaining = [];
    for (const task of tasks) {
      if (task.cancelled) continue; // dropped by flag
      if (task.fireTime <= nowMs) due.push(task);
      else remaining.push(task);
    }
    tasks = remaining;
    return due;
  }

  // Schedule fn to run after `delayMs` from the injected clock's now.
  function setTimeout(fn, delayMs) {
    const id = idCounter += 1;
    add({ id, fn, fireTime: now() + delayMs, interval: 0, cancelled: false });
    return id;
  }

  // Schedule fn to repeat every `intervalMs`.
  function setInterval(fn, intervalMs) {
    const id = idCounter += 1;
    add({ id, fn, fireTime: now() + intervalMs, interval: intervalMs, cancelled: false });
    return id;
  }

  // After a task fires, return it re-armed for its next cycle (if repeating)
  // or null (one-shot).
  function reschedule(task) {
    if (task.interval > 0) {
      return { id: task.id, fn: task.fn, fireTime: task.fireTime + task.interval, interval: task.interval, cancelled: false };
    }
    return null;
  }

  // Promise that resolves after `delayMs`.
  function wait(delayMs) {
    return new Promise((resolve) => {
      setTimeout(resolve, delayMs);
    });
  }

  function clear() {
    tasks = [];
  }

  return {
    setTimeout,
    clearTimeout: remove,
    setInterval,
    clearInterval: remove,
    wait,
    fireDue,
    reschedule,
    add,
    clear,
  };
}