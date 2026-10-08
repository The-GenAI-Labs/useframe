import { z } from "zod"
import {
  CreateProjectSchema,
  CreateProjectFromBriefSchema,
  UpdateProjectSchema,
  SendMessageSchema,
} from "@repo/schemas"

// { briefId } is the intake flow; the legacy field body keeps working.
export const CreateProjectRequestSchema = z.union([CreateProjectFromBriefSchema, CreateProjectSchema])

export { CreateProjectSchema, UpdateProjectSchema, SendMessageSchema }
export type { CreateProjectInput, UpdateProjectInput, SendMessageInput, CreateProjectFromBriefInput } from "@repo/schemas"
