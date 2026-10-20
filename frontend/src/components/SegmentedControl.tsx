import type { LucideIcon } from "lucide-react";
import { ToggleGroup } from "radix-ui";
import { useId } from "react";
import styles from "./SegmentedControl.module.css";

type Props<T extends string> = {
  label: string;
  hideLabel?: boolean; // still announced, just not drawn (e.g. the header units toggle)
  value: T;
  options: { value: T; label: string; icon?: LucideIcon }[];
  onChange: (value: T) => void;
};

export function SegmentedControl<T extends string>({ label, hideLabel, value, options, onChange }: Props<T>) {
  const labelId = useId();
  return (
    <div className={styles.field}>
      <span id={labelId} className={hideLabel ? styles.hidden : styles.label}>
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
            {o.icon && <o.icon aria-hidden className={styles.icon} />}
            {o.label}
          </ToggleGroup.Item>
        ))}
      </ToggleGroup.Root>
    </div>
  );
}
