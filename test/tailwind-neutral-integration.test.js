import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "vitest";
import { transformLitsxSync } from "../packages/compiler/src/index.js";
import {
  litsxTailwind,
  TAILWIND_PREFLIGHT_MODULE_ID,
} from "../packages/tailwind/src/index.js";

function fixture(name, color = "#123456") {
  const fixturesRoot = path.join(process.cwd(), "test-results");
  fs.mkdirSync(fixturesRoot, { recursive: true });
  const root = fs.mkdtempSync(path.join(fixturesRoot, `${name}-`));
  const entry = path.join(root, "tailwind.css");
  fs.writeFileSync(
    entry,
    `@import "tailwindcss" source(none);\n@theme { --color-brand: ${color}; }\n`,
  );
  return { root, entry };
}

function compile(instance, sourcePath, utility = "p-4") {
  return transformLitsxSync(
    `
const SIZES = { sm: "h-8 px-3", lg: "h-12 px-6" };
export function NeutralCard({ size = "sm" }) {
  return <article class={\`bg-brand ${utility} data-[open=true]:block aria-expanded:hidden dark:text-white w-[17px] \${SIZES[size]}\`}>Card</article>;
}
NeutralCard.styles = [css\`:host { display: block; }\`];
export const story = () => <main class="grid gap-3">Story</main>;
`,
    { ...instance.compiler, filename: sourcePath, sourceMaps: true },
  );
}

function inlineComponentSpecifier(code) {
  return code.match(
    /from "(virtual:@litsx\/tailwind\/component\/[^"?]+\.css(?:\?inline)?)"/,
  )?.[1];
}

function moduleCss(module) {
  return JSON.parse(module.code.slice("export default ".length, -2));
}

