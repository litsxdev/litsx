import assert from "assert";
import { afterEach, beforeEach, describe, it, vi } from "vitest";

function createDocument({
  uri = "file:///virtual/component.tsx",
  fsPath = "/virtual/component.tsx",
  scheme = "file",
  languageId = "typescriptreact",
  text = "",
  version = 1,
} = {}) {
  const lineStarts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\n") {
      lineStarts.push(index + 1);
    }
  }

  const document = {
    uri: {
      scheme,
      fsPath,
      toString() {
        return uri;
      },
    },
    languageId,
    version,
    isClosed: false,
    getText(range) {
      if (!range) {
        return text;
      }

      return text.slice(document.offsetAt(range.start), document.offsetAt(range.end));
    },
    positionAt(offset) {
      let line = 0;
      while (line + 1 < lineStarts.length && lineStarts[line + 1] <= offset) {
        line += 1;
      }
      return { line, character: offset - lineStarts[line] };
    },
    offsetAt(position) {
      return (lineStarts[position.line] ?? 0) + position.character;
    },
  };

  return document;
}

function createWorkspaceState(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    get(key, fallbackValue) {
      return store.has(key) ? store.get(key) : fallbackValue;
    },
    async update(key, value) {
      store.set(key, value);
    },
    snapshot() {
      return Object.fromEntries(store);
    },
  };
}

function createVscodeMock({
  documents = [],
  activeDocument = documents[0] ?? null,
  infoResponses = [],
  config = {},
} = {}) {
  const commands = new Map();
  const listeners = {
    open: [],
    change: [],
    active: [],
    close: [],
  };
  const hoverProviders = [];
  const completionProviders = [];
  const infoMessages = [];
  const outputLines = [];
  const diagnosticsState = {
    setCalls: [],
    deleteCalls: [],
  };

  class Range {
    constructor(start, end) {
      this.start = start;
      this.end = end;
    }
  }

  class Diagnostic {
    constructor(range, message, severity) {
      this.range = range;
      this.message = message;
      this.severity = severity;
    }
  }

  class CompletionItem {
    constructor(label, kind) {
      this.label = label;
      this.kind = kind;
    }
  }

  class MarkdownString {
    constructor() {
      this.value = "";
    }

    appendCodeblock(code, language) {
      this.value += `\`\`\`${language}\n${code}\n\`\`\``;
      return this;
    }
  }

  class Hover {
    constructor(contents, range) {
      this.contents = contents;
      this.range = range;
    }
  }

  const diagnosticsCollection = {
    set(uri, diagnostics) {
      diagnosticsState.setCalls.push([uri.toString(), diagnostics]);
    },
    delete(uri) {
      diagnosticsState.deleteCalls.push(uri.toString());
    },
  };

  const vscode = {
    Range,
    Diagnostic,
    CompletionItem,
    CompletionItemKind: {
      Event: 23,
      Property: 10,
    },
    DiagnosticSeverity: {
      Warning: 1,
      Error: 0,
    },
    MarkdownString,
    Hover,
    commands: {
      registerCommand(name, callback) {
        commands.set(name, callback);
        return { dispose() {} };
      },
    },
    languages: {
      createDiagnosticCollection() {
        return diagnosticsCollection;
      },
      async setTextDocumentLanguage(document, targetLanguageId) {
        document.languageId = targetLanguageId;
        return document;
      },
      registerHoverProvider(selector, provider) {
        hoverProviders.push({ selector, provider });
        return { dispose() {} };
      },
      registerCompletionItemProvider(selector, provider, ...triggers) {
        completionProviders.push({ selector, provider, triggers });
        return { dispose() {} };
      },
    },
    window: {
      activeTextEditor: activeDocument ? { document: activeDocument } : null,
      createOutputChannel() {
        return {
          appendLine(line) {
            outputLines.push(line);
          },
          show() {},
        };
      },
      async showInformationMessage(message, ...actions) {
        infoMessages.push({ message, actions });
        return infoResponses.shift();
      },
    },
    workspace: {
      textDocuments: documents,
      getConfiguration(section) {
        return {
          get(key, fallbackValue) {
            return config[`${section}.${key}`] ?? fallbackValue;
          },
        };
      },
      onDidOpenTextDocument(callback) {
        listeners.open.push(callback);
        return { dispose() {} };
      },
      onDidChangeTextDocument(callback) {
        listeners.change.push(callback);
        return { dispose() {} };
      },
      onDidCloseTextDocument(callback) {
        listeners.close.push(callback);
        return { dispose() {} };
      },
    },
  };

  vscode.window.onDidChangeActiveTextEditor = (callback) => {
    listeners.active.push(callback);
    return { dispose() {} };
  };

  return {
    vscode,
    commands,
    hoverProviders,
    completionProviders,
    infoMessages,
    outputLines,
    diagnosticsState,
    listeners,
    emitOpen(document) {
      for (const listener of listeners.open) listener(document);
    },
    emitChange(document) {
      for (const listener of listeners.change) listener({ document });
    },
    emitActive(document) {
      vscode.window.activeTextEditor = document ? { document } : null;
      for (const listener of listeners.active) listener(vscode.window.activeTextEditor);
    },
    emitClose(document) {
      document.isClosed = true;
      vscode.workspace.textDocuments = vscode.workspace.textDocuments.filter(
        (candidate) => candidate !== document,
      );
      for (const listener of listeners.close) listener(document);
    },
  };
}

