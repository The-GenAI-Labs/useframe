import { memo } from "react";
import { SectionHeading } from "../ui/SectionHeading";

interface PlaceholderPanelProps {
    title: string;
}

export const PlaceholderPanel = memo(function PlaceholderPanel({ title }: PlaceholderPanelProps) {
    return (
        <div className="flex flex-col gap-1">
            <SectionHeading>{title}</SectionHeading>
            <p className="text-[13px] text-mut mt-2">This section is coming soon.</p>
        </div>
    );
});
