import { useId, type InputHTMLAttributes } from "react";
import styles from "./Field.module.css";

// warning: shown like a helper but highlighted; unlike error it doesn't mark the input invalid.
type Props = InputHTMLAttributes<HTMLInputElement> & { label: string; helper?: string; error?: string; warning?: string };

export function Field({ label, helper, error, warning, ...props }: Props) {
  const id = useId();
  const note = error ?? warning ?? helper;
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <input
        {...props}
        id={id}
        className={styles.input}
        data-warning={!error && warning ? true : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={note ? `${id}-note` : undefined}
      />
      {note && (
        <span id={`${id}-note`} className={error ? styles.error : warning ? styles.warning : styles.helper}>
          {note}
        </span>
      )}
    </div>
  );
}
