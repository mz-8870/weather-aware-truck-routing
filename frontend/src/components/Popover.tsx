import { Popover as RadixPopover } from "radix-ui";
import type { ReactNode } from "react";
import styles from "./Popover.module.css";

type Props = {
  children: ReactNode;
  // Either a trigger element the popover toggles from, or an anchor it is positioned against (open is then controlled).
  trigger?: ReactNode;
  anchor?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function Popover({ trigger, anchor, children, open, onOpenChange }: Props) {
  return (
    <RadixPopover.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <RadixPopover.Trigger asChild>{trigger}</RadixPopover.Trigger>}
      {anchor && <RadixPopover.Anchor asChild>{anchor}</RadixPopover.Anchor>}
      <RadixPopover.Portal>
        <RadixPopover.Content className={styles.content} sideOffset={8} collisionPadding={16}>
          {children}
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}
