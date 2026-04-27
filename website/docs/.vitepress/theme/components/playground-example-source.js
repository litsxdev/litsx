export const counterExampleSource = `
import { useState, useStyle } from "litsx";

type CounterProps = {
  title: string;
  count: number;
};

export function Counter({
  title = "Counter",
  count: initialCount = 3,
}: CounterProps) {
  const [count, setCount] = useState(initialCount);
  const tone = count >= 8 ? "#0f766e" : count >= 4 ? "#b45309" : "#7c2d12";
  const level = count >= 8 ? "High" : count >= 4 ? "Medium" : "Low";

  ^styles(\`
    :host {
      display: block;
      font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
      color: #e5e7eb;
    }

    button {
      font: inherit;
    }

    .card {
      display: grid;
      gap: 0.75rem;
      width: min(100%, 20rem);
      padding: 1rem;
      border-radius: 1rem;
      background: #111827;
      border: 1px solid #1f2937;
    }

    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
    }

    .label {
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #94a3b8;
    }

    .value {
      margin: 0;
      font-size: 2.4rem;
      font-weight: 700;
    }

    .tag {
      padding: 0.3rem 0.55rem;
      border-radius: 999px;
      background: #1f2937;
      color: #cbd5e1;
      font-size: 0.78rem;
    }

    .button {
      border: 0;
      border-radius: 999px;
      padding: 0.55rem 0.9rem;
      background: var(--accent);
      color: white;
      cursor: pointer;
      font-weight: 600;
    }
  \`);

  useStyle("--accent", tone);

  return (
    <div class="card">
      <div class="label">{title}</div>
      <div class="row">
        <p class="value">{count}</p>
        <span class="tag">{level}</span>
      </div>
      <div class="row">
        <span class="tag">local state + runtime style</span>
        <button class="button" @click={() => setCount((value) => value + 1)}>
          Increment
        </button>
      </div>
    </div>
  );
}
`.trim();

export const propertyInferenceExampleSource = `

type ProfileCardProps = {
  title: string;
  subtitle: string;
  active: boolean;
  tone: "neutral" | "success";
  tags: string[];
  createdAt: Date;
  onSelect: (id: string) => void;
};

export function ProfileCard({
  title = "Ada Lovelace",
  subtitle = "Analytical Engine notes",
  active = true,
  tone = "success",
  tags = ["typed props", "reflect"],
  createdAt = new Date("1843-07-01"),
  onSelect = (id) => alert(\`Selected profile: \${id}\`),
}: ProfileCardProps) {
  ^properties<ProfileCardProps>({
    active: { reflect: true },
    tags: { attribute: false },
    createdAt: { attribute: false },
    onSelect: { attribute: false },
  });

  ^styles(\`
    :host {
      display: block;
      font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
      color: #e5e7eb;
    }

    button {
      font: inherit;
    }

    .card {
      display: grid;
      gap: 0.85rem;
      width: min(100%, 24rem);
      padding: 1rem;
      border-radius: 1rem;
      background: #0f172a;
      border: 1px solid #1e293b;
    }

    .eyebrow {
      font-size: 0.78rem;
      color: #94a3b8;
    }

    .title {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 700;
    }

    .subtitle {
      margin: 0.15rem 0 0;
      color: #cbd5e1;
    }

    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .pill {
      padding: 0.35rem 0.6rem;
      border-radius: 999px;
      background: #1e293b;
      font-size: 0.8rem;
      color: #cbd5e1;
    }

    .footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
    }

    .status {
      color: #fca5a5;
      font-weight: 600;
    }

    :host([active]) .status {
      color: #86efac;
    }

    :host([active]) .card[data-tone="success"] {
      border-color: #14532d;
    }

    .button {
      border: 0;
      border-radius: 999px;
      padding: 0.55rem 0.9rem;
      background: #f97316;
      color: white;
      cursor: pointer;
      font-weight: 600;
    }
  \`);

  return (
    <article class="card" data-tone={tone}>
      <div class="eyebrow">TypeScript owns the prop contract</div>
      <h2 class="title">{title}</h2>
      <p class="subtitle">{subtitle}</p>
      <div class="meta">
        <span class="pill">reflect: active</span>
        <span class="pill">js-only: callback / date / tags</span>
        <span class="pill">{createdAt.toISOString().slice(0, 10)}</span>
        <span class="pill">{tags.join(" · ")}</span>
      </div>
      <div class="footer">
        <span class="status">{active ? "Active" : "Idle"}</span>
        <button class="button" @click={() => onSelect(title)}>
          Select
        </button>
      </div>
    </article>
  );
}
`.trim();

export const jsxAuthoringExampleSource = `
import { useState } from "litsx";

type ComposerProps = {
  name: string;
};

export function Composer({ name = "world" }: ComposerProps) {
  const [count, setCount] = useState(0);

  ^styles(\`
    :host {
      display: block;
      font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
      color: #e5e7eb;
    }

    button {
      font: inherit;
    }

    *,
    *::before,
    *::after {
      box-sizing: border-box;
    }

    .card {
      width: min(100%, 24rem);
      padding: 1rem;
      border-radius: 1rem;
      background:
        radial-gradient(circle at top left, rgba(255, 255, 255, 0.08), transparent 40%),
        linear-gradient(160deg, #141d2e, #0f172a);
      box-shadow: 0 18px 40px rgba(15, 23, 42, 0.24);
    }

    .title {
      margin: 0;
      font-size: 1.5rem;
      font-weight: 700;
      line-height: 1.1;
    }

    .accent {
      color: #ff9f84;
    }

    .row {
      margin-top: 1rem;
      display: flex;
      align-items: center;
    }

    .button {
      appearance: none;
      border: 0;
      border-radius: 999px;
      padding: 0.55rem 0.9rem;
      background: #ff8666;
      color: white;
      cursor: pointer;
      font-weight: 600;
    }

    .preview {
      margin-top: 1rem;
      padding: 0.85rem 0.95rem;
      border-radius: 0.95rem;
      background: rgba(148, 163, 184, 0.12);
    }

    .body {
      margin: 0;
      line-height: 1.45;
      color: rgba(226, 232, 240, 0.9);
    }
  \`);

  return (
    <section class="card">
      <h2 class="title">
        Hello, <span class="accent">{name}</span>.
      </h2>

      <div class="row">
        <button class="button" @click={() => setCount((value) => value + 1)}>
          Click me
        </button>
      </div>

      <div class="preview">
        <p class="body">
          You clicked <strong>{count}</strong> time{count === 1 ? "" : "s"}.
        </p>
      </div>
    </section>
  );
}
`.trim();

