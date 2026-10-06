import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata(
  "Project Board",
  "Organize your website work and keep your projects moving in useframe.",
);

import BoardView from "@/components/board/BoardView";
import { PageFadeIn } from "@/components/shared/PageFadeIn";

export default function BoardPage() {
  return (
    <PageFadeIn>
      <BoardView />
    </PageFadeIn>
  );
}
