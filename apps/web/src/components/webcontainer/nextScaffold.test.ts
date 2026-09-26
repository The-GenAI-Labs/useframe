import { describe, expect, it } from "vitest";
import { withScaffold } from "./nextScaffold";

const page = {
  path: "app/page.tsx",
  content: "export default function Page() { return <main>Hello</main> }",
};

describe("replication scaffold", () => {
  it("normalizes file paths and pins the preview's dependencies", () => {
    const files = withScaffold([
      { ...page, path: "./app/page.tsx" },
      { path: "package.json", content: "{}" },
    ]);
    expect(files.find((file) => file.path === "app/page.tsx")).toEqual(page);
    expect(
      JSON.parse(files.find((file) => file.path === "package.json")!.content)
        .dependencies.next,
    ).toBe("15.0.3");
    expect(files.some((file) => file.path === "app/layout.tsx")).toBe(true);
    expect(
      JSON.parse(files.find((file) => file.path === "package.json")!.content)
        .scripts.dev,
    ).toBe("node node_modules/next/dist/bin/next dev");
  });

  it.each([
    "../page.tsx",
    "/app/page.tsx",
    "app/../page.tsx",
    "app\\page.tsx",
    "node_modules/.bin/next",
    "__proto__/polluted",
    ".env.local",
    "app//page.tsx",
  ])("rejects unsafe file path %s", (path) => {
    expect(() => withScaffold([page, { path, content: "bad" }])).toThrow(
      "Invalid generated file path",
    );
  });

  it("rejects a missing home page rather than displaying the template placeholder", () => {
    expect(() => withScaffold([])).toThrow("missing its home page");
  });
});