export const litDirectivesExampleSource = `
import { useState } from "litsx";
import { keyed } from "lit/directives/keyed.js";
import { repeat } from "lit/directives/repeat.js";
import { when } from "lit/directives/when.js";

const initialMessages = [
  { id: "a", label: "Server ready", read: false },
  { id: "b", label: "New deployment", read: true },
  { id: "c", label: "Docs updated", read: false },
];

export function DirectiveInbox() {
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [cycle, setCycle] = useState(1);
  const [messages, setMessages] = useState(initialMessages);

  ^styles(\`
    :host {
      display: block;
      color: #f5efe5;
      font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
    }

    button {
      font: inherit;
    }

    .directive-card {
      width: min(100%, 28rem);
      padding: 1rem;
      border-radius: 1.1rem;
      background:
        radial-gradient(circle at top left, rgba(255, 255, 255, 0.12), transparent 40%),
        linear-gradient(165deg, #0f172a, #1e293b);
      box-shadow: 0 18px 42px rgba(15, 23, 42, 0.24);
      display: grid;
      gap: 0.9rem;
    }

    .directive-head {
      display: flex;
      justify-content: space-between;
      align-items: start;
      gap: 1rem;
    }

    .directive-title {
      margin: 0;
      font-size: 1.15rem;
      font-weight: 700;
    }

    .directive-copy {
      margin: 0.25rem 0 0;
      color: rgba(245, 239, 229, 0.72);
      font-size: 0.92rem;
    }

    .directive-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.55rem;
    }

    .directive-button {
      appearance: none;
      border: 0;
      border-radius: 999px;
      padding: 0.5rem 0.8rem;
      background: rgba(255, 255, 255, 0.1);
      color: inherit;
      cursor: pointer;
      font-weight: 600;
    }

    .directive-button--accent {
      background: #f97316;
      color: white;
    }

    .directive-list {
      display: grid;
      gap: 0.55rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .directive-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.72rem 0.82rem;
      border-radius: 0.9rem;
      background: rgba(255, 255, 255, 0.07);
    }

    .directive-pill {
      border-radius: 999px;
      padding: 0.22rem 0.5rem;
      font-size: 0.76rem;
      background: rgba(255, 255, 255, 0.1);
      color: rgba(245, 239, 229, 0.76);
    }

    .directive-empty {
      margin: 0;
      padding: 0.95rem 1rem;
      border-radius: 0.9rem;
      background: rgba(255, 255, 255, 0.06);
      color: rgba(245, 239, 229, 0.72);
    }
  \`);

  const visibleMessages = showUnreadOnly
    ? messages.filter((message) => !message.read)
    : messages;

  return (
    <div>
      {keyed(cycle, (
        <section class="directive-card">
          <header class="directive-head">
            <div>
              <h3 class="directive-title">Lit directives inside LitSX</h3>
              <p class="directive-copy">
                repeat(...) renders the list, when(...) swaps the empty state,
                and keyed(...) remounts the card.
              </p>
            </div>
            <span class="directive-pill">cycle {cycle}</span>
          </header>

          <div class="directive-actions">
            <button
              class="directive-button directive-button--accent"
              @click={() => setShowUnreadOnly((value) => !value)}
            >
              {showUnreadOnly ? "Show all" : "Unread only"}
            </button>
            <button
              class="directive-button"
              @click={() =>
                setMessages((items) =>
                  items.map((message, index) =>
                    index === 0 ? { ...message, read: !message.read } : message
                  )
                )
              }
            >
              Toggle first item
            </button>
            <button
              class="directive-button"
              @click={() => setCycle((value) => value + 1)}
            >
              Remount with keyed
            </button>
          </div>

          {when(
            visibleMessages.length > 0,
            () => (
              <ul class="directive-list">
                {repeat(
                  visibleMessages,
                  (message) => message.id,
                  (message) => (
                    <li class="directive-item">
                      <span>{message.label}</span>
                      <span class="directive-pill">
                        {message.read ? "Read" : "Unread"}
                      </span>
                    </li>
                  )
                )}
              </ul>
            ),
            () => <p class="directive-empty">No unread announcements.</p>
          )}
        </section>
      ))}
    </div>
  );
}
`.trim();

export const stylingExampleSource = `
import { useState, useStyle } from "litsx";

type AccentPanelProps = {
  title: string;
};

export function AccentPanel({ title = "System Accent" }: AccentPanelProps) {
  const accents = ["#fb7185", "#f97316", "#0ea5e9", "#22c55e"];
  const [accentIndex, setAccentIndex] = useState(0);
  const [active, setActive] = useState(true);
  const accent = accents[accentIndex];

  ^styles(\`
    :host {
      display: block;
      font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
      color: #e2e8f0;
    }

    button {
      font: inherit;
    }

    *,
    *::before,
    *::after {
      box-sizing: border-box;
    }

    .panel {
      width: min(100%, 26rem);
      padding: 1rem;
      border-radius: 1.15rem;
      border: 1px solid rgba(148, 163, 184, 0.18);
      border-left: 6px solid var(--panel-accent);
      background:
        radial-gradient(circle at top left, rgba(255, 255, 255, 0.08), transparent 42%),
        linear-gradient(165deg, #111827, #1f2937);
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.06),
        0 18px 40px rgba(15, 23, 42, 0.22);
      transition: transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease;
    }

    .panel[data-active] {
      transform: translateY(-1px);
      border-color: color-mix(in srgb, var(--panel-accent) 36%, rgba(255, 255, 255, 0.12));
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.06),
        0 20px 44px rgba(15, 23, 42, 0.26);
    }

    .eyebrow {
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: rgba(226, 232, 240, 0.62);
    }

    .title {
      margin: 0.35rem 0 0;
      font-size: 1.35rem;
      font-weight: 700;
    }

    .body {
      margin: 0.75rem 0 0;
      line-height: 1.5;
      color: rgba(226, 232, 240, 0.86);
    }

    .swatch {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      margin-top: 0.95rem;
      padding: 0.32rem 0.55rem;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.08);
      font-size: 0.8rem;
      color: rgba(226, 232, 240, 0.88);
    }

    .swatch-dot {
      width: 0.8rem;
      height: 0.8rem;
      border-radius: 999px;
      background: var(--panel-accent);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--panel-accent) 18%, transparent);
    }

    .footer {
      margin-top: 1rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
    }

    .button {
      appearance: none;
      border: 0;
      border-radius: 999px;
      padding: 0.55rem 0.9rem;
      background: var(--panel-accent);
      color: white;
      cursor: pointer;
      font-weight: 600;
    }

    .button--ghost {
      background: rgba(255, 255, 255, 0.08);
      color: rgba(226, 232, 240, 0.92);
    }
  \`);

  useStyle("--panel-accent", accent);

  return (
    <article class="panel" ?data-active={active}>
      <div class="eyebrow">Styling split</div>
      <h2 class="title">{title}</h2>
      <p class="body">
        The layout and selectors stay in ^styles(...). The accent color is driven at runtime
        through a CSS custom property.
      </p>

      <div class="swatch">
        <span class="swatch-dot" />
        {accent}
      </div>

      <div class="footer">
        <button class="button" @click={() => setAccentIndex((index) => (index + 1) % accents.length)}>
          Rotate accent
        </button>
        <button class="button button--ghost" @click={() => setActive((value) => !value)}>
          {active ? "Disable emphasis" : "Enable emphasis"}
        </button>
      </div>
    </article>
  );
}
`.trim();

export const primitivesExampleSource = `
import {
  useAfterUpdate,
  useOnCommit,
  useRef,
  useState,
} from "litsx";

type RuntimeCardProps = {
  label: string;
};

export function RuntimeCard({ label = "Runtime surface" }: RuntimeCardProps) {
  const [count, setCount] = useState(2);
  const buttonRef = useRef(null);
  const phaseRef = useRef(null);

  useOnCommit(() => {
    if (phaseRef.current) {
      phaseRef.current.textContent = "phase: commit";
    }
    buttonRef.current?.style.setProperty("transform", "translateY(-1px)");

    return () => {
      buttonRef.current?.style.removeProperty("transform");
    };
  }, [count]);

  useAfterUpdate(() => {
    const timer = setTimeout(() => {
      if (phaseRef.current) {
        phaseRef.current.textContent = "phase: after update";
      }
    }, 160);

    return () => clearTimeout(timer);
  }, [count]);

  ^styles(\`
    :host {
      display: block;
      font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
      color: #e2e8f0;
    }

    button {
      font: inherit;
    }

    *,
    *::before,
    *::after {
      box-sizing: border-box;
    }

    .card {
      width: min(100%, 25rem);
      padding: 1rem;
      border-radius: 1.1rem;
      background:
        radial-gradient(circle at top left, rgba(255, 255, 255, 0.08), transparent 40%),
        linear-gradient(160deg, #0f172a, #1e293b);
      box-shadow: 0 18px 40px rgba(15, 23, 42, 0.24);
    }

    .eyebrow {
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: rgba(226, 232, 240, 0.62);
    }

    .title {
      margin: 0.35rem 0 0;
      font-size: 1.35rem;
      font-weight: 700;
    }

    .metrics {
      margin-top: 0.9rem;
      display: flex;
      gap: 0.6rem;
      flex-wrap: wrap;
    }

    .pill {
      padding: 0.35rem 0.6rem;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.08);
      font-size: 0.8rem;
      color: rgba(226, 232, 240, 0.88);
    }

    .footer {
      margin-top: 1rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
    }

    .button {
      appearance: none;
      border: 0;
      border-radius: 999px;
      padding: 0.55rem 0.9rem;
      background: #38bdf8;
      color: #082f49;
      cursor: pointer;
      font-weight: 700;
      transition: transform 120ms ease;
    }

    .hint {
      margin-top: 0.9rem;
      color: rgba(226, 232, 240, 0.72);
      font-size: 0.9rem;
      line-height: 1.45;
    }
  \`);

  return (
    <article class="card">
      <div class="eyebrow">{label}</div>
      <h2 class="title">Native runtime hooks</h2>
      <div class="metrics">
        <span class="pill">count: {count}</span>
        <span ref={phaseRef} class="pill">phase: idle</span>
      </div>
      <div class="footer">
        <button ref={buttonRef} class="button" @click={() => setCount((value) => value + 1)}>
          Advance frame
        </button>
      </div>
      <p class="hint">
        useState keeps the value, useElement captures the button, useOnCommit runs on the commit
        path, and useAfterUpdate settles a moment later.
      </p>
    </article>
  );
}
`.trim();

