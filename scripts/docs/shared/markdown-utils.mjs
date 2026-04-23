export function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function fence(code, language = "") {
  return `\`\`\`${language}\n${code.replace(/\s+$/, "")}\n\`\`\``;
}

export function firstParagraph(markdown) {
  if (!markdown) return "";
  const lines = markdown.split("\n");
  const parts = [];

  for (const line of lines) {
    if (!line.trim()) {
      if (parts.length) break;
      continue;
    }
    if (line.startsWith("#")) continue;
    parts.push(line.trim());
  }

  return parts.join(" ").trim();
}
