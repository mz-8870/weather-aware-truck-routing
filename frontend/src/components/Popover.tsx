import { Popover as RadixPopover } from "radix-ui";
import type { ReactNode } from "react";
import styles from "./Popover.module.css";

type Props = { trigger: ReactNode; children: ReactNode; open?: boolean; onOpenChange?: (open: boolean) => void };

export function Popover({ trigger, children, open, onOpenChange }: Props) {
  return (
    <RadixPopover.Root open={open} onOpenChange={onOpenChange}>
      <RadixPopover.Trigger asChild>{trigger}</RadixPopover.Trigger>
      <RadixPopover.Portal>
        <RadixPopover.Content className={styles.content} sideOffset={8} collisionPadding={16}>
          {children}
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}
