import { auth } from "@/lib/auth";
import Layout from "@/components/layout/Layout";
import { ChatModal } from "@/components/chat/modal/ChatModal";
import { MinimizedPill } from "@/components/chat/modal/MinimizedPill";
import { SearchModal } from "@/components/search/SearchModal";

export default async function ChatLayout({ children }: { children: React.ReactNode }) {
    const session = await auth();

    if (!session?.user) {
        return <>{children}</>;
    }

    return (
        <Layout>
            {children}
            <ChatModal />
            <MinimizedPill />
            <SearchModal />
        </Layout>
    );
}
