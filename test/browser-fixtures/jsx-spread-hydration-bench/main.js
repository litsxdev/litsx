import { html, noChange } from "lit";
import { Directive, PartType, directive } from "lit/directive.js";
import { digestForTemplateResult, hydrate } from "@lit-labs/ssr-client";

const STRING_CACHE = new Map();
const DESCRIPTOR_CACHE = new Map();

function templateStrings(key, values) {
  let strings = STRING_CACHE.get(key);
  if (!strings) {
    Object.defineProperty(values, "raw", { value: Object.freeze([...values]) });
    strings = Object.freeze(values);
    STRING_CACHE.set(key, strings);
  }
  return strings;
}

function serializedValue(value) {
  return value == null || value === false ? null : value === true ? "" : String(value);
}

class BenchmarkSpreadDirective extends Directive {
  constructor(partInfo) {
    super(partInfo);
    if (partInfo.type !== PartType.ELEMENT) {
      throw new Error("benchmarkSpread requires an ElementPart");
    }
    this.seen = new Set();
  }

  render() {
    return noChange;
  }

  update(part, [sources, adoptSsrAttributes = false]) {
    const element = part.element;
    let tagDescriptors = DESCRIPTOR_CACHE.get(element.localName);
    if (!tagDescriptors) {
      tagDescriptors = new Map();
      DESCRIPTOR_CACHE.set(element.localName, tagDescriptors);
    }

    const needsDedupe = sources.length > 1;
    if (needsDedupe) this.seen.clear();
    for (let sourceIndex = sources.length - 1; sourceIndex >= 0; sourceIndex -= 1) {
      const source = sources[sourceIndex];
      for (const name in source) {
        if (needsDedupe) {
          if (this.seen.has(name)) continue;
          this.seen.add(name);
        }
        const value = source[name];
        // This deliberately includes the classification and comparison work the
        // production spread directive needs, while avoiding redundant writes.
        let kind = tagDescriptors.get(name);
        if (!kind) {
          kind = /^on[A-Z]/.test(name)
            ? "event"
            : name.startsWith("data-") || name.startsWith("aria-") || name === "title"
              ? "attribute"
              : typeof value === "boolean"
                ? "boolean"
                : name in element || (value != null && typeof value === "object")
                  ? "property"
                  : "attribute";
          tagDescriptors.set(name, kind);
        }

        if (kind === "attribute") {
          if (adoptSsrAttributes) continue;
          const next = serializedValue(value);
          if (next === null) {
            if (element.hasAttribute(name)) element.removeAttribute(name);
          } else if (element.getAttribute(name) !== next) {
            element.setAttribute(name, next);
          }
        } else if (kind === "boolean") {
          if (adoptSsrAttributes) continue;
          if (element.hasAttribute(name) !== value) element.toggleAttribute(name, value);
        } else if (kind === "property") {
          if (element[name] !== value) element[name] = value;
        } else if (kind === "event") {
          element.addEventListener(name.slice(2).toLowerCase(), value);
        }
      }
    }
    return noChange;
  }
}

const benchmarkSpread = directive(BenchmarkSpreadDirective);

function buildProps(elementIndex, propCount) {
  const props = {};
  for (let propIndex = 0; propIndex < propCount; propIndex += 1) {
    props[`data-p${propIndex}`] = `${elementIndex}:${propIndex}`;
  }
  return props;
}

function attributesMarkup(props) {
  return Object.entries(props)
    .map(([name, value]) => ` ${name}="${value}"`)
    .join("");
}

function buildBaselineCase(elementCount, propCount) {
  const strings = [""];
  const values = [];
  const propsByElement = [];
  let markup = "";

  for (let elementIndex = 0; elementIndex < elementCount; elementIndex += 1) {
    const props = buildProps(elementIndex, propCount);
    propsByElement.push(props);
    strings[strings.length - 1] += "<div";
    for (const [name, value] of Object.entries(props)) {
      strings[strings.length - 1] += ` ${name}=`;
      strings.push("");
      values.push(value);
    }
    strings[strings.length - 1] += "></div>";
    markup += `<!--lit-node ${elementIndex}--><div${attributesMarkup(props)}></div>`;
  }

  const result = html(
    templateStrings(`baseline:${elementCount}:${propCount}`, strings),
    ...values
  );
  return {
    result,
    markup: `<!--lit-part ${digestForTemplateResult(result)}-->${markup}<!--/lit-part-->`,
  };
}

function splitSources(props, sourceCount) {
  if (sourceCount <= 1) return [props];
  const sources = Array.from({ length: sourceCount }, () => ({}));
  let index = 0;
  for (const [name, value] of Object.entries(props)) {
    sources[index % sourceCount][name] = value;
    index += 1;
  }
  return sources;
}

function buildSpreadCase(elementCount, propCount, sourceCount) {
  const strings = [""];
  const values = [];
  let markup = "";

  for (let elementIndex = 0; elementIndex < elementCount; elementIndex += 1) {
    const props = buildProps(elementIndex, propCount);
    strings[strings.length - 1] += "<div ";
    strings.push("></div>");
    values.push(benchmarkSpread(splitSources(props, sourceCount), true));
    markup += `<!--lit-node ${elementIndex}--><div${attributesMarkup(props)}></div>`;
  }

  const result = html(
    templateStrings(`spread:${elementCount}`, strings),
    ...values
  );
  return {
    result,
    markup: `<!--lit-part ${digestForTemplateResult(result)}-->${markup}<!--/lit-part-->`,
  };
}

