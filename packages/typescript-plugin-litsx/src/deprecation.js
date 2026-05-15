function shouldWarn() {
  return globalThis.process?.env?.LITSX_DISABLE_DEPRECATION_WARNINGS !== "1";
}

let warned = false;

export function warnDeprecatedTypescriptPlugin(logger) {
  if (warned || !shouldWarn()) {
    return;
  }
  warned = true;
  const message = "[@litsx/typescript-plugin] This package name is deprecated. Use @litsx/typescript instead.";
  if (logger && typeof logger.info === "function") {
    logger.info(message);
  } else {
    console.warn(message);
  }
}