async function flushAsyncWork() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function loadExtension({ vscodeMock, editorSupportMock }) {
  vi.resetModules();
  vi.doMock("vscode", () => vscodeMock.vscode);
  vi.doMock("../packages/vscode-litsx/src/editor-support.js", () => editorSupportMock);

  try {
    return await import("../packages/vscode-litsx/src/extension.js");
  } finally {
    vi.doUnmock("vscode");
    vi.doUnmock("../packages/vscode-litsx/src/editor-support.js");
  }
}

describe("vscode-litsx extension activation", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("accepts the language-mode suggestion and can reset the file back to standard mode", async () => {
    const document = createDocument({
      text: "const view = <button @click={handleClick} />;",
    });
    const vscodeMock = createVscodeMock({
      documents: [document],
      infoResponses: ["Switch to LitSX"],
    });
    const workspaceState = createWorkspaceState();
    const editorSupportMock = {
      async computeLitsxCompletions() { return []; },
      async computeLitsxDiagnostics() { return []; },
      async computeLitsxHover() { return null; },
      async computeLitsxProjectCompletions() { return []; },
      async computeLitsxProjectDiagnostics() { return []; },
      async computeLitsxProjectHover() { return null; },
    };

    const extension = await loadExtension({ vscodeMock, editorSupportMock });
    const context = {
      subscriptions: [],
      workspaceState,
    };

    extension.activate(context);
    await flushAsyncWork();

    assert.strictEqual(document.languageId, "litsx");
    assert.deepStrictEqual(
      workspaceState.snapshot()["litsx.languageSelections"],
      { [document.uri.toString()]: "litsx" },
    );
    assert.strictEqual(vscodeMock.infoMessages.length, 1);

    await vscodeMock.commands.get("litsx.resetCurrentFileLanguageMode")();

    assert.strictEqual(document.languageId, "typescriptreact");
    assert.deepStrictEqual(
      workspaceState.snapshot()["litsx.languageSelections"],
      {},
    );
  });

  it("persists dismissals but treats closing the banner as a no-op", async () => {
    const dismissedDoc = createDocument({
      uri: "file:///virtual/dismiss.tsx",
      fsPath: "/virtual/dismiss.tsx",
      text: "const view = <button @click={handleClick} />;",
    });
    const dismissedMock = createVscodeMock({
      documents: [dismissedDoc],
      infoResponses: ["Dismiss"],
    });
    const dismissedState = createWorkspaceState();

    let extension = await loadExtension({
      vscodeMock: dismissedMock,
      editorSupportMock: {
        async computeLitsxCompletions() { return []; },
        async computeLitsxDiagnostics() { return []; },
        async computeLitsxHover() { return null; },
        async computeLitsxProjectCompletions() { return []; },
        async computeLitsxProjectDiagnostics() { return []; },
        async computeLitsxProjectHover() { return null; },
      },
    });

    extension.activate({ subscriptions: [], workspaceState: dismissedState });
    await flushAsyncWork();

    const dismissedSignatures = dismissedState.snapshot()["litsx.dismissedSignatures"];
    assert.strictEqual(dismissedMock.infoMessages.length, 1);
    assert.strictEqual(
      dismissedSignatures[dismissedDoc.uri.toString()].targetLanguageId,
      "litsx",
    );

    dismissedMock.emitChange(dismissedDoc);
    await flushAsyncWork();
    assert.strictEqual(dismissedMock.infoMessages.length, 1);

    const closedDoc = createDocument({
      uri: "file:///virtual/closed.tsx",
      fsPath: "/virtual/closed.tsx",
      text: "const view = <button @click={handleClick} />;",
    });
    const closedMock = createVscodeMock({
      documents: [closedDoc],
      infoResponses: [undefined],
    });
    const closedState = createWorkspaceState();

    extension = await loadExtension({
      vscodeMock: closedMock,
      editorSupportMock: {
        async computeLitsxCompletions() { return []; },
        async computeLitsxDiagnostics() { return []; },
        async computeLitsxHover() { return null; },
        async computeLitsxProjectCompletions() { return []; },
        async computeLitsxProjectDiagnostics() { return []; },
        async computeLitsxProjectHover() { return null; },
      },
    });

    extension.activate({ subscriptions: [], workspaceState: closedState });
    await flushAsyncWork();

    assert.strictEqual(closedMock.infoMessages.length, 1);
    assert.deepStrictEqual(
      closedState.snapshot()["litsx.dismissedSignatures"] ?? {},
      {},
    );
  });

  it("refreshes diagnostics, hover, completions, and dump output for LitSX documents", async () => {
    const document = createDocument({
      uri: "file:///virtual/component.litsx",
      fsPath: "/virtual/component.litsx",
      languageId: "litsx",
      text: "^styles(`:host { color: red; }`)\nconst view = <button @click={save} />;",
    });
    const vscodeMock = createVscodeMock({
      documents: [document],
      config: {
        "litsx.traceDiagnostics": true,
      },
    });
    const workspaceState = createWorkspaceState();
    const editorSupportMock = {
      async computeLitsxCompletions() {
        return [];
      },
      async computeLitsxDiagnostics() {
        return [{ code: 91006, start: 50, length: 6, messageText: "inline warning" }];
      },
      async computeLitsxHover() {
        return null;
      },
      async computeLitsxProjectCompletions(fileName, sourceText, languageId, position, vscodeApi) {
        assert.strictEqual(fileName, "/virtual/component.litsx");
        assert.strictEqual(languageId, "litsx");
        assert.ok(position > 0);
        assert.strictEqual(vscodeApi.CompletionItemKind.Property, 10);
        return [{
          label: "@click",
          kind: vscodeApi.CompletionItemKind.Event,
          detail: "LitSX binding",
          documentation: "LitSX event listener binding",
          start: sourceText.indexOf("@click"),
          length: "@click".length,
        }];
      },
      async computeLitsxProjectDiagnostics(fileName) {
        assert.strictEqual(fileName, "/virtual/component.litsx");
        return [{ code: 91006, start: 50, length: 6, messageText: "inline warning" }];
      },
      async computeLitsxProjectHover(fileName, sourceText, languageId, position) {
        assert.strictEqual(fileName, "/virtual/component.litsx");
        assert.strictEqual(languageId, "litsx");
        assert.ok(position > 0);
        return {
          start: sourceText.indexOf("@click"),
          length: "@click".length,
          code: "@click: event",
          documentation: "LitSX event listener binding for <button>.",
        };
      },
    };

    const extension = await loadExtension({ vscodeMock, editorSupportMock });
    extension.activate({ subscriptions: [], workspaceState });
    await flushAsyncWork();

    assert.ok(vscodeMock.diagnosticsState.setCalls.length >= 1);
    assert.strictEqual(
      vscodeMock.outputLines.some((line) => line.startsWith("refreshDiagnostics")),
      true,
    );
    assert.strictEqual(
      vscodeMock.diagnosticsState.setCalls.at(-1)[1][0].message,
      "inline warning",
    );

    const hoverProvider = vscodeMock.hoverProviders[0].provider;
    const hover = await hoverProvider.provideHover(document, document.positionAt(document.getText().indexOf("@click")));
    assert.strictEqual(hover.contents[1], "LitSX event listener binding for <button>.");

    const completionProvider = vscodeMock.completionProviders[0].provider;
    const completions = await completionProvider.provideCompletionItems(
      document,
      document.positionAt(document.getText().indexOf("@click") + 2),
    );
    assert.strictEqual(completions[0].label, "@click");

    await vscodeMock.commands.get("litsx.dumpCurrentFileDiagnostics")();
    assert.ok(vscodeMock.outputLines.some((line) => line.startsWith("dumpCurrentFileDiagnostics")));
  });

  it("uses direct authored helpers for non-file LitSX documents and deletes diagnostics for non-LitSX files", async () => {
    const document = createDocument({
      uri: "untitled:component",
      fsPath: "/virtual/untitled-component",
      scheme: "untitled",
      languageId: "litsx-jsx",
      text: "const view = <button ?disabled={busy} />;",
    });
    const vscodeMock = createVscodeMock({
      documents: [document],
    });
    const workspaceState = createWorkspaceState();
    const editorSupportMock = {
      async computeLitsxCompletions(sourceText, languageId) {
        assert.strictEqual(languageId, "litsx-jsx");
        return [{
          label: "?disabled",
          kind: 10,
          detail: "LitSX binding",
          documentation: "LitSX boolean attribute binding",
          start: sourceText.indexOf("?disabled"),
          length: "?disabled".length,
        }];
      },
      async computeLitsxDiagnostics(sourceText, languageId) {
        assert.strictEqual(languageId, "litsx-jsx");
        return [{ code: 91005, start: sourceText.indexOf("?disabled"), length: 9, messageText: "bool warning" }];
      },
      async computeLitsxHover(sourceText, languageId) {
        assert.strictEqual(languageId, "litsx-jsx");
        return {
          start: sourceText.indexOf("?disabled"),
          length: "?disabled".length,
          code: "?disabled: boolean",
          documentation: "LitSX boolean attribute binding for <button>.",
        };
      },
      async computeLitsxProjectCompletions() { return []; },
      async computeLitsxProjectDiagnostics() { return []; },
      async computeLitsxProjectHover() { return null; },
    };

    const extension = await loadExtension({ vscodeMock, editorSupportMock });
    extension.activate({ subscriptions: [], workspaceState });
    await flushAsyncWork();

    assert.ok(vscodeMock.diagnosticsState.setCalls.length >= 1);
    assert.strictEqual(
      vscodeMock.diagnosticsState.setCalls.at(-1)[1][0].message,
      "bool warning",
    );

    const hover = await vscodeMock.hoverProviders[0].provider.provideHover(
      document,
      document.positionAt(document.getText().indexOf("?disabled")),
    );
    assert.strictEqual(hover.contents[1], "LitSX boolean attribute binding for <button>.");

    document.languageId = "plaintext";
    vscodeMock.emitChange(document);
    await flushAsyncWork();
    assert.ok(vscodeMock.diagnosticsState.deleteCalls.length >= 1);
    assert.ok(
      vscodeMock.diagnosticsState.deleteCalls.every((uri) => uri === document.uri.toString()),
    );
  });

  it("formats warning diagnostics with default spans and returns null hover when no hover info exists", async () => {
    const document = createDocument({
      uri: "file:///virtual/default-warning.litsx",
      fsPath: "/virtual/default-warning.litsx",
      languageId: "litsx",
      text: "const view = <button />;",
    });
    const vscodeMock = createVscodeMock({
      documents: [document],
      activeDocument: document,
      config: {
        "litsx.traceDiagnostics": true,
      },
    });

    const extension = await loadExtension({
      vscodeMock,
      editorSupportMock: {
        async computeLitsxCompletions() { return []; },
        async computeLitsxDiagnostics() { return []; },
        async computeLitsxHover() { return null; },
        async computeLitsxProjectCompletions() { return []; },
        async computeLitsxProjectDiagnostics() {
          return [{ category: 0, messageText: "warn without span" }];
        },
        async computeLitsxProjectHover() { return null; },
      },
    });

    extension.activate({ subscriptions: [], workspaceState: createWorkspaceState() });
    await flushAsyncWork();

    const [, diagnostics] = vscodeMock.diagnosticsState.setCalls.at(-1);
    assert.strictEqual(diagnostics[0].severity, vscodeMock.vscode.DiagnosticSeverity.Warning);
    assert.strictEqual(diagnostics[0].message, "warn without span");
    assert.strictEqual(diagnostics[0].code, undefined);
    assert.strictEqual(diagnostics[0].source, "vscode-litsx");
    assert.ok(vscodeMock.outputLines.some((line) => line.includes('[?] 1:1-1:1 "" warn without span')));

    const hover = await vscodeMock.hoverProviders[0].provider.provideHover(document, document.positionAt(0));
    assert.strictEqual(hover, null);
  });

  it("supports jsx-specific suggestion labels, same-language switches, and current-content dismissals", async () => {
    const jsxDocument = createDocument({
      uri: "file:///virtual/component.jsx",
      fsPath: "/virtual/component.jsx",
      languageId: "javascriptreact",
      text: "const view = <button @click={save} />;",
    });
    const jsxMock = createVscodeMock({
      documents: [jsxDocument],
      activeDocument: jsxDocument,
      infoResponses: ["Switch to LitSX JSX"],
    });

    let extension = await loadExtension({
      vscodeMock: jsxMock,
      editorSupportMock: {
        async computeLitsxCompletions() { return []; },
        async computeLitsxDiagnostics() { return []; },
        async computeLitsxHover() { return null; },
        async computeLitsxProjectCompletions() { return []; },
        async computeLitsxProjectDiagnostics() { return []; },
        async computeLitsxProjectHover() { return null; },
      },
    });

    extension.activate({ subscriptions: [], workspaceState: createWorkspaceState() });
    await flushAsyncWork();

    assert.strictEqual(jsxMock.infoMessages[0].actions[0], "Switch to LitSX JSX");
    assert.strictEqual(jsxDocument.languageId, "litsx-jsx");

    await jsxMock.commands.get("litsx.switchCurrentFileToLitsxMode")();
    assert.strictEqual(jsxDocument.languageId, "litsx-jsx");

    const dismissedDocument = createDocument({
      uri: "file:///virtual/dismissed.tsx",
      fsPath: "/virtual/dismissed.tsx",
      languageId: "typescriptreact",
      text: "const view = <button @click={save} />;",
    });
    const fingerprint = `${dismissedDocument.getText().length}:${(() => {
      let hash = 5381;
      const text = dismissedDocument.getText();
      for (let index = 0; index < text.length; index += 1) {
        hash = ((hash << 5) + hash) ^ text.charCodeAt(index);
      }
      return hash >>> 0;
    })()}`;
    const dismissedMock = createVscodeMock({
      documents: [dismissedDocument],
      activeDocument: dismissedDocument,
    });

    extension = await loadExtension({
      vscodeMock: dismissedMock,
      editorSupportMock: {
        async computeLitsxCompletions() { return []; },
        async computeLitsxDiagnostics() { return []; },
        async computeLitsxHover() { return null; },
        async computeLitsxProjectCompletions() { return []; },
        async computeLitsxProjectDiagnostics() { return []; },
        async computeLitsxProjectHover() { return null; },
      },
    });

    extension.activate({
      subscriptions: [],
      workspaceState: createWorkspaceState({
        "litsx.dismissedSignatures": {
          [dismissedDocument.uri.toString()]: {
            targetLanguageId: "litsx",
            fingerprint,
          },
        },
      }),
    });
    await flushAsyncWork();

    assert.deepStrictEqual(dismissedMock.infoMessages, []);
  });

  it("clears persisted state when the user explicitly switches a remembered LitSX file back to standard mode", async () => {
    const document = createDocument({
      uri: "file:///virtual/component.litsx",
      fsPath: "/virtual/component.litsx",
      languageId: "litsx",
      text: "const view = <button @click={save} />;",
    });
    const workspaceState = createWorkspaceState({
      "litsx.languageSelections": {
        [document.uri.toString()]: "litsx",
      },
      "litsx.dismissedSignatures": {
        [document.uri.toString()]: {
          targetLanguageId: "litsx",
          fingerprint: "1:1",
        },
      },
    });
    const vscodeMock = createVscodeMock({
      documents: [document],
      activeDocument: document,
    });

    const extension = await loadExtension({
      vscodeMock,
      editorSupportMock: {
        async computeLitsxCompletions() { return []; },
        async computeLitsxDiagnostics() { return []; },
        async computeLitsxHover() { return null; },
        async computeLitsxProjectCompletions() { return []; },
        async computeLitsxProjectDiagnostics() { return []; },
        async computeLitsxProjectHover() { return null; },
      },
    });

    extension.activate({ subscriptions: [], workspaceState });
    await flushAsyncWork();

    document.languageId = "typescriptreact";
    vscodeMock.emitChange(document);
    await flushAsyncWork();

    assert.deepStrictEqual(
      workspaceState.snapshot()["litsx.languageSelections"],
      {},
    );
    assert.deepStrictEqual(
      workspaceState.snapshot()["litsx.dismissedSignatures"],
      {},
    );
  });

  it("treats commands and editor-change events as no-ops when there is no active document", async () => {
    const vscodeMock = createVscodeMock({
      documents: [],
      activeDocument: null,
    });
    const workspaceState = createWorkspaceState();

    const extension = await loadExtension({
      vscodeMock,
      editorSupportMock: {
        async computeLitsxCompletions() { return []; },
        async computeLitsxDiagnostics() { return []; },
        async computeLitsxHover() { return null; },
        async computeLitsxProjectCompletions() { return []; },
        async computeLitsxProjectDiagnostics() { return []; },
        async computeLitsxProjectHover() { return null; },
      },
    });

    extension.activate({ subscriptions: [], workspaceState });
    await flushAsyncWork();

    await vscodeMock.commands.get("litsx.switchCurrentFileToLitsxMode")();
    await vscodeMock.commands.get("litsx.resetCurrentFileLanguageMode")();
    await vscodeMock.commands.get("litsx.dumpCurrentFileDiagnostics")();
    vscodeMock.emitActive(null);
    await flushAsyncWork();

    assert.deepStrictEqual(vscodeMock.infoMessages, []);
    assert.deepStrictEqual(vscodeMock.outputLines, []);
    assert.deepStrictEqual(vscodeMock.diagnosticsState.setCalls, []);
  });

  it("clears stale dismissals when the file no longer contains LitSX syntax and respects disabled auto-suggest", async () => {
    const plainDocument = createDocument({
      uri: "file:///virtual/plain.tsx",
      fsPath: "/virtual/plain.tsx",
      languageId: "typescriptreact",
      text: "const view = <button onClick={save} />;",
    });
    const workspaceState = createWorkspaceState({
      "litsx.dismissedSignatures": {
        [plainDocument.uri.toString()]: {
          targetLanguageId: "litsx",
          fingerprint: "old",
        },
      },
    });
    const vscodeMock = createVscodeMock({
      documents: [plainDocument],
      activeDocument: plainDocument,
      config: {
        "litsx.autoSuggestLanguageMode": false,
      },
    });

    const extension = await loadExtension({
      vscodeMock,
      editorSupportMock: {
        async computeLitsxCompletions() { return []; },
        async computeLitsxDiagnostics() { return []; },
        async computeLitsxHover() { return null; },
        async computeLitsxProjectCompletions() { return []; },
        async computeLitsxProjectDiagnostics() { return []; },
        async computeLitsxProjectHover() { return null; },
      },
    });

    extension.activate({ subscriptions: [], workspaceState });
    await flushAsyncWork();

    assert.deepStrictEqual(vscodeMock.infoMessages, []);
    assert.deepStrictEqual(
      workspaceState.snapshot()["litsx.dismissedSignatures"],
      {
        [plainDocument.uri.toString()]: {
          targetLanguageId: "litsx",
          fingerprint: "old",
        },
      },
    );

    const syntaxDocument = createDocument({
      uri: "file:///virtual/syntax.tsx",
      fsPath: "/virtual/syntax.tsx",
      languageId: "typescriptreact",
      text: "const view = <button @click={save} />;",
    });
    const syntaxState = createWorkspaceState({
      "litsx.dismissedSignatures": {
        [syntaxDocument.uri.toString()]: {
          targetLanguageId: "litsx",
          fingerprint: "1:1",
        },
      },
    });
    const syntaxMock = createVscodeMock({
      documents: [syntaxDocument],
      activeDocument: syntaxDocument,
    });

    const syntaxExtension = await loadExtension({
      vscodeMock: syntaxMock,
      editorSupportMock: {
        async computeLitsxCompletions() { return []; },
        async computeLitsxDiagnostics() { return []; },
        async computeLitsxHover() { return null; },
        async computeLitsxProjectCompletions() { return []; },
        async computeLitsxProjectDiagnostics() { return []; },
        async computeLitsxProjectHover() { return null; },
      },
    });

    syntaxExtension.activate({ subscriptions: [], workspaceState: syntaxState });
    await flushAsyncWork();

    syntaxDocument.text = "const view = <button onClick={save} />;";
    syntaxDocument.getText = () => syntaxDocument.text;
    syntaxMock.emitChange(syntaxDocument);
    await flushAsyncWork();

    assert.deepStrictEqual(
      syntaxState.snapshot()["litsx.dismissedSignatures"],
      {},
    );
  });

  it("keeps diagnostics when a LitSX document is reopened immediately after close", async () => {
    const document = createDocument({
      uri: "file:///virtual/reopen.litsx",
      fsPath: "/virtual/reopen.litsx",
      languageId: "litsx",
      text: "const view = <button @click={save} />;",
    });
    const vscodeMock = createVscodeMock({
      documents: [document],
      activeDocument: document,
    });
    const workspaceState = createWorkspaceState();

    const extension = await loadExtension({
      vscodeMock,
      editorSupportMock: {
        async computeLitsxCompletions() { return []; },
        async computeLitsxDiagnostics() { return []; },
        async computeLitsxHover() { return null; },
        async computeLitsxProjectCompletions() { return []; },
        async computeLitsxProjectDiagnostics() { return [{ start: 0, length: 5, messageText: "warn" }]; },
        async computeLitsxProjectHover() { return null; },
      },
    });

    extension.activate({ subscriptions: [], workspaceState });
    await flushAsyncWork();

    const reopened = createDocument({
      uri: document.uri.toString(),
      fsPath: document.uri.fsPath,
      languageId: "litsx",
      text: document.getText(),
    });

    vscodeMock.emitClose(document);
    vscodeMock.vscode.workspace.textDocuments = [reopened];
    vscodeMock.emitOpen(reopened);
    await flushAsyncWork();

    assert.deepStrictEqual(vscodeMock.diagnosticsState.deleteCalls, []);
  });

  it("deletes diagnostics after closing a LitSX document when it is not reopened", async () => {
    const document = createDocument({
      uri: "file:///virtual/closed-litsx.litsx",
      fsPath: "/virtual/closed-litsx.litsx",
      languageId: "litsx",
      text: "const view = <button @click={save} />;",
    });
    const vscodeMock = createVscodeMock({
      documents: [document],
      activeDocument: document,
    });

    const extension = await loadExtension({
      vscodeMock,
      editorSupportMock: {
        async computeLitsxCompletions() { return []; },
        async computeLitsxDiagnostics() { return []; },
        async computeLitsxHover() { return null; },
        async computeLitsxProjectCompletions() { return []; },
        async computeLitsxProjectDiagnostics() { return []; },
        async computeLitsxProjectHover() { return null; },
      },
    });

    extension.activate({ subscriptions: [], workspaceState: createWorkspaceState() });
    await flushAsyncWork();

    vscodeMock.emitClose(document);
    await flushAsyncWork();

    assert.ok(vscodeMock.diagnosticsState.deleteCalls.length >= 1);
    assert.ok(
      vscodeMock.diagnosticsState.deleteCalls.every((uri) => uri === document.uri.toString()),
    );
  });

  it("uses fallback targets for commands and dumps diagnostics for non-file LitSX documents", async () => {
    const document = createDocument({
      uri: "untitled:panel",
      fsPath: "/virtual/panel",
      scheme: "untitled",
      languageId: "custom-jsx",
      text: "const view = <button @click={save} />;",
    });
    const vscodeMock = createVscodeMock({
      documents: [document],
      activeDocument: document,
    });
    const workspaceState = createWorkspaceState();
    let directDiagnosticCalls = 0;

    const extension = await loadExtension({
      vscodeMock,
      editorSupportMock: {
        async computeLitsxCompletions() { return []; },
        async computeLitsxDiagnostics() {
          directDiagnosticCalls += 1;
          return [{ start: 0, length: 5, messageText: "inline" }];
        },
        async computeLitsxHover() { return null; },
        async computeLitsxProjectCompletions() { return []; },
        async computeLitsxProjectDiagnostics() { return []; },
        async computeLitsxProjectHover() { return null; },
      },
    });

    extension.activate({ subscriptions: [], workspaceState });
    await flushAsyncWork();

    await vscodeMock.commands.get("litsx.switchCurrentFileToLitsxMode")();
    assert.strictEqual(document.languageId, "litsx");

    document.languageId = "unknown-language";
    await vscodeMock.commands.get("litsx.resetCurrentFileLanguageMode")();
    assert.strictEqual(document.languageId, "typescriptreact");

    document.languageId = "litsx-jsx";
    await vscodeMock.commands.get("litsx.dumpCurrentFileDiagnostics")();
    assert.ok(directDiagnosticCalls >= 1);
    assert.ok(vscodeMock.outputLines.some((line) => line.startsWith("dumpCurrentFileDiagnostics")));
  });

  it("clears diagnostics and remembered state when a closed LitSX file reopens as standard JSX", async () => {
    const document = createDocument({
      uri: "file:///virtual/reopen-standard.litsx",
      fsPath: "/virtual/reopen-standard.litsx",
      languageId: "litsx",
      text: "const view = <button @click={save} />;",
    });
    const workspaceState = createWorkspaceState({
      "litsx.languageSelections": {
        [document.uri.toString()]: "litsx",
      },
      "litsx.dismissedSignatures": {
        [document.uri.toString()]: {
          targetLanguageId: "litsx",
          fingerprint: "1:1",
        },
      },
    });
    const vscodeMock = createVscodeMock({
      documents: [document],
      activeDocument: document,
    });

    const extension = await loadExtension({
      vscodeMock,
      editorSupportMock: {
        async computeLitsxCompletions() { return []; },
        async computeLitsxDiagnostics() { return []; },
        async computeLitsxHover() { return null; },
        async computeLitsxProjectCompletions() { return []; },
        async computeLitsxProjectDiagnostics() { return [{ start: 0, length: 5, messageText: "warn" }]; },
        async computeLitsxProjectHover() { return null; },
      },
    });

    extension.activate({ subscriptions: [], workspaceState });
    await flushAsyncWork();

    const reopened = createDocument({
      uri: document.uri.toString(),
      fsPath: document.uri.fsPath,
      languageId: "typescriptreact",
      text: document.getText(),
    });

    vscodeMock.emitClose(document);
    vscodeMock.vscode.workspace.textDocuments = [reopened];
    vscodeMock.emitOpen(reopened);
    await flushAsyncWork();

    assert.ok(vscodeMock.diagnosticsState.deleteCalls.length >= 1);
    assert.ok(
      vscodeMock.diagnosticsState.deleteCalls.every((uri) => uri === document.uri.toString()),
    );
    assert.deepStrictEqual(workspaceState.snapshot()["litsx.languageSelections"], {});
    assert.deepStrictEqual(workspaceState.snapshot()["litsx.dismissedSignatures"], {});
  });
});
