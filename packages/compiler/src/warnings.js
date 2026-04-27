function normalizeLocationNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function normalizeLitsxWarning(warning, context = {}) {
  const normalized = warning && typeof warning === "object" ? { ...warning } : {};

  normalized.code = typeof normalized.code === "string" && normalized.code !== "" ? normalized.code : null;
  normalized.message =
    typeof normalized.message === "string" && normalized.message !== ""
      ? normalized.message
      : "LitSX emitted a warning during compilation.";
  normalized.filename =
    typeof normalized.filename === "string" && normalized.filename !== ""
      ? normalized.filename
      : typeof context.filename === "string" && context.filename !== ""
        ? context.filename
        : null;
  normalized.line = normalizeLocationNumber(normalized.line);
  normalized.column = normalizeLocationNumber(normalized.column);
  normalized.attributeName =
    typeof normalized.attributeName === "string" && normalized.attributeName !== ""
      ? normalized.attributeName
      : null;
  normalized.tagName =
    typeof normalized.tagName === "string" && normalized.tagName !== ""
      ? normalized.tagName
      : null;
  normalized.propName =
    typeof normalized.propName === "string" && normalized.propName !== ""
      ? normalized.propName
      : null;

  return normalized;
}

export function mergeLitsxWarnings(existingWarnings = [], additionalWarnings = [], context = {}) {
  const merged = [];
  const seen = new Set();

  for (const rawWarning of [...existingWarnings, ...additionalWarnings]) {
    const warning = normalizeLitsxWarning(rawWarning, context);
    const key = [
      warning.code ?? "",
      warning.attributeName ?? "",
      warning.tagName ?? "",
      warning.propName ?? "",
      warning.line ?? "",
      warning.column ?? "",
      warning.message ?? "",
    ].join(":");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    merged.push(warning);
  }

  return merged;
}
