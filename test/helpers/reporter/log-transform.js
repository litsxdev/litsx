import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { diffLines } = require("diff");
export const LOG_TRANSFORM_MARKER = "__LITSX_TRANSFORM__";
export const LOG_TRANSFORM_END_MARKER = "__END_LITSX_TRANSFORM__";

const supportsIntlSegmenter =
  typeof Intl !== "undefined" && typeof Intl.Segmenter === "function";
const intlSegmenter = supportsIntlSegmenter
  ? new Intl.Segmenter("en", { granularity: "word" })
  : null;

const colors = {
  banner: "\u001b[35;1m",
  label: "\u001b[36;1m",
  divider: "\u001b[90m",
  transformed: "\u001b[32m",
  removed: "\u001b[31m",
  faint: "\u001b[90m",
  headerBg: "\u001b[100m",
  textWhite: "\u001b[97m",
  reset: "\u001b[0m",
};

function dedent(value) {
  if (typeof value !== "string") return "";

  const withoutPadding = value.replace(/^\n/, "").replace(/\n\s*$/, "");
  const lines = withoutPadding.split("\n");

  let indent = null;
  for (const line of lines) {
    if (!line.trim()) continue;
    const match = line.match(/^\s*/);
    const current = match ? match[0].length : 0;
    indent = indent === null ? current : Math.min(indent, current);
  }

  if (!indent) {
    return lines.join("\n");
  }

  return lines.map((line) => line.slice(indent)).join("\n");
}

function formatInlineDiff(label, sourceSection, transformedSection) {
  const diffOptions = intlSegmenter ? { intlSegmenter } : undefined;
  const diff = diffLines(sourceSection, transformedSection, diffOptions);

  const body = diff
    .map((part) => {
      const prefix = part.added ? "+ " : part.removed ? "- " : "  ";
      const applyColor = part.added
        ? (value) => `${colors.transformed}${value}${colors.reset}`
        : part.removed
          ? (value) => `${colors.removed}${value}${colors.reset}`
          : (value) => `${colors.faint}${value}${colors.reset}`;

      const endsWithNewline = part.value.endsWith("\n");
      const lines = part.value.split("\n");

      const formatted = lines
        .map((line, index) => {
          const isLast = index === lines.length - 1;
          if (isLast && !endsWithNewline) {
            return `${prefix}${line}`;
          }
          return `${prefix}${line}\n`;
        })
        .join("");

      const output = endsWithNewline ? formatted : `${formatted}\n`;
      return applyColor(output);
    })
    .join("");
  return { header: "", body, footer: "" };
}

function formatSideBySideDiff(label, sourceSection, transformedSection) {
  const diffOptions = intlSegmenter ? { intlSegmenter } : undefined;
  const diff = diffLines(sourceSection, transformedSection, diffOptions);

  const rows = [];
  let maxLeft = 0;
  let maxRight = 0;

  diff.forEach((part) => {
    const lines = part.value.split("\n");
    const trimmedLines =
      lines[lines.length - 1] === "" ? lines.slice(0, -1) : lines;

    if (part.added) {
      trimmedLines.forEach((line) => {
        rows.push({ left: "", right: line, type: "added" });
        maxRight = Math.max(maxRight, line.length);
      });
      return;
    }

    if (part.removed) {
      trimmedLines.forEach((line) => {
        rows.push({ left: line, right: "", type: "removed" });
        maxLeft = Math.max(maxLeft, line.length);
      });
      return;
    }

    trimmedLines.forEach((line) => {
      rows.push({ left: line, right: line, type: "unchanged" });
      maxLeft = Math.max(maxLeft, line.length);
      maxRight = Math.max(maxRight, line.length);
    });
  });

  if (rows.length === 0) {
    rows.push({ left: "", right: "", type: "unchanged" });
  }

  const leftLabel = "source";
  const rightLabel = "output";
  const leftLabelContent = ` ${leftLabel} `;
  const rightLabelContent = ` ${rightLabel} `;

  const leftWidth = Math.min(
    Math.max(Math.max(maxLeft, leftLabelContent.length), 60),
    80
  );
  const rightWidth = Math.max(
    Math.min(Math.max(maxRight, 8), 80),
    rightLabelContent.length
  );

  const headerLeft = `${colors.headerBg}${colors.textWhite}${leftLabelContent}${colors.reset}`;
  const headerRight = `${colors.headerBg}${colors.textWhite}${rightLabelContent}${colors.reset}`;

  const expectedPaddingWidth = Math.max(leftWidth - leftLabelContent.length + 1, 0);
  const expectedPadding = `${colors.faint}${" ".repeat(expectedPaddingWidth)}${colors.reset}`;

  const actualPaddingWidth = Math.max(rightWidth - rightLabelContent.length, 0);
  const actualPadding = `${colors.faint}${" ".repeat(actualPaddingWidth)}${colors.reset}`;

  const columnsHeader = `${headerLeft}${expectedPadding}│ ${headerRight}${actualPadding}`;
  const divider = `${colors.faint}${"─".repeat(leftWidth)}${colors.reset}─┼─${colors.faint}${"─".repeat(rightWidth)}${colors.reset}`;

  const splitSegments = (value, width) => {
    if (width <= 0) return [""];
    if (!value) return [""];
    const segments = [];
    for (let index = 0; index < value.length; index += width) {
      segments.push(value.slice(index, index + width));
    }
    if (segments.length === 0) segments.push("");
    return segments;
  };

  const colorSegments = (segments, type, width, side) => {
    if (!Array.isArray(segments) || segments.length === 0) {
      segments = [""];
    }
    return segments.map((segment) => {
      const padded = segment.padEnd(width, " ");
      if (type === "removed" && side === "left" && segment.trim().length > 0) {
        return `${colors.removed}${padded}${colors.reset}`;
      }
      if (type === "added" && side === "right" && segment.trim().length > 0) {
        return `${colors.transformed}${padded}${colors.reset}`;
      }
      return `${colors.faint}${padded}${colors.reset}`;
    });
  };

  const bodyLines = rows.flatMap((row) => {
    const leftSegments = colorSegments(
      splitSegments(row.left, leftWidth),
      row.type,
      leftWidth,
      "left"
    );
    const rightSegments = colorSegments(
      splitSegments(row.right, rightWidth),
      row.type,
      rightWidth,
      "right"
    );
    const lineCount = Math.max(leftSegments.length, rightSegments.length);
    const lines = [];
    for (let index = 0; index < lineCount; index += 1) {
      const leftPart =
        leftSegments[index] ??
        `${colors.faint}${" ".repeat(leftWidth)}${colors.reset}`;
      const rightPart =
        rightSegments[index] ??
        `${colors.faint}${" ".repeat(rightWidth)}${colors.reset}`;
      lines.push(`${leftPart} │ ${rightPart}`);
    }
    return lines;
  });

  return {
    header: [columnsHeader, divider].join("\n"),
    body: bodyLines.join("\n"),
    footer: "",
  };
}

export function formatTransformDiff(
  label,
  source,
  transformed,
  mode = "inline"
) {
  const sourceSection = dedent(source);
  const transformedSection = dedent(transformed).trim();

  if (mode === "side-by-side") {
    return formatSideBySideDiff(label, sourceSection, transformedSection);
  }
  return formatInlineDiff(label, sourceSection, transformedSection);
}

export default function logTransform(label, source, transformed) {
  const payload = Buffer.from(
    JSON.stringify({ label, source, transformed }),
    "utf8"
  ).toString("base64");
  console.log(
    `${LOG_TRANSFORM_MARKER}${payload}${LOG_TRANSFORM_END_MARKER}`
  );
}
