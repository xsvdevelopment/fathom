import * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "flex h-11 w-full rounded-md bg-secondary px-3 text-sm text-foreground shadow-[0_0_0_1px_rgba(255,255,255,0.08)] outline-none placeholder:text-muted-foreground/80 focus-visible:shadow-[0_0_0_1px_rgba(200,204,212,0.7)] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
