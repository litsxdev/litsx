import { haveDepsChanged, shouldRerunRecord } from "./runtime-deps.js";
import { runCleanup } from "./runtime-cleanup.js";

export function registerEffect(controller, callback, deps, layout) {
  const index = controller.cursor;
  const nextDeps = Array.isArray(deps) ? deps.slice() : null;
  let record = controller.effects[index];

  if (!record) {
    record = controller.effects[index] = {
      callback,
      deps: nextDeps,
      cleanup: undefined,
      hasRun: false,
      layout,
      needsRun: true,
    };
  } else {
    const prevDeps = record.deps;
    const prevHasRun = record.hasRun;
    record.callback = callback;
    record.layout = layout;
    record.needsRun = shouldRerunRecord(
      { deps: prevDeps, hasRun: prevHasRun },
      nextDeps
    );
    record.deps = nextDeps;
    if (record.needsRun) {
      record.hasRun = false;
    }
  }

  controller.cursor = index + 1;
  return index;
}

export function registerConnectedEffect(controller, callback, deps) {
  const index = controller.connectedCursor;
  const nextDeps = Array.isArray(deps) ? deps.slice() : [];
  let record = controller.connectedEffects[index];

  if (!record) {
    record = controller.connectedEffects[index] = {
      callback,
      deps: nextDeps,
      cleanup: undefined,
      active: false,
      needsRun: true,
    };
  } else {
    const prevDeps = record.deps;
    record.callback = callback;
    record.needsRun = !record.active || haveDepsChanged(prevDeps, nextDeps);
    record.deps = nextDeps;
  }

  controller.connectedCursor = index + 1;
  return index;
}

export function buildEffectQueues(controller) {
  const count = Math.min(controller.effects.length, controller.cursor);
  const layoutQueue = [];
  const passiveQueue = [];

  for (let index = 0; index < count; index += 1) {
    const record = controller.effects[index];
    if (!record) continue;
    const shouldRun = record.needsRun || !record.hasRun || record.deps === null;
    if (!shouldRun) continue;
    (record.layout ? layoutQueue : passiveQueue).push(record);
  }

  if (controller.effects.length > count) {
    for (let index = count; index < controller.effects.length; index += 1) {
      runCleanup(controller.effects[index], controller.host);
    }
    controller.effects.length = count;
  }

  controller.layoutQueue = layoutQueue;
  controller.passiveQueue = passiveQueue;
  controller.cursor = 0;
}

export function finalizeConnectedEffects(controller) {
  const count = Math.min(
    controller.connectedEffects.length,
    controller.connectedCursor
  );

  if (controller.connectedEffects.length > count) {
    for (let index = count; index < controller.connectedEffects.length; index += 1) {
      const record = controller.connectedEffects[index];
      if (record?.active) {
        runCleanup(record, controller.host);
      }
    }
    controller.connectedEffects.length = count;
  }

  controller.connectedCursor = 0;
}

export function runEffectQueue(controller, queue) {
  for (const record of queue) {
    runCleanup(record, controller.host);
    const cleanup = record.callback.call(controller.host);
    record.cleanup = typeof cleanup === "function" ? cleanup : undefined;
    record.hasRun = true;
    record.needsRun = false;
  }
}

export function runConnectedEffects(controller, force = false) {
  for (const record of controller.connectedEffects) {
    if (!record) continue;
    const shouldRun = force || record.needsRun || !record.active;
    if (!shouldRun) continue;

    runCleanup(record, controller.host);

    const cleanup = record.callback.call(controller.host);
    record.cleanup = typeof cleanup === "function" ? cleanup : undefined;
    record.active = true;
    record.needsRun = false;
  }
}

export function cleanupDisconnectedEffects(controller) {
  for (const record of controller.effects) {
    runCleanup(record, controller.host);
    if (record) record.hasRun = false;
  }

  for (const record of controller.connectedEffects) {
    if (record?.active) {
      runCleanup(record, controller.host);
    }
    if (record) {
      record.active = false;
      record.needsRun = true;
    }
  }
}

export function resetAdoptedConnectedEffects(controller) {
  for (const record of controller.connectedEffects) {
    if (record?.active) {
      runCleanup(record, controller.host);
    }
    if (record) {
      record.active = false;
      record.needsRun = true;
    }
  }
}