export const controlledStateExampleSource = `
import { useControlledState } from "litsx";

type DisclosureProps = {
  title: string;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (value: boolean) => void;
};

export function Disclosure({
  title = "Design system panel",
  open,
  defaultOpen = true,
  onOpenChange,
}: DisclosureProps) {
  ^properties<DisclosureProps>({
    open: { attribute: false },
    defaultOpen: { attribute: false },
    onOpenChange: { attribute: false },
  });

  const [isOpen, setIsOpen] = useControlledState({
    value: open,
    defaultValue: defaultOpen,
    onChange: onOpenChange,
  });

  ^styles(\`
    :host {
      display: block;
      font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
      color: #e2e8f0;
    }

    button {
      font: inherit;
    }

    .card {
      display: grid;
      gap: 0.75rem;
      width: min(100%, 25rem);
      padding: 1rem;
      border-radius: 1rem;
      background: #102033;
      border: 1px solid #1d4ed8;
    }

    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
    }

    .title {
      margin: 0;
      font-size: 1rem;
      font-weight: 700;
    }

    .button {
      border: 0;
      border-radius: 999px;
      padding: 0.55rem 0.9rem;
      background: #38bdf8;
      color: #082f49;
      cursor: pointer;
      font-weight: 700;
    }

    .status {
      font-size: 0.85rem;
      color: #93c5fd;
    }

    .panel {
      padding: 0.85rem 0.95rem;
      border-radius: 0.9rem;
      background: #0f172a;
      border: 1px solid #1e3a8a;
    }
  \`);

  return (
    <section class="card">
      <div class="row">
        <h2 class="title">{title}</h2>
        <button class="button" @click={() => setIsOpen((value) => !value)}>
          {isOpen ? "Collapse" : "Expand"}
        </button>
      </div>

      <div class="status">
        controlled pattern: <code>open / defaultOpen / onOpenChange</code>
      </div>

      {isOpen ? (
        <div class="panel">
          This panel can be owned locally or driven from props without changing the authored
          component code.
        </div>
      ) : null}
    </section>
  );
}
`.trim();

export const errorBoundaryExampleSource = `
import { keyed } from "lit/directives/keyed.js";
import { ErrorBoundary, useState } from "litsx";

type BoundaryDemoProps = {
  title: string;
};

export function BoundaryDemo({ title = "Recoverable render failure" }: BoundaryDemoProps) {
  const [cycle, setCycle] = useState(0);
  const [shouldCrash, setShouldCrash] = useState(false);

  ^styles(\`
    :host {
      display: block;
      font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
      color: #e2e8f0;
    }

    button {
      font: inherit;
    }

    .card {
      width: min(100%, 26rem);
      padding: 1rem;
      border-radius: 1rem;
      background:
        radial-gradient(circle at top left, rgba(255, 255, 255, 0.08), transparent 38%),
        linear-gradient(155deg, #102033, #0f172a);
      box-shadow: 0 18px 40px rgba(15, 23, 42, 0.24);
    }

    .eyebrow {
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: rgba(226, 232, 240, 0.62);
    }

    .title {
      margin: 0.35rem 0 0;
      font-size: 1.35rem;
      font-weight: 700;
    }

    .body {
      margin: 0.7rem 0 0;
      line-height: 1.5;
      color: rgba(226, 232, 240, 0.82);
    }

    .panel {
      margin-top: 1rem;
      padding: 0.9rem 1rem;
      border-radius: 0.95rem;
      background: rgba(255, 255, 255, 0.06);
      border-left: 4px solid #38bdf8;
    }

    .panel--error {
      border-left-color: #fb7185;
      background: rgba(251, 113, 133, 0.12);
    }

    .panel__title {
      margin: 0;
      font-size: 1rem;
      font-weight: 700;
    }

    .panel__body {
      margin: 0.45rem 0 0;
      color: rgba(226, 232, 240, 0.84);
      line-height: 1.45;
    }

    .footer {
      margin-top: 1rem;
      display: flex;
      gap: 0.75rem;
      justify-content: flex-end;
    }

    .button {
      appearance: none;
      border: 0;
      border-radius: 999px;
      padding: 0.55rem 0.9rem;
      background: #38bdf8;
      color: #082f49;
      cursor: pointer;
      font-weight: 700;
    }

    .button--danger {
      background: #fb7185;
      color: white;
    }
  \`);

  return (
    <section class="card">
      <div class="eyebrow">Failure boundary</div>
      <h2 class="title">{title}</h2>
      <p class="body">
        ErrorBoundary catches synchronous render failures for one subtree and keeps the fallback
        latched until the boundary gets a new identity.
      </p>

      {keyed(cycle, (
        <ErrorBoundary
          .fallbackRenderer={(error) => (
            <div class="panel panel--error">
              <h3 class="panel__title">Fallback active</h3>
              <p class="panel__body">{error.message}</p>
              <div class="footer">
                <button
                  class="button"
                  @click={() => {
                    setShouldCrash(false);
                    setCycle((value) => value + 1);
                  }}
                >
                  Retry with new identity
                </button>
              </div>
            </div>
          )}
          .contentRenderer={() => {
            if (shouldCrash) {
              throw new Error("Profile panel renderer failed.");
            }

            return (
              <div class="panel">
                <h3 class="panel__title">Healthy subtree</h3>
                <p class="panel__body">
                  The content renders normally until you trip the boundary.
                </p>
              </div>
            );
          }}
        />
      ))}

      <div class="footer">
        <button
          class="button button--danger"
          @click={() => setShouldCrash(true)}
        >
          Trip boundary
        </button>
      </div>
    </section>
  );
}
`.trim();

