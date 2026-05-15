export function isReactiveControllerHostLike(value) {
  return !!value
    && typeof value === "object"
    && typeof value.addController === "function";
}

function readHostSlotName(node) {
  if (!node || typeof node !== "object") {
    return "default";
  }

  if (typeof node.slot === "string" && node.slot) {
    return node.slot;
  }

  if (typeof node.getAttribute === "function") {
    const slotName = node.getAttribute("slot");
    if (typeof slotName === "string" && slotName) {
      return slotName;
    }
  }

  return "default";
}

function readHostTextContent(host) {
  if (typeof host?.textContent === "string") {
    return host.textContent;
  }

  const nodes = Array.isArray(host?.childNodes) ? host.childNodes : Array.from(host?.childNodes ?? []);
  return nodes.map((node) => node?.textContent ?? "").join("");
}

export function createHostContentSnapshot(host, options = {}) {
  const nodes = Array.from(host?.childNodes ?? []);
  const rawText = readHostTextContent(host);
  const text = options.trim ? rawText.trim() : rawText;
  const slots = { default: [] };

  for (const node of nodes) {
    const slotName = readHostSlotName(node);
    if (!slots[slotName]) {
      slots[slotName] = [];
    }
    slots[slotName].push(node);
  }

  const hasContent = nodes.some((node) => {
    if (!node || typeof node !== "object") {
      return false;
    }

    if (node.nodeType === 3) {
      return String(node.textContent ?? "").trim().length > 0;
    }

    return true;
  });

  return {
    text,
    nodes,
    hasContent,
    slots,
  };
}

export function isSameHostContentSnapshot(prev, next) {
  if (prev === next) {
    return true;
  }

  if (!prev || !next) {
    return false;
  }

  if (prev.text !== next.text || prev.hasContent !== next.hasContent) {
    return false;
  }

  if (prev.nodes.length !== next.nodes.length) {
    return false;
  }

  for (let index = 0; index < prev.nodes.length; index += 1) {
    if (prev.nodes[index] !== next.nodes[index]) {
      return false;
    }
  }

  const prevSlotNames = Object.keys(prev.slots);
  const nextSlotNames = Object.keys(next.slots);
  if (prevSlotNames.length !== nextSlotNames.length) {
    return false;
  }

  for (const slotName of prevSlotNames) {
    if (!next.slots[slotName]) {
      return false;
    }

    const prevNodes = prev.slots[slotName];
    const nextNodes = next.slots[slotName];
    if (prevNodes.length !== nextNodes.length) {
      return false;
    }

    for (let index = 0; index < prevNodes.length; index += 1) {
      if (prevNodes[index] !== nextNodes[index]) {
        return false;
      }
    }
  }

  return true;
}
