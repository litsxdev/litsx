import {
  css,
  defineHook,
  useFormValue,
  useHost,
  useState,
} from "@litsx/core";
import {
  LitsxContextProviderElement,
  useContext,
} from "@litsx/core/context";
import {
  PlainLitBridge,
  PlainLitContextBridge,
  PlainLitTerminal,
} from "./matrix-lit-elements.ts";
import { MatrixContext } from "./matrix-context.ts";

export { PlainLitBridge, PlainLitContextBridge, PlainLitTerminal };

class AlphaMarker extends HTMLElement {}
class BetaMarker extends HTMLElement {}
class OwnMarker extends HTMLElement {}

const AlphaMixin = (Base: any) =>
  class AlphaCapability extends Base {
    static properties = {
      ...(super.properties ?? {}),
      alpha: { type: String },
    };

    static styles = [
      super.styles ?? [],
      css`.matrix-probe { color: rgb(180, 0, 0); }`,
    ];

    static elements = {
      ...(super.elements ?? {}),
      "alpha-marker": AlphaMarker,
    };

    declare alpha: string;
    mixinLifecycle?: string[];

    constructor(...args: any[]) {
      super(...args);
      this.alpha = "alpha";
    }

    connectedCallback() {
      (this.mixinLifecycle ??= []).push("connect:alpha");
      return super.connectedCallback?.();
    }

    disconnectedCallback() {
      (this.mixinLifecycle ??= []).push("disconnect:alpha");
      return super.disconnectedCallback?.();
    }
  };

const BetaMixin = (Base: any) =>
  class BetaCapability extends Base {
    static properties = {
      ...(super.properties ?? {}),
      beta: { type: String },
    };

    static styles = [
      super.styles ?? [],
      css`.matrix-probe { background-color: rgb(0, 0, 180); }`,
    ];

    static elements = {
      ...(super.elements ?? {}),
      "beta-marker": BetaMarker,
    };

    declare beta: string;
    mixinLifecycle?: string[];

    constructor(...args: any[]) {
      super(...args);
      this.beta = "beta";
    }

    connectedCallback() {
      (this.mixinLifecycle ??= []).push("connect:beta");
      return super.connectedCallback?.();
    }

    disconnectedCallback() {
      (this.mixinLifecycle ??= []).push("disconnect:beta");
      return super.disconnectedCallback?.();
    }
  };

const useAlpha = defineHook({
  mixin: AlphaMixin,
  use() {
    return (useHost() as any).alpha;
  },
});

const useBeta = defineHook({
  mixin: BetaMixin,
  use() {
    return (useHost() as any).beta;
  },
});

function useNestedBeta() {
  return useBeta();
}

export { MatrixContext };

type MatrixComplexLeafProps = {
  label?: string;
  payload?: { id: string } | null;
};

export function MatrixComplexLeaf({
  label = "matrix-leaf",
  payload = null,
}: MatrixComplexLeafProps) {
  const alpha = useAlpha();
  const duplicateAlpha = useAlpha();
  const beta = useNestedBeta();
  const contextValue = useContext(MatrixContext);
  const formValue = useFormValue("face-initial");
  const [terminalValue, setTerminalValue] = useState(5);

  return (
    <section class="matrix-probe" data-matrix-leaf>
      <output data-capabilities>
        {label}:{alpha}:{duplicateAlpha}:{beta}:{contextValue}:{formValue.value}
      </output>
      <PlainLitTerminal
        value={terminalValue}
        payload={payload}
        on:terminal-change={(event: CustomEvent<{ value: number }>) => {
          setTerminalValue(event.detail.value);
          formValue.setValue(`face-${event.detail.value}`);
        }}
      />
    </section>
  );
}

MatrixComplexLeaf.styles = css`
  .matrix-probe {
    border-style: solid;
    border-width: 4px;
    padding: 5px;
  }
`;
MatrixComplexLeaf.elements = { "own-marker": OwnMarker };

Object.defineProperty(PlainLitBridge, "elements", {
  configurable: true,
  value: { "matrix-complex-leaf": MatrixComplexLeaf },
});

export function MatrixLightBridge() {
  const [updates, setUpdates] = useState(0);
  return (
    <>
      <button
        data-matrix-light-update
        on:click={() => setUpdates((value) => value + 1)}
      >
        {updates}
      </button>
      <PlainLitContextBridge context={MatrixContext} />
    </>
  );
}

MatrixLightBridge.lightDom = true;
MatrixLightBridge.elements = {
  "litsx-context-provider": LitsxContextProviderElement,
};
