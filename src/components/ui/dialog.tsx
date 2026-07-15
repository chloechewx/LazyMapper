import * as React from "react";
import { X } from "lucide-react";
import { Button } from "./button";
import { cn } from "./utils";

export function Dialog({ open, onOpenChange, title, description, children, className }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: string; children: React.ReactNode; className?: string }) {
  const ref = React.useRef<HTMLDialogElement>(null);
  React.useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog ref={ref} onCancel={(event) => { event.preventDefault(); onOpenChange(false); }} onClose={() => onOpenChange(false)} className={cn("m-auto w-[min(620px,calc(100%-24px))] rounded-[8px] border border-[#bdc7c5] bg-white p-0 text-[#161616] shadow-2xl backdrop:bg-[#161616]/45", className)} aria-labelledby="dialog-title">
      <div className="flex items-start justify-between border-b border-[#dde3e2] px-5 py-4">
        <div><h2 id="dialog-title" className="text-base font-extrabold">{title}</h2>{description ? <p className="mt-1 text-sm text-[#65706f]">{description}</p> : null}</div>
        <Button size="icon" variant="ghost" onClick={() => onOpenChange(false)} aria-label="Close dialog"><X className="size-4" /></Button>
      </div>
      {children}
    </dialog>
  );
}