export const staticExposeExampleSource = `
import { useState } from "litsx";

type Tone = "ocean" | "amber" | "rose";

type ProfileChipProps = {
  name: string;
  tone: Tone;
  note: string;
};

export function ProfileChip({
  name = "Ada Lovelace",
  tone = "ocean",
  note = "Ready for review",
}: ProfileChipProps) {
  ^properties<ProfileChipProps>({
    tone: { attribute: false },
  });

  ^expose({
    nextTone(current: Tone): Tone {
      const tones: Tone[] = ["ocean", "amber", "rose"];
      const index = tones.indexOf(current);
      return tones[(index + 1) % tones.length];
    },

    createPreset(seed: number) {
      const presets = [
        { name: "Ada Lovelace", tone: "ocean", note: "Analytical and steady" },
        { name: "Katherine Johnson", tone: "amber", note: "Precise under pressure" },
        { name: "Grace Hopper", tone: "rose", note: "Ships sharp decisions" },
      ];

      return presets[seed % presets.length];
    },

    createNote(name: string, tone: Tone) {
      return \`\${name} is currently in \${tone} mode.\`;
    },
  });

  ^styles(\`
    :host {
      display: block;
      font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
      color: #e2e8f0;
    }

    .card {
      padding: 1rem;
      border-radius: 1rem;
      background:
        radial-gradient(circle at top left, rgba(255, 255, 255, 0.08), transparent 40%),
        linear-gradient(160deg, #0f172a, #1e293b);
      box-shadow: 0 18px 40px rgba(15, 23, 42, 0.18);
    }

    .eyebrow {
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: rgba(226, 232, 240, 0.62);
    }

    .title {
      margin: 0.35rem 0 0;
      font-size: 1.2rem;
      font-weight: 700;
    }

    .note {
      margin: 0.75rem 0 0;
      color: rgba(226, 232, 240, 0.82);
      line-height: 1.45;
    }

    .tone {
      margin-top: 0.8rem;
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.35rem 0.65rem;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.08);
      font-size: 0.82rem;
      text-transform: capitalize;
    }

    .tone::before {
      content: "";
      width: 0.55rem;
      height: 0.55rem;
      border-radius: 999px;
      background: var(--tone-color);
      box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.06);
    }
  \`);

  const toneColor = tone === "ocean" ? "#38bdf8" : tone === "amber" ? "#f59e0b" : "#fb7185";

  return (
    <article class="card" style={\`--tone-color: \${toneColor};\`}>
      <div class="eyebrow">Child component</div>
      <h2 class="title">{name}</h2>
      <p class="note">{note}</p>
      <div class="tone">{tone}</div>
    </article>
  );
}

export function StaticExposeDemo() {
  const [seed, setSeed] = useState(0);
  const [profile, setProfile] = useState(() => ProfileChip.createPreset(0));

  ^styles(\`
    :host {
      display: block;
      font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
      color: #e2e8f0;
    }

    button {
      font: inherit;
    }

    .stack {
      width: min(100%, 28rem);
      display: grid;
      gap: 0.9rem;
    }

    .panel {
      padding: 1rem;
      border-radius: 1rem;
      background:
        radial-gradient(circle at top left, rgba(255, 255, 255, 0.08), transparent 38%),
        linear-gradient(155deg, #102033, #0f172a);
      box-shadow: 0 18px 40px rgba(15, 23, 42, 0.24);
    }

    .eyebrow {
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: rgba(226, 232, 240, 0.62);
    }

    .title {
      margin: 0.35rem 0 0;
      font-size: 1.3rem;
      font-weight: 700;
    }

    .body {
      margin: 0.7rem 0 0;
      color: rgba(226, 232, 240, 0.82);
      line-height: 1.5;
    }

    .controls {
      margin-top: 0.95rem;
      display: flex;
      flex-wrap: wrap;
      gap: 0.65rem;
    }

    .button {
      appearance: none;
      border: 0;
      border-radius: 999px;
      padding: 0.55rem 0.9rem;
      background: #38bdf8;
      color: #082f49;
      cursor: pointer;
      font-weight: 700;
    }

    .button--ghost {
      background: rgba(255, 255, 255, 0.08);
      color: #e2e8f0;
    }

    .hint {
      margin-top: 0.85rem;
      font-size: 0.88rem;
      color: rgba(226, 232, 240, 0.72);
    }
  \`);

  return (
    <section class="stack">
      <div class="panel">
        <div class="eyebrow">Parent component</div>
        <h2 class="title">Imperative child class API</h2>
        <p class="body">
          The parent drives the child by calling static methods generated from <code>^expose(...)</code>.
        </p>
        <div class="controls">
          <button
            class="button"
            @click={() => {
              const nextSeed = seed + 1;
              setSeed(nextSeed);
              setProfile(ProfileChip.createPreset(nextSeed));
            }}
          >
            Load child preset
          </button>
          <button
            class="button button--ghost"
            @click={() =>
              setProfile((current) => {
                const nextTone = ProfileChip.nextTone(current.tone);
                return {
                  ...current,
                  tone: nextTone,
                  note: ProfileChip.createNote(current.name, nextTone),
                };
              })
            }
          >
            Ask child for next tone
          </button>
        </div>
        <p class="hint">
          This is class-level imperative coordination, not an instance ref handle.
        </p>
      </div>

      <ProfileChip
        .name={profile.name}
        .tone={profile.tone}
        .note={profile.note}
      />
    </section>
  );
}
`.trim();

export const lightDomExampleSource = `
import { LitElement, css, html } from "lit";
import { LightDomElementsMixin, LightDomMixin } from "litsx/runtime-infrastructure";

// Native Lit classes: these are the two concrete implementations that collide
// on purpose under the same base tag, <profile-chip>.
class AdminProfileChip extends LitElement {
  static properties = {
    label: { type: String },
  };

  static styles = css\`
    :host {
      display: inline-flex;
    }

    .chip {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      padding: 0.45rem 0.7rem;
      border-radius: 999px;
      background: rgba(14, 116, 144, 0.12);
      color: #0f172a;
      font: 600 0.82rem/1 "IBM Plex Sans", "Segoe UI", sans-serif;
      border: 1px solid rgba(14, 116, 144, 0.22);
    }

    .dot {
      width: 0.55rem;
      height: 0.55rem;
      border-radius: 999px;
      background: #0891b2;
    }
  \`;

  render() {
    return html\`<span class="chip"><span class="dot"></span>\${this.label}</span>\`;
  }
}

class GuestProfileChip extends LitElement {
  static properties = {
    label: { type: String },
  };

  static styles = css\`
    :host {
      display: inline-flex;
    }

    .chip {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      padding: 0.45rem 0.7rem;
      border-radius: 999px;
      background: rgba(194, 65, 12, 0.12);
      color: #0f172a;
      font: 600 0.82rem/1 "IBM Plex Sans", "Segoe UI", sans-serif;
      border: 1px solid rgba(194, 65, 12, 0.22);
    }

    .dot {
      width: 0.55rem;
      height: 0.55rem;
      border-radius: 999px;
      background: #ea580c;
    }
  \`;

  render() {
    return html\`<span class="chip"><span class="dot"></span>\${this.label}</span>\`;
  }
}

// Native Lit + LitSX runtime mixins: each host publishes its own contextual
// light DOM registry for the same "profile-chip" tag.
class AdminPanel extends LightDomElementsMixin(LightDomMixin(LitElement)) {
  static elements = {
    "profile-chip": AdminProfileChip,
  };

  static styles = css\`
    .panel {
      padding: 1rem;
      border-radius: 1rem;
      background: #ecfeff;
      border: 1px solid rgba(8, 145, 178, 0.16);
    }

    .eyebrow {
      font: 600 0.72rem/1 "IBM Plex Sans", "Segoe UI", sans-serif;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: rgba(14, 116, 144, 0.8);
    }

    .title {
      margin: 0.45rem 0 0;
      font: 700 1.1rem/1.15 "IBM Plex Sans", "Segoe UI", sans-serif;
      color: #0f172a;
    }

    .body {
      margin: 0.6rem 0 0;
      color: #334155;
      font: 0.94rem/1.45 "IBM Plex Sans", "Segoe UI", sans-serif;
    }
  \`;

  render() {
    return html\`
      <section class="panel">
        <div class="eyebrow">Admin host</div>
        <h3 class="title">Same tag, admin implementation</h3>
        <p class="body">This subtree resolves <code>&lt;profile-chip&gt;</code> to the admin ctor.</p>
        <profile-chip label="Admin permissions"></profile-chip>
      </section>
    \`;
  }
}

class GuestPanel extends LightDomElementsMixin(LightDomMixin(LitElement)) {
  static elements = {
    "profile-chip": GuestProfileChip,
  };

  static styles = css\`
    .panel {
      padding: 1rem;
      border-radius: 1rem;
      background: #fff7ed;
      border: 1px solid rgba(234, 88, 12, 0.16);
    }

    .eyebrow {
      font: 600 0.72rem/1 "IBM Plex Sans", "Segoe UI", sans-serif;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: rgba(194, 65, 12, 0.8);
    }

    .title {
      margin: 0.45rem 0 0;
      font: 700 1.1rem/1.15 "IBM Plex Sans", "Segoe UI", sans-serif;
      color: #0f172a;
    }

    .body {
      margin: 0.6rem 0 0;
      color: #334155;
      font: 0.94rem/1.45 "IBM Plex Sans", "Segoe UI", sans-serif;
    }
  \`;

  render() {
    return html\`
      <section class="panel">
        <div class="eyebrow">Guest host</div>
        <h3 class="title">Same tag, guest implementation</h3>
        <p class="body">This subtree resolves the same <code>&lt;profile-chip&gt;</code> tag to a different ctor.</p>
        <profile-chip label="Guest badge"></profile-chip>
      </section>
    \`;
  }
}

// LitSX authored host: the transform registers <admin-panel> and <guest-panel>
// automatically from the sibling classes above. No manual customElements.define(...)
// is needed for those tags in the demo.
export function LightDomPalette() {
  ^lightDom();

  return (
    <section
      style="
        box-sizing: border-box;
        display: grid;
        gap: 1rem;
        width: min(100%, 42rem);
        padding: 1rem;
        border-radius: 1.15rem;
        background: linear-gradient(180deg, #ffffff, #f8fafc);
        box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
      "
    >
      <header>
        <div
          style="
            font: 600 0.72rem/1 IBM Plex Sans, Segoe UI, sans-serif;
            text-transform: uppercase;
            letter-spacing: 0.12em;
            color: rgba(71, 85, 105, 0.8);
          "
        >
          Light DOM registry
        </div>
        <h2
          style="
            margin: 0.45rem 0 0;
            font: 700 1.45rem/1.1 IBM Plex Sans, Segoe UI, sans-serif;
            color: #0f172a;
          "
        >
          Two hosts, one tag base, different implementations
        </h2>
        <p
          style="
            margin: 0.7rem 0 0;
            color: #475569;
            font: 0.96rem/1.5 IBM Plex Sans, Segoe UI, sans-serif;
          "
        >
          Both hosts render <code>&lt;profile-chip&gt;</code>. The global registry only holds the shared proxy.
          Each light DOM host provides its own contextual mapping through <code>static elements</code>.
        </p>
      </header>

      <AdminPanel />
      <GuestPanel />
    </section>
  );
}
`.trim();

