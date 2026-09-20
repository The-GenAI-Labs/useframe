import SettingsView from "@/components/settings/SettingsView";
import { PageFadeIn } from "@/components/shared/PageFadeIn";

export default function CustomizePage() {
    return (
        <PageFadeIn>
            <SettingsView />
        </PageFadeIn>
    );
}
