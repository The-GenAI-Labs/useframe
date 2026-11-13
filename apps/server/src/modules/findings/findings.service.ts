import { prisma } from "@useframe/db"
import { AppError } from "@/middleware/errorHandler.js"

export const FindingsService = {
  // Public: only what a locked visitor may see, so old /research/<id> links can redirect to the library.
  async publicRef(id: string): Promise<{ id: string; slug: string; title: string }> {
    const finding = await prisma.researchFinding.findFirst({
      where: { id, status: "VERIFIED" },
      select: { id: true, slug: true, title: true },
    })
    if (!finding) throw new AppError("Finding not found", 404)
    return finding
  },
}