const BENCHMARK_LISTENER = () => {};

function buildMixedProps(elementIndex) {
  return {
    "data-index": String(elementIndex),
    title: `button-${elementIndex}`,
    disabled: elementIndex % 2 === 0,
    payload: { index: elementIndex },
    onClick: BENCHMARK_LISTENER,
  };
}

function buildMixedBaselineCase(elementCount) {
  const strings = [""];
  const values = [];
  let markup = "";
  for (let index = 0; index < elementCount; index += 1) {
    const props = buildMixedProps(index);
    strings[strings.length - 1] += "<button data-index=";
    strings.push(" title=");
    strings.push(" ?disabled=");
    strings.push(" .payload=");
    strings.push(" @click=");
    strings.push("></button>");
    values.push(
      props["data-index"],
      props.title,
      props.disabled,
      props.payload,
      props.onClick
    );
    markup += `<!--lit-node ${index}--><button data-index="${index}" ` +
      `title="button-${index}"${props.disabled ? " disabled" : ""}></button>`;
  }
  const result = html(templateStrings(`mixed-baseline:${elementCount}`, strings), ...values);
  return {
    result,
    markup: `<!--lit-part ${digestForTemplateResult(result)}-->${markup}<!--/lit-part-->`,
  };
}

function buildMixedSpreadCase(elementCount, sourceCount) {
  const strings = [""];
  const values = [];
  let markup = "";
  for (let index = 0; index < elementCount; index += 1) {
    const props = buildMixedProps(index);
    strings[strings.length - 1] += "<button ";
    strings.push("></button>");
    values.push(benchmarkSpread(splitSources(props, sourceCount), true));
    markup += `<!--lit-node ${index}--><button data-index="${index}" ` +
      `title="button-${index}"${props.disabled ? " disabled" : ""}></button>`;
  }
  const result = html(templateStrings(`mixed-spread:${elementCount}`, strings), ...values);
  return {
    result,
    markup: `<!--lit-part ${digestForTemplateResult(result)}-->${markup}<!--/lit-part-->`,
  };
}

function instrumentDomWrites(run) {
  const methods = ["setAttribute", "removeAttribute", "toggleAttribute", "addEventListener"];
  const originals = new Map();
  let writes = 0;
  for (const name of methods) {
    const owner = name === "addEventListener" ? EventTarget.prototype : Element.prototype;
    const original = owner[name];
    originals.set(name, original);
    owner[name] = function (...args) {
      writes += 1;
      return original.apply(this, args);
    };
  }
  try {
    return { value: run(), writes };
  } finally {
    for (const [name, original] of originals) {
      const owner = name === "addEventListener" ? EventTarget.prototype : Element.prototype;
      owner[name] = original;
    }
  }
}

function measureHydration(testCase) {
  const container = document.createElement("div");
  container.innerHTML = testCase.markup;
  const start = performance.now();
  const measured = instrumentDomWrites(() => hydrate(testCase.result, container));
  const duration = performance.now() - start;
  if (container.children.length === 0) throw new Error("hydration produced no elements");
  return { duration, writes: measured.writes };
}

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

function summarize(samples) {
  const durations = samples.map((sample) => sample.duration);
  return {
    medianMs: percentile(durations, 0.5),
    p95Ms: percentile(durations, 0.95),
    minMs: Math.min(...durations),
    writes: samples.reduce((total, sample) => total + sample.writes, 0) / samples.length,
  };
}

async function runCase(elementCount, propCount, sourceCount, mode, iterations, warmups) {
  const baseline = mode === "mixed"
    ? buildMixedBaselineCase(elementCount)
    : buildBaselineCase(elementCount, propCount);
  const spread = mode === "mixed"
    ? buildMixedSpreadCase(elementCount, sourceCount)
    : buildSpreadCase(elementCount, propCount, sourceCount);

  for (let index = 0; index < warmups; index += 1) {
    measureHydration(index % 2 === 0 ? baseline : spread);
    measureHydration(index % 2 === 0 ? spread : baseline);
  }

  const baselineSamples = [];
  const spreadSamples = [];
  for (let index = 0; index < iterations; index += 1) {
    if (index % 2 === 0) {
      baselineSamples.push(measureHydration(baseline));
      spreadSamples.push(measureHydration(spread));
    } else {
      spreadSamples.push(measureHydration(spread));
      baselineSamples.push(measureHydration(baseline));
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  const baselineSummary = summarize(baselineSamples);
  const spreadSummary = summarize(spreadSamples);
  return {
    elements: elementCount,
    props: propCount,
    sources: sourceCount,
    mode,
    bindings: elementCount * propCount,
    baseline: baselineSummary,
    spread: spreadSummary,
    medianRatio: spreadSummary.medianMs / baselineSummary.medianMs,
  };
}

window.runJsxSpreadHydrationBenchmark = async ({ cases, iterations = 15, warmups = 4 }) => {
  const results = [];
  for (const [elements, props, sources = 1, mode = "attributes"] of cases) {
    results.push(await runCase(elements, props, sources, mode, iterations, warmups));
  }
  return results;
};

window.__jsxSpreadHydrationBenchmarkReady = true;
