"use client";

/**
 * Small accessible primitives built on Radix: Tabs, Switch, Checkbox, Slider, Tooltip,
 * DropdownMenu, Popover. Import from "@/components/ui/primitives".
 */

import * as React from "react";
import { Tabs as T, Switch as S, Checkbox as C, Slider as SL, Tooltip as TT, DropdownMenu as DM, Popover as PO } from "radix-ui";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

// ------------------------------------------------------------------ Tabs
export const Tabs = T.Root;

export function TabsList({ className, ...props }: React.ComponentProps<typeof T.List>) {
  return (
    <T.List
      className={cn(
        "inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-border bg-bg-subtle p-1 scrollbar-thin",
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof T.Trigger>) {
  return (
    <T.Trigger
      className={cn(
        "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-medium text-muted transition-colors",
        "hover:text-text data-[state=active]:bg-surface data-[state=active]:text-text data-[state=active]:shadow-card [&_svg]:size-4",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: React.ComponentProps<typeof T.Content>) {
  return <T.Content className={cn("mt-5 focus-visible:outline-none", className)} {...props} />;
}

// ------------------------------------------------------------------ Switch
export function Switch({ className, ...props }: React.ComponentProps<typeof S.Root>) {
  return (
    <S.Root
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-border-strong transition-colors",
        "data-[state=checked]:bg-primary disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <S.Thumb className="pointer-events-none block size-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[22px]" />
    </S.Root>
  );
}

/** Switch with label + description as one accessible row. */
export function SwitchRow({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
  badge,
}: {
  label: React.ReactNode;
  description?: React.ReactNode;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
  badge?: React.ReactNode;
}) {
  const id = React.useId();
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <label htmlFor={id} className="flex items-center gap-2 text-sm font-medium text-text">
          {label}
          {badge}
        </label>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  );
}

// ------------------------------------------------------------------ Checkbox
export function Checkbox({ className, ...props }: React.ComponentProps<typeof C.Root>) {
  return (
    <C.Root
      className={cn(
        "flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border border-border-strong bg-surface transition-colors",
        "data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-fg",
        className,
      )}
      {...props}
    >
      <C.Indicator>
        <Check className="size-3.5" strokeWidth={3} />
      </C.Indicator>
    </C.Root>
  );
}

// ------------------------------------------------------------------ Slider
export function Slider({ className, ...props }: React.ComponentProps<typeof SL.Root>) {
  return (
    <SL.Root className={cn("relative flex h-5 w-full touch-none select-none items-center", className)} {...props}>
      <SL.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-border">
        <SL.Range className="absolute h-full bg-primary" />
      </SL.Track>
      {(props.value ?? props.defaultValue ?? [0]).map((_, i) => (
        <SL.Thumb
          key={i}
          className="block size-4 rounded-full border-2 border-primary bg-surface shadow transition-transform hover:scale-110"
          aria-label={props["aria-label"] as string | undefined}
        />
      ))}
    </SL.Root>
  );
}

// ------------------------------------------------------------------ Tooltip
export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return <TT.Provider delayDuration={250}>{children}</TT.Provider>;
}

export function Tooltip({ content, children, side = "top" }: { content: React.ReactNode; children: React.ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <TT.Root>
      <TT.Trigger asChild>{children}</TT.Trigger>
      <TT.Portal>
        <TT.Content
          side={side}
          sideOffset={6}
          className="z-[60] max-w-xs rounded-lg bg-text px-2.5 py-1.5 text-xs text-bg shadow-pop data-[state=delayed-open]:animate-fade-in"
        >
          {content}
        </TT.Content>
      </TT.Portal>
    </TT.Root>
  );
}

// ------------------------------------------------------------------ Dropdown menu
export const DropdownMenu = DM.Root;
export const DropdownMenuTrigger = DM.Trigger;

export function DropdownMenuContent({ className, align = "end", ...props }: React.ComponentProps<typeof DM.Content>) {
  return (
    <DM.Portal>
      <DM.Content
        align={align}
        sideOffset={6}
        className={cn(
          "z-50 min-w-48 rounded-xl border border-border bg-surface p-1 shadow-pop data-[state=open]:animate-fade-in",
          className,
        )}
        {...props}
      />
    </DM.Portal>
  );
}

export function DropdownMenuItem({ className, destructive, ...props }: React.ComponentProps<typeof DM.Item> & { destructive?: boolean }) {
  return (
    <DM.Item
      className={cn(
        "flex cursor-pointer select-none items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none transition-colors [&_svg]:size-4",
        destructive ? "text-danger data-[highlighted]:bg-danger-soft" : "text-text data-[highlighted]:bg-bg-subtle",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof DM.Label>) {
  return <DM.Label className={cn("px-2.5 py-1.5 text-caption font-medium text-subtle", className)} {...props} />;
}

export function DropdownMenuSeparator() {
  return <DM.Separator className="my-1 h-px bg-border" />;
}

// ------------------------------------------------------------------ Popover
export const Popover = PO.Root;
export const PopoverTrigger = PO.Trigger;

export function PopoverContent({ className, align = "end", ...props }: React.ComponentProps<typeof PO.Content>) {
  return (
    <PO.Portal>
      <PO.Content
        align={align}
        sideOffset={8}
        className={cn(
          "z-50 rounded-xl border border-border bg-surface shadow-pop focus:outline-none data-[state=open]:animate-fade-in",
          className,
        )}
        {...props}
      />
    </PO.Portal>
  );
}
