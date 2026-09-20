"use client";

import { useAuth } from "@/lib/authContext";
import { RouteGuard } from "@/components/RouteGuard";
import Layout from "@/components/layout/Layout";
import { ChatModal } from "@/components/chat/modal/ChatModal";
import { MinimizedPill } from "@/components/chat/modal/MinimizedPill";
import { SearchModal } from "@/components/search/SearchModal";
import { CreateProjectModal } from "@/components/project/CreateProjectModal";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
    const { status } = useAuth();

    if (status !== "authenticated") {
        return <RouteGuard>{children}</RouteGuard>;
    }

    return (
        <RouteGuard>
            <Layout>
                {children}
                <ChatModal />
                <MinimizedPill />
                <SearchModal />
                <CreateProjectModal />
            </Layout>
        </RouteGuard>
    );
}
