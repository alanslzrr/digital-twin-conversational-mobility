"use client";
import { X } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { useId, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card as UICard } from "@/components/ui/card";
import {
  EmptyContent,
  EmptyHeader,
  EmptyTitle,
  Empty as UIEmpty,
} from "@/components/ui/empty";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  SheetClose,
  SheetContent,
  SheetDescription,
  Sheet as SheetRoot,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton as UISkeleton } from "@/components/ui/skeleton";
import { Table as UITable } from "@/components/ui/table";
import {
  TabsContent,
  TabsList,
  Tabs as TabsRoot,
  TabsTrigger,
} from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
export function Card({ className, ...props }: ComponentProps<"div">) {
  return <UICard className={cn("dc-card", className)} {...props} />;
}
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <UISkeleton
      className={cn("dc-skeleton", className)}
      aria-hidden="true"
      {...props}
    />
  );
}
export function Table({ children, ...props }: ComponentProps<"table">) {
  return (
    <UITable className="dc-table" {...props}>
      {children}
    </UITable>
  );
}
export const Tabs = {
  Root: TabsRoot,
  List: TabsList,
  Trigger: TabsTrigger,
  Content: TabsContent,
};
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  trigger,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  trigger?: ReactNode;
  children: ReactNode;
}) {
  const previousFocus = useRef<HTMLElement | null>(null);
  return (
    <SheetRoot open={open} onOpenChange={onOpenChange}>
      {trigger ? <SheetTrigger asChild>{trigger}</SheetTrigger> : null}
      <SheetContent
        showCloseButton={false}
        lang="en"
        className="dashboard-dialog dc-sheet"
        onOpenAutoFocus={() => {
          previousFocus.current =
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null;
        }}
        onCloseAutoFocus={(event) => {
          if (!trigger && previousFocus.current?.isConnected) {
            event.preventDefault();
            previousFocus.current.focus();
          }
        }}
      >
        <div className="dc-sheet-heading">
          <SheetTitle>{title}</SheetTitle>
          <SheetClose asChild>
            <Button variant="ghost" size="icon" aria-label="Close details">
              <X aria-hidden="true" />
            </Button>
          </SheetClose>
        </div>
        <SheetDescription className={description ? "dc-meta" : "sr-only"}>
          {description ?? `${title} details`}
        </SheetDescription>
        <div className="dc-sheet-body">{children}</div>
      </SheetContent>
    </SheetRoot>
  );
}
export function Segmented({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly (readonly [string, string])[];
  onChange: (v: string) => void;
}) {
  const name = useId();
  return (
    <RadioGroup
      className="dc-radio-segment"
      aria-label={label}
      value={value}
      onValueChange={onChange}
    >
      {options.map(([id, text]) => (
        <div key={id} className="dc-radio-option">
          <RadioGroupItem id={`${name}-${id}`} value={id} />
          <label htmlFor={`${name}-${id}`}>{text}</label>
        </div>
      ))}
    </RadioGroup>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <UIEmpty className="dc-card dc-empty">
      <EmptyHeader>
        <EmptyTitle>
          <h2>{title}</h2>
        </EmptyTitle>
      </EmptyHeader>
      <EmptyContent>{children}</EmptyContent>
    </UIEmpty>
  );
}
