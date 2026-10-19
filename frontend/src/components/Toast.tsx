import { Toast as RadixToast } from "radix-ui";
import type { ReactNode } from "react";
import styles from "./Toast.module.css";

export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <RadixToast.Provider>
      {children}
      <RadixToast.Viewport className={styles.viewport} />
    </RadixToast.Provider>
  );
}

type Props = {
  message: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action?: { label: string; onClick: () => void };
};

export function Toast({ message, open, onOpenChange, action }: Props) {
  return (
    <RadixToast.Root className={styles.toast} open={open} onOpenChange={onOpenChange}>
      <RadixToast.Description>{message}</RadixToast.Description>
      {action && (
        <RadixToast.Action className={styles.action} altText={action.label} onClick={action.onClick}>
          {action.label}
        </RadixToast.Action>
      )}
    </RadixToast.Root>
  );
}
