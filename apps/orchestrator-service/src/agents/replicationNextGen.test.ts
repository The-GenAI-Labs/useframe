import { beforeEach, describe, expect, it, vi } from "vitest";

const generateText = vi.hoisted(() => vi.fn());
vi.mock("ai", () => ({ generateText }));
vi.mock("@/llm/router.js", () => ({
  getModelForTier: () => ({}),
  getProviderOptionsForTier: (tier: string) =>
    tier === "free" ? { openai: { reasoningEffort: "high" } } : undefined,
}));
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
    ).rejects.toThrow("did not finish all website files");
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

  it("retries reasoning-only exhaustion with more budget and no empty assistant turn", async () => {
    generateText
      .mockResolvedValueOnce({ text: "", finishReason: "length" })
      .mockResolvedValueOnce({ text: page, finishReason: "stop" });
    await expect(
      generateReplicationNextFiles("A page", "free"),
    ).resolves.toHaveLength(1);
    expect(generateText.mock.calls[0]![0].maxTokens).toBe(65_536);
    expect(generateText.mock.calls[1]![0].maxTokens).toBe(131_072);
    expect(generateText.mock.calls[1]![0].providerOptions).toEqual({
      openai: { reasoningEffort: "high" },
    });
    expect(
      generateText.mock.calls[1]![0].messages.every(
        (message: { content: string }) => message.content.trim(),
      ),
    ).toBe(true);
  });

  it("does not spend every continuation on repeated empty reasoning responses", async () => {
    generateText.mockResolvedValue({ text: "", finishReason: "length" });
    await expect(
      generateReplicationNextFiles("A page", "free"),
    ).rejects.toThrow("returned no website code");
    expect(generateText).toHaveBeenCalledTimes(2);
  });

  it("retains complete files and replaces the truncated file instead of joining fragments", async () => {
    const home = page.replace(
      "export default",
      'import Header from "../components/Header";\nexport default',
    );
    const partial =
      "\nFILE: components/Header.tsx\n```tsx\nexport default function He";
    generateText
      .mockResolvedValueOnce({ text: home + partial, finishReason: "length" })
      .mockResolvedValueOnce({
        text: "FILE: components/Header.tsx\n```tsx\nexport default function Header() { return <header /> }\n```",
        finishReason: "stop",
      });
    const result = await generateReplicationNextFiles("A page", "free");
    expect(result).toHaveLength(2);
    expect(result[1]!.content).toBe(
      "export default function Header() { return <header /> }\n",
    );
    expect(
      generateText.mock.calls[1]![0].messages.some(
        (message: { content: string }) =>
          message.content.includes(
            "Unfinished files to resend: components/Header.tsx",
          ),
      ),
    ).toBe(true);
  });

  it("accepts CRLF fenced blocks", async () => {
    generateText.mockResolvedValue({
      text: page.replaceAll("\n", "\r\n"),
      finishReason: "stop",
    });
    await expect(
      generateReplicationNextFiles("A page", "paid"),
    ).resolves.toHaveLength(1);
    expect(generateText.mock.calls[0]![0].maxTokens).toBe(16_384);
  });

  it("repairs server components containing image error handlers before saving", async () => {
    const serverPage =
      'FILE: app/page.tsx\n```tsx\nexport default function Page() { return <img src="https://example.com/logo.png" onError={() => {}} /> }\n```';
    const clientPage = serverPage.replace(
      "```tsx\n",
      '```tsx\n"use client";\n',
    );
    generateText
      .mockResolvedValueOnce({ text: serverPage, finishReason: "stop" })
      .mockResolvedValueOnce({ text: clientPage, finishReason: "stop" });
    const result = await generateReplicationNextFiles("A page", "free");
    expect(result[0]!.content).toContain('"use client"');
    expect(generateText).toHaveBeenCalledTimes(2);
  });

  it("rejects client components that export server metadata", async () => {
    generateText.mockResolvedValue({
      text: 'FILE: app/page.tsx\n```tsx\n"use client";\nexport const metadata = { title: "Invalid" };\nexport default function Page() { return <main /> }\n```',
      finishReason: "stop",
    });
    await expect(
      generateReplicationNextFiles("A page", "free"),
    ).rejects.toThrow("cannot export server metadata");
  });
});