describe("neutral litsxTailwind integration", () => {
  it("contributes the compiler, materializes Shadow DOM modules, and declares document outputs", async () => {
    const { root, entry } = fixture("tailwind-neutral");
    const instance = await litsxTailwind({
      integration: { entry: "./tailwind.css" },
    }).create({
      projectRoot: root,
      mode: "production",
      identity: { id: "tailwind-neutral" },
    });
    const sourcePath = path.join(root, "card.tsx");
    try {
      const compiled = compile(instance, sourcePath);
      assert.equal(instance.compiler.reactCompat, false);
      assert.equal(instance.compiler.authoringPlugins.length, 1);
      assert.equal(instance.compiler.outputPlugins.length, 1);
      assert.match(compiled.code, /tailwind\/preflight\.css/);
      assert.doesNotMatch(compiled.code, /tailwind\/preflight\.css\?inline/);
      assert.match(
        compiled.code,
        /static styles = \[_litsxTailwindPreflight, super\.styles \?\? \[\], css`:host \{ display: block; \}`, _litsxTailwindStyles\]/,
      );

      const contribution = await instance.processModule({
        result: compiled,
        sourcePath,
      });
      assert.ok(contribution.dependencies.includes(entry));

      const infrastructure = await instance.resolveModule({
        specifier: "virtual:@litsx/tailwind/infrastructure.css",
      });
      assert.equal(infrastructure.code, "export {};\n");
      await assert.rejects(
        instance.resolveModule({
          specifier: "virtual:@litsx/tailwind/component/missing.css?inline",
        }),
        /Missing Tailwind component metadata/,
      );
      assert.equal(
        await instance.resolveModule({
          specifier: "virtual:@litsx/tailwind/component/malformed",
        }),
        null,
      );

      const specifier = inlineComponentSpecifier(compiled.code);
      assert.ok(specifier);
      const component = await instance.resolveModule({ specifier });
      const componentCss = moduleCss(component);
      assert.match(componentCss, /\.p-4/);
      assert.match(componentCss, /\.w-\\\[17px\\\]/);
      assert.match(componentCss, /data-open="true"/);
      assert.match(componentCss, /aria-expanded="true"/);
      assert.match(componentCss, /prefers-color-scheme: dark/);
      assert.doesNotMatch(componentCss, /@property/);
      const preflight = await instance.resolveModule({
        specifier: TAILWIND_PREFLIGHT_MODULE_ID,
      });
      assert.match(moduleCss(preflight), /box-sizing: border-box/);
      assert.doesNotMatch(moduleCss(preflight), /--color-brand/);

      const finalized = await instance.finalize();
      const moduleOutput = finalized.outputs.find(
        ({ kind }) => kind === "module",
      );
      const globalOutput = finalized.outputs.find(
        ({ kind }) => kind === "style",
      );
      assert.equal(
        moduleOutput.specifier,
        TAILWIND_PREFLIGHT_MODULE_ID,
      );
      assert.equal(globalOutput.document, true);
      assert.match(globalOutput.content, /--color-brand: #123456/);
      assert.doesNotMatch(globalOutput.content, /\.p-4/);
      assert.match(globalOutput.content, /\.grid/);
      assert.equal(
        globalOutput.content.match(/--color-brand: #123456/g)?.length,
        1,
      );
      assert.ok(finalized.dependencies.includes(entry));
      assert.equal(
        await instance.resolveModule({ specifier: "virtual:other" }),
        null,
      );
    } finally {
      instance.dispose();
      instance.dispose();
      fs.rmSync(root, { recursive: true, force: true });
    }
    await assert.rejects(instance.finalize(), /disposed/);
  });

  it("removes stale candidates after recompilation and reloads entry changes", async () => {
    const { root, entry } = fixture("tailwind-neutral-invalidate");
    const instance = await litsxTailwind({
      integration: { entry: "./tailwind.css" },
    }).create({
      projectRoot: root,
      mode: "development",
      identity: { id: "dev" },
    });
    const sourcePath = path.join(root, "card.tsx");
    try {
      const initial = compile(instance, sourcePath, "p-4");
      await instance.processModule({ result: initial, sourcePath });
      assert.match(
        moduleCss(
          await instance.resolveModule({
            specifier: inlineComponentSpecifier(initial.code),
          }),
        ),
        /\.p-4/,
      );

      const updated = compile(instance, sourcePath, "m-7");
      await instance.processModule({ result: updated, sourcePath });
      const refreshed = await instance.resolveModule({
        specifier: inlineComponentSpecifier(updated.code),
      });
      assert.match(moduleCss(refreshed), /\.m-7/);
      assert.doesNotMatch(moduleCss(refreshed), /\.p-4/);

      fs.writeFileSync(
        entry,
        '@import "tailwindcss" source(none);\n@theme { --color-brand: #abcdef; }\n',
      );
      await instance.invalidate({ paths: [entry], affected: true });
      const global = (await instance.finalize()).outputs.find(
        ({ kind }) => kind === "style",
      );
      assert.match(global.content, /--color-brand: #abcdef/);
      assert.doesNotMatch(global.content, /--color-brand: #123456/);

      instance.forget({ moduleId: sourcePath });
      const withoutModule = (await instance.finalize()).outputs.find(
        ({ kind }) => kind === "style",
      );
      assert.doesNotMatch(withoutModule.content, /\.m-7/);
    } finally {
      instance.dispose();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("isolates mutable candidate and theme state across concurrent hosts", async () => {
    const firstFixture = fixture("tailwind-neutral-a", "#111111");
    const secondFixture = fixture("tailwind-neutral-b", "#eeeeee");
    const descriptor = litsxTailwind({
      integration: { entry: "./tailwind.css" },
    });
    const [first, second] = await Promise.all([
      descriptor.create({
        projectRoot: firstFixture.root,
        mode: "production",
        identity: { id: "a" },
      }),
      descriptor.create({
        projectRoot: secondFixture.root,
        mode: "production",
        identity: { id: "b" },
      }),
    ]);
    try {
      const firstPath = path.join(firstFixture.root, "card.tsx");
      const secondPath = path.join(secondFixture.root, "card.tsx");
      await Promise.all([
        first.processModule({
          result: compile(first, firstPath, "p-2"),
          sourcePath: firstPath,
        }),
        second.processModule({
          result: compile(second, secondPath, "p-8"),
          sourcePath: secondPath,
        }),
      ]);
      const [firstGlobal, secondGlobal] = await Promise.all([
        first.finalize(),
        second.finalize(),
      ]);
      const firstCss = firstGlobal.outputs.find(
        ({ kind }) => kind === "style",
      ).content;
      const secondCss = secondGlobal.outputs.find(
        ({ kind }) => kind === "style",
      ).content;
      assert.match(firstCss, /#111111/);
      assert.doesNotMatch(firstCss, /#eeeeee/);
      assert.match(secondCss, /#eeeeee/);
      assert.doesNotMatch(secondCss, /#111111/);
    } finally {
      first.dispose();
      second.dispose();
      fs.rmSync(firstFixture.root, { recursive: true, force: true });
      fs.rmSync(secondFixture.root, { recursive: true, force: true });
    }
  });

  it("observes and reloads a legacy Tailwind config dependency", async () => {
    const { root, entry } = fixture("tailwind-neutral-config");
    const configPath = path.join(root, "tailwind.config.mjs");
    fs.writeFileSync(
      configPath,
      'export default { theme: { extend: { colors: { brand: "#112233" } } } };\n',
    );
    fs.writeFileSync(
      entry,
      '@config "./tailwind.config.mjs";\n@import "tailwindcss" source(none);\n',
    );
    const instance = await litsxTailwind({
      integration: { entry: "./tailwind.css" },
    }).create({
      projectRoot: root,
      mode: "development",
      identity: { id: "config" },
    });
    const sourcePath = path.join(root, "card.tsx");
    try {
      const compiled = compile(instance, sourcePath);
      await instance.processModule({ result: compiled, sourcePath });
      const initial = await instance.finalize();
      assert.ok(initial.dependencies.includes(configPath));
      assert.match(
        moduleCss(
          await instance.resolveModule({
            specifier: inlineComponentSpecifier(compiled.code),
          }),
        ),
        /#112233/,
      );

      fs.writeFileSync(
        configPath,
        'export default { theme: { extend: { colors: { brand: "#445566" } } } };\n',
      );
      await instance.invalidate({ paths: [configPath], affected: true });
      const refreshed = await instance.resolveModule({
        specifier: inlineComponentSpecifier(compiled.code),
      });
      const css = moduleCss(refreshed);
      assert.match(css, /#445566/);
      assert.doesNotMatch(css, /#112233/);
    } finally {
      instance.dispose();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps the neutral root free of Evolit and Vite imports", () => {
    const source = fs.readFileSync(
      path.resolve("packages/tailwind/src/index.js"),
      "utf8",
    );
    assert.doesNotMatch(source, /from ["'](?:evolit|vite|@litsx\/vite-plugin)/);
  });

  it("honors custom output ids", async () => {
    const { root } = fixture("tailwind-neutral-output-ids");
    const instance = await litsxTailwind({
      integration: { entry: "./tailwind.css" },
      preflightOutput: "shadow-reset.js",
      globalCssOutput: "document-tailwind.css",
    }).create({
      projectRoot: root,
      mode: "production",
      identity: { id: "outputs" },
    });
    try {
      assert.deepEqual(
        (await instance.finalize()).outputs.map(({ id }) => id),
        ["shadow-reset.js", "document-tailwind.css"],
      );
    } finally {
      instance.dispose();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("reports dependencies through the host's logical project root", async () => {
    const fixtureRoot = fixture("tailwind-neutral-logical-root");
    const logicalRoot = `${fixtureRoot.root}-logical`;
    fs.symlinkSync(fixtureRoot.root, logicalRoot, "dir");
    const instance = await litsxTailwind({
      integration: { entry: "./tailwind.css" },
    }).create({
      projectRoot: logicalRoot,
      mode: "development",
      identity: { id: "logical-root" },
    });
    try {
      const finalized = await instance.finalize();
      assert.ok(finalized.dependencies.includes(path.join(logicalRoot, "tailwind.css")));
      assert.equal(
        finalized.dependencies.some((dependency) => (
          dependency === fixtureRoot.root
          || dependency.startsWith(`${fixtureRoot.root}${path.sep}`)
        )),
        false,
        JSON.stringify(finalized.dependencies),
      );
    } finally {
      instance.dispose();
      fs.rmSync(logicalRoot, { force: true });
      fs.rmSync(fixtureRoot.root, { recursive: true, force: true });
    }
  });
});
