import * as vscode from "vscode";
import {
  detectLitsxSyntax,
  getSuggestedLitsxLanguageId,
  getStandardLanguageId,
  isStandardJsxLanguage,
} from "./detect.js";
import {
  computeLitsxCompletions,
  computeLitsxDiagnostics,
  computeLitsxHover,
  computeLitsxProjectCompletions,
  computeLitsxProjectDiagnostics,
  computeLitsxProjectHover,
} from "./editor-support.js";

const LANGUAGE_SELECTIONS_KEY = "litsx.languageSelections";
const DISMISSED_SIGNATURES_KEY = "litsx.dismissedSignatures";
const RECENT_CLOSE_WINDOW_MS = 1500;

function activate(context) {
  const diagnostics = vscode.languages.createDiagnosticCollection("litsx");
  const output = vscode.window.createOutputChannel("LitSX");
  const dismissedDocumentVersions = new Map();
  const pendingSuggestions = new Set();
  let persistedSelections = context.workspaceState.get(LANGUAGE_SELECTIONS_KEY, {});
  let dismissedSignatures = context.workspaceState.get(DISMISSED_SIGNATURES_KEY, {});
  const openDocumentLanguageIds = new Map(
    vscode.workspace.textDocuments.map((document) => [document.uri.toString(), document.languageId]),
  );
  const recentlyClosedLanguageIds = new Map();

  function getDocumentKey(document) {
    return document?.uri?.toString() ?? "";
  }

  function getLiveDocument(documentOrKey) {
    const documentKey = typeof documentOrKey === "string"
      ? documentOrKey
      : getDocumentKey(documentOrKey);
    return vscode.workspace.textDocuments.find(
      (candidate) => getDocumentKey(candidate) === documentKey,
    ) ?? null;
  }

  function getDocumentFingerprint(document) {
    const text = document?.getText?.() ?? "";
    let hash = 5381;
    for (let index = 0; index < text.length; index += 1) {
      hash = ((hash << 5) + hash) ^ text.charCodeAt(index);
    }
    return `${text.length}:${hash >>> 0}`;
  }

  function getPersistedLanguageSelection(document) {
    return persistedSelections[getDocumentKey(document)] ?? null;
  }

  async function persistLanguageSelection(document, targetLanguageId) {
    const documentKey = getDocumentKey(document);
    if (!documentKey || !targetLanguageId) {
      return;
    }

    persistedSelections = {
      ...persistedSelections,
      [documentKey]: targetLanguageId,
    };
    await context.workspaceState.update(LANGUAGE_SELECTIONS_KEY, persistedSelections);
    await clearDismissedSignature(document);
  }

  async function clearPersistedLanguageSelection(document) {
    const documentKey = getDocumentKey(document);
    if (!documentKey || !(documentKey in persistedSelections)) {
      return;
    }

    const nextSelections = { ...persistedSelections };
    delete nextSelections[documentKey];
    persistedSelections = nextSelections;
    await context.workspaceState.update(LANGUAGE_SELECTIONS_KEY, persistedSelections);
  }

  function getDismissedSignature(document) {
    return dismissedSignatures[getDocumentKey(document)] ?? null;
  }

  async function persistDismissedSignature(document, targetLanguageId) {
    const documentKey = getDocumentKey(document);
    if (!documentKey || !targetLanguageId) {
      return;
    }

    dismissedSignatures = {
      ...dismissedSignatures,
      [documentKey]: {
        targetLanguageId,
        fingerprint: getDocumentFingerprint(document),
      },
    };
    await context.workspaceState.update(DISMISSED_SIGNATURES_KEY, dismissedSignatures);
  }

  async function clearDismissedSignature(document) {
    const documentKey = getDocumentKey(document);
    if (!documentKey || !(documentKey in dismissedSignatures)) {
      return;
    }

    const nextDismissedSignatures = { ...dismissedSignatures };
    delete nextDismissedSignatures[documentKey];
    dismissedSignatures = nextDismissedSignatures;
    await context.workspaceState.update(DISMISSED_SIGNATURES_KEY, dismissedSignatures);
  }

  function isDismissedForCurrentContent(document, targetLanguageId) {
    const dismissedSignature = getDismissedSignature(document);
    if (!dismissedSignature) {
      return false;
    }

    return (
      dismissedSignature.targetLanguageId === targetLanguageId &&
      dismissedSignature.fingerprint === getDocumentFingerprint(document)
    );
  }

  function rememberDismissedVersion(document) {
    const documentKey = getDocumentKey(document);
    if (!documentKey) {
      return;
    }

    dismissedDocumentVersions.set(documentKey, document.version);
  }

  function wasDismissedForCurrentVersion(document) {
    const documentKey = getDocumentKey(document);
    return dismissedDocumentVersions.get(documentKey) === document.version;
  }

  async function switchDocumentLanguage(document, targetLanguageId) {
    if (!document || !targetLanguageId || document.languageId === targetLanguageId) {
      return;
    }

    await vscode.languages.setTextDocumentLanguage(document, targetLanguageId);
  }

  function toSeverity(vscodeModule, diagnostic) {
    if (diagnostic.category === 0) {
      return vscodeModule.DiagnosticSeverity.Warning;
    }

    return vscodeModule.DiagnosticSeverity.Error;
  }

  function isTraceDiagnosticsEnabled() {
    return vscode.workspace.getConfiguration("litsx").get("traceDiagnostics", false);
  }

  function formatDiagnosticLog(document, diagnostic) {
    const start = document.positionAt(diagnostic.start ?? 0);
    const end = document.positionAt((diagnostic.start ?? 0) + (diagnostic.length ?? 0));
    const excerpt = document.getText(new vscode.Range(start, end)).replace(/\n/g, "\\n");
    return `[${diagnostic.code ?? "?"}] ${start.line + 1}:${start.character + 1}-${end.line + 1}:${end.character + 1} "${excerpt}" ${String(diagnostic.messageText ?? "")}`;
  }

  async function refreshDiagnostics(document) {
    if (!document || document.isClosed) {
      return;
    }

    if (document.languageId !== "litsx" && document.languageId !== "litsx-jsx") {
      const liveDocument = getLiveDocument(document);
      if (
        !liveDocument ||
        liveDocument.isClosed ||
        (liveDocument.languageId !== "litsx" && liveDocument.languageId !== "litsx-jsx")
      ) {
        diagnostics.delete(document.uri);
      }
      return;
    }

    const sourceText = document.getText();
    const documentKey = getDocumentKey(document);
    const languageId = document.languageId;
    const version = document.version;
    const authoredDiagnostics = await (
      document.uri?.scheme === "file"
        ? computeLitsxProjectDiagnostics(document.uri.fsPath, sourceText, document.languageId)
        : computeLitsxDiagnostics(sourceText, document.languageId)
    );

    const latestDocument = getLiveDocument(documentKey);

    if (
      !latestDocument ||
      latestDocument.isClosed ||
      latestDocument.version !== version ||
      latestDocument.languageId !== languageId
    ) {
      return;
    }

    const nextDiagnostics = authoredDiagnostics.map((diagnostic) => {
      const start = latestDocument.positionAt(diagnostic.start ?? 0);
      const end = latestDocument.positionAt((diagnostic.start ?? 0) + (diagnostic.length ?? 0));
      const vscodeDiagnostic = new vscode.Diagnostic(
        new vscode.Range(start, end),
        String(diagnostic.messageText ?? ""),
        toSeverity(vscode, diagnostic),
      );
      vscodeDiagnostic.code = diagnostic.code;
      vscodeDiagnostic.source = diagnostic.source ?? "vscode-litsx";
      return vscodeDiagnostic;
    });

    if (isTraceDiagnosticsEnabled()) {
      output.appendLine(`refreshDiagnostics ${latestDocument.uri.toString()} v${latestDocument.version} ${latestDocument.languageId}`);
      for (const diagnostic of authoredDiagnostics) {
        output.appendLine(`  ${formatDiagnosticLog(latestDocument, diagnostic)}`);
      }
    }

    diagnostics.set(latestDocument.uri, nextDiagnostics);
  }

  async function provideHover(document, position) {
    const hoverInfo = await (
      document.uri?.scheme === "file"
        ? computeLitsxProjectHover(
          document.uri.fsPath,
          document.getText(),
          document.languageId,
          document.offsetAt(position),
        )
        : computeLitsxHover(
          document.getText(),
          document.languageId,
          document.offsetAt(position),
        )
    );

    if (!hoverInfo) {
      return null;
    }

    const start = document.positionAt(hoverInfo.start);
    const end = document.positionAt(hoverInfo.start + hoverInfo.length);
    return new vscode.Hover(
      [
        new vscode.MarkdownString().appendCodeblock(hoverInfo.code, "ts"),
        hoverInfo.documentation,
      ],
      new vscode.Range(start, end),
    );
  }

  async function provideCompletions(document, position) {
    const completions = await (
      document.uri?.scheme === "file"
        ? computeLitsxProjectCompletions(
          document.uri.fsPath,
          document.getText(),
          document.languageId,
          document.offsetAt(position),
          vscode,
        )
        : computeLitsxCompletions(
          document.getText(),
          document.languageId,
          document.offsetAt(position),
          vscode,
        )
    );

    return completions.map((entry) => {
      const item = new vscode.CompletionItem(entry.label, entry.kind);
      item.detail = entry.detail;
      item.documentation = entry.documentation;
      item.insertText = entry.label;
      item.range = new vscode.Range(
        document.positionAt(entry.start),
        document.positionAt(entry.start + entry.length),
      );
      return item;
    });
  }

  async function ensurePersistedLanguageMode(document) {
    if (!document || document.isClosed) {
      return false;
    }

    const targetLanguageId = getPersistedLanguageSelection(document);
    if (!targetLanguageId || document.languageId === targetLanguageId) {
      return false;
    }

    await switchDocumentLanguage(document, targetLanguageId);
    return true;
  }

  async function suggestLanguageMode(document) {
    if (!document || document.isClosed) {
      return;
    }

    if (await ensurePersistedLanguageMode(document)) {
      return;
    }

    if (!isStandardJsxLanguage(document.languageId)) {
      return;
    }

    if (!vscode.workspace.getConfiguration("litsx").get("autoSuggestLanguageMode", true)) {
      return;
    }

    const targetLanguageId = getSuggestedLitsxLanguageId(document.languageId);
    if (!targetLanguageId) {
      return;
    }

    const documentKey = document.uri.toString();
    if (wasDismissedForCurrentVersion(document) || pendingSuggestions.has(documentKey)) {
      return;
    }

    if (!detectLitsxSyntax(document.getText())) {
      await clearDismissedSignature(document);
      return;
    }

    if (isDismissedForCurrentContent(document, targetLanguageId)) {
      return;
    }

    pendingSuggestions.add(documentKey);
    const switchLabel = targetLanguageId === "litsx-jsx" ? "Switch to LitSX JSX" : "Switch to LitSX";
    const response = await vscode.window.showInformationMessage(
      "LitSX-authored syntax detected in this file. Switch the editor language mode for correct LitSX highlighting?",
      switchLabel,
      "Dismiss",
    );
    pendingSuggestions.delete(documentKey);

    if (response === switchLabel) {
      await persistLanguageSelection(document, targetLanguageId);
      await switchDocumentLanguage(document, targetLanguageId);
      return;
    }

    if (response === "Dismiss") {
      await persistDismissedSignature(document, targetLanguageId);
      rememberDismissedVersion(document);
    }
  }

  function queueSuggestion(document) {
    void suggestLanguageMode(document);
    void refreshDiagnostics(document);
  }

  function getPreviousObservedLanguageId(documentKey) {
    const openLanguageId = openDocumentLanguageIds.get(documentKey);
    if (openLanguageId != null) {
      return openLanguageId;
    }

    const recentlyClosed = recentlyClosedLanguageIds.get(documentKey);
    if (!recentlyClosed) {
      return null;
    }

    if (Date.now() - recentlyClosed.closedAt > RECENT_CLOSE_WINDOW_MS) {
      recentlyClosedLanguageIds.delete(documentKey);
      return null;
    }

    return recentlyClosed.languageId;
  }

  async function handleExplicitLanguageModeChange(document, previousLanguageId, nextLanguageId) {
    if (!document || previousLanguageId === nextLanguageId) {
      return;
    }

    if (getStandardLanguageId(previousLanguageId) === nextLanguageId) {
      await clearPersistedLanguageSelection(document);
      await clearDismissedSignature(document);
    }
  }

  function observeDocument(document) {
    if (!document) {
      return;
    }

    const documentKey = getDocumentKey(document);
    const previousLanguageId = getPreviousObservedLanguageId(documentKey);
    openDocumentLanguageIds.set(documentKey, document.languageId);
    recentlyClosedLanguageIds.delete(documentKey);

    if (
      previousLanguageId != null &&
      previousLanguageId !== document.languageId &&
      getStandardLanguageId(previousLanguageId) === document.languageId
    ) {
      void handleExplicitLanguageModeChange(document, previousLanguageId, document.languageId);
    }

    queueSuggestion(document);
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("litsx.switchCurrentFileToLitsxMode", async () => {
      const editor = vscode.window.activeTextEditor;
      const document = editor?.document;
      if (!document) {
        return;
      }

      const targetLanguageId =
        getSuggestedLitsxLanguageId(document.languageId) ??
        (document.languageId === "litsx-jsx" ? "litsx-jsx" : "litsx");

      await persistLanguageSelection(document, targetLanguageId);
      await switchDocumentLanguage(document, targetLanguageId);
    }),
    vscode.commands.registerCommand("litsx.resetCurrentFileLanguageMode", async () => {
      const editor = vscode.window.activeTextEditor;
      const document = editor?.document;
      if (!document) {
        return;
      }

      const targetLanguageId = getStandardLanguageId(document.languageId) ?? "typescriptreact";

      await clearPersistedLanguageSelection(document);
      await clearDismissedSignature(document);
      await switchDocumentLanguage(document, targetLanguageId);
    }),
    vscode.commands.registerCommand("litsx.dumpCurrentFileDiagnostics", async () => {
      const editor = vscode.window.activeTextEditor;
      const document = editor?.document;
      if (!document) {
        return;
      }

      const computedDiagnostics = await (
        document.uri?.scheme === "file"
          ? computeLitsxProjectDiagnostics(document.uri.fsPath, document.getText(), document.languageId)
          : computeLitsxDiagnostics(document.getText(), document.languageId)
      );

      output.appendLine(`dumpCurrentFileDiagnostics ${document.uri.toString()} v${document.version} ${document.languageId}`);
      for (const diagnostic of computedDiagnostics) {
        output.appendLine(`  ${formatDiagnosticLog(document, diagnostic)}`);
      }
      output.show(true);
    }),
    vscode.workspace.onDidOpenTextDocument(observeDocument),
    vscode.workspace.onDidChangeTextDocument((event) => observeDocument(event.document)),
    vscode.window.onDidChangeActiveTextEditor((editor) => observeDocument(editor?.document)),
    vscode.workspace.onDidCloseTextDocument((document) => {
      recentlyClosedLanguageIds.set(getDocumentKey(document), {
        languageId: document.languageId,
        closedAt: Date.now(),
      });
      openDocumentLanguageIds.delete(getDocumentKey(document));
      dismissedDocumentVersions.delete(getDocumentKey(document));
      pendingSuggestions.delete(getDocumentKey(document));
      setTimeout(() => {
        const liveDocument = getLiveDocument(document);
        if (
          !liveDocument ||
          liveDocument.isClosed ||
          (liveDocument.languageId !== "litsx" && liveDocument.languageId !== "litsx-jsx")
        ) {
          diagnostics.delete(document.uri);
        }
      }, 0);
    }),
    vscode.languages.registerHoverProvider(
      [{ language: "litsx" }, { language: "litsx-jsx" }],
      {
        provideHover(document, position) {
          return provideHover(document, position);
        },
      },
    ),
    vscode.languages.registerCompletionItemProvider(
      [{ language: "litsx" }, { language: "litsx-jsx" }],
      {
        provideCompletionItems(document, position) {
          return provideCompletions(document, position);
        },
      },
      "@",
      ".",
      "?",
    ),
    diagnostics,
    output,
  );

  for (const document of vscode.workspace.textDocuments) {
    observeDocument(document);
  }

  observeDocument(vscode.window.activeTextEditor?.document);
}

function deactivate() {}

export {
  activate,
  deactivate,
};
