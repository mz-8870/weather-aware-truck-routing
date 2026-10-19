import { ToggleGroup } from "radix-ui";
import { useId } from "react";
import styles from "./SegmentedControl.module.css";

type Props<T extends string> = {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
};

export function SegmentedControl<T extends string>({ label, value, options, onChange }: Props<T>) {
  const labelId = useId();
  return (
    <div className={styles.field}>
      <span id={labelId} className={styles.label}>
        {label}
      </span>
      <ToggleGroup.Root
        type="single"
        aria-labelledby={labelId}
        className={styles.root}
        value={value}
        // Radix sends "" when the active item is clicked again; a segmented control always keeps one selected.
        onValueChange={(v) => v && onChange(v as T)}
      >
        {options.map((o) => (
          <ToggleGroup.Item key={o.value} value={o.value} className={styles.item}>
            {o.label}
          </ToggleGroup.Item>
        ))}
      </ToggleGroup.Root>
    </div>
  );
}
