import { createFormHook } from "@tanstack/react-form";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { fieldContext, formContext, useFieldContext, useFormContext } from "./form-context";

function extractErrorMessage(error: unknown): string | undefined {
  if (typeof error === "string") return error;
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return undefined;
}

interface TextFieldProps {
  label: ReactNode;
  placeholder?: string;
  type?: "text" | "email" | "search";
  autoComplete?: string;
}

function TextField({ label, placeholder, type = "text", autoComplete }: TextFieldProps) {
  const field = useFieldContext<string>();
  const error =
    field.state.meta.isTouched || field.form.state.submissionAttempts > 0
      ? extractErrorMessage(field.state.meta.errors[0])
      : undefined;
  const errorId = `${field.name}-error`;

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={field.name}>{label}</Label>
      <Input
        id={field.name}
        name={field.name}
        type={type}
        value={field.state.value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-invalid={error !== undefined}
        aria-describedby={error !== undefined ? errorId : undefined}
        onBlur={field.handleBlur}
        onChange={(e) => field.handleChange(e.target.value)}
      />
      {error !== undefined && (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

interface NumberFieldProps {
  label: ReactNode;
  min?: number;
  step?: string;
}

function NumberField({ label, min, step = "1" }: NumberFieldProps) {
  const field = useFieldContext<number>();
  const error =
    field.state.meta.isTouched || field.form.state.submissionAttempts > 0
      ? extractErrorMessage(field.state.meta.errors[0])
      : undefined;
  const errorId = `${field.name}-error`;

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={field.name}>{label}</Label>
      <Input
        id={field.name}
        name={field.name}
        type="number"
        min={min}
        step={step}
        value={Number.isFinite(field.state.value) ? field.state.value : ""}
        aria-invalid={error !== undefined}
        aria-describedby={error !== undefined ? errorId : undefined}
        onBlur={field.handleBlur}
        onChange={(e) => field.handleChange(e.target.value === "" ? Number.NaN : Number(e.target.value))}
      />
      {error !== undefined && (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

interface SubmitButtonProps {
  label: ReactNode;
  pendingLabel?: ReactNode;
}

function SubmitButton({ label, pendingLabel }: SubmitButtonProps) {
  const form = useFormContext();
  return (
    <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>
      {([canSubmit, isSubmitting]) => (
        <Button type="submit" disabled={!canSubmit || isSubmitting}>
          {isSubmitting && pendingLabel !== undefined ? pendingLabel : label}
        </Button>
      )}
    </form.Subscribe>
  );
}

export const { useAppForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: {
    TextField,
    NumberField,
  },
  formComponents: {
    SubmitButton,
  },
});
