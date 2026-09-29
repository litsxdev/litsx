import { css } from "@litsx/core";

type BannerProps = {
  tone?: "info" | "success";
  open?: boolean;
  message: string;
};

export function Banner({ tone = "info", open = true, message }: BannerProps) {
  return (
    <section hidden={!open} data-tone={tone}>
      {message}
    </section>
  );
}

Banner.properties = {
  open: { reflect: true },
  tone: { reflect: true },
};

Banner.styles = css`
  :host {
    display: block;
  }

  [hidden] {
    display: none;
  }
`;
