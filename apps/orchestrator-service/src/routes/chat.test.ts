import { afterEach, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
const mocks = vi.hoisted(() => ({
  owner: vi.fn(),
  token: vi.fn(),
  run: vi.fn(),
}));
vi.mock("@useframe/db", () => ({
  prisma: { project: { findFirst: mocks.owner } },
}));
vi.mock("../lib/auth.js", () => ({ verifyToken: mocks.token }));
vi.mock("../agents/chat.agent.js", () => ({ runProjectChat: mocks.run }));
import route from "./chat.route.js";
let server: Server | undefined;
afterEach(async () => {
  await new Promise<void>((resolve) =>
    server ? server.close(() => resolve()) : resolve(),
  );
  vi.resetAllMocks();
});
async function post(body: unknown) {
  const app = express();
  app.use(express.json());
  app.use(route);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server!.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No address");
  return fetch(`http://127.0.0.1:${address.port}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const body = {
  projectId: "cproject123456789012345678",
  message: "Why purple?",
};
it("rejects missing authentication before any data access", async () => {
  mocks.token.mockImplementation(() => {
    throw new Error("unauthenticated");
  });
  expect((await post(body)).status).toBe(401);
  expect(mocks.owner).not.toHaveBeenCalled();
  expect(mocks.run).not.toHaveBeenCalled();
});
it("rejects other owners and deleted projects before storing or invoking models", async () => {
  mocks.token.mockReturnValue({ id: "owner" });
  mocks.owner.mockResolvedValue(null);
  expect((await post(body)).status).toBe(404);
  expect(mocks.owner).toHaveBeenCalledWith({
    where: { id: body.projectId, userId: "owner", deletedAt: null },
    select: { id: true },
  });
  expect(mocks.run).not.toHaveBeenCalled();
});
it("validates project requests and declines unscoped legacy chat without models", async () => {
  mocks.token.mockReturnValue({ id: "owner" });
  const response = await post({ instruction: "Write me a poem" });
  expect((await response.json()).data.reply).toContain("Open a project");
  expect(mocks.run).not.toHaveBeenCalled();
});
it("streams the persisted message with existing SSE framing", async () => {
  mocks.token.mockReturnValue({ id: "owner" });
  mocks.owner.mockResolvedValue({ id: body.projectId });
  mocks.run.mockResolvedValue({
    id: "message",
    projectId: body.projectId,
    content: "Answer",
    citedFindingIds: [],
  });
  const response = await post(body);
  expect(response.headers.get("content-type")).toContain("text/event-stream");
  expect(await response.text()).toContain(
    'event: chat_message\ndata: {"type":"chat_message"',
  );
});
it("rejects empty questions", async () => {
  mocks.token.mockReturnValue({ id: "owner" });
  expect((await post({ ...body, message: "   " })).status).toBe(422);
  expect(mocks.run).not.toHaveBeenCalled();
});
