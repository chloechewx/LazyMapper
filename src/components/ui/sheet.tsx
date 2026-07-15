import * as React from "react";
import { X } from "lucide-react";
import { Button } from "./button";

export function Sheet({ open, onOpenChange, title, children }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; children: React.ReactNode }) {
  const ref = React.useRef<HTMLDialogElement>(null);
  React.useEffect(() => {
    const sheet = ref.current;
    if (!sheet) return;
    if (open && !sheet.open) sheet.showModal();
    if (!open && sheet.open) sheet.close();
  }, [open]);
  return (
    <dialog ref={ref} onCancel={(event) => { event.preventDefault(); onOpenChange(false); }} onClose={() => onOpenChange(false)} className="sheet-dialog ml-auto h-full max-h-none w-[min(440px,100%)] rounded-none border-0 border-l border-[#bdc7c5] bg-white p-0 text-[#161616] shadow-2xl backdrop:bg-[#161616]/35" aria-label={title}>
      <div className="flex h-14 items-center justify-between border-b border-[#dde3e2] px-4"><strong className="text-sm">{title}</strong><Button size="icon" variant="ghost" onClick={() => onOpenChange(false)} aria-label="Close panel"><X className="size-4" /></Button></div>
      <div className="h-[calc(100%-56px)] overflow-y-auto">{children}</div>
    </dialog>
  );
}
