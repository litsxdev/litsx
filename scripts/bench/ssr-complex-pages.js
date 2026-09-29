import { performance } from "node:perf_hooks";
import { createLitsxCompilationSession } from "../../packages/compiler/src/index.js";
import { jsxSpreadElement } from "../../packages/core/src/jsx-spread.js";
import { renderDocument, renderToString } from "../../packages/ssr/src/index.js";
import { html, LitElement } from "lit";

const validationMode = process.argv.includes("--check");
const positionalArguments = process.argv.slice(2).filter((argument) => argument !== "--check");
const iterations = validationMode ? 7 : Number.parseInt(positionalArguments[0] || "20", 10);
const warmups = validationMode ? 2 : Number.parseInt(positionalArguments[1] || "5", 10);
const compileIterations = validationMode ? 3 : Number.parseInt(positionalArguments[2] || "5", 10);
const scenarios = [
  { name: "page-25", items: 25, props: 5, sources: 1 },
  { name: "page-100", items: 100, props: 20, sources: 5 },
  { name: "page-250", items: 250, props: 20, sources: 5 },
];
const validationThresholds = Object.freeze({
  compileScale: 5,
  renderScale: 4,
  spreadRenderOverhead: 1.75,
  largeCompileP50Ms: 3_000,
  largeRenderP50Ms: 750,
});

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

function stats(values) {
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    min: Math.min(...values),
    avg: total / values.length,
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    max: Math.max(...values),
  };
}

function formatMs(value) {
  return `${value.toFixed(2)}ms`;
}

function formatBytes(value) {
  if (value < 1024) return `${value}B`;
  return `${(value / 1024).toFixed(1)}KiB`;
}

function printStats(label, result) {
  console.log(
    `  ${label.padEnd(18)} p50 ${formatMs(result.p50).padStart(9)}  ` +
    `p95 ${formatMs(result.p95).padStart(9)}  avg ${formatMs(result.avg).padStart(9)}  ` +
    `min/max ${formatMs(result.min)}/${formatMs(result.max)}`,
  );
}

function splitRecord(record, sourceCount) {
  const sources = Array.from({ length: sourceCount }, () => ({}));
  let index = 0;
  for (const [name, value] of Object.entries(record)) {
    sources[index % sourceCount][name] = value;
    index += 1;
  }
  return sources;
}

const directCardTemplates = new Map();

function directCard(item, index, propCount) {
  let strings = directCardTemplates.get(propCount);
  if (!strings) {
    const next = ["<bench-card .item="];
    next.push(" .iconOnly=", " .ariaLabel=", " data-index=");
    for (let prop = 0; prop < propCount; prop += 1) next.push(` .p${prop}=`);
    next.push("></bench-card>");
    Object.defineProperty(next, "raw", { value: [...next] });
    strings = Object.freeze(next);
    directCardTemplates.set(propCount, strings);
  }
  const values = [item, index % 3 === 0, `Card ${index}`, index];
  for (let prop = 0; prop < propCount; prop += 1) values.push(`${index}:${prop}`);
  return html(strings, ...values);
}

class BenchBadge extends LitElement {
  static properties = {
    label: { type: String },
    active: { type: Boolean, reflect: true },
  };

  render() {
    return html`<span class="badge" ?data-active=${this.active}>${this.label}</span>`;
  }
}

class BenchAction extends LitElement {
  static properties = {
    label: { type: String },
    disabled: { type: Boolean, reflect: true },
  };

  render() {
    return html`<button ?disabled=${this.disabled}>${this.label}</button>`;
  }
}

class BenchCard extends LitElement {
  static properties = {
    item: { attribute: false },
    iconOnly: { type: Boolean, reflect: true, attribute: "icon-only" },
    ariaLabel: { type: String, reflect: true, attribute: "aria-label" },
    ...Object.fromEntries(
      Array.from({ length: 20 }, (_, index) => [`p${index}`, { type: String }]),
    ),
  };

  static elements = {
    "bench-action": BenchAction,
    "bench-badge": BenchBadge,
  };

  render() {
    const item = this.item;
    return html`
      <article data-id=${item.id}>
        <header>
          <h2>${this.iconOnly ? "#" : item.title}</h2>
          <p>${this.ariaLabel}</p>
        </header>
        <section>
          ${item.tags.map((tag, index) => html`
            <bench-badge label=${tag} ?active=${index === 0}></bench-badge>
          `)}
        </section>
        <footer>
          <bench-action label="Open" .disabled=${item.disabled}></bench-action>
          <bench-action label="Save" .disabled=${false}></bench-action>
        </footer>
      </article>
    `;
  }
}

class BenchPage extends LitElement {
  static properties = {
    items: { attribute: false },
    propCount: { type: Number, attribute: false },
    sourceCount: { type: Number, attribute: false },
    spreadMode: { type: Boolean, attribute: false },
  };

  static elements = {
    "bench-card": BenchCard,
  };

