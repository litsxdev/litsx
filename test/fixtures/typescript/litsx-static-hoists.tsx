type BannerProps = {
  tone?: "info" | "success";
  open?: boolean;
  message: string;
};

export function Banner({ tone = "info", open = true, message }: BannerProps) {
  ^properties({
    open: { reflect: true },
    tone: { reflect: true },
  });

  ^styles((parent: { styles: unknown }) => [
    parent.styles,
    `
      :host {
        display: block;
      }

      [hidden] {
        display: none;
      }
    `,
  ]);

  return (
    <section hidden={!open} data-tone={tone}>
      {message}
    </section>
  );
}
