import { Slider as RadixSlider } from "radix-ui";
import styles from "./Slider.module.css";

type Props = {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
};

export function Slider({ label, value, min, max, step = 1, onChange }: Props) {
  return (
    <RadixSlider.Root
      className={styles.root}
      value={[value]}
      min={min}
      max={max}
      step={step}
      onValueChange={([v]) => onChange(v)}
    >
      <RadixSlider.Track className={styles.track}>
        <RadixSlider.Range className={styles.range} />
      </RadixSlider.Track>
      <RadixSlider.Thumb className={styles.thumb} aria-label={label} />
    </RadixSlider.Root>
  );
}