  render() {
    return html`
      <main>
        <nav>${this.items.slice(0, 12).map((item) => html`<a href="#${item.id}">${item.title}</a>`)}</nav>
        <section class="catalog">
          ${this.items.map((item, index) => {
            if (!this.spreadMode) return directCard(item, index, this.propCount);
            const props = {
              item,
              iconOnly: index % 3 === 0,
              ariaLabel: `Card ${index}`,
              "data-index": index,
            };
            for (let prop = 0; prop < this.propCount; prop += 1) {
              props[`p${prop}`] = `${index}:${prop}`;
            }
            return jsxSpreadElement(
              "bench-card",
              splitRecord(props, this.sourceCount),
              { component: BenchCard, server: true },
            );
          })}
        </section>
      </main>
    `;
  }
}

function createItems(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `item-${index}`,
    title: `Product ${index}`,
    disabled: index % 7 === 0,
    tags: [`group-${index % 8}`, "available", `rank-${index % 5}`, "benchmark"],
  }));
}

function createSsrValue(scenario, items, spreadMode) {
  return html`
    <bench-page
      .items=${items}
      .propCount=${scenario.props}
      .sourceCount=${scenario.sources}
      .spreadMode=${spreadMode}
    ></bench-page>
  `;
}

const rootElements = { "bench-page": BenchPage };

async function measureAsync(iterationCount, run) {
  const durations = [];
  let lastResult;
  for (let index = 0; index < iterationCount; index += 1) {
    const start = performance.now();
    lastResult = await run(index);
    durations.push(performance.now() - start);
  }
  return { durations, lastResult };
}

function createCompilerInput(scenario, spreadMode) {
  const props = Array.from({ length: scenario.props }, (_, index) => `p${index}?: string;`);
  const types = [
    "export type BenchCardProps = {",
    "item: unknown; iconOnly?: boolean; ariaLabel?: string;",
    ...props,
    "};",
    "export declare const BenchCard: (props: BenchCardProps) => unknown;",
  ].join("\n");
  const spreadNames = Array.from({ length: scenario.sources }, (_, index) => `spread${index}`);
  const declarations = spreadNames.map((name, sourceIndex) => {
    const entries = Array.from({ length: scenario.props }, (_, propIndex) =>
      propIndex % scenario.sources === sourceIndex ? `p${propIndex}: "${sourceIndex}:${propIndex}"` : null,
    ).filter(Boolean);
    return `const ${name} = { ${entries.join(", ")} };`;
  });
  const callsites = Array.from({ length: scenario.items }, (_, index) => {
    const shared = [
      `<BenchCard data-index="${index}" item={items[${index}]} `,
      `iconOnly={${index % 3 === 0}} ariaLabel="Card ${index}" `,
    ];
    if (spreadMode) shared.push(spreadNames.map((name) => `{...${name}}`).join(" "));
    else shared.push(Array.from(
      { length: scenario.props },
      (_, propIndex) => `p${propIndex}={"${index}:${propIndex}"}`,
    ).join(" "));
    shared.push(" />");
    return shared.join("");
  });
  return {
    filename: `/virtual/${scenario.name}.tsx`,
    types,
    source: [
      'import { BenchCard } from "./bench-card";',
      ...declarations,
      "export function ComplexPage({ items }) {",
      "  return <main>",
      ...callsites,
      "  </main>;",
      "}",
    ].join("\n"),
  };
}

function summarizeProfile(events) {
  const phases = new Map();
  for (const event of events || []) {
    phases.set(event.name, (phases.get(event.name) || 0) + event.durationMs);
  }
  return phases;
}

function measureCompilation(scenario, spreadMode) {
  const input = createCompilerInput(scenario, spreadMode);
  const sessionStart = performance.now();
  const session = createLitsxCompilationSession({
    transformOptions: { filename: input.filename, ssr: true },
  });
  const sessionMs = performance.now() - sessionStart;
  try {
    const run = () => session.transformSync(input.source, {
      filename: input.filename,
      ssr: true,
      sourceMaps: false,
      inMemoryFiles: { "/virtual/bench-card.tsx": input.types },
    });
    const coldStart = performance.now();
    const cold = run();
    const coldMs = performance.now() - coldStart;
    const durations = [];
    const phaseTotals = new Map();
    for (let index = 0; index < compileIterations; index += 1) {
      const start = performance.now();
      const result = run();
      durations.push(performance.now() - start);
      for (const [name, durationMs] of summarizeProfile(result.metadata?.litsxProfile)) {
        phaseTotals.set(name, (phaseTotals.get(name) || 0) + durationMs);
      }
    }
    return {
      bytes: Buffer.byteLength(input.source),
      outputBytes: Buffer.byteLength(cold.code),
      sessionMs,
      coldMs,
      warm: stats(durations),
      phases: [...phaseTotals.entries()]
        .map(([name, total]) => [name, total / compileIterations])
        .sort((left, right) => right[1] - left[1]),
    };
  } finally {
    session.dispose();
  }
}

