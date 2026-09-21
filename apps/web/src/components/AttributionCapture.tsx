"use client";

import { useEffect } from "react";
import { captureAttribution } from "@/lib/attribution";

/** Fire-and-forget: stashes ?ref / utm_* into sessionStorage on first load. */
export function AttributionCapture() {
    useEffect(() => {
        captureAttribution();
    }, []);

    return null;
}
