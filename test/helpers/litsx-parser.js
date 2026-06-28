import * as babelParser from "@babel/parser";
import {
  getLitsxVirtualizationMetadata,
  parseWithLitsxVirtualization,
} from "../../packages/authoring/src/parser.js";

export { getLitsxVirtualizationMetadata };

export function parse(code, options) {
  return parseWithLitsxVirtualization(babelParser.parse, code, options);
}

export function parseExpression(code, options) {
  return parseWithLitsxVirtualization(babelParser.parseExpression, code, options);
}

export const tokTypes = babelParser.tokTypes;

export default {
  getLitsxVirtualizationMetadata,
  parse,
  parseExpression,
  tokTypes,
};
