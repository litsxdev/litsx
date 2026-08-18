const DIGEST_MAPPINGS = Symbol.for("@litsx/ssr/spread-digest-mappings");
const MARKER = "<!--lit-part ";

export function createSpreadDigestRewriter(mappings = globalThis[DIGEST_MAPPINGS]) {
  let pending = "";

  const trailingPrefixLength = (value) => {
    const limit = Math.min(value.length, MARKER.length - 1);
    for (let length = limit; length > 0; length -= 1) {
      if (MARKER.startsWith(value.slice(-length))) return length;
    }
    return 0;
  };

  return {
    write(chunk) {
      pending += chunk;
      let output = "";
      while (pending) {
        const start = pending.indexOf(MARKER);
        if (start < 0) {
          const keep = trailingPrefixLength(pending);
          output += pending.slice(0, pending.length - keep);
          pending = pending.slice(pending.length - keep);
          break;
        }
        output += pending.slice(0, start);
        pending = pending.slice(start);
        const end = pending.indexOf("-->", MARKER.length);
        if (end < 0) break;
        const digest = pending.slice(MARKER.length, end);
        const replacement = (mappings ?? globalThis[DIGEST_MAPPINGS])?.get?.(digest);
        output += replacement ? `${MARKER}${replacement}-->` : pending.slice(0, end + 3);
        pending = pending.slice(end + 3);
      }
      return output;
    },
    end() {
      const output = pending;
      pending = "";
      return output;
    },
  };
}

function transformResult(result, rewriter, root) {
  return (function* () {
    for (const chunk of result) {
      if (typeof chunk === "string") {
        const output = rewriter.write(chunk);
        if (output) yield output;
      } else {
        yield Promise.resolve(chunk).then((nested) => transformResult(nested, rewriter, false));
      }
    }
    if (root) {
      const output = rewriter.end();
      if (output) yield output;
    }
  })();
}

export function rewriteSpreadRenderResult(result) {
  return transformResult(result, createSpreadDigestRewriter(), true);
}
