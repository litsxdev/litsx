export function normalizeJsdoc(block) {
  if (!block) return "";

  return block
    .replace(/^\/\*\*\s*\n?/, "")
    .replace(/\n?\s*\*\/$/, "")
    .split("\n")
    .map((line) => line.replace(/^\s*\*\s?/, ""))
    .join("\n")
    .trim();
}

export function extractLeadingJsdoc(source, startIndex) {
  let cursor = startIndex - 1;

  while (cursor >= 0 && /\s/.test(source[cursor])) {
    cursor -= 1;
  }

  if (cursor < 1 || source[cursor] !== "/" || source[cursor - 1] !== "*") {
    return "";
  }

  const blockEnd = cursor + 1;
  const blockStart = source.lastIndexOf("/**", cursor - 1);
  if (blockStart === -1) {
    return "";
  }

  const block = source.slice(blockStart, blockEnd + 1);
  if (!block.trimEnd().endsWith("*/")) {
    return "";
  }

  return normalizeJsdoc(block);
}

export function splitJsdocSections(jsdoc) {
  if (!jsdoc) {
    return { summary: "", tags: [] };
  }

  const lines = jsdoc.split("\n");
  const summaryLines = [];
  const tags = [];
  let currentTag = null;

  for (const line of lines) {
    if (line.trim().startsWith("@")) {
      if (currentTag) tags.push(currentTag);
      const [tag, ...rest] = line.trim().split(/\s+/);
      currentTag = { tag, text: rest.join(" ") };
      continue;
    }

    if (currentTag) {
      currentTag.text += ` ${line.trim()}`.trimEnd();
    } else {
      summaryLines.push(line);
    }
  }

  if (currentTag) tags.push(currentTag);

  return {
    summary: summaryLines.join("\n").trim(),
    tags,
  };
}
