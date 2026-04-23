export function extractUseStateInfo(declaration, usedNames, t) {
  const init = declaration.init;
  if (!t.isCallExpression(init)) return null;
  if (!t.isIdentifier(init.callee, { name: 'useState' })) return null;

  let valueBindingName = null;
  let setterBindingName = null;

  if (t.isIdentifier(declaration.id)) {
    valueBindingName = declaration.id.name;
  } else if (t.isArrayPattern(declaration.id)) {
    const [first, second] = declaration.id.elements;
    if (t.isIdentifier(first)) valueBindingName = first.name;
    if (t.isIdentifier(second)) setterBindingName = second.name;
  } else {
    return null;
  }

  let stateKeyName = valueBindingName;
  if (!stateKeyName && setterBindingName) {
    stateKeyName = deriveStateNameFromSetter(setterBindingName);
  }
  if (!stateKeyName) {
    stateKeyName = generateUniqueName('state', usedNames);
  } else {
    stateKeyName = ensureUniqueName(stateKeyName, usedNames);
  }

  return {
    valueBindingName,
    setterBindingName,
    stateKeyName,
    initArg: init.arguments[0] || null,
  };
}

function ensureUniqueName(name, usedNames) {
  let candidate = name;
  let suffix = 1;
  while (usedNames.has(candidate)) {
    candidate = `${name}${suffix}`;
    suffix += 1;
  }
  usedNames.add(candidate);
  return candidate;
}

function generateUniqueName(base, usedNames) {
  let suffix = 1;
  let candidate = `${base}${suffix}`;
  while (usedNames.has(candidate)) {
    suffix += 1;
    candidate = `${base}${suffix}`;
  }
  usedNames.add(candidate);
  return candidate;
}

function deriveStateNameFromSetter(setterName) {
  if (setterName.startsWith('set') && setterName.length > 3) {
    const tail = setterName.slice(3);
    return tail.charAt(0).toLowerCase() + tail.slice(1);
  }
  return `${setterName}State`;
}
