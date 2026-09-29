import { css, useMemoValue, useState } from "@litsx/core";

export function DemoCounter({ initialCount = 0 }) {
  const [count, setCount] = useState(initialCount);
  const label = useMemoValue(() => `Count: ${count}`, [count]);

  return <button on:click={() => setCount((value) => value + 1)}>{label}</button>;
}

DemoCounter.styles = css`
  :host {
    display: inline-block;
  }

  button {
    border: 0;
    border-radius: 999px;
    background: #1d231f;
    color: #fff9f1;
    cursor: pointer;
    font: 700 14px/1 ui-sans-serif, system-ui, sans-serif;
    padding: 12px 16px;
  }
`;

export function DemoApp({
  title = "LitSX SSR Starter",
  subtitle = "Server rendered, then hydrated in the browser.",
  initialCount = 0,
}) {
  return (
    <section class="card">
      <h1>{title}</h1>
      <p>{subtitle}</p>
      <DemoCounter initialCount={initialCount} />
    </section>
  );
}

DemoApp.styles = css`
  :host {
    display: block;
  }

  .card {
    border: 1px solid rgba(29, 35, 31, 0.12);
    border-radius: 28px;
    background: rgba(255, 255, 255, 0.72);
    box-shadow: 0 24px 60px rgba(64, 54, 44, 0.14);
    padding: 32px;
  }

  h1 {
    margin: 0 0 10px;
    font-size: clamp(36px, 7vw, 64px);
    letter-spacing: -0.06em;
    line-height: 0.92;
  }

  p {
    margin: 0 0 18px;
    color: #5a625d;
    font-size: 18px;
    line-height: 1.5;
  }
`;

export function defineDemoElements() {
  if (!customElements.get("demo-app")) {
    customElements.define("demo-app", DemoApp as any);
  }
}
