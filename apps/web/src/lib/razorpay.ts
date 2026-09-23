"use client";

const RAZORPAY_SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

type RazorpayInstance = {
    open: () => void;
    on: (event: string, handler: (response: unknown) => void) => void;
};

type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayInstance;

declare global {
    interface Window {
        Razorpay?: RazorpayConstructor;
    }
}

let scriptPromise: Promise<void> | null = null;

// Hosted modal loaded from Razorpay's CDN; memoized so repeated opens don't
// re-inject the tag.
function loadRazorpayScript(): Promise<void> {
    if (typeof window === "undefined") return Promise.reject(new Error("Not in a browser"));
    if (window.Razorpay) return Promise.resolve();

    if (!scriptPromise) {
        scriptPromise = new Promise<void>((resolve, reject) => {
            const existing = document.querySelector<HTMLScriptElement>(
                `script[src="${RAZORPAY_SCRIPT_SRC}"]`
            );
            if (existing) {
                existing.addEventListener("load", () => resolve());
                existing.addEventListener("error", () => reject(new Error("Failed to load Razorpay")));
                return;
            }

            const script = document.createElement("script");
            script.src = RAZORPAY_SCRIPT_SRC;
            script.async = true;
            script.onload = () => resolve();
            script.onerror = () => {
                scriptPromise = null; // allow a retry on the next attempt
                reject(new Error("Failed to load Razorpay"));
            };
            document.body.appendChild(script);
        });
    }

    return scriptPromise;
}

export type RazorpayCheckoutOptions = {
    keyId: string;
    orderId: string;
    amountCents: number;
    currency: string;
    name?: string;
    description?: string;
    prefill?: { name?: string; email?: string };
    /** Tokenize the card for later off-session charges (auto-reload). */
    saveCard?: boolean;
};

export type RazorpayResult =
    | { status: "success"; paymentId: string; orderId: string; signature: string }
    | { status: "dismissed" }
    | { status: "failed"; message: string };

// Resolves once the user completes, fails, or dismisses the modal. A success
// here is not proof of payment — credits are granted by the webhook.
export async function openRazorpayCheckout(
    options: RazorpayCheckoutOptions
): Promise<RazorpayResult> {
    await loadRazorpayScript();

    const Razorpay = window.Razorpay;
    if (!Razorpay) throw new Error("Razorpay failed to initialize");

    return new Promise<RazorpayResult>((resolve) => {
        let settled = false;
        const settle = (result: RazorpayResult) => {
            if (settled) return;
            settled = true;
            resolve(result);
        };

        const instance = new Razorpay({
            key: options.keyId,
            order_id: options.orderId,
            amount: options.amountCents,
            currency: options.currency,
            name: options.name ?? "UseFrame",
            description: options.description,
            prefill: options.prefill,
            ...(options.saveCard ? { save: 1 } : {}),
            handler: (response: {
                razorpay_payment_id: string;
                razorpay_order_id: string;
                razorpay_signature: string;
            }) => {
                settle({
                    status: "success",
                    paymentId: response.razorpay_payment_id,
                    orderId: response.razorpay_order_id,
                    signature: response.razorpay_signature,
                });
            },
            modal: {
                ondismiss: () => settle({ status: "dismissed" }),
            },
        });

        instance.on("payment.failed", (response: unknown) => {
            const description =
                (response as { error?: { description?: string } })?.error?.description ??
                "Payment failed. Please try again.";
            settle({ status: "failed", message: description });
        });

        instance.open();
    });
}
