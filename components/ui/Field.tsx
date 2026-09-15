import { useId, type InputHTMLAttributes } from "react";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
  labelClassName?: string;
}

/** A single receipt-line input: underline only, printed small-caps label above. */
export function Field({
  label,
  hint,
  error,
  id,
  className = "",
  labelClassName = "",
  ...props
}: FieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={fieldId} className={`receipt-label ${labelClassName}`}>
        {label}
      </label>
      <input
        id={fieldId}
        aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
        aria-invalid={error ? true : undefined}
        className={`min-h-11 border-b border-ink bg-transparent px-1 py-2 font-sans text-base text-ink outline-none placeholder:text-ink-faint focus-visible:border-tomato ${className}`}
        {...props}
      />
      {hint && !error ? (
        <p id={hintId} className="text-xs text-ink-soft">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs text-tomato-ink" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
