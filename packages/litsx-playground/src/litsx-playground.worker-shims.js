export function installLitsxPlaygroundWorkerShims(scope = globalThis) {
  if (!scope.process) {
    scope.process = {
      env: {},
      argv: [],
      versions: {
        node: "20.0.0",
      },
      platform: "browser",
      browser: true,
      cwd() {
        return "/";
      },
      emitWarning() {},
    };
  }

  if (!scope.global) {
    scope.global = scope;
  }

  return scope;
}

installLitsxPlaygroundWorkerShims();
