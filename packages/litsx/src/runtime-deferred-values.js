import { Priority } from "./runtime-priority-scheduler.js";

export function resolveDeferredValue(controller, value, options) {
  const index = controller.deferredCursor || 0;
  controller.deferredCursor = index + 1;
  let slot = controller.deferredValues[index];

  if (!slot) {
    slot = controller.deferredValues[index] = {
      source: value,
      current: value,
      pending: false,
      timer: null,
      version: 0,
      options: null,
    };
    return slot;
  }

  const hasChanged = !Object.is(slot.source, value);
  slot.options = options || null;

  if (hasChanged) {
    slot.source = value;
    slot.version += 1;
    scheduleDeferredFlush(controller, slot);
  }

  return slot;
}

export function scheduleDeferredFlush(controller, slot) {
  if (slot.timer != null) {
    clearTimeout(slot.timer);
    slot.timer = null;
  }

  const timeout =
    slot.options && typeof slot.options.timeout === "number"
      ? Math.max(0, slot.options.timeout)
      : 0;

  const token = slot.version;
  slot.pending = true;

  slot.timer = setTimeout(() => {
    slot.timer = null;
    if (slot.version !== token) {
      return;
    }
    slot.current = slot.source;
    slot.pending = false;
    controller.priorityQueue.enqueue({
      priority: Priority.TRANSITION,
      flush: () => controller.host?.requestUpdate?.(),
    });
  }, timeout);
}

export function clearDeferredValues(controller) {
  if (!controller.deferredValues?.length) return;
  for (const slot of controller.deferredValues) {
    if (!slot) continue;
    if (slot.timer != null) {
      clearTimeout(slot.timer);
      slot.timer = null;
    }
    slot.pending = false;
  }
}
