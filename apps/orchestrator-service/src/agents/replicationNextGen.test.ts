import { beforeEach, describe, expect, it, vi } from "vitest";

const generateText = vi.hoisted(() => vi.fn());
vi.mock("ai", () => ({ generateText }));
vi.mock("@/llm/router.js", () => ({ getModelForTier: () => ({}) }));
import { generateReplicationNextFiles } from "./replicationNextGen.js";

const page =
  "FILE: app/page.tsx\n```tsx\nexport default function Page() { return <main>Hello</main> }\n```";
beforeEach(() => generateText.mockReset());

describe("replication code generation", () => {
  it("repairs an unavailable dependency with the original response in context", async () => {
    const broken = page.replace(
      "export default",
      'import { Icon } from "lucide-react";\nexport default',
    );
    generateText
      .mockResolvedValueOnce({ text: broken, finishReason: "stop" })
      .mockResolvedValueOnce({ text: page, finishReason: "stop" });
    await expect(
      generateReplicationNextFiles("A page", "free"),
    ).resolves.toHaveLength(1);
    expect(generateText).toHaveBeenCalledTimes(2);
    const messages = generateText.mock.calls[1]![0].messages;
    expect(messages).toContainEqual({ role: "assistant", content: broken });
    expect(
      messages.some((message: { content: string }) =>
        message.content.includes("lucide-react (not available"),
      ),
    ).toBe(true);
  });

  it("rejects repeated output with a missing home page", async () => {
    generateText.mockResolvedValue({
      text: page.replace("app/page.tsx", "components/Header.tsx"),
      finishReason: "stop",
    });
    await expect(
      generateReplicationNextFiles("A page", "free"),
    ).rejects.toThrow("Missing home page");
  });

  it("rejects truncated generations instead of accepting complete earlier blocks", async () => {
    generateText.mockResolvedValue({ text: page, finishReason: "length" });
    await expect(
      generateReplicationNextFiles("A page", "free"),
    ).rejects.toThrow("truncated");
  });

  it("accepts relative directory imports when an index file is supplied", async () => {
    const text =
      page.replace(
        "export default",
        'import Header from "../components";\nexport default',
      ) +
      "\nFILE: components/index.tsx\n```tsx\nexport default function Header() { return <header /> }\n```";
    generateText.mockResolvedValue({ text, finishReason: "stop" });
    await expect(
      generateReplicationNextFiles("A page", "free"),
    ).resolves.toHaveLength(2);
    expect(generateText).toHaveBeenCalledTimes(1);
  });
});
