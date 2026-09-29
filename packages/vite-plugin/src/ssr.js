import {
  appendToDocumentBody,
  captureCurrentSsrConsole,
  createEntry,
  createSsrDevErrorDocument,
  renderDocument,
  renderSsrDevConsoleDiagnostics,
} from "@litsx/ssr";
import { createServer } from "vite";
import path from "node:path";
import { createLitsxViteAssetResolver, litsx } from "./index.js";

function resolveFsPath(root, value) {
  if (!value) {
    return root;
  }
  return path.isAbsolute(value) ? value : path.join(root, value);
}

function toViteSsrModuleId(root, filePath) {
  const relativePath = path.relative(root, filePath).split(path.sep).join("/");
  return relativePath.startsWith("../") ? filePath : `/${relativePath}`;
}

/**
 * Create a Vite-backed local development server for authored LitSX SSR.
 */
export async function createSsrDevServer(options = {}) {
  const root = resolveFsPath(process.cwd(), options.root ?? process.cwd());
  const viteServer = await createServer({
    root,
    appType: "custom",
    logLevel: options.logLevel ?? "info",
    server: {
      host: options.host ?? "127.0.0.1",
      port: options.port ?? 5177,
      strictPort: options.strictPort ?? false,
      ...(options.server || {}),
    },
    plugins: [
      litsx({
        ssr: true,
        sourceMaps: true,
        ...(options.litsx || {}),
      }),
      ...((options.plugins || [])),
    ],
    ...(options.vite || {}),
  });

  viteServer.middlewares.use(async (req, res, next) => {
    const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
    if (
      (req.method !== "GET" && req.method !== "HEAD") ||
      (requestUrl.pathname !== "/" && requestUrl.pathname !== "/index.html")
    ) {
      next();
      return;
    }

    const messages = [];
    try {
      const assetResolver = options.assetResolver ?? createLitsxViteAssetResolver({
        root,
        base: viteServer.config.base,
      });
      const { result } = await captureCurrentSsrConsole(
        () => renderDocument(createEntry({
          ...options,
          root,
          assetResolver,
          loadModule(resolvedPath) {
            return viteServer.ssrLoadModule(toViteSsrModuleId(root, resolvedPath));
          },
        })),
        messages,
      );
      const document = await viteServer.transformIndexHtml(
        requestUrl.pathname,
        appendToDocumentBody(result.document, renderSsrDevConsoleDiagnostics(messages)),
      );
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(document);
    } catch (error) {
      viteServer.ssrFixStacktrace(error);
      viteServer.config.logger.error(
        error instanceof Error && error.stack ? error.stack : String(error),
      );
      const document = await viteServer.transformIndexHtml(
        requestUrl.pathname,
        appendToDocumentBody(
          createSsrDevErrorDocument(error),
          renderSsrDevConsoleDiagnostics(messages),
        ),
      );
      res.statusCode = 500;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(document);
    }
  });

  return viteServer;
}
