import { memo } from "react";

export const SectionHeading = memo(function SectionHeading({ children }: { children: React.ReactNode }) {
    return (
        <h2 className="text-[15px] font-semibold text-black/75 mb-1 mt-2">{children}</h2>
    );
});
