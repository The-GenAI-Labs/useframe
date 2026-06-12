"use client";

import { memo } from "react";
import { FileText } from "lucide-react";

export const InvoiceCard = memo(function InvoiceCard() {
  return (
    <div className="w-44 rounded-2xl bg-white p-4 shadow-xl shadow-sky-950/10">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-900">Invoices</p>
        <FileText className="size-4 text-blue-500" />
      </div>
      <p className="mt-1 text-[10px] text-slate-400">#INV-00124</p>
      <div className="mt-2 flex items-center justify-between">
        <p className="text-sm font-bold text-slate-900">$2,450.00</p>
        <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[9px] font-semibold text-green-600">
          Paid
        </span>
      </div>
    </div>
  );
});
