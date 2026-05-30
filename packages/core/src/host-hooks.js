import { resolveRuntimeHost } from "./runtime-controller.js";
import {
  isReactiveControllerHostLike,
  createHostContentSnapshot,
  isSameHostContentSnapshot,
} from "./runtime-host-content.js";
import { useOnCommit, useOnConnect } from "./effect-hooks.js";
import { useState } from "./state-hooks.js";

/**
 * Return the current component instance.
 * Use this when a component or custom hook needs direct access to instance-level platform APIs.
 * @usage Call useHost inside a Lit<sup>sx</sup> component or custom hook during render.
 * @usage Prefer more specific hooks like useRef when you need a rendered DOM node instead of the host instance itself.
 * @behavior Returns the active component instance for the current render pass.
 * @behavior Throws if called without an active host, just like other Lit<sup>sx</sup> hooks.
 * @mentalModel useHost gives authored code access to the current component instance as host-level platform context, not as render data.
 * @pitfall Prefer more specific hooks like useRef, useHostContent, or useSlot when they describe the intent more clearly than direct host access.
 * @pitfall Do not turn useHost into the default path for every DOM interaction. Reach for it when the component genuinely needs host-level platform APIs.
 * @example
 * const host = useHost();
 *
 * useOnConnect(() => {
 *   const observer = new MutationObserver(() => {
 *     console.log(host.textContent);
 *   });
 *   observer.observe(host, { childList: true, subtree: true });
 *   return () => observer.disconnect();
 * }, []);
 * @param {import('lit').ReactiveControllerHost} host
 * @returns {import('lit').ReactiveControllerHost}
 */
export function useHost(host) {
  const resolvedHost = resolveRuntimeHost(host);
  if (!resolvedHost) {
    throw new TypeError(
      "Lit<sup>sx</sup> hooks require an active ReactiveControllerHost during render."
    );
  }
  return resolvedHost;
}

/**
 * Read reactive light DOM content from the current component.
 * Use this when authored code needs projected text or nodes as input, while staying aligned with the web-component model.
 * @usage Call useHostContent when a component derives behavior from the content placed inside its own tag.
 * @usage Prefer this over manual MutationObserver wiring when the goal is to react to host content changes declaratively.
 * @usage Use the returned `text` for textual inputs, `nodes` for generic projected content, and `slots` when content should be grouped by slot name.
 * @behavior Returns a reactive snapshot of the current host content.
 * @behavior The snapshot updates when light DOM children, text nodes, or slot attributes change.
 * @behavior `slots.default` contains nodes without an explicit slot name.
 * @mentalModel useHostContent treats the host's light DOM as input data owned by the component boundary, not as an implementation detail hidden behind `this.textContent`.
 * @pitfall This reads projected host content, not `children` as an abstract virtual data structure or general-purpose render value.
 * @example
 * const content = useHostContent({ trim: true });
 * const source = content.text;
 *
 * return <pre>{source}</pre>;
 * @param {import('lit').ReactiveControllerHost} host
 * @param {{ trim?: boolean }} [options]
 * @returns {{ text: string, nodes: Node[], hasContent: boolean, slots: Record<string, Node[]> & { default: Node[] } }}
 */
export function useHostContent(host, options) {
  let runtimeHost = host;
  let normalizedOptions = options;

  if (!isReactiveControllerHostLike(host)) {
    runtimeHost = undefined;
    normalizedOptions = host;
  }

  const resolvedHost = useHost(runtimeHost);
  normalizedOptions = normalizedOptions && typeof normalizedOptions === "object"
    ? normalizedOptions
    : {};
  const [snapshot, setSnapshot] = useState(
    resolvedHost,
    () => createHostContentSnapshot(resolvedHost, normalizedOptions)
  );

  useOnConnect(resolvedHost, () => {
    if (typeof MutationObserver !== "function") {
      return;
    }

    const syncSnapshot = () => {
      const nextSnapshot = createHostContentSnapshot(resolvedHost, normalizedOptions);
      setSnapshot((prevSnapshot) =>
        isSameHostContentSnapshot(prevSnapshot, nextSnapshot)
          ? prevSnapshot
          : nextSnapshot
      );
    };

    const observer = new MutationObserver(() => {
      syncSnapshot();
    });

    observer.observe(resolvedHost, {
      childList: true,
      characterData: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["slot"],
    });

    syncSnapshot();

    return () => {
      observer.disconnect();
    };
  }, [normalizedOptions.trim]);

  return snapshot;
}

