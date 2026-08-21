import { css, type LitsxComponent } from "@litsx/core";
import type { LitsxUnoCssViteOptions } from "@litsx/unocss/vite";

declare const unoOptions: LitsxUnoCssViteOptions;
void unoOptions;

const BUTTON_SIZE_CLASSES = {
  sm: "h-8 px-3",
  md: "h-10 px-4",
  lg: "h-12 px-6",
} as const;

const GuardedButton: LitsxComponent<{
  size: keyof typeof BUTTON_SIZE_CLASSES;
}> = ({ size }) => <button class={BUTTON_SIZE_CLASSES[size]}>Save</button>;

GuardedButton.styles = [
  BUTTON_SIZE_CLASSES,
  [
    css`
      :host {
        display: inline-block;
      }
    `,
  ],
];

const InvalidButton: LitsxComponent = () => <button>Invalid</button>;
// @ts-expect-error UnoCSS guards may only contain statically enumerable strings.
InvalidButton.styles = [{ sm: 8 }];
