import {
  callCreateCheckout,
  callCreateSetupIntent,
  callGetAutoReload,
  callPutAutoReload,
} from "@/lib/billingService.js"
import type { AutoReloadInput, CheckoutInput } from "./billing.schema.js"

export const BillingService = {
  createCheckout(user: { id: string; email: string }, input: CheckoutInput) {
    return callCreateCheckout(user, input)
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
