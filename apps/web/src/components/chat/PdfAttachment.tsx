"use client";

import { memo } from "react";

export type PdfAttachmentData = {
    type: "pdf";
    documentId: string;
    title: string;
    url: string;
};

const API_SERVICE_URL = process.env.NEXT_PUBLIC_API_SERVICE_URL ?? "http://localhost:4000";

// Inline preview so a generated report stays readable in place — scrolling
// back up the chat re-opens it, rather than it being a one-time download.
export const PdfAttachment = memo(function PdfAttachment({ title, url }: PdfAttachmentData) {
    // Attachment urls are stored service-relative ("/api/research-documents/…")
    // so they don't bake in a host; resolve against the API origin here.
    const href = url.startsWith("http") ? url : `${API_SERVICE_URL}${url}`;

    return (
        <div className="mt-2 flex flex-col gap-2 rounded-xl border border-base bg-tertiary p-2.5">
            <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-pri">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                    </svg>
                    {title}
                </span>
                <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-[11.5px] font-semibold text-blue-600 hover:text-blue-500"
                >
                    Open
                </a>
            </div>

            <iframe
                src={href}
                title={title}
                className="h-100 w-full rounded-lg border border-base bg-white"
            />
        </div>
    );
});
