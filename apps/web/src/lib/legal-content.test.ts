import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  LEGAL,
  LEGAL_PAGE_LIST,
  LEGAL_PAGES,
  legalMetadata,
  legalStructuredData,
} from "./legal";
import {
  loadLegalDocument,
  parseLegalDocument,
  renderLegalTemplate,
} from "./legal-content";

const doc = (body: string) => `---\ntitle: Test\nslug: test\n---\n${body}`;

describe("legal documents", () => {
  it.each(LEGAL_PAGE_LIST)(
    "$slug renders with every placeholder resolved",
    (page) => {
      const document = loadLegalDocument(page.slug);
      expect(document.slug).toBe(page.slug);
      expect(document.body).not.toContain("{{");
      expect(document.body).not.toContain("}}");
      expect(document.body).not.toContain("<!--");
      expect(document.body).toContain(LEGAL.supportEmail);
      expect(document.headings.length).toBeGreaterThan(0);
    },
  );

  it("puts the config values into the privacy policy", () => {
    const { title, body } = loadLegalDocument("privacy");
    expect(title).toBe("Privacy Policy");
    expect(body).toContain(`when you use ${LEGAL.siteUrl} and our services`);
    expect(body).toContain(`operated by\n${LEGAL.operatorName}.`);
    expect(body).toContain(`- Name: ${LEGAL.grievanceOfficerName}`);
    expect(body).toContain(`- Phone: ${LEGAL.supportPhoneDisplay}`);
  });

  it("links the contact email and phone and hides the unset address", () => {
    const { body } = loadLegalDocument("contact");
    expect(body).toContain(
      `[${LEGAL.supportEmail}](mailto:${LEGAL.supportEmail})`,
    );
    expect(body).toContain(
      `[${LEGAL.supportPhoneDisplay}](tel:${LEGAL.supportPhoneTel})`,
    );
    expect(body).toContain(`within ${LEGAL.responseTime}`);
    expect(LEGAL.registeredAddress).toBeNull();
    expect(body).not.toMatch(/registered address/i);
  });

  it("renders conditional blocks only when the value is set", () => {
    const source = "Intro.\n\n<!--if:registeredAddress-->\nAt {{registeredAddress}}\n<!--/if-->\nEnd.";
    expect(renderLegalTemplate(source, { registeredAddress: null })).toBe(
      "Intro.\n\nEnd.",
    );
    expect(
      renderLegalTemplate(source, { registeredAddress: "12 Main Road" }),
    ).toBe("Intro.\n\nAt 12 Main Road\nEnd.");
  });

  it("fails on unresolved or unknown placeholders", () => {
    expect(() => renderLegalTemplate("Hi {{nope}}")).toThrow(/\{\{nope\}\}/);
    expect(() => renderLegalTemplate("At {{registeredAddress}}")).toThrow(
      /registeredAddress/,
    );
    expect(() => renderLegalTemplate("{{ brandName }}")).toThrow(
      /template markup/,
    );
    expect(() =>
      renderLegalTemplate("<!--if:nope-->x<!--/if-->"),
    ).toThrow(/Unknown legal condition/);
  });

  it("rejects documents with missing frontmatter or duplicate headings", () => {
    expect(() => parseLegalDocument("## 1. Hi")).toThrow(/frontmatter/);
    expect(() => parseLegalDocument(doc("## 3. A\n\n## 3. A\n"))).toThrow(
      /duplicate headings/,
    );
  });

  it("keeps the server's TERMS_VERSION equal to the policies' last-updated date", () => {
    const authService = readFileSync(
      fileURLToPath(new URL("../../../server/src/modules/auth/auth.service.ts", import.meta.url)),
      "utf8",
    );
    const version = authService.match(/export const TERMS_VERSION = "([^"]+)"/)?.[1];
    expect(version).toBe(LEGAL.lastUpdatedISO);
  });

  it("names the providers that receive personal data and none that are off", () => {
    const flat = loadLegalDocument("privacy").body.replace(/\s+/g, " ");
    expect(flat).toContain(
      "Search and ranking providers (Voyage AI, Cohere) and Brave Search receive text derived from your project description to find relevant research and similar websites.",
    );
    expect(flat).toContain(
      "We visit publicly available competitor websites to learn about their design. This does not involve your personal data.",
    );
    for (const provider of ["Anthropic", "DeepSeek", "OpenAI", "Moonshot AI", "Razorpay", "Resend", "Google Cloud", "Vercel", "Neon", "Upstash", "Cloudflare", "StackBlitz"]) {
      expect(flat).toContain(provider);
    }
    expect(flat).not.toMatch(/Runware|Langfuse|IPQualityScore|IP-reputation|auto-?reload/i);
  });

  it("never mentions auto-reload or recurring charges", () => {
    for (const page of LEGAL_PAGE_LIST) {
      const flat = loadLegalDocument(page.slug).body.replace(/\s+/g, " ");
      expect(flat).not.toMatch(/auto-?reload|top[- ]?up automatically|recurring (charge|payment)|saved card/i);
    }
  });

  it("parses CRLF files", () => {
    const parsed = parseLegalDocument(doc("## 1. One\r\n\r\nText").replace(/\n/g, "\r\n"));
    expect(parsed.headings).toEqual([{ id: "1-one", text: "1. One" }]);
  });
});

describe("legal page SEO", () => {
  it.each(LEGAL_PAGE_LIST)("$slug has unique, sized copy", (page) => {
    expect(page.title.length).toBeLessThanOrEqual(60);
    expect(page.description.length).toBeLessThanOrEqual(160);
    const metadata = legalMetadata(page);
    expect(metadata.title).toEqual({ absolute: page.title });
    expect(metadata.description).toBe(page.description);
    expect(metadata.alternates).toEqual({ canonical: page.path });
    expect(metadata.openGraph).toMatchObject({
      title: page.title,
      url: page.path,
      images: [expect.objectContaining({ url: "/og-image.png" })],
    });
    expect(metadata.twitter).toMatchObject({ title: page.title });
  });

  it("uses distinct titles and descriptions", () => {
    const titles = new Set(LEGAL_PAGE_LIST.map((p) => p.title));
    const descriptions = new Set(LEGAL_PAGE_LIST.map((p) => p.description));
    expect(titles.size).toBe(LEGAL_PAGE_LIST.length);
    expect(descriptions.size).toBe(LEGAL_PAGE_LIST.length);
  });

  it("describes policy pages as WebPage", () => {
    expect(legalStructuredData(LEGAL_PAGES.privacy)).toMatchObject({
      "@type": "WebPage",
      url: `${LEGAL.siteUrl}/privacy`,
      dateModified: LEGAL.lastUpdatedISO,
    });
  });

  it("describes the contact page as ContactPage without an address", () => {
    const data = legalStructuredData(LEGAL_PAGES.contact);
    expect(data).toMatchObject({
      "@type": "ContactPage",
      mainEntity: {
        "@type": "Organization",
        name: LEGAL.brandName,
        url: LEGAL.siteUrl,
        contactPoint: {
          email: LEGAL.supportEmail,
          telephone: LEGAL.supportPhoneTel,
          contactType: "customer support",
          areaServed: "IN",
          availableLanguage: "en",
        },
      },
    });
    expect(JSON.stringify(data)).not.toMatch(/address/i);
  });
});
