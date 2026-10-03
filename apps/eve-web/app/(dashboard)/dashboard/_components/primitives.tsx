"use client";
import { X } from "lucide-react";
import { Dialog as Primitive, Tabs as TabsPrimitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { useId, useRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("dc-card", className)} {...props} />;
}
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("dc-skeleton", className)}
      aria-hidden="true"
      {...props}
    />
  );
}
export function Table({ children, ...props }: ComponentProps<"table">) {
  return (
    <div className="dc-table-scroll">
      <table className="dc-table" {...props}>
        {children}
      </table>
    </div>
  );
}
export const Tabs = TabsPrimitive;
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
    <Primitive.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? (
        <Primitive.Trigger asChild>{trigger}</Primitive.Trigger>
      ) : null}
      <Primitive.Portal>
        <Primitive.Overlay className="dc-overlay" />
        <Primitive.Content
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
            <Primitive.Title>{title}</Primitive.Title>
            <Primitive.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close details">
                <X aria-hidden="true" />
              </Button>
            </Primitive.Close>
          </div>
          <Primitive.Description
            className={description ? "dc-meta" : "sr-only"}
          >
            {description ?? `${title} details`}
          </Primitive.Description>
          <div className="dc-sheet-body">{children}</div>
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
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
    <fieldset className="dc-segment">
      <legend className="sr-only">{label}</legend>
      {options.map(([id, text]) => (
        <label key={id}>
          <input
            type="radio"
            name={name}
            value={id}
            checked={id === value}
            onChange={() => onChange(id)}
          />
          <span>{text}</span>
        </label>
      ))}
    </fieldset>
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
    <Card className="dc-empty">
      <h2>{title}</h2>
      {children}
    </Card>
  );
}