export const lightDomStylingExampleSource = `
import { useState } from "litsx";

type LightDomPaletteProps = {
  title: string;
};

export function LightDomPalette({
  title = "Light DOM surface",
}: LightDomPaletteProps) {
  ^lightDom();

  const [accent, setAccent] = useState("#0f766e");
  const [tone, setTone] = useState("Forest");

  ^styles(\`
    :host {
      display: block;
      font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
    }

    button {
      font: inherit;
    }

    .card {
      width: min(100%, 28rem);
      padding: 1rem;
      border-radius: 1rem;
      background: color-mix(in srgb, var(--surface, #ffffff) 92%, var(--accent) 8%);
      border: 1px solid color-mix(in srgb, var(--accent) 30%, white);
      box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
      color: var(--text, #0f172a);
    }

    .eyebrow {
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: color-mix(in srgb, var(--text, #0f172a) 60%, white);
    }

    .title {
      margin: 0.35rem 0 0;
      font-size: 1.35rem;
      font-weight: 700;
    }

    .body {
      margin: 0.7rem 0 0;
      line-height: 1.5;
      color: color-mix(in srgb, var(--text, #0f172a) 78%, white);
    }

    .chip {
      margin-top: 0.85rem;
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      padding: 0.35rem 0.65rem;
      border-radius: 999px;
      background: color-mix(in srgb, var(--accent) 14%, white);
      color: var(--text, #0f172a);
      font-size: 0.82rem;
      font-weight: 600;
    }

    .chip::before {
      content: "";
      width: 0.55rem;
      height: 0.55rem;
      border-radius: 999px;
      background: var(--accent);
      box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 18%, white);
    }

    .controls {
      margin-top: 1rem;
      display: flex;
      flex-wrap: wrap;
      gap: 0.65rem;
    }

    .button {
      appearance: none;
      border: 0;
      border-radius: 999px;
      padding: 0.55rem 0.9rem;
      background: var(--accent);
      color: white;
      cursor: pointer;
      font-weight: 700;
    }

    .button--ghost {
      background: transparent;
      color: var(--text, #0f172a);
      border: 1px solid color-mix(in srgb, var(--accent) 35%, white);
    }

    .hint {
      margin-top: 0.85rem;
      font-size: 0.88rem;
      color: color-mix(in srgb, var(--text, #0f172a) 70%, white);
    }
  \`);

  return (
    <section
      style={\`--accent: \${accent}; --surface: #f8fafc; --text: #0f172a;\`}
      class="card"
    >
      <div class="eyebrow">Static hoist</div>
      <h2 class="title">{title}</h2>
      <p class="body">
        This component opts out of the default shadow root. The DOM stays in light DOM,
        so host-level variables and surrounding page styles flow through normally.
      </p>
      <div class="chip">{tone}</div>
      <div class="controls">
        <button
          class="button"
          @click={() => {
            setAccent("#0f766e");
            setTone("Forest");
          }}
        >
          Forest
        </button>
        <button
          class="button"
          @click={() => {
            setAccent("#c2410c");
            setTone("Copper");
          }}
        >
          Copper
        </button>
        <button
          class="button button--ghost"
          @click={() => {
            setAccent("#7c3aed");
            setTone("Iris");
          }}
        >
          Iris
        </button>
      </div>
      <p class="hint">
        Light DOM keeps this component in the page's normal styling flow.
      </p>
    </section>
  );
}
`.trim();

export const scopedElementsBaselineExampleSource = `
import { LitElement, css, html } from "lit";
import { useState } from "litsx";

class StatusBadge extends LitElement {
  static properties = {
    label: { type: String },
    tone: { type: String },
  };

  static styles = css\`
    :host {
      display: inline-flex;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.35rem 0.65rem;
      border-radius: 999px;
      background: color-mix(in srgb, var(--tone, #38bdf8) 18%, white);
      color: #0f172a;
      font: 600 0.82rem/1 "IBM Plex Sans", "Segoe UI", sans-serif;
    }

    .dot {
      width: 0.5rem;
      height: 0.5rem;
      border-radius: 999px;
      background: var(--tone, #38bdf8);
    }
  \`;

  constructor() {
    super();
    this.label = "Ready";
    this.tone = "#38bdf8";
  }

  render() {
    return html\`
      <span class="badge" style=\${\`--tone: \${this.tone};\`}>
        <span class="dot"></span>
        <span>\${this.label}</span>
      </span>
    \`;
  }
}

type ScopedElementsBaselineProps = {
  title: string;
};

export function ScopedElementsBaseline({
  title = "Scoped elements baseline",
}: ScopedElementsBaselineProps) {
  const [active, setActive] = useState(true);

  ^styles(\`
    :host {
      display: block;
      font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
      color: #e2e8f0;
    }

    button {
      font: inherit;
    }

    .card {
      width: min(100%, 26rem);
      padding: 1rem;
      border-radius: 1.15rem;
      background:
        radial-gradient(circle at top left, rgba(255, 255, 255, 0.08), transparent 40%),
        linear-gradient(160deg, #111827, #1e293b);
      box-shadow: 0 18px 40px rgba(15, 23, 42, 0.24);
    }

    .eyebrow {
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: rgba(226, 232, 240, 0.62);
    }

    .title {
      margin: 0.35rem 0 0;
      font-size: 1.35rem;
      font-weight: 700;
    }

    .body {
      margin: 0.7rem 0 0;
      line-height: 1.5;
      color: rgba(226, 232, 240, 0.82);
    }

    .row {
      margin-top: 1rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
    }

    .button {
      appearance: none;
      border: 0;
      border-radius: 999px;
      padding: 0.55rem 0.9rem;
      background: #f97316;
      color: white;
      cursor: pointer;
      font-weight: 600;
    }
  \`);

  return (
    <section class="card">
      <div class="eyebrow">Scoped registry</div>
      <h2 class="title">{title}</h2>
      <p class="body">
        This baseline isolates scoped custom elements without suspense or async rendering.
      </p>
      <div class="row">
        <StatusBadge
          label={active ? "Registry active" : "Registry idle"}
          tone={active ? "#38bdf8" : "#f97316"}
        />
        <button class="button" @click={() => setActive((value) => !value)}>
          Toggle
        </button>
      </div>
    </section>
  );
}
`.trim();

