"use client";
import { useEffect, useRef, useState } from "react";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ProjectChatMessageSchema,
  type ProjectChatMessageView,
} from "@repo/schemas";
import { chatApi } from "@/lib/api/services/chat.service";
import { useSSE } from "@/hooks/useSSE";
import { FindingCitations } from "@/components/webcontainer/FindingCitations";
const ORCHESTRATOR_URL =
  process.env.NEXT_PUBLIC_ORCHESTRATOR_URL ?? "http://localhost:4001";
export function ProjectChatPanel({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const generation = useRef(0);
  const { connect, disconnect } = useSSE();
  const queryClient = useQueryClient();
  const key = ["project-chat", projectId];
  const history = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => chatApi.history(projectId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const research = useQuery({
    queryKey: ["project-chat-citations", projectId],
    queryFn: () => chatApi.research(projectId),
  });
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [pending, setPending] = useState<ProjectChatMessageView[]>([]);
  const [partial, setPartial] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
    return () => {
      generation.current++;
      disconnect();
    };
  }, [disconnect]);
  const stored =
    history.data?.pages
      .slice()
      .reverse()
      .flatMap((page) => page.messages) ?? [];
  const messages = [
    ...stored,
    ...pending.filter(
      (message) => !stored.some((row) => row.id === message.id),
    ),
  ];
  const citations =
    research.data?.areas.flatMap((area) =>
      area.findings.map((finding) => ({
        id: finding.findingId,
        title: finding.title,
        source: finding.source?.title ?? "Research finding",
        url: finding.source?.url ?? undefined,
      })),
    ) ?? [];
  const send = async () => {
    const message = draft.trim();
    if (!message || streaming) return;
    const run = ++generation.current;
    setError("");
    setDraft("");
    setPartial("");
    setStreaming(true);
    setPending([
      {
        id: `pending-${run}`,
        projectId,
        role: "USER",
        content: message,
        topic: null,
        citedFindingIds: [],
        jevConfidence: null,
        createdAt: new Date().toISOString(),
      },
    ]);
    let completed = false;
    await connect(
      `${ORCHESTRATOR_URL}/chat`,
      { projectId, message },
      {
        onEvent: (event) => {
          if (generation.current !== run) return;
          if (event.type === "token") setPartial((text) => text + event.delta);
          if (event.type === "error") setError(event.message);
          if (event.type === "chat_message") {
            const row = ProjectChatMessageSchema.parse(event.message);
            if (row.projectId !== projectId) return;
            completed = true;
            setPending((current) => [...current, row]);
            setPartial("");
          }
        },
        onError: (failure) => {
          if (generation.current === run) setError(failure.message);
        },
      },
    );
    if (generation.current !== run) return;
    if (!completed) {
      setPartial("");
      setError(
        (current) => current || "The answer was interrupted. Please try again.",
      );
    }
    await queryClient.invalidateQueries({ queryKey: key });
    if (generation.current === run) {
      setPending([]);
      setStreaming(false);
    }
  };
  return (
    <dialog
      ref={dialog}
      onCancel={onClose}
      className="m-auto w-[min(92vw,42rem)] rounded-2xl border border-base bg-surface p-0 text-pri backdrop:bg-black/40"
      aria-labelledby="project-chat-title"
    >
      <div className="flex max-h-[85vh] flex-col">
        <header className="flex items-center justify-between border-b border-base p-4">
          <h2 id="project-chat-title" className="font-semibold">
            Ask about this project
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close project chat"
            className="rounded p-2 focus-visible:outline-2"
          >
            Close
          </button>
        </header>
        <div
          className="min-h-32 flex-1 overflow-y-auto p-4"
          role="log"
          aria-live="polite"
          aria-busy={streaming}
        >
          {history.hasNextPage && (
            <button
              type="button"
              disabled={history.isFetchingNextPage}
              onClick={() => void history.fetchNextPage()}
              className="mb-3 text-sm underline"
            >
              Load earlier messages
            </button>
          )}
          {history.isPending && <p>Loading conversation…</p>}
          {history.isError && (
            <p role="alert">
              Could not load conversation.{" "}
              <button type="button" onClick={() => void history.refetch()}>
                Retry
              </button>
            </p>
          )}
          {!messages.length && !history.isPending && (
            <p className="text-sm text-mut">
              Ask about design decisions, citations, SEO, or competitor research
              for this project.
            </p>
          )}
          {messages.map((message) => (
            <article key={message.id} className="mb-4">
              <p className="mb-1 text-xs font-semibold">
                {message.role === "USER" ? "You" : "UseFrame"}
              </p>
              <p className="whitespace-pre-wrap text-sm">{message.content}</p>
              {message.citedFindingIds.length > 0 && (
                <FindingCitations
                  citations={citations.filter((citation) =>
                    message.citedFindingIds.includes(citation.id),
                  )}
                />
              )}
            </article>
          ))}
          {streaming && (
            <p className="whitespace-pre-wrap text-sm">
              {partial || "Thinking about your project…"}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
          className="flex gap-2 border-t border-base p-4"
        >
          <label htmlFor="project-chat-message" className="sr-only">
            Question about this project
          </label>
          <textarea
            id="project-chat-message"
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={2000}
            rows={2}
            disabled={streaming}
            placeholder="Why did we choose these colors?"
            className="min-w-0 flex-1 rounded-lg border border-base bg-transparent p-2 text-sm"
          />
          <button
            type="submit"
            disabled={
              streaming || !draft.trim() || history.isPending || history.isError
            }
            className="rounded-lg border border-base px-3 text-sm disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </div>
    </dialog>
  );
}
