"use client";
import { Minus, Plus } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

/** For secondary technical detail only. Never hide routine worker state or KPIs. */
export function RefinedDisclosure({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rf-disclosure">
      <CollapsibleTrigger asChild>
        <Button type="button" variant="ghost" className="rf-disclosure-trigger">
          <span>{title}</span>
          <span className="rf-disclosure-action" aria-hidden="true">
            {open ? "Hide" : "Show"}
            {open ? <Minus size={14} /> : <Plus size={14} />}
          </span>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="rf-disclosure-content">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
