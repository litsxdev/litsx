import assert from "assert";
import babelCore from "@babel/core";
import parser from "../packages/babel-parser-litsx/src/index.js";
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

  it("supports namespace imports, string keys, objectOf, and instanceOf helpers", () => {
    const source = `
      import * as PropTypes from "prop-types";

      export default function Card({ title, createdAt, model, flags, "cta-label": ctaLabel, 1: priority }) {
        return <article>{title}{createdAt}{String(model)}{String(flags)}{ctaLabel}{priority}</article>;
      }

      Card.propTypes = {
        title: PropTypes.string,
        createdAt: PropTypes.instanceOf(Date),
        model: PropTypes.instanceOf(Model),
        flags: PropTypes.objectOf(PropTypes.bool),
        "cta-label": PropTypes.string,
        1: PropTypes.number,
      };
    `;

    const code = run(source);

    assert.match(code, /import \{[^}]*objectOf[^}]*instanceOf[^}]*\} from "@litsx\/prop-types\/runtime"|import \{[^}]*instanceOf[^}]*objectOf[^}]*\} from "@litsx\/prop-types\/runtime"/);
    assert.match(code, /createdAt: \{\s*type: Date\s*\}/);
    assert.match(code, /model: \{\s*type: Model,\s*\.\.\.[A-Za-z0-9_]+\(Model\)\s*\}/);
    assert.match(code, /flags: \{\s*type: Object,\s*attribute: false,\s*\.\.\.[A-Za-z0-9_]+\(Boolean\)\s*\}/);
    assert.match(code, /"cta-label": \{\s*type: String\s*\}/);
    assert.match(code, /"1": \{\s*type: Number\s*\}/);
  });

  it("supports boolean aliases and required runtime helpers on collection validators", () => {
    const source = `
      import PropTypes from "prop-types";

      export function Card(props) {
        return <article>{String(props.flags)}{String(props.model)}{String(props.ready)}</article>;
      }

      Card.propTypes = {
        ready: PropTypes.boolean.isRequired,
        flags: PropTypes.objectOf(PropTypes.bool).isRequired,
        model: PropTypes.instanceOf(Model).isRequired,
      };
    `;

    const code = run(source);

    assert.match(code, /import \{[^}]*required[^}]*objectOf[^}]*instanceOf[^}]*\} from "@litsx\/prop-types\/runtime"|import \{[^}]*instanceOf[^}]*objectOf[^}]*required[^}]*\} from "@litsx\/prop-types\/runtime"/);
    assert.match(code, /ready: \{\s*type: Boolean,\s*\.\.\.[A-Za-z0-9_]+\(\)\s*\}/);
    assert.match(code, /flags: \{\s*type: Object,\s*attribute: false,\s*\.\.\.[A-Za-z0-9_]+\(Boolean\),\s*\.\.\.[A-Za-z0-9_]+\(\)\s*\}/);
    assert.match(code, /model: \{\s*type: Model,\s*\.\.\.[A-Za-z0-9_]+\(Model\),\s*\.\.\.[A-Za-z0-9_]+\(\)\s*\}/);
  });

  it("keeps the prop-types import when the authored code still references it elsewhere", () => {
    const source = `
      import PropTypes from "prop-types";

      export function Card(props) {
        return <article data-kind={typeof PropTypes}>{props.title}</article>;
      }

      Card.propTypes = {
        title: PropTypes.string,
      };
    `;

    const code = run(source);

    assert.match(code, /import PropTypes from "prop-types";/);
    assert.match(code, /__litsx_static_properties\(\{\s*title: \{\s*type: String\s*\}\s*\}\);/);
  });

  it("supports expression-bodied arrow components by converting the body before injecting hoists", () => {
    const source = `
      import PropTypes from "prop-types";

      const Panel = ({ title }) => <article>{title}</article>;
      Panel.propTypes = {
        title: PropTypes.string,
      };
    `;

    const code = run(source);

    assert.match(code, /const Panel = \(\{\s*title\s*\}\) => \{\s*__litsx_static_properties\(\{\s*title: \{\s*type: String\s*\}\s*\}\);/s);
    assert.match(code, /return <article>\{title\}<\/article>;/);
  });

  it("rejects unsupported prop-types helpers and non-plain shape members", () => {
    const unsupportedHelperSource = `
      import PropTypes from "prop-types";

      export function Card(props) {
        return <article>{props.title}</article>;
      }

      Card.propTypes = {
        title: PropTypes.unknownHelper("x"),
      };
    `;

    const invalidShapeSource = `
      import PropTypes from "prop-types";

      export function Card(props) {
        return <article>{props.title}</article>;
      }

      Card.propTypes = {
        title: PropTypes.shape({
          ...extra,
        }),
      };
    `;

    const invalidStaticKeySource = `
      import PropTypes from "prop-types";

      export function Card(props) {
        return <article>{props.title}</article>;
      }

      Card.propTypes = {
        title: PropTypes.shape({
          [dynamic()]: PropTypes.string,
        }),
      };
    `;

    const missingInstanceSource = `
      import PropTypes from "prop-types";

      export function Card(props) {
        return <article>{props.title}</article>;
      }

      Card.propTypes = {
        title: PropTypes.instanceOf(),
      };
    `;

    assert.throws(() => run(unsupportedHelperSource), /Unsupported React prop-types helper/);
    assert.throws(() => run(invalidShapeSource), /only accepts plain object members/);
    assert.throws(() => run(invalidStaticKeySource), /only accepts static property names/);
    assert.throws(() => run(missingInstanceSource), /expects a constructor/);
  });

  it("merges explicit hoist spreads and extra authored properties with generated descriptors", () => {
    const source = `
      import PropTypes from "prop-types";

      export function SearchCard(props) {
        ^properties({
          ...sharedProperties,
          subtitle: { reflect: true },
          title: { reflect: true },
        });

        return <article>{props.title}</article>;
      }

      SearchCard.propTypes = {
        title: PropTypes.string,
        onSelect: PropTypes.func,
      };
    `;

    const code = run(source);

    assert.match(code, /__litsx_static_properties\(\{\s*title: \{\s*\.\.\.\{\s*type: String\s*\},\s*reflect: true\s*\},\s*onSelect: \{\s*type: Object,\s*attribute: false\s*\},\s*\.\.\.sharedProperties,\s*subtitle: \{\s*reflect: true\s*\}\s*\}\)/s);
  });

  it("supports empty and non-plain helper arguments with defaulted runtime descriptors", () => {
    const source = `
      import PT from "prop-types";

      export function Card(props) {
        return <article>{props.mode}{props.choice}{String(props.loose)}{String(props.strict)}</article>;
      }

      Card.propTypes = {
        mode: PT.oneOf(),
        choice: PT.oneOfType(PT.string),
        loose: PT.shape(),
        strict: PT.exact(null),
      };
    `;

    const code = run(source);

    assert.match(code, /import \{[^}]*oneOf[^}]*oneOfType[^}]*shape[^}]*exact[^}]*\} from "@litsx\/prop-types\/runtime"|import \{[^}]*exact[^}]*shape[^}]*oneOfType[^}]*oneOf[^}]*\} from "@litsx\/prop-types\/runtime"/);
    assert.match(code, /mode: \{\s*type: Object,\s*\.\.\.[A-Za-z0-9_]+\(\[\]\)\s*\}/);
    assert.match(code, /choice: \{\s*type: Object,\s*\.\.\.[A-Za-z0-9_]+\(\[\]\)\s*\}/);
    assert.match(code, /loose: \{\s*type: Object,\s*attribute: false,\s*\.\.\.[A-Za-z0-9_]+\(\{\}\)\s*\}/);
    assert.match(code, /strict: \{\s*type: Object,\s*attribute: false,\s*\.\.\.[A-Za-z0-9_]+\(\{\}\)\s*\}/);
  });

  it("infers oneOf primitive types and falls back to Object for mixed or sparse values", () => {
    const source = `
      import PropTypes from "prop-types";

      export function Card(props) {
        return <article>{props.level}{String(props.ready)}{props.mixed}</article>;
      }

      Card.propTypes = {
        level: PropTypes.oneOf([1, 2, 3]),
        ready: PropTypes.oneOf([true, false]),
        mixed: PropTypes.oneOf([1, maybeValue, , false]),
      };
    `;

    const code = run(source);

    assert.match(code, /level: \{\s*type: Number,\s*\.\.\.[A-Za-z0-9_]+\(\[1, 2, 3\]\)\s*\}/);
    assert.match(code, /ready: \{\s*type: Boolean,\s*\.\.\.[A-Za-z0-9_]+\(\[true, false\]\)\s*\}/);
    assert.match(code, /mixed: \{\s*type: Object,\s*\.\.\.[A-Za-z0-9_]+\(\[1, maybeValue,, false\]\)\s*\}/);
  });

  it("overrides non-object authored property descriptors and preserves dynamic hoist members", () => {
    const source = `
      import PropTypes from "prop-types";

      export function SearchCard(props) {
        ^properties({
          title: forwardedTitle,
          [dynamicKey]: runtimeDescriptor,
        });

        return <article>{props.title}</article>;
      }

      SearchCard.propTypes = {
        title: PropTypes.string,
      };
    `;

    const code = run(source);

    assert.match(code, /__litsx_static_properties\(\{\s*title: forwardedTitle,\s*\[dynamicKey\]: runtimeDescriptor\s*\}\)/s);
  });

  it("ignores malformed or non-component propTypes assignments while transforming valid ones", () => {
    const source = `
      import PropTypes from "prop-types";

      const config = {};
      config.propTypes = {
        title: PropTypes.string,
      };

      const NonComponent = 1;
      NonComponent.propTypes = {
        title: PropTypes.string,
      };

      function RealCard(props) {
        return <article>{props.title}</article>;
      }

      RealCard["propTypes"] = {
        title: PropTypes.number,
      };

      RealCard.propTypes = {
        title: PropTypes.string,
      };
    `;

    const code = run(source);

    assert.match(code, /config\.propTypes = \{\s*title: PropTypes\.string\s*\};/);
    assert.match(code, /NonComponent\.propTypes = \{\s*title: PropTypes\.string\s*\};/);
    assert.match(code, /RealCard\["propTypes"\] = \{\s*title: PropTypes\.number\s*\};/);
    assert.match(code, /__litsx_static_properties\(\{\s*title: \{\s*type: String\s*\}\s*\}\);/);
  });

  it("supports default-import aliases and rejects non-prop-types member expressions", () => {
    const source = `
      import PT from "prop-types";

      export function Card(props) {
        return <article>{props.title}</article>;
      }

      Card.propTypes = {
        title: PT.string,
      };
    `;

    const invalidSource = `
      import PropTypes from "prop-types";

      export function Card(props) {
        return <article>{props.title}</article>;
      }

      Card.propTypes = {
        title: Validators.string,
      };
    `;

    const code = run(source);

    assert.match(code, /__litsx_static_properties\(\{\s*title: \{\s*type: String\s*\}\s*\}\);/);
    assert.throws(() => run(invalidSource), /Unsupported propTypes expression/);
  });

  it("covers nested runtime validator helpers and Object fallbacks for mixed primitive enums", () => {
    const source = `
      import PropTypes from "prop-types";

      export function Card(props) {
        return <article>{String(props.variant)}{String(props.items)}{String(props.meta)}{String(props.fallback)}</article>;
      }

      Card.propTypes = {
        variant: PropTypes.oneOf([1, true]),
        items: PropTypes.arrayOf(PropTypes.oneOfType(PropTypes.string)),
        meta: PropTypes.objectOf(
          PropTypes.shape({
            "created-at": PropTypes.instanceOf(Date),
          })
        ),
        fallback: PropTypes.unknownThing,
      };
    `;

    const code = run(source);

    assert.match(code, /variant: \{\s*type: Object,\s*\.\.\.[A-Za-z0-9_]+\(\[1, true\]\)\s*\}/);
    assert.match(code, /items: \{\s*type: Array,\s*\.\.\.[A-Za-z0-9_]+\([A-Za-z0-9_]+\(\[\]\)\)\s*\}/);
    assert.match(code, /meta: \{\s*type: Object,\s*attribute: false,\s*\.\.\.[A-Za-z0-9_]+\([A-Za-z0-9_]+\(\{\s*"created-at": Date\s*\}\)\)\s*\}/s);
    assert.match(code, /fallback: \{\s*type: Object\s*\}/);
  });

  it("skips non-static top-level prop keys and leaves files without prop-types imports alone", () => {
    const transformedSource = `
      import PropTypes from "prop-types";

      export function Card(props) {
        return <article>{props.title}</article>;
      }

      Card.propTypes = {
        [dynamicKey()]: PropTypes.string,
        title: PropTypes.string,
      };
    `;

    const untouchedSource = `
      function Card(props) {
        return <article>{props.title}</article>;
      }

      Missing.propTypes = {
        title: validator.string,
      };

      const Wrapped = forwardRef();
      Wrapped.propTypes = {
        title: validator.string,
      };
    `;

    const transformedCode = run(transformedSource);
    const untouchedCode = run(untouchedSource);

    assert.match(transformedCode, /__litsx_static_properties\(\{\s*title: \{\s*type: String\s*\}\s*\}\);/);
    assert.doesNotMatch(transformedCode, /dynamicKey/);
    assert.match(untouchedCode, /Missing\.propTypes = \{\s*title: validator\.string\s*\};/);
    assert.match(untouchedCode, /Wrapped\.propTypes = \{\s*title: validator\.string\s*\};/);
    assert.doesNotMatch(untouchedCode, /__litsx_static_properties/);
  });
});
