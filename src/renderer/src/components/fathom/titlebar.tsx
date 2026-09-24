import type { ReactNode } from "react";
import { FathomMark } from "@/components/fathom/mark";
import { cn } from "@/lib/utils";

/** The top strip of the frameless window: draggable, with room on the right for the window buttons. */
export function TitleBar({ children, onHome, className }: { children?: ReactNode; onHome?: () => void; className?: string }) {
  return (
    <div className={cn("titlebar flex h-10 shrink-0 items-center gap-3 pl-4", className)}>
      {onHome ? (
        <button type="button" onClick={onHome} className="rounded-md focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-none" title="Back to start">
          <FathomMark />
        </button>
      ) : (
        <FathomMark />
      )}
      {children}
    </div>
  );
}
