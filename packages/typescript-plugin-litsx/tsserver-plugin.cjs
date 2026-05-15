"use strict";

const canonicalInit = require("@litsx/typescript");
let warned = false;

function warn(logger) {
  if (warned || process.env.LITSX_DISABLE_DEPRECATION_WARNINGS === "1") return;
  warned = true;
  const message = "[@litsx/typescript-plugin] This package name is deprecated. Use @litsx/typescript instead.";
  if (logger && typeof logger.info === "function") {
    logger.info(message);
  } else {
    console.warn(message);
  }
}

module.exports = function init(modules) {
  const plugin = canonicalInit(modules);
  return {
    ...plugin,
    create(info) {
      warn(info && info.project && info.project.projectService && info.project.projectService.logger);
      return plugin.create(info);
    },
  };
};
