import Layout from "@/components/layout/Layout";
import { ChatModal } from "@/components/chat/modal/ChatModal";
import { MinimizedPill } from "@/components/chat/modal/MinimizedPill";
import { SearchModal } from "@/components/search/SearchModal";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
    return (
        <Layout>
            {children}
            <ChatModal />
            <MinimizedPill />
            <SearchModal />
        </Layout>
    );
}