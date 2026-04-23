# @litsx/light-dom-registry

Runtime support for contextual element resolution in LitSX `^lightDom()` components.

## Attribution

[`src/index.js`](./src/index.js) includes code adapted from The Polymer Project's custom elements work. The original BSD-style attribution notice is preserved in the source file and in this package's [`NOTICE`](./NOTICE).

## What It Does

`@litsx/light-dom-registry` lets `^lightDom()` components keep clean base tags while still using different implementations for the same tag name in different light DOM subtrees.

It does that by:

- registering one global stand-in proxy per tag on `window.customElements`
- attaching a contextual registry to each `^lightDom()` host
- resolving the nearest host registry when a proxy instance is created or connected
- upgrading the real element in place, without adding a visible wrapper child

This is runtime infrastructure. The transform and LitSX runtime are still responsible for:

- emitting `static elements`
- choosing `LightDomElementsMixin`
- calling `connectLightDomRegistry(...)`

## Where The Global Proxy Is Registered

The global proxy registration happens when a light DOM registry defines a tag for the first time:

```js
if (!standInClass) {
  standInClass = createStandInElement(tagName);
  standInClass[STAND_IN_MARK] = true;
  nativeDefine(tagName, standInClass);
}
```

That path lives in `ShimmedCustomElementsRegistry#define(...)`.

There is also an explicit helper:

```js
ensureLightDomProxy("profile-chip");
```

which uses the same `nativeDefine(...)` path when the global stand-in does not exist yet.

## Coexistence Demo

Two different light DOM hosts can use the same tag base and still resolve different constructors.

### Authored Components

```tsx
import { LitElement } from "lit";

export function AdminScreen() {
  ^lightDom();
  return <profile-chip />;
}

AdminScreen.elements = {
  "profile-chip": AdminProfileChip,
};

export function GuestScreen() {
  ^lightDom();
  return <profile-chip />;
}

GuestScreen.elements = {
  "profile-chip": GuestProfileChip,
};
```

### Lowered Shape

```js
class AdminScreen extends LightDomElementsMixin(LitElement) {
  static elements = {
    "profile-chip": AdminProfileChip,
  };

  createRenderRoot() {
    return this;
  }

  render() {
    return <profile-chip />;
  }
}

class GuestScreen extends LightDomElementsMixin(LitElement) {
  static elements = {
    "profile-chip": GuestProfileChip,
  };

  createRenderRoot() {
    return this;
  }

  render() {
    return <profile-chip />;
  }
}
```

### Runtime Result

When both hosts are mounted in the same document:

```html
<admin-screen>
  <profile-chip></profile-chip>
</admin-screen>

<guest-screen>
  <profile-chip></profile-chip>
</guest-screen>
```

the two `profile-chip` nodes share the same globally registered proxy class, but each one upgrades against the nearest host registry:

- under `admin-screen`, `profile-chip` upgrades to `AdminProfileChip`
- under `guest-screen`, `profile-chip` upgrades to `GuestProfileChip`

No suffix is added to the tag name, and no extra wrapper node is inserted.

## Nested Host Demo

Nearest-host resolution also works when one light DOM host is nested inside another.

```html
<outer-screen>
  <profile-chip></profile-chip>
  <inner-screen>
    <profile-chip></profile-chip>
  </inner-screen>
</outer-screen>
```

If:

- `OuterScreen.elements["profile-chip"] = OuterProfileChip`
- `InnerScreen.elements["profile-chip"] = InnerProfileChip`

then:

- the outer `profile-chip` upgrades to `OuterProfileChip`
- the inner `profile-chip` upgrades to `InnerProfileChip`

The closest host context wins.

## Collision Rule

If the base tag is already registered globally to a constructor that does not belong to this runtime, the registry throws instead of falling back to a suffixed tag.

That is deliberate. `^lightDom()` is preserving the authored tag, not generating an alternative global name.