export const suspenseExampleSource = `
import { keyed } from "lit/directives/keyed.js";
import {
  SuspenseBoundary,
  SuspenseList,
  useRef,
  useState,
} from "litsx";

function createProfileResource(name, role, delay, tone) {
  let status = "pending";
  let value = null;

  const promise = new Promise((resolve) => {
    setTimeout(() => {
      status = "resolved";
      value = { name, role, tone };
      resolve(value);
    }, delay);
  });

  return {
    read() {
      if (status !== "resolved") {
        throw promise;
      }

      return value;
    },
  };
}

function createResourceSet() {
  return {
    alpha: createProfileResource("Alpha", "Edge cache warm", 700, "#38bdf8"),
    beta: createProfileResource("Beta", "Search index synced", 1400, "#f97316"),
  };
}

type AsyncShowcaseProps = {
  title: string;
};

export function AsyncShowcase({ title = "Async reveal order" }: AsyncShowcaseProps) {
  const [cycle, setCycle] = useState(0);
  const resourcesRef = useRef(null);

  if (resourcesRef.current == null || resourcesRef.current.cycle !== cycle) {
    resourcesRef.current = {
      cycle,
      resources: createResourceSet(),
    };
  }

  const resources = resourcesRef.current.resources;

  ^styles(\`
    :host {
      display: block;
      font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
      color: #e2e8f0;
    }

    button {
      font: inherit;
    }

    *,
    *::before,
    *::after {
      box-sizing: border-box;
    }

    .card {
      width: min(100%, 28rem);
      padding: 1rem;
      border-radius: 1.15rem;
      background:
        radial-gradient(circle at top left, rgba(255, 255, 255, 0.08), transparent 40%),
        linear-gradient(160deg, #111827, #1e293b);
      box-shadow: 0 18px 40px rgba(15, 23, 42, 0.24);
    }

    .eyebrow {
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: rgba(226, 232, 240, 0.62);
    }

    .title {
      margin: 0.35rem 0 0;
      font-size: 1.35rem;
      font-weight: 700;
    }

    .body {
      margin: 0.7rem 0 0;
      line-height: 1.5;
      color: rgba(226, 232, 240, 0.82);
    }

    .list {
      margin-top: 1rem;
      display: grid;
      gap: 0.75rem;
    }

    .profile {
      border-left: 4px solid var(--profile-tone, rgba(148, 163, 184, 0.55));
      padding: 0.85rem 0.9rem;
      border-radius: 0.95rem;
      background: rgba(255, 255, 255, 0.06);
    }

    .profile--loading {
      border-left-color: rgba(148, 163, 184, 0.45);
      color: rgba(226, 232, 240, 0.78);
    }

    .profile__eyebrow {
      font-size: 0.68rem;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: rgba(226, 232, 240, 0.58);
    }

    .profile__title {
      margin: 0.3rem 0 0;
      font-size: 1.05rem;
      font-weight: 700;
    }

    .profile__body {
      margin: 0.45rem 0 0;
      color: rgba(226, 232, 240, 0.84);
    }

    .footer {
      margin-top: 1rem;
      display: flex;
      justify-content: flex-end;
    }

    .button {
      appearance: none;
      border: 0;
      border-radius: 999px;
      padding: 0.55rem 0.9rem;
      background: #f97316;
      color: white;
      cursor: pointer;
      font-weight: 600;
    }
  \`);

  return (
    <section class="card">
      <div class="eyebrow">Suspense primitives</div>
      <h2 class="title">{title}</h2>
      <p class="body">
        Each panel resolves independently, but SuspenseList coordinates the reveal order so the
        second panel does not jump ahead of the first one.
      </p>

      <div class="list">
        <SuspenseList reveal-order="forwards" tail="collapsed">
          {keyed(\`alpha-\${cycle}\`, (
            <SuspenseBoundary
              .fallbackRenderer={() => (
                <article class="profile profile--loading">
                  <div class="profile__eyebrow">Pending</div>
                  <h3 class="profile__title">Alpha panel</h3>
                  <p class="profile__body">Waiting behind the suspense boundary...</p>
                </article>
              )}
              .contentRenderer={() => {
                const profile = resources.alpha.read();

                return (
                  <article class="profile" style={\`--profile-tone: \${profile.tone};\`}>
                    <div class="profile__eyebrow">Resolved</div>
                    <h3 class="profile__title">{profile.name}</h3>
                    <p class="profile__body">{profile.role}</p>
                  </article>
                );
              }}
            />
          ))}
          {keyed(\`beta-\${cycle}\`, (
            <SuspenseBoundary
              .fallbackRenderer={() => (
                <article class="profile profile--loading">
                  <div class="profile__eyebrow">Pending</div>
                  <h3 class="profile__title">Beta panel</h3>
                  <p class="profile__body">Waiting behind the suspense boundary...</p>
                </article>
              )}
              .contentRenderer={() => {
                const profile = resources.beta.read();

                return (
                  <article class="profile" style={\`--profile-tone: \${profile.tone};\`}>
                    <div class="profile__eyebrow">Resolved</div>
                    <h3 class="profile__title">{profile.name}</h3>
                    <p class="profile__body">{profile.role}</p>
                  </article>
                );
              }}
            />
          ))}
        </SuspenseList>
      </div>

      <div class="footer">
        <button class="button" @click={() => setCycle((value) => value + 1)}>
          Replay loading
        </button>
      </div>
    </section>
  );
}
`.trim();

export const reactMigrationExampleSource = `
import {
  forwardRef,
  lazy,
  memo,
  Suspense,
  useDeferredValue,
  useMemo,
  useRef,
  useState,
} from "react";

const resultsPanelModuleSource = [
  'import { LitElement, html } from "lit";',
  "",
  "export default class ResultsPanel extends LitElement {",
  "  static properties = {",
  "    query: { type: String },",
  "  };",
  "",
  "  render() {",
  "    return html\`<p class=\\"search-status\\">Top result for \\"\\\${this.query}\\"</p>\`;",
  "  }",
  "}",
].join("\\n");

const resultsPanelModuleUrl =
  "data:text/javascript;charset=utf-8," +
  encodeURIComponent(resultsPanelModuleSource);

const ResultsPanel = lazy(() =>
  import(resultsPanelModuleUrl).then((mod) => mod.default)
);

type SearchCardProps = {
  initialQuery?: string;
};

const ReactMigrationDemo = memo(
  forwardRef(function SearchCard(
    { initialQuery = "LitSX" }: SearchCardProps,
    forwardedRef
  ) {
    const [query, setQuery] = useState(initialQuery);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const deferredQuery = useDeferredValue(query);

    const normalizedQuery = useMemo(
      () => deferredQuery.trim().toLowerCase(),
      [deferredQuery]
    );

    return (
      <section className="search-card" ref={forwardedRef}>
        <label className="search-label" htmlFor="search-box">
          Search docs
        </label>
        <input
          id="search-box"
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Suspense fallback={<p className="search-status">Loading results…</p>}>
          <ResultsPanel query={normalizedQuery} />
        </Suspense>
      </section>
    );
  })
);

export { ReactMigrationDemo };
`.trim();

