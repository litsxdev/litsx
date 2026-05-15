let globalIdCounter = 0;

export function createStableId() {
  globalIdCounter += 1;
  return `litsx-${globalIdCounter}`;
}
