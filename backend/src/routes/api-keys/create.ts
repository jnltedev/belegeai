import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { apiKeys } from "../../db/schema/index.js";
import { currentUser } from "../../lib/auth-guard.js";
import { generateApiKey, hashApiKey } from "../../lib/api-keys.js";

const createBody = z.object({
  name: z.string().min(1).max(100),
});

export default async function createApiKeyRoute(fastify: FastifyInstance) {
  fastify.post("/", async (request, reply) => {
    const parsed = createBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const user = currentUser(request);
    const key = generateApiKey();

    const [created] = await fastify.db
      .insert(apiKeys)
      .values({ name: parsed.data.name, keyHash: hashApiKey(key), createdBy: user.id })
      .returning();

    const { keyHash: _keyHash, ...rest } = created;
    // The only point in this key's lifetime where the plaintext is available
    // - the client must capture it now, it's never retrievable again.
    return reply.code(201).send({ apiKey: { ...rest, key } });
  });
}