async function measureRendering(scenario) {
  const items = createItems(scenario.items);
  const renderDirectFragment = () => renderToString(createSsrValue(scenario, items, false), { elements: rootElements });
  const renderSpreadFragment = () => renderToString(createSsrValue(scenario, items, true), { elements: rootElements });
  const renderPage = () => renderDocument(createSsrValue(scenario, items, true), {
    elements: rootElements,
    title: `SSR benchmark ${scenario.name}`,
    clientEntry: "/src/main.js",
  });

  for (let index = 0; index < warmups; index += 1) {
    await renderDirectFragment();
    await renderSpreadFragment();
  }
  const directFragment = await measureAsync(iterations, renderDirectFragment);
  const spreadFragment = await measureAsync(iterations, renderSpreadFragment);
  const document = await measureAsync(iterations, renderPage);

  const concurrentStart = performance.now();
  await Promise.all(Array.from({ length: 10 }, renderPage));
  const concurrentMs = performance.now() - concurrentStart;

  return {
    directFragment: stats(directFragment.durations),
    spreadFragment: stats(spreadFragment.durations),
    document: stats(document.durations),
    htmlBytes: Buffer.byteLength(document.lastResult.document),
    concurrentMs,
    requestsPerSecond: 10_000 / concurrentMs,
  };
}

console.log(
  `complex LitSX SSR benchmark (${iterations} render, ${compileIterations} compile, ` +
  `${warmups} warmup iterations)`,
);
console.log(`Node ${process.version}; compiler profiling ${process.env.LITSX_PROFILE === "1" ? "enabled" : "disabled"}`);
console.log("");

const activeScenarios = validationMode ? scenarios.slice(1) : scenarios;
const results = [];

for (const scenario of activeScenarios) {
  // Direct-prop compilation is intentionally omitted from the regression check:
  // the historical quadratic failure makes a failing validation unnecessarily
  // slow, while the spread compilation exercises the same source remapping path.
  const directCompilation = validationMode ? null : measureCompilation(scenario, false);
  const spreadCompilation = measureCompilation(scenario, true);
  const rendering = await measureRendering(scenario);
  results.push({ scenario, spreadCompilation, rendering });
  console.log(`${scenario.name}: ${scenario.items} component callsites/items, ${scenario.props} props, ${scenario.sources} spread sources`);
  if (directCompilation) {
    console.log(
      `  compile direct input/output ${formatBytes(directCompilation.bytes)}/${formatBytes(directCompilation.outputBytes)}; ` +
      `session ${formatMs(directCompilation.sessionMs)}; cold ${formatMs(directCompilation.coldMs)}`,
    );
    printStats("compile direct", directCompilation.warm);
  }
  console.log(
    `  compile spread input/output ${formatBytes(spreadCompilation.bytes)}/${formatBytes(spreadCompilation.outputBytes)}; ` +
    `session ${formatMs(spreadCompilation.sessionMs)}; cold ${formatMs(spreadCompilation.coldMs)}`,
  );
  printStats("compile spread", spreadCompilation.warm);
  printStats("SSR direct", rendering.directFragment);
  printStats("SSR spread", rendering.spreadFragment);
  printStats("document SSR", rendering.document);
  console.log(
    `  output ${formatBytes(rendering.htmlBytes)}; 10-request batch ${formatMs(rendering.concurrentMs)}; ` +
    `${rendering.requestsPerSecond.toFixed(1)} req/s`,
  );
  if (spreadCompilation.phases.length > 0) {
    console.log("  spread compiler phases (warm average):");
    for (const [name, durationMs] of spreadCompilation.phases) {
      console.log(`    ${name.padEnd(20)} ${formatMs(durationMs)}`);
    }
  }
  console.log("");
}

if (validationMode) {
  const [medium, large] = results;
  const measurements = {
    compileScale: large.spreadCompilation.warm.p50 / medium.spreadCompilation.warm.p50,
    renderScale: large.rendering.spreadFragment.p50 / medium.rendering.spreadFragment.p50,
    spreadRenderOverhead:
      large.rendering.spreadFragment.p50 / large.rendering.directFragment.p50,
    largeCompileP50Ms: large.spreadCompilation.warm.p50,
    largeRenderP50Ms: large.rendering.spreadFragment.p50,
  };
  const failures = [];

  console.log("SSR performance regression thresholds:");
  for (const [name, maximum] of Object.entries(validationThresholds)) {
    const actual = measurements[name];
    const unit = name.endsWith("Ms") ? "ms" : "x";
    console.log(`  ${name.padEnd(24)} ${actual.toFixed(2)}${unit} <= ${maximum}${unit}`);
    if (!Number.isFinite(actual) || actual > maximum) {
      failures.push(`${name}: ${actual.toFixed(2)}${unit} exceeds ${maximum}${unit}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`SSR performance regression detected:\n- ${failures.join("\n- ")}`);
  }
}
