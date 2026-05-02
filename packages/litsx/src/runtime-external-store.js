function shouldUseServerSnapshot() {
  return typeof window === "undefined";
}

export function readExternalSnapshot(slot) {
  const { getSnapshot, getServerSnapshot } = slot;
  const getter = shouldUseServerSnapshot() && typeof getServerSnapshot === "function"
    ? getServerSnapshot
    : getSnapshot;
  return getter();
}

export function cleanupExternalStoreSlot(slot) {
  if (!slot?.unsubscribe) {
    return;
  }

  try {
    slot.unsubscribe();
  } finally {
    slot.unsubscribe = null;
  }
}

export function createExternalStoreEffect(slot, host) {
  return () => {
    cleanupExternalStoreSlot(slot);

    const latestSnapshot = readExternalSnapshot(slot);
    if (!Object.is(slot.value, latestSnapshot)) {
      slot.value = latestSnapshot;
      host.requestUpdate?.();
    }

    const unsubscribe = slot.subscribe(() => {
      const nextValue = readExternalSnapshot(slot);
      if (!Object.is(slot.value, nextValue)) {
        slot.value = nextValue;
        host.requestUpdate?.();
      }
    });

    slot.unsubscribe = typeof unsubscribe === "function" ? unsubscribe : null;

    return () => {
      cleanupExternalStoreSlot(slot);
    };
  };
}
