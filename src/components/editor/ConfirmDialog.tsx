"use client";

import * as Dialog from "@radix-ui/react-dialog";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="confirm-overlay" />
        <Dialog.Content className="confirm-content" aria-describedby="confirm-desc">
          <Dialog.Title className="confirm-title">{title}</Dialog.Title>
          <Dialog.Description className="confirm-desc" id="confirm-desc">
            {description}
          </Dialog.Description>
          <div className="confirm-actions">
            <button
              className="confirm-btn confirm-btn--cancel"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </button>
            <button
              className="confirm-btn confirm-btn--confirm"
              onClick={() => {
                onConfirm();
                onOpenChange(false);
              }}
            >
              {confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
