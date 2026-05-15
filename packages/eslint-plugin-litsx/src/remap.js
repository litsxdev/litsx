import { mapOriginalPositionToToolingVirtual } from "@litsx/typescript/virtualization";

export function offsetToLineColumn(offset, lineStarts) {
  const normalizedOffset = Math.max(0, offset);
  let low = 0;
  let high = lineStarts.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lineStarts[mid] <= normalizedOffset) {
      if (mid === lineStarts.length - 1 || lineStarts[mid + 1] > normalizedOffset) {
        return {
          line: mid + 1,
          column: normalizedOffset - lineStarts[mid] + 1,
        };
      }
      low = mid + 1;
      continue;
    }

    high = mid - 1;
  }

  return {
    line: 1,
    column: 1,
  };
}

export function lineColumnToOffset(line, column, lineStarts) {
  const normalizedLine = Math.max(1, line || 1);
  const lineIndex = Math.min(normalizedLine - 1, lineStarts.length - 1);
  const lineStart = lineStarts[lineIndex] ?? 0;
  return lineStart + Math.max(0, (column || 1) - 1);
}

function findVirtualReplacementRangeAtOffset(offset, virtualization) {
  const replacements = virtualization?.replacements ?? [];
  const preambleLength = virtualization?.toolingPreambleLength ?? 0;
  let virtualCursor = preambleLength;
  let originalCursor = 0;

  for (const replacement of replacements) {
    const untouchedLength = replacement.start - originalCursor;
    const virtualStart = virtualCursor + untouchedLength;
    const virtualEnd = virtualStart + replacement.replacement.length;

    if (offset >= virtualStart && offset < virtualEnd) {
      return {
        replacement,
        virtualStart,
        virtualEnd,
      };
    }

    virtualCursor = virtualEnd;
    originalCursor = replacement.end;
  }

  return null;
}

export function remapVirtualOffsetToOriginal(offset, virtualization) {
  const replacements = virtualization?.replacements ?? [];
  if (!replacements.length) {
    return offset - (virtualization?.toolingPreambleLength ?? 0);
  }

  const preambleLength = virtualization?.toolingPreambleLength ?? 0;
  const normalizedOffset = Math.max(0, offset - preambleLength);
  let virtualCursor = 0;
  let originalCursor = 0;

  for (const replacement of replacements) {
    const untouchedLength = replacement.start - originalCursor;
    const virtualStart = virtualCursor + untouchedLength;
    const virtualEnd = virtualStart + replacement.replacement.length;

    if (normalizedOffset < virtualStart) {
      return originalCursor + (normalizedOffset - virtualCursor);
    }

    if (normalizedOffset < virtualEnd) {
      return replacement.start;
    }

    virtualCursor = virtualEnd;
    originalCursor = replacement.end;
  }

  return originalCursor + (normalizedOffset - virtualCursor);
}

export function mapOriginalSpanToVirtual(start, length, virtualization) {
  const originalStart = Math.max(0, start ?? 0);
  const originalEnd = originalStart + Math.max(0, length ?? 0);
  const replacements = virtualization?.replacements ?? [];
  const virtualStart = mapOriginalPositionToToolingVirtual(originalStart, virtualization);
  const startReplacement = replacements.find((replacement) => (
    originalStart >= replacement.start && originalStart < replacement.end
  ));

  if (startReplacement) {
    return {
      start: virtualStart,
      end: virtualStart + startReplacement.replacement.length,
    };
  }

  const endReplacement = replacements.find((replacement) => (
    originalEnd > replacement.start && originalEnd <= replacement.end
  ));
  const virtualEnd = endReplacement
    ? mapOriginalPositionToToolingVirtual(endReplacement.start, virtualization) + endReplacement.replacement.length
    : mapOriginalPositionToToolingVirtual(originalEnd, virtualization);

  return {
    start: virtualStart,
    end: Math.max(virtualStart + (length > 0 ? 1 : 0), virtualEnd),
  };
}

export function remapLintFix(fix, virtualization) {
  if (!fix || !Array.isArray(fix.range) || fix.range.length !== 2) {
    return fix;
  }

  const [start, end] = fix.range;
  if (findVirtualReplacementRangeAtOffset(start, virtualization) || findVirtualReplacementRangeAtOffset(Math.max(start, end - 1), virtualization)) {
    return null;
  }

  return {
    ...fix,
    range: [
      remapVirtualOffsetToOriginal(start, virtualization),
      remapVirtualOffsetToOriginal(end, virtualization),
    ],
  };
}

export function remapLintMessage(message, state) {
  if (!message || !state) {
    return message;
  }

  const {
    originalLineStarts,
    virtualLineStarts,
    virtualization,
  } = state;

  const startOffset = lineColumnToOffset(message.line, message.column, virtualLineStarts);
  const originalStartOffset = remapVirtualOffsetToOriginal(startOffset, virtualization);
  const originalStart = offsetToLineColumn(originalStartOffset, originalLineStarts);

  let remapped = {
    ...message,
    line: originalStart.line,
    column: originalStart.column,
  };

  if (message.endLine || message.endColumn) {
    const endOffset = lineColumnToOffset(
      message.endLine ?? message.line,
      message.endColumn ?? message.column,
      virtualLineStarts,
    );
    const originalEndOffset = remapVirtualOffsetToOriginal(endOffset, virtualization);
    const originalEnd = offsetToLineColumn(originalEndOffset, originalLineStarts);
    remapped.endLine = originalEnd.line;
    remapped.endColumn = originalEnd.column;
  }

  if (message.fix) {
    const fix = remapLintFix(message.fix, virtualization);
    if (fix) {
      remapped.fix = fix;
    } else {
      delete remapped.fix;
    }
  }

  if (Array.isArray(message.suggestions)) {
    remapped.suggestions = message.suggestions
      .map((suggestion) => (
        suggestion?.fix
          ? {
            ...suggestion,
            fix: remapLintFix(suggestion.fix, virtualization),
          }
          : suggestion
      ))
      .filter((suggestion) => !suggestion?.fix || suggestion.fix);
  }

  return remapped;
}

export function createMessageDedupKey(message) {
  return [
    message?.severity ?? "",
    message?.message ?? "",
    message?.line ?? "",
  ].join("|");
}
