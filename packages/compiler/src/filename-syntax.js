export function normalizeLitsxSyntaxFilename(filename) {
  return typeof filename === "string"
    ? filename.split(/[?#]/, 1)[0].toLowerCase()
    : "";
}

export function resolveLitsxRequireJsx(filename, requireJsx) {
  if (typeof requireJsx === "boolean") {
    return requireJsx;
  }

  const normalizedFilename = normalizeLitsxSyntaxFilename(filename);
  if (/\.(?:ts|mts|cts)$/.test(normalizedFilename)) {
    return false;
  }
  if (/\.(?:jsx|tsx|mtsx|ctsx)$/.test(normalizedFilename)) {
    return true;
  }

  return true;
}
