import BoardView from "@/components/board/BoardView";
import { PageFadeIn } from "@/components/shared/PageFadeIn";

export default function BoardPage() {
    return (
        <PageFadeIn>
            <BoardView />
        </PageFadeIn>
    );
}