export const reactForwardRefExampleSource = `
import { useRef, useState } from "react";

type SearchFieldProps = {
  label?: string;
  ref?: React.Ref<HTMLInputElement>;
};

function SearchField({ label = "Forwarded input", ref }: SearchFieldProps) {
  return (
    <label className="forward-ref-card">
      <span className="forward-ref-label">{label}</span>
      <input ref={ref} placeholder="Focus me from the parent" />
    </label>
  );
}

export function ReactForwardRefDemo() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState("Idle");

  return (
    <div className="forward-ref-stack">
      <SearchField ref={inputRef} />
      <button
        className="forward-ref-button"
        onClick={() => {
          inputRef.current?.focus();
          setStatus(
            inputRef.current
              ? "Focused the inner input through forwardRef."
              : "Missing forwarded target."
          );
        }}
      >
        Focus input
      </button>
      <p className="forward-ref-status">{status}</p>
    </div>
  );
}
`.trim();

export const reactContextExampleSource = `
import React, { createContext, useContext, useState } from "react";

const ThemeContext = createContext("light");

function ThemeBadge() {
  const theme = useContext(ThemeContext);

  return (
    <span className={theme === "dark" ? "theme-badge theme-badge--dark" : "theme-badge"}>
      Active theme: {theme}
    </span>
  );
}

function ThemePreview() {
  return (
    <ThemeContext.Consumer>
      {(theme) => (
        <p className="theme-preview">
          Consumer sees: <strong>{theme}</strong>
        </p>
      )}
    </ThemeContext.Consumer>
  );
}

export function ReactContextDemo() {
  const [theme, setTheme] = useState("dark");

  return (
    <ThemeContext.Provider value={theme}>
      <section className="theme-panel">
        <div className="theme-panel__eyebrow">React context compat</div>
        <h2 className="theme-panel__title">Provider + useContext + Consumer</h2>

        <div className="theme-panel__controls">
          <button
            className="theme-panel__button"
            onClick={() => setTheme((current) => (current === "dark" ? "sunrise" : "dark"))}
          >
            Toggle theme
          </button>
          <ThemeBadge />
        </div>

        <ThemePreview />
      </section>
    </ThemeContext.Provider>
  );
}
`.trim();

export const nativeRefResolutionExampleSource = `
import { useExpose, useRef, useState } from "litsx";

type InputApi = {
  focus(): void;
  clear(): void;
  value(): string;
};

type RefProp<T> = { current: T | null };

function HostRefCard({ ref }: { ref?: RefProp<HTMLElement> }) {
  ^styles(\`
    :host {
      display: block;
      color: #f4efe8;
      font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
    }

    .ref-card {
      display: grid;
      gap: 0.45rem;
      padding: 0.8rem 0.9rem;
      border-radius: 0.9rem;
      background: #182234;
      border: 1px solid #263346;
      color: #f8fafc;
    }

    .ref-card span {
      font-size: 0.82rem;
      color: #93c5fd;
    }
  \`);

  return (
    <section class="ref-card">
      <span>Component instance ref</span>
      <strong>Host instance ref</strong>
    </section>
  );
}

function ForwardedDomInput({ ref }: { ref?: RefProp<HTMLInputElement> }) {
  ^styles(\`
    :host {
      display: block;
      color: #f4efe8;
      font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
    }

    input {
      font: inherit;
    }

    .ref-card {
      display: grid;
      gap: 0.45rem;
      padding: 0.8rem 0.9rem;
      border-radius: 0.9rem;
      background: #182234;
      border: 1px solid #263346;
      color: #f8fafc;
    }

    .ref-card span {
      font-size: 0.82rem;
      color: #93c5fd;
    }

    .ref-card input {
      width: 100%;
      box-sizing: border-box;
      border: 0;
      border-radius: 0.75rem;
      padding: 0.7rem 0.8rem;
      background: #0f172a;
      color: #f8fafc;
      box-shadow: inset 0 0 0 1px #334155;
    }

    .ref-card input::placeholder {
      color: #64748b;
    }
  \`);

  return (
    <label class="ref-card">
      <span>Forwarded DOM ref</span>
      <input ref={ref} placeholder="Forwarded input" />
    </label>
  );
}

function ImperativeHandleInput({ ref }: { ref?: RefProp<InputApi> }) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  ^styles(\`
    :host {
      display: block;
      color: #f4efe8;
      font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
    }

    input {
      font: inherit;
    }

    .ref-card {
      display: grid;
      gap: 0.45rem;
      padding: 0.8rem 0.9rem;
      border-radius: 0.9rem;
      background: #182234;
      border: 1px solid #263346;
      color: #f8fafc;
    }

    .ref-card span {
      font-size: 0.82rem;
      color: #93c5fd;
    }

    .ref-card input {
      width: 100%;
      box-sizing: border-box;
      border: 0;
      border-radius: 0.75rem;
      padding: 0.7rem 0.8rem;
      background: #0f172a;
      color: #f8fafc;
      box-shadow: inset 0 0 0 1px #334155;
    }

    .ref-card input::placeholder {
      color: #64748b;
    }
  \`);

  useExpose(ref, () => ({
    focus() {
      inputRef.current?.focus();
    },
    clear() {
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    },
    value() {
      return inputRef.current?.value ?? "";
    },
  }), [inputRef]);

  return (
    <label class="ref-card">
      <span>Imperative handle</span>
      <input ref={inputRef} placeholder="Imperative input" />
    </label>
  );
}

export function NativeRefResolutionDemo() {
  const hostRef = useRef<HTMLElement | null>(null);
  const domRef = useRef<HTMLInputElement | null>(null);
  const apiRef = useRef<InputApi | null>(null);
  const [status, setStatus] = useState("Idle");

  ^styles(\`
    :host {
      display: block;
      color: #f4efe8;
      font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
    }

    button {
      font: inherit;
    }

    .ref-stack {
      display: grid;
      gap: 0.9rem;
      padding: 1rem;
      border-radius: 1rem;
      background: #0f172a;
      border: 1px solid #1e293b;
    }

    .ref-actions {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
      gap: 0.65rem;
    }

    .ref-button {
      border: 0;
      border-radius: 999px;
      padding: 0.72rem 0.9rem;
      background: #38bdf8;
      color: #082f49;
      cursor: pointer;
      font-weight: 700;
    }

    .ref-status {
      margin: 0;
      padding: 0.8rem 0.95rem;
      border-radius: 0.85rem;
      background: #111827;
      color: #dbeafe;
      border: 1px solid #1e293b;
      font-size: 0.95rem;
    }
  \`);

  return (
    <div class="ref-stack">
      <HostRefCard ref={hostRef} />
      <ForwardedDomInput ref={domRef} />
      <ImperativeHandleInput ref={apiRef} />
      <div class="ref-actions">
        <button
          class="ref-button"
          @click={() => {
            const tag = hostRef.current?.tagName?.toLowerCase?.() ?? "missing";
            setStatus(\`Host ref -> \${tag}\`);
          }}
        >
          Read host ref
        </button>
        <button
          class="ref-button"
          @click={() => {
            domRef.current?.focus();
            setStatus(domRef.current ? "DOM ref -> input node" : "DOM ref missing");
          }}
        >
          Focus DOM ref
        </button>
        <button
          class="ref-button"
          @click={() => {
            apiRef.current?.clear();
            apiRef.current?.focus();
            setStatus(apiRef.current ? "Imperative ref -> handle" : "Imperative ref missing");
          }}
        >
          Use imperative ref
        </button>
      </div>
      <p class="ref-status">{status}</p>
    </div>
  );
}
`.trim();

