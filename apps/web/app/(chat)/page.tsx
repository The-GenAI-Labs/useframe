import { auth } from "@/lib/auth";
import { HomeView } from "@/components/home/HomeView";
import ChatHomeView from "@/components/chat/ChatHomeView";

export default async function RootPage() {
  const session = await auth();

  if (!session?.user) {
    return <HomeView />;
  }

  return <ChatHomeView />;
}
