import { Router } from "express"
import { WebcontainerSnapshotController } from "./webcontainerSnapshot.controller.js"

// Public — pure build output, no user data. The WebContainer boot flow
// fetches this before authentication has necessarily resolved on first load.
const router: Router = Router()

router.get("/:template", WebcontainerSnapshotController.get)

export default router
