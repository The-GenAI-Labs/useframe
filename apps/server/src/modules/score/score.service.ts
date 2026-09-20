import { callCreateScore, callGetScore, callGetScreenshot } from "@/lib/scoringService.js"

export const ScoreService = {
  create(userId: string, url: string, force?: boolean) {
    return callCreateScore(url, userId, force)
  },

  get(scoreId: string) {
    return callGetScore(scoreId)
  },

  getScreenshot(scoreId: string) {
    return callGetScreenshot(scoreId)
  },
}
