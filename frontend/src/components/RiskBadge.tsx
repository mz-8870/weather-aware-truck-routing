import { riskLevel } from "../risk";
import styles from "./RiskBadge.module.css";

export function RiskBadge({ level }: { level: number | null }) {
  const { key, label, Icon } = riskLevel(level);
  return (
    <span className={styles.badge} data-risk={key}>
      <Icon className={styles.icon} aria-hidden />
      {label}
    </span>
  );
}
