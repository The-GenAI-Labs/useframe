import { memo } from "react";

interface SettingsRowProps {
    label: string;
    children: React.ReactNode;
}

export const SettingsRow = memo(function SettingsRow({ label, children }: SettingsRowProps) {
    return (
        <div className="flex items-center justify-between py-4 border-b border-black/[0.06] last:border-0">
            <span className="text-[14px] text-black/60 font-normal">{label}</span>
            <div className="flex items-center gap-2">{children}</div>
        </div>
    );
});
