import {
  ensureLitsxParserPlugins,
  prepareLitsxAuthoredInput,
} from "../../compiler/src/authored-input.js";
import { createVirtualLitsxJsxSource } from "../../jsx-authoring/src/index.js";
import { PLAYGROUND_TYPE_FILES } from "./virtual-types.js";
const BABEL_STANDALONE_CDN_URL = "https://esm.sh/@babel/standalone@7.26.5?bundle";
const TYPESCRIPT_CDN_URL = "https://esm.sh/typescript@5.8.3?bundle";
const PLAYGROUND_MODE_NATIVE = "native";
const PLAYGROUND_MODE_REACT_COMPAT = "react-compat";

let compilerRuntimePromise;
let injectedCompilerRuntime = null;

let pluginsRegistered = false;

function normalizeModule(moduleValue) {
  return moduleValue?.default ?? moduleValue;
}

export function setLitsxPlaygroundCompilerRuntime(runtime) {
  injectedCompilerRuntime = runtime || null;
  compilerRuntimePromise = null;
  pluginsRegistered = false;
}

async function loadCompilerRuntime() {
  if (injectedCompilerRuntime) {
    const { Babel, typescript } = injectedCompilerRuntime;
    const [{ default: nativePreset, setTypescriptModule }, { default: reactCompatPreset }, { default: transformJsxHtmlTemplate }] = await Promise.all([
      import("../../babel-preset-litsx/src/index.js"),
      import("../../babel-preset-react-compat/src/index.js"),
      import("../../babel-plugin-transform-jsx-html-template/src/index.js"),
    ]);

    setTypescriptModule(typescript);

    return {
      Babel,
      parser: Babel.packages.parser,
      presets: {
        nativePreset,
        reactCompatPreset,
      },
      plugins: {
        transformJsxHtmlTemplate,
      },
    };
  }

  const [
    { default: nativePreset, setTypescriptModule },
    BabelStandaloneModule,
    typescriptModule,
    { default: reactCompatPreset },
    { default: transformJsxHtmlTemplate },
  ] = await Promise.all([
    import("../../babel-preset-litsx/src/index.js"),
    import(BABEL_STANDALONE_CDN_URL),
    import(TYPESCRIPT_CDN_URL),
    import("../../babel-preset-react-compat/src/index.js"),
    import("../../babel-plugin-transform-jsx-html-template/src/index.js"),
  ]);

  const Babel = normalizeModule(BabelStandaloneModule);
  setTypescriptModule(typescriptModule);

  return {
    Babel,
    parser: Babel.packages.parser,
    presets: {
      nativePreset,
      reactCompatPreset,
    },
      plugins: {
        transformJsxHtmlTemplate,
      },
    };
}

async function ensureCompilerRuntime() {
  if (!compilerRuntimePromise) {
    compilerRuntimePromise = loadCompilerRuntime();
  }

  return compilerRuntimePromise;
}

function ensureRegisteredPlugins(Babel, runtimePlugins, runtimePresets) {
  if (pluginsRegistered) return;

  Babel.registerPreset("litsx-native", runtimePresets.nativePreset);
  Babel.registerPreset("litsx-react-compat", runtimePresets.reactCompatPreset);
  Babel.registerPlugin("litsx-jsx-html-template", runtimePlugins.transformJsxHtmlTemplate);
  pluginsRegistered = true;
}

function formatEmittedModule(Babel, code, filename) {
  if (!code) return "";

  const result = Babel.transform(code, {
    configFile: false,
    babelrc: false,
    filename,
    sourceMaps: false,
    parserOpts: {
      sourceType: "module",
    },
    generatorOpts: {
      comments: true,
      compact: false,
      concise: false,
      jsescOption: {
        minimal: true,
      },
      retainLines: false,
    },
  });

  return result?.code || code;
}

export async function compileLitsxPlayground(source, options = {}) {
  const {
    Babel,
    parser,
    presets: runtimePresets,
    plugins: runtimePlugins,
  } = await ensureCompilerRuntime();
  ensureRegisteredPlugins(Babel, runtimePlugins, runtimePresets);

  const {
    filename,
    mode = PLAYGROUND_MODE_NATIVE,
    parserPlugins = ["typescript"],
    jsxTemplate = true,
    jsxTemplateOptions = {},
    authoringPlugins = [],
    outputPlugins = [],
  } = options;

  const virtualSource = createVirtualLitsxJsxSource(source);
  const { inputAst } = prepareLitsxAuthoredInput(
    source,
    {
      filename,
      parserPlugins: ensureLitsxParserPlugins(filename, parserPlugins, {
        requireJsx: true,
      }),
      authoringPlugins,
      requireJsx: true,
    },
    {
      parse: parser.parse,
      transformFromAstSync: Babel.transformFromAst,
    }
  );

  const resolvedMode =
    mode === PLAYGROUND_MODE_REACT_COMPAT
      ? PLAYGROUND_MODE_REACT_COMPAT
      : PLAYGROUND_MODE_NATIVE;

  const presets = [];
  const plugins = [];

  if (resolvedMode === PLAYGROUND_MODE_REACT_COMPAT) {
    presets.push([
      "litsx-react-compat",
      {
        jsxTemplate: false,
        transformLitsx: {
          typeResolutionMode: "in-memory",
          inMemoryFiles: PLAYGROUND_TYPE_FILES,
        },
      },
    ]);
  } else {
    presets.push([
      "litsx-native",
      {
        jsxTemplate: false,
        typeResolutionMode: "in-memory",
        inMemoryFiles: PLAYGROUND_TYPE_FILES,
      },
    ]);
  }

  const typescriptPlugin = [
    "transform-typescript",
    {
      isTSX: true,
      allowDeclareFields: true,
    },
  ];

  plugins.push(typescriptPlugin);

  const firstPass = Babel.transformFromAst(inputAst, virtualSource.code, {
    configFile: false,
    babelrc: false,
    filename,
    presets,
    plugins,
    sourceMaps: false,
    ast: true,
  });

  let finalResult = firstPass;

  if (outputPlugins.length > 0) {
    finalResult = Babel.transformFromAst(firstPass?.ast, firstPass?.code || "", {
      configFile: false,
      babelrc: false,
      filename,
      presets: [],
      plugins: outputPlugins,
      sourceMaps: false,
      ast: true,
    });
  }

  if (jsxTemplate) {
    finalResult = Babel.transformFromAst(finalResult?.ast, finalResult?.code || "", {
      configFile: false,
      babelrc: false,
      filename,
      presets: [],
      plugins: [["litsx-jsx-html-template", jsxTemplateOptions]],
      sourceMaps: false,
      ast: false,
    });
  }

  return {
    code: formatEmittedModule(Babel, finalResult?.code || "", filename),
    metadata: firstPass?.metadata || {},
  };
}

export function preloadLitsxPlaygroundCompiler() {
  return ensureCompilerRuntime();
}

export default compileLitsxPlayground;
