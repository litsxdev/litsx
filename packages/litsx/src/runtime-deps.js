export function normalizeDeps(deps) {
  if (Array.isArray(deps)) {
    return deps.slice();
  }
  return deps ?? undefined;
}

export function haveDepsChanged(prev, next) {
  if (!Array.isArray(prev) || !Array.isArray(next)) {
    return true;
  }
  if (prev.length !== next.length) {
    return true;
  }
  for (let index = 0; index < prev.length; index += 1) {
    if (!Object.is(prev[index], next[index])) {
      return true;
    }
  }
  return false;
}

export function shouldRerunRecord(record, nextDeps) {
  if (nextDeps === null) {
    return true;
  }
  if (!record.hasRun || !Array.isArray(record.deps)) {
    return true;
  }
  return haveDepsChanged(record.deps, nextDeps);
}
