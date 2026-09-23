import { prisma } from "@useframe/db"
import { razorpay } from "@/lib/razorpay.js"

export async function getOrCreateRazorpayCustomer(userId: string, email: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { razorpayCustomerId: true },
  })

  if (user?.razorpayCustomerId) return user.razorpayCustomerId

  // fail_existing: 0 returns the existing customer instead of erroring when
  // the email is already registered.
  const customer = await razorpay.customers.create({
    email,
    notes: { userId },
    fail_existing: 0,
  })

  await prisma.user.update({
    where: { id: userId },
    data: { razorpayCustomerId: customer.id },
  })

  return customer.id
}