/**
 * Read reactive text content projected into the current component.
 * Use this when the component consumes light DOM text as input data.
 * @usage Call useTextContent when content inside the host should be treated as text, such as markdown, SQL, or authored source code.
 * @usage Prefer useHostContent when the component also needs direct access to projected nodes or slot groupings.
 * @behavior Returns a reactive text snapshot derived from the current host content.
 * @behavior The returned string updates when host text nodes or child content change.
 * @mentalModel useTextContent treats the host's projected content as a text input stream for the component, not as node-level structure.
 * @pitfall useTextContent flattens projected content to text. If the component cares about node boundaries or named slots, useHostContent or useSlot instead.
 * @pitfall Text snapshots may include formatting whitespace from authored markup unless `trim` is enabled or the caller normalizes the content.
 * @example
 * const source = useTextContent({ trim: true });
 * @param {import('lit').ReactiveControllerHost} host
 * @param {{ trim?: boolean }} [options]
 * @returns {string}
 */
export function useTextContent(host, options) {
  let runtimeHost = host;
  let normalizedOptions = options;

  if (!isReactiveControllerHostLike(host)) {
    runtimeHost = undefined;
    normalizedOptions = host;
  }

  return runtimeHost === undefined
    ? useHostContent(normalizedOptions).text
    : useHostContent(runtimeHost, normalizedOptions).text;
}

/**
 * Read reactive projected nodes for one slot.
 * Use this when authored code needs projected content grouped by slot name in a web-component-native way.
 * @usage Call useSlot() for default content and useSlot("name") for named projected content.
 * @usage Prefer useHostContent when the component needs the full host-content snapshot instead of just one slot.
 * @behavior Returns a reactive array of nodes assigned to the requested slot.
 * @behavior The returned array updates when projected nodes are added, removed, or moved between slots.
 * @mentalModel useSlot gives authored code a reactive view of projected light DOM for one slot. It does not render, clone, or virtualize children as framework-level data.
 * @pitfall useSlot reads host-projected content, not JSX `children` as a manipulable abstract data structure.
 * @example
 * const defaultNodes = useSlot();
 * const actions = useSlot("actions");
 * @param {import('lit').ReactiveControllerHost} host
 * @param {string} [slotName]
 * @returns {Node[]}
 */
export function useSlot(host, slotName) {
  let runtimeHost = host;
  let requestedSlot = slotName;

  if (!isReactiveControllerHostLike(host)) {
    runtimeHost = undefined;
    requestedSlot = host;
  }

  const resolvedSlotName = typeof requestedSlot === "string" && requestedSlot
    ? requestedSlot
    : "default";

  return useHostContent(runtimeHost).slots[resolvedSlotName] ?? [];
}

/**
 * Apply a dynamic style property to the current component host.
 * Think of useStyle as the authored way to drive CSS custom properties or individual host style values from component state.
 * @usage Use useStyle for dynamic theme values, layout measurements, or other single style properties that change with state.
 * @usage This is especially useful for CSS custom properties such as `--accent-color` that your stylesheet consumes.
 * @usage Prefer useStyle over rebuilding a full stylesheet string when only one or two host-level style values are dynamic.
 * @usage Pass a compute function when the style value should be derived after commit. Add a dependency array only when that derived value should be recalculated for specific reactive inputs instead of every commit.
 * @behavior Lit<sup>sx</sup> applies the style property to the host element after commit.
 * @behavior Passing `null`, `undefined`, or `false` removes the property from the host.
 * @behavior The property is applied through the host's inline style object, making it a good fit for CSS variables and host-level overrides.
 * @mentalModel useStyle lets JavaScript decide a value while CSS keeps ownership of how that value is consumed.
 * @pitfall Do not use useStyle to move large amounts of visual styling into JavaScript. Keep most presentation in CSS rules and use this hook only for the dynamic edge.
 * @pitfall When the value naturally belongs on a child element rather than the host, prefer a normal JSX `style` binding or a class/attribute-based selector.
 * @pitfall Keep compute functions pure. Omitting the dependency array means the compute function runs after every commit.
 * @example
 * useStyle("--accent-color", accent);
 * useStyle("--panel-width", `${width}px`);
 * useStyle("--panel-gap", () => `${gap}px`);
 * useStyle("--panel-gap", () => `${gap}px`, [gap]);
 * @param {import('lit').ReactiveControllerHost} host
 * @param {string} propertyName CSS property name to set on the current host.
 * @param {string | number | null | undefined | false | (() => string | number | null | undefined | false)} valueOrFactory Value to assign to that property, or a pure compute function evaluated after commit.
 * @param {ReadonlyArray<unknown>} [deps] Reactive values that control when the computed style value should be recalculated.
 */
export function useStyle(host, propertyName, valueOrFactory, deps) {
  const isComputed = typeof valueOrFactory === "function";

  useOnCommit(host, () => {
    if (!host?.style) return;

    const value = isComputed ? valueOrFactory() : valueOrFactory;

    if (value == null || value === false) {
      host.style.removeProperty?.(propertyName);
      return;
    }

    host.style.setProperty?.(propertyName, String(value));
  }, isComputed
    ? (Array.isArray(deps) ? [propertyName, ...deps] : undefined)
    : [propertyName, valueOrFactory]);
}
