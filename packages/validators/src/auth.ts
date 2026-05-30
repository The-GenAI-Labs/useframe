import { z } from "zod";

export const AuthSchema = z.object({
    username: z.string().min(3, "username must be 3 char long").max(50, "username cannot exceed 50 char")
})