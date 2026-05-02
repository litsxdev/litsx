import * as babelParser from "@babel/parser";
import {
  getLitsxVirtualizationMetadata,
  parseWithLitsxVirtualization,
} from "@litsx/jsx-authoring/parser";

export { getLitsxVirtualizationMetadata };

export function parse(code, options) {
  return parseWithLitsxVirtualization(babelParser.parse, code, options);
}

export function parseExpression(code, options) {
  return parseWithLitsxVirtualization(babelParser.parseExpression, code, options);
}

export const tokTypes = babelParser.tokTypes;

const parserApi = {
  getLitsxVirtualizationMetadata,
  parse,
  parseExpression,
  tokTypes,
};

export default parserApi;
