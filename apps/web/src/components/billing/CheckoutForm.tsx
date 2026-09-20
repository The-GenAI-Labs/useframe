"use client";

import { useState, useCallback } from "react";
import { PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";

type Props = {
    onSuccess: () => void;
    onCancel: () => void;
};

export function CheckoutForm({ onSuccess, onCancel }: Props) {
    const stripe = useStripe();
    const elements = useElements();
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = useCallback(async () => {
        if (!stripe || !elements) return;
        setSubmitting(true);
        setError(null);

        const { error: confirmError } = await stripe.confirmPayment({
            elements,
            redirect: "if_required",
        });

        if (confirmError) {
            setError(confirmError.message ?? "Payment failed. Please try again.");
            setSubmitting(false);
            return;
        }

        setSubmitting(false);
        onSuccess();
    }, [stripe, elements, onSuccess]);

    return (
        <div className="flex flex-col gap-4">
            <PaymentElement />
            {error && <p className="text-[12.5px] text-red-500">{error}</p>}
            <div className="flex gap-2">
                <button
                    type="button"
                    onClick={onCancel}
                    disabled={submitting}
                    className="px-4 py-2.5 rounded-xl border border-base text-[12.5px] font-medium text-sec hover:border-em hover:bg-tertiary transition-all cursor-pointer disabled:opacity-50"
                >
                    Cancel
                </button>
                <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={!stripe || submitting}
                    className="flex-1 px-4 py-2.5 rounded-xl text-[12.5px] font-semibold text-white bg-linear-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {submitting ? "Processing…" : "Pay now"}
                </button>
            </div>
        </div>
    );
}
