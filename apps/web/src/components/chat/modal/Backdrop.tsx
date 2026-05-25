"use client";

import { memo } from "react";

interface BackdropProps {
    onClick: () => void;
}

export const Backdrop = memo(function Backdrop({ onClick }: BackdropProps) {
    return (
        <div
            className="fixed inset-0 z-[9998] bg-black/20 backdrop-blur-[2px] animate-modal-fade-in"
            onClick={onClick}
            aria-hidden="true"
        />
    );
});
