"use strict";

let moduleNamespace;

try {
  moduleNamespace = require("./dist/index.cjs");
} catch {
  moduleNamespace = require("./src/index.js");
}

module.exports = moduleNamespace.default;
