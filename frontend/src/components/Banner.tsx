import { Ban, Info } from "lucide-react";
import styles from "./Banner.module.css";

type Props = { tone: "notravel" | "info"; title: string; body: string };

export function Banner({ tone, title, body }: Props) {
  const Icon = tone === "notravel" ? Ban : Info;
  return (
    <div className={styles.banner} data-tone={tone} role="status">
      <Icon className={styles.icon} aria-hidden />
      <div className={styles.text}>
        <span className={styles.title}>{title}</span>
        <span className={styles.body}>{body}</span>
      </div>
    </div>
  );
}
