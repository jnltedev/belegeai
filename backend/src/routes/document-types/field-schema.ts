import { z } from "zod";

export const documentTypeFieldSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-zA-Z][a-zA-Z0-9]*$/, "key must be a camelCase identifier"),
  label: z.string().min(1).max(100),
  type: z.enum(["text", "date", "currency", "sender"]),
});