export const useEmitExampleSource = `
import { useEmit, useState } from "litsx";

function EventEmitterButton() {
  ^styles(\`
    :host {
      display: block;
      font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
      color: #f4efe8;
    }

    .emit-card {
      display: grid;
      gap: 0.75rem;
      padding: 1rem;
      border-radius: 1rem;
      background: linear-gradient(160deg, rgba(14, 23, 36, 0.96), rgba(33, 54, 80, 0.88));
      border: 1px solid rgba(148, 163, 184, 0.2);
    }

    .emit-label {
      display: grid;
      gap: 0.35rem;
      font-size: 0.84rem;
      color: rgba(244, 239, 232, 0.74);
      letter-spacing: 0.03em;
    }

    .emit-button {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.72rem 0.86rem;
      border-radius: 999px;
      background: rgba(15, 23, 42, 0.72);
      color: #f8fafc;
      font: 600 0.9rem/1 "IBM Plex Sans", "Segoe UI", sans-serif;
      box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.24);
      border: 0;
      cursor: pointer;
      transition: transform 140ms ease, box-shadow 140ms ease, background 140ms ease;
    }

    .emit-button:hover {
      background: rgba(30, 41, 59, 0.88);
      box-shadow:
        inset 0 0 0 1px rgba(125, 211, 252, 0.4),
        0 0.6rem 1.4rem rgba(15, 23, 42, 0.18);
    }

    .emit-button:focus-visible {
      outline: none;
      box-shadow:
        inset 0 0 0 1px rgba(56, 189, 248, 0.7),
        0 0 0 0.24rem rgba(56, 189, 248, 0.18);
    }

    .emit-button:active {
      transform: translateY(1px) scale(0.99);
    }

    .emit-dot {
      width: 0.55rem;
      height: 0.55rem;
      border-radius: 999px;
      background: #38bdf8;
      box-shadow: 0 0 0 0.24rem rgba(56, 189, 248, 0.16);
    }

    .emit-status {
      margin: 0;
      padding: 0.78rem 0.9rem;
      border-radius: 0.85rem;
      background: rgba(255, 255, 255, 0.06);
      color: rgba(244, 239, 232, 0.92);
      font-size: 0.9rem;
    }

  \`);

  const emit = useEmit();
  const [index, setIndex] = useState(0);
  const options = ["Alpha", "Beta", "Gamma"];
  const current = options[index];

  return (
    <div class="emit-card">
      <div class="emit-label">
        Public change event
        <button
          @click={() => {
            const nextIndex = (index + 1) % options.length;
            setIndex(nextIndex);
            emit("change", current);
          }}
          class="emit-button"
        >
          <span class="emit-dot"></span>
          Emit next value: {current}
        </button>
      </div>
      <p class="emit-status">Current internal value: {current}</p>
    </div>
  );
}

export function UseEmitDemo() {
  const [lastEvent, setLastEvent] = useState("Nothing emitted yet");

  return (
    <section
      @change={(event) => {
        setLastEvent(String(event.detail || ""));
      }}
      style="display:grid; gap:0.85rem;"
    >
      <EventEmitterButton />
      <p style="margin:0; color:#51606f; font:600 0.9rem/1.45 'IBM Plex Sans', 'Segoe UI', sans-serif;">
        Last change event detail: <strong style="color:#1f2937;">{lastEvent}</strong>
      </p>
    </section>
  );
}
`.trim();

export const useAsyncStateExampleSource = `
import { useAsyncState } from "litsx";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function UseAsyncStateDemo() {
  ^styles(\`
    :host {
      display: block;
      font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
      color: #e5e7eb;
    }

    button {
      font: inherit;
    }

    .card {
      display: grid;
      gap: 0.85rem;
      padding: 1rem;
      border-radius: 1rem;
      background: #111827;
      border: 1px solid #1f2937;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.65rem;
    }

    .button {
      padding: 0.7rem 0.88rem;
      border-radius: 999px;
      border: 0;
      cursor: pointer;
      color: #e2e8f0;
      background: #1e293b;
    }

    .button[data-kind="primary"] {
      background: #0f766e;
    }

    .button[data-kind="danger"] {
      background: #7f1d1d;
    }

    .status {
      margin: 0;
      padding: 0.78rem 0.9rem;
      border-radius: 0.85rem;
      background: #0f172a;
      color: #e2e8f0;
      font-size: 0.92rem;
    }

    .error {
      color: #fda4af;
    }
  \`);

  const [count, saveCount, meta] = useAsyncState(1, async (_current, nextCount) => {
    await wait(450);
    if (nextCount === 13) {
      throw new Error("13 is reserved");
    }
    return nextCount;
  });

  return (
    <div class="card">
      <div class="actions">
        <button
          class="button"
          data-kind="primary"
          @click={() => saveCount(count + 1)}
        >
          Save next count
        </button>
        <button
          class="button"
          data-kind="danger"
          @click={() => {
            saveCount(13).catch(() => {});
          }}
        >
          Trigger error
        </button>
        <button
          class="button"
          @click={() => meta.reset()}
        >
          Reset
        </button>
      </div>
      <p class="status">Authoritative count: {count}</p>
      <p class="status">Pending: {meta.pending ? "yes" : "no"}</p>
      <p class="status error">Latest error: {meta.error?.message ?? "none"}</p>
    </div>
  );
}
`.trim();

export const useOptimisticExampleSource = `
import { useOptimistic, useState } from "litsx";

export function UseOptimisticDemo() {
  ^styles(\`
    :host {
      display: block;
      font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
      color: #e5e7eb;
    }

    button {
      font: inherit;
    }

    .card {
      display: grid;
      gap: 0.85rem;
      padding: 1rem;
      border-radius: 1rem;
      background: #111827;
      border: 1px solid #312e81;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.65rem;
    }

    .copy {
      margin: 0;
      color: #cbd5e1;
      font-size: 0.93rem;
      line-height: 1.45;
    }

    .button {
      padding: 0.7rem 0.88rem;
      border-radius: 999px;
      border: 0;
      cursor: pointer;
      color: #f5f3ff;
      background: #4c1d95;
    }

    .columns {
      display: grid;
      gap: 0.8rem;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .panel {
      display: grid;
      gap: 0.65rem;
      padding: 0.82rem;
      border-radius: 0.9rem;
      background: #0f172a;
      border: 1px solid #312e81;
    }

    .heading {
      margin: 0;
      font-size: 0.9rem;
      font-weight: 700;
      color: #f5f3ff;
    }

    .list {
      display: grid;
      gap: 0.45rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .item {
      padding: 0.68rem 0.8rem;
      border-radius: 0.8rem;
      background: #111827;
    }

    .meta {
      margin: 0;
      padding: 0.78rem 0.9rem;
      border-radius: 0.85rem;
      background: #0f172a;
      color: #f5f3ff;
      font-size: 0.9rem;
    }
  \`);

  const [baseTodos, setBaseTodos] = useState(["Ship docs"]);
  const [optimisticTodos, addOptimisticTodo, resetOptimisticTodos] = useOptimistic(
    baseTodos,
    (currentTodos, optimisticTodo) => [...currentTodos, optimisticTodo]
  );
  const optimisticOnlyCount = optimisticTodos.length - baseTodos.length;

  return (
    <div class="card">
      <p class="copy">
        This example keeps an authoritative todo list and a separate optimistic overlay.
        The right column shows what the UI renders while the optimistic queue is active.
      </p>

      <div class="actions">
        <button
          class="button"
          @click={() => addOptimisticTodo(\`Draft #\${optimisticTodos.length + 1}\`)}
        >
          Queue optimistic todo
        </button>
        <button
          class="button"
          @click={() => setBaseTodos([...baseTodos, \`Server item #\${baseTodos.length + 1}\`])}
        >
          Simulate server commit
        </button>
        <button
          class="button"
          @click={() => resetOptimisticTodos()}
        >
          Discard optimistic overlay
        </button>
      </div>

      <div class="columns">
        <section class="panel">
          <p class="heading">Authoritative state</p>
          <ul class="list">
            {baseTodos.map((todo) => (
              <li class="item">{todo}</li>
            ))}
          </ul>
        </section>

        <section class="panel">
          <p class="heading">Rendered with optimistic overlay</p>
          <ul class="list">
            {optimisticTodos.map((todo) => (
              <li class="item">{todo}</li>
            ))}
          </ul>
        </section>
      </div>

      <p class="meta">
        Optimistic items pending: {optimisticOnlyCount > 0 ? optimisticOnlyCount : 0}
      </p>
    </div>
  );
}
`.trim();
