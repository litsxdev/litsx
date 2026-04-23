export const playgroundStyles = `
  :host {
    display: block;
    margin: 1.5rem 0;
    --litsx-playground-preview-height: 1px;
    --litsx-playground-preview-width: 20rem;
    --litsx-playground-editor-min-height: 18rem;
  }

  .litsx-playground {
    display: grid;
    gap: 1rem;
  }

  .litsx-playground__signature {
    justify-self: end;
    margin-top: -0.75rem;
    font: 600 0.72rem/1.2 "IBM Plex Sans", "Segoe UI", sans-serif;
    letter-spacing: 0.03em;
    color: var(--vp-c-text-3);
    opacity: 0.9;
  }

  .litsx-playground__signature-heart {
    color: #a33232;
  }

  .litsx-playground__signature-link {
    color: inherit;
    text-decoration-color: color-mix(in srgb, currentColor 42%, transparent);
    text-underline-offset: 0.12em;
    transition:
      color 0.18s ease,
      text-decoration-color 0.18s ease;
  }

  .litsx-playground__signature-link:hover {
    color: var(--vp-c-text-1);
    text-decoration-color: currentColor;
  }

  .litsx-playground__panel {
    border: 1px solid var(--vp-c-divider);
    border-radius: 12px;
    overflow: hidden;
    background: var(--vp-c-bg-soft);
    contain: layout paint;
  }

  .litsx-playground.is-fullscreen {
    position: fixed;
    inset: 0;
    z-index: 9999;
    margin: 0;
    padding: 0;
    background: color-mix(in srgb, var(--vp-c-bg) 88%, rgba(8, 13, 20, 0.84));
    backdrop-filter: blur(10px);
  }

  .litsx-playground.is-fullscreen .litsx-playground__panel {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    width: 100vw;
    height: 100vh;
    border-radius: 0;
    box-shadow: 0 28px 80px rgba(0, 0, 0, 0.26);
  }

  .litsx-playground__toolbar,
  .litsx-playground__label {
    padding: 0.6rem 0.8rem;
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--vp-c-text-2);
    background: var(--vp-c-bg-elv);
    border-bottom: 1px solid var(--vp-c-divider);
  }

  .litsx-playground__label--subtle {
    padding: 0.38rem 0.8rem;
    font-size: 0.7rem;
    letter-spacing: 0.06em;
    background: color-mix(in srgb, var(--vp-c-bg-elv) 72%, transparent);
  }

  .litsx-playground__toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.45rem 0.7rem;
  }

  .litsx-playground__toolbar--subtle {
    padding: 0.32rem 0.7rem;
    background: color-mix(in srgb, var(--vp-c-bg-elv) 72%, transparent);
  }

  .litsx-playground__toolbar .litsx-playground__label {
    padding: 0;
    background: transparent;
    border-bottom: 0;
  }

  .litsx-playground__toolbar-actions {
    display: flex;
    align-items: center;
    gap: 0.7rem;
  }

  .litsx-playground__workspace {
    display: block;
  }

  .litsx-playground__segmented {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    padding: 0.2rem;
    border: 1px solid var(--vp-c-divider);
    border-radius: 999px;
    background: color-mix(in srgb, var(--vp-c-bg-soft) 76%, var(--vp-c-bg-elv));
  }

  .litsx-playground__segment {
    appearance: none;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: var(--vp-c-text-3);
    font: 700 0.73rem/1 "IBM Plex Sans", "Segoe UI", sans-serif;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    padding: 0.48rem 0.72rem;
    cursor: pointer;
    transition:
      background-color 0.18s ease,
      color 0.18s ease;
  }

  .litsx-playground__segment:hover {
    background: color-mix(in srgb, var(--vp-c-bg) 88%, transparent);
    color: var(--vp-c-text-1);
  }

  .litsx-playground__segment.is-active {
    background: var(--vp-c-text-1);
    color: var(--vp-c-bg);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--vp-c-text-1) 82%, transparent);
  }

  .litsx-playground__subsection {
    border-top: 1px solid var(--vp-c-divider);
    background: color-mix(in srgb, var(--vp-c-bg-soft) 86%, var(--vp-c-bg));
  }

  .litsx-playground.is-fullscreen .litsx-playground__workspace {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(22rem, 1fr);
    min-height: 0;
  }

  .litsx-playground.is-fullscreen .litsx-playground__subsection {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto auto;
    align-content: stretch;
    min-height: 0;
    height: 100%;
    border-top: 0;
    border-left: 1px solid var(--vp-c-divider);
    background: color-mix(in srgb, var(--vp-c-bg) 96%, var(--vp-c-bg-soft));
  }

  .litsx-playground__status {
    font-weight: 600;
    letter-spacing: 0;
    text-transform: none;
    color: var(--vp-c-text-2);
  }

  .litsx-playground__action {
    appearance: none;
    border: 1px solid var(--vp-c-divider);
    border-radius: 999px;
    background: var(--vp-c-bg);
    color: var(--vp-c-text-2);
    font: 600 0.78rem/1 "IBM Plex Sans", "Segoe UI", sans-serif;
    padding: 0.42rem 0.72rem;
    cursor: pointer;
    transition:
      background-color 0.18s ease,
      border-color 0.18s ease,
      color 0.18s ease;
  }

  .litsx-playground__action:hover {
    background: var(--vp-c-bg-soft);
    color: var(--vp-c-text-1);
    border-color: var(--vp-c-brand-2);
  }

  .litsx-playground__action:disabled {
    opacity: 0.46;
    cursor: default;
    background: color-mix(in srgb, var(--vp-c-bg-soft) 78%, var(--vp-c-bg));
    color: var(--vp-c-text-3);
    border-color: var(--vp-c-divider);
  }

  .litsx-playground__action:disabled:hover {
    background: color-mix(in srgb, var(--vp-c-bg-soft) 78%, var(--vp-c-bg));
    color: var(--vp-c-text-3);
    border-color: var(--vp-c-divider);
  }

  .litsx-playground__action--subtle {
    background: transparent;
    color: var(--vp-c-text-3);
    border-color: transparent;
    box-shadow: none;
  }

  .litsx-playground__action--subtle:hover {
    background: color-mix(in srgb, var(--vp-c-bg) 72%, transparent);
    color: var(--vp-c-text-1);
    border-color: color-mix(in srgb, var(--vp-c-divider) 72%, transparent);
  }

  .litsx-playground__action--icon {
    display: inline-grid;
    place-items: center;
    min-width: 2.25rem;
    width: 2.25rem;
    height: 2.25rem;
    padding: 0;
    border-radius: 999px;
    border-color: var(--vp-c-divider);
    background: color-mix(in srgb, var(--vp-c-bg-soft) 76%, var(--vp-c-bg-elv));
    color: var(--vp-c-text-3);
    font-size: 1rem;
    line-height: 1;
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--vp-c-bg) 24%, transparent);
  }

  .litsx-playground__action--chrome {
    min-height: 2.25rem;
    border-color: var(--vp-c-divider);
    background: color-mix(in srgb, var(--vp-c-bg-soft) 76%, var(--vp-c-bg-elv));
    color: var(--vp-c-text-3);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--vp-c-bg) 24%, transparent);
  }

  .litsx-playground__action--icon:hover {
    background: color-mix(in srgb, var(--vp-c-bg) 88%, transparent);
    color: var(--vp-c-text-1);
    border-color: var(--vp-c-divider);
  }

  .litsx-playground__action--chrome:hover {
    background: color-mix(in srgb, var(--vp-c-bg) 88%, transparent);
    color: var(--vp-c-text-1);
    border-color: var(--vp-c-divider);
  }

  .litsx-playground__action--icon.is-active {
    background: var(--vp-c-text-1);
    color: var(--vp-c-bg);
    border-color: var(--vp-c-text-1);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--vp-c-text-1) 82%, transparent);
  }

  .litsx-playground__editor-panel,
  .litsx-playground__output {
    width: 100%;
    margin: 0;
    border: 0;
    background: transparent;
    box-sizing: border-box;
  }

  .litsx-playground__editor-stage {
    position: relative;
    min-height: var(--litsx-playground-editor-min-height);
    max-height: var(--litsx-playground-editor-max-height, none);
    contain: layout paint;
  }

  .litsx-playground.is-fullscreen .litsx-playground__editor-stage {
    min-height: 0;
    max-height: none;
    height: 100%;
  }

  .litsx-playground__editor-panel {
    display: none;
    min-height: var(--litsx-playground-editor-min-height);
    max-height: var(--litsx-playground-editor-max-height, none);
    overflow: auto;
  }

  .litsx-playground__editor-panel.is-active {
    display: block;
  }

  .litsx-playground.is-fullscreen .litsx-playground__editor-panel,
  .litsx-playground.is-fullscreen .litsx-playground__output {
    min-height: 100%;
    max-height: none;
    height: 100%;
  }

  .litsx-playground__output {
    min-height: var(--litsx-playground-editor-min-height);
    max-height: var(--litsx-playground-editor-max-height, none);
    overflow: auto;
  }

  .litsx-playground__editor-panel .cm-editor,
  .litsx-playground__output .cm-editor {
    background: transparent;
  }

  .litsx-playground__editor-panel .cm-scroller,
  .litsx-playground__output .cm-scroller {
    overflow: auto;
    padding: 0;
  }

  .litsx-playground__editor-panel .cm-gutters,
  .litsx-playground__output .cm-gutters {
    padding-top: 0;
  }

  .litsx-playground__preview {
    display: block;
    width: 100%;
    height: var(--litsx-playground-preview-height);
    border: 0;
    background: var(--vp-c-bg);
    contain: layout paint;
  }

  .litsx-playground.is-fullscreen .litsx-playground__preview {
    width: 100%;
    height: 100%;
    max-width: 100%;
    justify-self: stretch;
    align-self: stretch;
  }

  .litsx-playground__runtime-error {
    padding: 0.85rem 1rem 1rem;
    color: var(--vp-c-danger-1);
    font-size: 0.9rem;
    border-top: 1px solid color-mix(in srgb, var(--vp-c-danger-1) 18%, var(--vp-c-divider));
    background: color-mix(in srgb, var(--vp-c-danger-soft) 78%, var(--vp-c-bg));
  }

  .litsx-playground__warnings {
    border-top: 1px solid color-mix(in srgb, var(--vp-c-warning-1) 18%, var(--vp-c-divider));
    background: color-mix(in srgb, var(--vp-c-warning-soft) 72%, var(--vp-c-bg));
    padding: 0.8rem 1rem;
    display: grid;
    gap: 0.45rem;
  }

  .litsx-playground__warning {
    color: var(--vp-c-warning-1);
    font-size: 0.86rem;
    line-height: 1.45;
  }

  .litsx-playground__signature.is-hidden {
    display: none;
  }

  @media (max-width: 960px) {
    .litsx-playground.is-fullscreen {
      padding: 0;
    }

    .litsx-playground.is-fullscreen .litsx-playground__panel {
      height: 100vh;
    }

    .litsx-playground.is-fullscreen .litsx-playground__workspace {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: minmax(0, 1fr) auto;
    }

    .litsx-playground.is-fullscreen .litsx-playground__subsection {
      border-left: 0;
      border-top: 1px solid var(--vp-c-divider);
    }

    .litsx-playground.is-fullscreen .litsx-playground__preview {
      width: 100%;
    }
  }
`;
