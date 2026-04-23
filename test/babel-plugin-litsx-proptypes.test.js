import assert from "assert";
import babelCore from "@babel/core";
import parser from "../packages/babel-parser-litsx/src/index.mjs";
import { beforeAll } from "vitest";
import { interopDefault } from "./helpers/interop-default.js";

const { transformFromAstSync } = babelCore;
let plugin;

beforeAll(async () => {
  const mod = await import("../packages/babel-plugin-litsx-proptypes/src/index.js");
  plugin = interopDefault(mod);
});

function run(source, parserPlugins = []) {
  const inputAst = parser.parse(source, { sourceType: "module", plugins: parserPlugins });
  return transformFromAstSync(inputAst, source, {
    configFile: false,
    babelrc: false,
    plugins: [plugin],
    generatorOpts: { decoratorsBeforeExport: true },
  }).code;
}

describe("@litsx/babel-plugin-litsx-proptypes", function () {
  it("emits compat hoists instead of static properties", () => {
    const source = `
      import PropTypes from "prop-types";

      export const FancyButton = ({ label, disabled, onClick }) => {
        return <button disabled={disabled} @click={onClick}>{label}</button>;
      };

      FancyButton.propTypes = {
        label: PropTypes.string,
        disabled: PropTypes.bool,
        onClick: PropTypes.func,
      };
    `;

    const code = run(source);

    assert.match(code, /__litsx_static_properties\(\{/);
    assert.match(code, /label: \{\s*type: String\s*\}/);
    assert.match(code, /disabled: \{\s*type: Boolean\s*\}/);
    assert.match(code, /onClick: \{\s*type: Object,\s*attribute: false\s*\}/);
    assert.doesNotMatch(code, /static properties =/);
    assert.doesNotMatch(code, /PropTypes/);
  });

  it("uses runtime helpers for structured and validated React propTypes", () => {
    const source = `
      import PropTypes from "prop-types";

      export function DashboardPanel(props) {
        return <section>{props.title}</section>;
      }

      DashboardPanel.propTypes = {
        title: PropTypes.string.isRequired,
        status: PropTypes.oneOf(["idle", "busy"]),
        payload: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
        tags: PropTypes.arrayOf(PropTypes.string),
        metadata: PropTypes.shape({
          slug: PropTypes.string.isRequired,
          count: PropTypes.number,
        }),
        strictMeta: PropTypes.exact({
          title: PropTypes.string,
        }),
      };
    `;

    const code = run(source);

    assert.match(code, /import \{[^}]*required[^}]*oneOf[^}]*oneOfType[^}]*arrayOf[^}]*shape[^}]*exact[^}]*\} from "@litsx\/prop-types\/runtime"|import \{[^}]*exact[^}]*shape[^}]*arrayOf[^}]*oneOfType[^}]*oneOf[^}]*required[^}]*\} from "@litsx\/prop-types\/runtime"/);
    assert.match(code, /title: \{\s*type: String,\s*\.\.\.[A-Za-z0-9_]+\(\)\s*\}/);
    assert.match(code, /status: \{\s*type: String,\s*\.\.\.[A-Za-z0-9_]+\(\["idle", "busy"\]\)\s*\}/);
    assert.match(code, /payload: \{\s*type: Object,\s*\.\.\.[A-Za-z0-9_]+\(\[String, Number\]\)\s*\}/);
    assert.match(code, /tags: \{\s*type: Array,\s*\.\.\.[A-Za-z0-9_]+\((String|[A-Za-z0-9_]+\(String\))\)\s*\}/);
    assert.match(code, /metadata: \{\s*type: Object,\s*attribute: false,\s*\.\.\.[A-Za-z0-9_]+\(\{\s*slug: [A-Za-z0-9_]+\(String\),\s*count: Number\s*\}\)\s*\}/s);
    assert.match(code, /strictMeta: \{\s*type: Object,\s*attribute: false,\s*\.\.\.[A-Za-z0-9_]+\(\{\s*title: String\s*\}\)\s*\}/s);
  });

  it("merges generated compat metadata into existing authored ^properties hoists", () => {
    const source = `
      import PropTypes from "prop-types";

      export function SearchCard(props) {
        ^properties({
          title: { reflect: true },
          onSelect: { attribute: false },
        });

        return <article>{props.title}</article>;
      }

      SearchCard.propTypes = {
        title: PropTypes.string,
        onSelect: PropTypes.func,
      };
    `;

    const code = run(source);

    const hoistMatches = code.match(/__litsx_static_properties\(/g) || [];
    assert.strictEqual(hoistMatches.length, 1);
    assert.match(code, /title: \{\s*\.\.\.\{\s*type: String\s*\},\s*reflect: true\s*\}/s);
    assert.match(code, /onSelect: \{\s*\.\.\.\{\s*type: Object,\s*attribute: false\s*\},\s*attribute: false\s*\}/s);
  });

  it("supports wrapper-style function components by injecting into the inner function body", () => {
    const source = `
      import React, { forwardRef, memo } from "react";
      import PropTypes from "prop-types";

      export const CardShell = memo(
        forwardRef(function CardShell({ title }, ref) {
          return <label ref={ref}>{title}</label>;
        })
      );

      CardShell.propTypes = {
        title: PropTypes.string,
      };
    `;

    const code = run(source);

    assert.match(code, /forwardRef\(function CardShell\(\{\s*title\s*\}, ref\) \{\s*__litsx_static_properties\(\{\s*title: \{\s*type: String\s*\}\s*\}\);/s);
  });

  it("rejects unsupported custom validators", () => {
    const source = `
      import PropTypes from "prop-types";

      export function Card(props) {
        return <article>{props.title}</article>;
      }

      Card.propTypes = {
        title(props) {
          return props.title ? null : new Error("missing");
        },
      };
    `;

    const inputAst = parser.parse(source, { sourceType: "module" });

    assert.throws(() => {
      transformFromAstSync(inputAst, source, {
        configFile: false,
        babelrc: false,
        plugins: [plugin],
      });
    }, /Custom propTypes validators are not supported yet/);
  });
});
