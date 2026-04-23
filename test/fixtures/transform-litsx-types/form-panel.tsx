import type { FormProps } from "./form-types";

export function FormPanel(props: FormProps) {
  ^properties<FormProps>({
    disabled: { reflect: true },
    onSubmit: { attribute: false },
    metadata: { attribute: false },
  });

  return (
    <form data-theme={props.theme}>
      <fieldset disabled={props.disabled}>
        <legend>{props.id}</legend>
        <button onClick={() => props.onSubmit(props.id)}>
          {props.submitLabel}
        </button>
      </fieldset>
    </form>
  );
}
