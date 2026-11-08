import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LEGAL, LEGAL_PAGE_LIST } from "../../lib/legal";
import { loadLegalDocument } from "../../lib/legal-content";
import { LegalMarkdown } from "./LegalMarkdown";

vi.stubGlobal("React", React);
vi.mock("@/lib/legal-content", () => import("../../lib/legal-content"));

function render(slug: (typeof LEGAL_PAGE_LIST)[number]["slug"]) {
  const document = loadLegalDocument(slug);
  const html = renderToStaticMarkup(
    React.createElement(LegalMarkdown, { body: document.body }),
  );
  return { document, html };
}

describe("LegalMarkdown", () => {
  it.each(LEGAL_PAGE_LIST)(
    "$slug renders anchored headings and no template markup",
    ({ slug }) => {
      const { document, html } = render(slug);
      expect(html).not.toContain("<h1");
      expect(html).not.toContain("{{");
      expect(html).not.toContain("<table");
      for (const heading of document.headings) {
        expect(html).toContain(`<h2 id="${heading.id}"`);
      }
    },
  );

  it("renders working mailto and tel links on the contact page", () => {
    const { html } = render("contact");
    expect(html).toContain(`href="mailto:${LEGAL.supportEmail}"`);
    expect(html).toContain(`href="tel:${LEGAL.supportPhoneTel}"`);
    for (const path of ["/privacy", "/terms", "/refund-policy", "/delivery-policy"]) {
      expect(html).toContain(`href="${path}"`);
    }
    expect(html).not.toMatch(/registered address/i);
  });

  it("drops unsafe link protocols", () => {
    const html = renderToStaticMarkup(
      React.createElement(LegalMarkdown, {
        body: "[x](javascript:alert(1)) [y](tel:not-a-number)",
      }),
    );
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("tel:not-a-number");
  });
});
