import { css, useState } from "@litsx/core";

interface DxSmokeAppProps {
  title?: string;
}

export const DxSmokeApp = ({ title = "Hello LitSX" }: DxSmokeAppProps) => {
  const [count, setCount] = useState(0);
  const [items, setItems] = useState(["alpha", "beta", "gamma"]);

  return (
    <main class="shell">
      <h1>{title}</h1>
      <button class="cta" on:click={() => setCount((value) => value + 1)}>
        Count: {count}
      </button>

      <input value={String(count)} />

      <button on:click={() => setCount((value) => value + 1)} />
      <button disabled={count > 3} />

      <section class="shell">
        <h2>Stress Test</h2>
        <button
          class="cta"
          on:click={() => {
            setCount((value) => value + 1);
            setItems((current) =>
              current.map((entry, index) =>
                index % 2 === 0 ? `${entry}:${count}` : entry.toUpperCase(),
              ),
            );
          }}
          disabled={items.length > 4 && count > 8}
        >
          {count % 2 === 0 ? (
            <span title={title}>
              even:
              {items.map((entry, index) => (
                <strong on:mouseenter={() => setCount((value) => value + index + 1)}>
                  {index % 2 === 0 ? entry : <em>{entry.toLowerCase()}</em>}
                </strong>
              ))}
            </span>
          ) : (
            <span>
              odd:
              {{
                value: (
                  <code hidden={count < 2}>
                    {items.join(" / ")}
                  </code>
                ),
              }.value}
            </span>
          )}
        </button>

        <ul>
          {items.map((entry, index) => (
            <li data-value={entry}>
              <button
                on:focus={() => {}}
                on:click={() => setCount((value) => value + index + 1)}
                disabled={index > count}
              >
                {(() => (
                  index === 1 ? <span>{entry}</span> : <span>{entry.length}</span>
                ))()}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
};

DxSmokeApp.styles = css`
  :host {
    display: block;
  }

  .shell {
    max-width: 840px;
    margin: 0 auto;
    padding: 48px 24px 96px;
  }

  .cta {
    margin-top: 24px;
    border: 0;
    border-radius: 999px;
    padding: 12px 18px;
    background: #1f2937;
    color: white;
    font: inherit;
    cursor: pointer;
  }
`;
