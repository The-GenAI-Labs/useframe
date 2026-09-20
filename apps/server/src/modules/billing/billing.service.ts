import {
  callCreateCheckout,
  callCreateSetupIntent,
  callGetAutoReload,
  callPutAutoReload,
} from "@/lib/billingService.js"
import type { AutoReloadInput } from "./billing.schema.js"

export const BillingService = {
  createCheckout(user: { id: string; email: string }, amountCents: number) {
    return callCreateCheckout(user, amountCents)
  },

  createSetupIntent(user: { id: string; email: string }) {
    return callCreateSetupIntent(user)
  },

  getAutoReload(user: { id: string; email: string }) {
    return callGetAutoReload(user)
  },

  putAutoReload(user: { id: string; email: string }, input: AutoReloadInput) {
    return callPutAutoReload(user, input)
  },
}
