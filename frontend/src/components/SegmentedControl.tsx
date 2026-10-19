import { ToggleGroup } from "radix-ui";
import styles from "./SegmentedControl.module.css";

type Props<T extends string> = {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
};

export function SegmentedControl<T extends string>({ label, value, options, onChange }: Props<T>) {
  return (
    <ToggleGroup.Root
      type="single"
      aria-label={label}
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
  );
}
