import { prisma } from "@useframe/db"
import { AppError } from "@/middleware/errorHandler.js"
import type { ReplicateMessageInput } from "./replicateMessages.schema.js"

export const ReplicateMessagesService = {
  async sendMessage(
    user: { id: string; email: string; plan: string },
    slug: string,
    input: ReplicateMessageInput
  ) {
    const replication = await prisma.replication.findFirst({
      where: { slug, userId: user.id },
    })
    if (!replication) throw new AppError("Replication not found", 404)
    if (!replication.nextFiles) throw new AppError("Preview not ready yet", 409)

    throw new AppError("Iterating on a replicated site isn't supported yet", 501)
  },
}
