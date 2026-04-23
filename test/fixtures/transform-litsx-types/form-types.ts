export interface BaseFormProps {
  id: string;
  disabled: boolean;
  submitLabel: string;
  theme?: "light" | "dark";
  metadata?: Record<string, unknown>;
  onSubmit: (id: string) => void;
}

export type FormProps =
  Omit<BaseFormProps, "submitLabel"> &
  Required<Pick<BaseFormProps, "submitLabel">> &
  Partial<Pick<BaseFormProps, "metadata">>;
