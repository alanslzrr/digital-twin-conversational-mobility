import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { Table } from "./table";

vi.stubGlobal("React", React);

it("distinguishes keyboard scroll regions by their table purpose", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      React.Fragment,
      null,
      React.createElement(Table, { "aria-label": "Source products" }),
      React.createElement(Table, { "aria-label": "Ingestion durations" }),
    ),
  );
  expect(html).toContain('aria-label="Source products scroll area"');
  expect(html).toContain('aria-label="Ingestion durations scroll area"');
  expect(html.match(/tabindex="0"/g)).toHaveLength(2);
  expect(html).not.toContain('aria-label="Scrollable data table"');
});
