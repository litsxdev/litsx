export function normalizeStableIdentityPath(value) {
  return String(value || "").replace(/\\/g, "/");
}

export function hashStableIdentity(value) {
  let hash = 2166136261;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function buildStableIdentitySeed(pathLike, state) {
  const filename =
    state.file?.opts?.sourceFileName ||
    state.file?.opts?.filename ||
    state.filename ||
    "";
  const normalizedFilename = normalizeStableIdentityPath(filename);
  const loc = pathLike.node?.loc?.start ?? null;
  const start = typeof pathLike.node?.start === "number"
    ? pathLike.node.start
    : 0;
  const line = loc?.line ?? 0;
  const column = loc?.column ?? 0;
  return `${normalizedFilename}:${line}:${column}:${start}`;
}

export function createStableIdentity(prefix, pathLike, state) {
  const seed = buildStableIdentitySeed(pathLike, state);
  return `${prefix}${hashStableIdentity(seed)}`;
}
