import { closeContext, deps } from "@/context.js"
import { runMediaGc } from "@/jobs/gc.js"

const result = await runMediaGc(deps)
console.log(JSON.stringify(result))
await closeContext()
