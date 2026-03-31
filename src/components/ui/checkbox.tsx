import * as React from "react";
import { cn } from "@/lib/utils";

type CheckboxProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">;

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(({ className, ...props }, ref) => (
    <input
        ref={ref}
        type="checkbox"
        className={cn(
            "h-4 w-4 shrink-0 rounded border border-border bg-card text-primary accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50",
            className,
        )}
        {...props}
    />
));

Checkbox.displayName = "Checkbox";

export { Checkbox };
