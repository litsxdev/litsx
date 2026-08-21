import type { FormProps } from "./form-types";

export function FormPanel(props: FormProps) {
  return (
    <form data-theme={props.theme}>
      <fieldset disabled={props.disabled}>
        <legend>{props.id}</legend>
        <button on:click={() => props.onSubmit(props.id)}>
          {props.submitLabel}
        </button>
      </fieldset>
    </form>
  );
}

FormPanel.properties = {
  disabled: { reflect: true },
  onSubmit: { attribute: false },
  metadata: { attribute: false },
};
