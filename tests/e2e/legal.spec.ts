import { test, expect } from "../shared/test.js";

const LEGAL_PAGES = [
  { path: "/privacy", title: "Privacy Policy | UseFrame", h1: "Privacy Policy", type: "WebPage" },
  { path: "/terms", title: "Terms & Conditions | UseFrame", h1: "Terms & Conditions", type: "WebPage" },
  { path: "/refund-policy", title: "Refund & Cancellation Policy | UseFrame", h1: "Refund & Cancellation Policy", type: "WebPage" },
  { path: "/delivery-policy", title: "Delivery Policy | UseFrame", h1: "Delivery Policy", type: "WebPage" },
  { path: "/contact", title: "Contact UseFrame", h1: "Contact Us", type: "ContactPage" },
];

for (const legal of LEGAL_PAGES) {
  test(`${legal.path} is public with its own title, canonical and JSON-LD`, async ({ page }) => {
    const response = await page.goto(legal.path);

    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(new RegExp(`${legal.path}$`));
    await expect(page).toHaveTitle(legal.title);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("h1")).toHaveText(legal.h1);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `https://useframe.in${legal.path}`,
    );
    const jsonLd = JSON.parse(
      (await page.locator('script[type="application/ld+json"]').first().textContent()) ?? "{}",
    ) as { "@type"?: string };
    expect(jsonLd["@type"]).toBe(legal.type);
  });
}

test("the footer links every legal page", async ({ page }) => {
  await page.goto("/privacy");
  const legalNav = page.getByRole("navigation", { name: "Legal" });
  for (const name of ["Privacy Policy", "Terms & Conditions", "Refund Policy", "Delivery Policy", "Contact"]) {
    await expect(legalNav.getByRole("link", { name, exact: true })).toBeVisible();
  }
});

test("the contact page has working email and phone links and no postal address", async ({ page }) => {
  await page.goto("/contact");
  await expect(page.getByRole("link", { name: "hi@useframe.in" }).first()).toHaveAttribute(
    "href",
    "mailto:hi@useframe.in",
  );
  await expect(page.getByRole("link", { name: "+91 70169 38629" })).toHaveAttribute(
    "href",
    "tel:+917016938629",
  );
  await expect(page.getByText(/registered address/i)).toHaveCount(0);
});

test("sign-in links the Terms and Privacy Policy", async ({ page }) => {
  await page.goto("/signin");
  await expect(page.getByRole("link", { name: "Terms & Conditions" })).toHaveAttribute("href", "/terms");
  await expect(page.getByRole("link", { name: "Privacy Policy" }).first()).toHaveAttribute("href", "/privacy");
});

test("pricing states that credit purchases are final", async ({ page }) => {
  await page.goto("/pricing");
  await expect(page.getByText("One-time credit purchase. No refunds.")).toBeVisible();
  await expect(page.locator("#pricing").getByRole("link", { name: "Refund Policy" })).toHaveAttribute(
    "href",
    "/refund-policy",
  );
});
