import Layout from "@/components/layout/Layout";
import { ChatModal } from "@/components/chat/modal/ChatModal";
import { MinimizedPill } from "@/components/chat/modal/MinimizedPill";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
    return (
        <Layout>
            {children}
            <ChatModal />
            <MinimizedPill />
        </Layout>
    );
}