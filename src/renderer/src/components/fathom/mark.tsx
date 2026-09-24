import { cn } from "@/lib/utils";

export function FathomGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={cn("size-5 text-primary", className)} aria-hidden="true" fill="none">
      <path d="M8 1.5v13M4.5 4.5H8M3.5 8H8M5 11.5H8" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <circle cx="8" cy="14.2" r="1.15" fill="currentColor" />
    </svg>
  );
}

export function FathomMark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <FathomGlyph />
      <span className="font-serif text-lg tracking-tight">Fathom</span>
    </span>
  );
}
