import { useId, type InputHTMLAttributes } from "react";
import styles from "./Field.module.css";

type Props = InputHTMLAttributes<HTMLInputElement> & { label: string; helper?: string; error?: string };

export function Field({ label, helper, error, ...props }: Props) {
  const id = useId();
  const note = error ?? helper;
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <input
        {...props}
        id={id}
        className={styles.input}
        aria-invalid={error ? true : undefined}
        aria-describedby={note ? `${id}-note` : undefined}
      />
      {note && (
        <span id={`${id}-note`} className={error ? styles.error : styles.helper}>
          {note}
        </span>
      )}
    </div>
  );
}
