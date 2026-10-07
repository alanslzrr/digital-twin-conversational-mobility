"use client";

import { MenuIcon } from "lucide-react";
import { useRef, useState } from "react";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUi } from "@/i18n/provider";
import { Conversations } from "./conversations";

/** Owned navigation only; never mounts or reconstructs the chat runtime. */
export function AccessControls({
  onSignOut,
  error,
}: {
  onSignOut: () => Promise<void>;
  error: string;
}) {
  const { t, copy } = useUi();
  const [conversationsOpen, setConversationsOpen] = useState(false);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const telemetry = () => {
    const id = window.location.pathname.split("/")[2];
    window.location.href = id
      ? `/dashboard/conversations/${id}`
      : "/dashboard/conversations";
  };
  return (
    <nav className="ui-access-controls" aria-label={t("evaluation.menu")}>
      <div className="ui-preferences">
        <LocaleSwitcher />
        <ThemeSwitcher />
      </div>
      <div className="ui-access-desktop">
        <Conversations
          open={conversationsOpen}
          onOpenChange={setConversationsOpen}
          onCloseAutoFocus={(event) => {
            if (window.matchMedia("(max-width: 1023px)").matches) {
              event.preventDefault();
              menuTrigger.current?.focus();
            }
          }}
        />
        <Button variant="ghost" size="sm" asChild>
          <a href="/dashboard">{t("evaluation.panel")}</a>
        </Button>
        <Button variant="ghost" size="sm" onClick={telemetry}>
          {t("evaluation.telemetria")}
        </Button>
        <Button variant="ghost" size="sm" onClick={onSignOut}>
          {t("evaluation.cerrarSesion")}
        </Button>
      </div>
      <div className="ui-access-mobile">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              ref={menuTrigger}
              variant="ghost"
              size="icon"
              aria-label={t("evaluation.menu")}
            >
              <MenuIcon aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            onCloseAutoFocus={(event) => {
              if (conversationsOpen) event.preventDefault();
            }}
          >
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={() => setConversationsOpen(true)}>
                {t("conversations.misConversaciones")}
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href="/dashboard">{t("evaluation.panel")}</a>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={telemetry}>
                {t("evaluation.telemetria")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void onSignOut()}>
                {t("evaluation.cerrarSesion")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {error ? (
        <p role="alert" className="ui-access-error">
          {copy(error)}
        </p>
      ) : null}
    </nav>
  );
}
