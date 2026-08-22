import fp from "fastify-plugin";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { pushSettings } from "../db/schema/index.js";
import { decrypt, encrypt, keyFromHex } from "../lib/crypto.js";

export interface ImportNotification {
  source: "imap" | "api";
  documentId: string;
}

export interface ProxyStatus {
  connected: boolean;
  /// Whether a proxy address is configured at all. The address itself is not
  /// exposed: it is deployment configuration, and the admin screen only needs
  /// to say whether the connection stands.
  configured: boolean;
  instanceId?: string;
  deviceCount?: number;
  lastNotifiedAt?: string | null;
  bundleId?: string;
  error?: string;
}

export interface PushService {
  /// Whether an instance is enrolled at a proxy at all. Not a promise that
  /// the proxy is currently reachable - see checkStatus() for that.
  isConfigured(): Promise<boolean>;
  status(): Promise<ProxyStatus>;
  enroll(): Promise<void>;
  /// The nonce the push proxy is currently expecting back from this
  /// instance's public challenge endpoint, if an enrollment is in flight.
  pendingChallenge(): string | null;
  disconnect(): Promise<void>;
  registerDevice(input: {
    token: string;
    environment: "sandbox" | "production";
    userRef: string;
    notifyImports: boolean;
  }): Promise<void>;
  unregisterDevice(token: string): Promise<void>;
  notifyImport(notification: ImportNotification): Promise<void>;
}

interface Credentials {
  proxyUrl: string;
  instanceId: string;
  instanceToken: string;
}

function normalizeUrl(input: string): string {
  let url = (input ?? "").trim();
  if (!url) return "";
  if (!url.includes("://")) url = `https://${url}`;
  while (url.endsWith("/")) url = url.slice(0, -1);
  return url;
}

export default fp(async function pushPlugin(fastify: FastifyInstance) {
  const encryptionKey = keyFromHex(fastify.env.SETTINGS_ENCRYPTION_KEY);

  // Held in memory only. The two enrollment calls happen back to back within
  // a single admin click, so there is nothing worth persisting - and a nonce
  // that outlives a restart would be a liability rather than a convenience.
  let challenge: { value: string; expiresAt: number } | null = null;

  async function credentials(): Promise<Credentials | null> {
    const [row] = await fastify.db.select().from(pushSettings).limit(1);
    if (!row) return null;
    return {
      proxyUrl: row.proxyUrl,
      instanceId: row.instanceId,
      instanceToken: decrypt(row.instanceTokenEncrypted, encryptionKey),
    };
  }

  /// Every proxy call funnels through here so failures are uniform: the proxy
  /// being down must never break ingestion or sign-in, only mean "no push".
  async function call(
    creds: Credentials,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ ok: boolean; status: number; data: unknown; error?: string }> {
    try {
      const response = await fetch(`${creds.proxyUrl}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${creds.instanceToken}`,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });

      const text = await response.text();
      const data = text ? safeJson(text) : null;
      return {
        ok: response.ok,
        status: response.status,
        data,
        error: response.ok ? undefined : errorMessage(data, response.status),
      };
    } catch (err) {
      return { ok: false, status: 0, data: null, error: err instanceof Error ? err.message : "Unreachable" };
    }
  }

  async function postJson(
    url: string,
    body: unknown,
  ): Promise<{ ok: boolean; data: unknown; error?: string }> {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
      const text = await response.text();
      const data = text ? safeJson(text) : null;
      return { ok: response.ok, data, error: response.ok ? undefined : errorMessage(data, response.status) };
    } catch (err) {
      return { ok: false, data: null, error: err instanceof Error ? err.message : "Push proxy unreachable" };
    }
  }

  function safeJson(text: string): unknown {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  function errorMessage(data: unknown, status: number): string {
    if (data && typeof data === "object" && "error" in data) {
      const value = (data as { error: unknown }).error;
      if (typeof value === "string") return value;
    }
    return `Push proxy responded ${status}`;
  }

  const service: PushService = {
    async isConfigured() {
      return (await credentials()) !== null;
    },

    async status() {
      const configured = Boolean(normalizeUrl(fastify.env.APNS_PUSH_PROXY_URL));
      const creds = await credentials();
      if (!creds) return { connected: false, configured };

      const result = await call(creds, "GET", "/api/instances/me");
      // Recorded so the admin screen can explain a failure that happened
      // between page loads, not only one it triggered itself.
      await fastify.db
        .update(pushSettings)
        .set({ lastCheckAt: new Date(), lastError: result.ok ? null : (result.error ?? "unknown") })
        .where(eq(pushSettings.instanceId, creds.instanceId));

      if (!result.ok) {
        return { connected: false, configured, instanceId: creds.instanceId, error: result.error };
      }

      const data = result.data as {
        deviceCount?: number;
        lastNotifiedAt?: string | null;
        bundleId?: string;
      };
      return {
        connected: true,
        configured,
        instanceId: creds.instanceId,
        deviceCount: data.deviceCount,
        lastNotifiedAt: data.lastNotifiedAt ?? null,
        bundleId: data.bundleId,
      };
    },

    async enroll() {
      const url = normalizeUrl(fastify.env.APNS_PUSH_PROXY_URL);
      if (!url) {
        throw new Error("No push proxy configured (APNS_PUSH_PROXY_URL)");
      }
      // The instance identifies itself by the address it is actually reachable
      // at, and then proves it controls that address. Nothing is typed in by
      // an operator, so nothing can be typed in wrongly.
      const instanceUrl = normalizeUrl(fastify.env.FRONTEND_ORIGIN);
      if (!instanceUrl) {
        throw new Error("This instance has no public URL configured (PUBLIC_APP_URL)");
      }

      const started = await postJson(`${url}/api/instances/enroll/start`, { instanceUrl });
      if (!started.ok) throw new Error(started.error ?? "Enrollment could not be started");

      const { verificationId, challenge: nonce } = started.data as {
        verificationId: string;
        challenge: string;
      };
      // Published by GET /api/push/challenge until the proxy has fetched it.
      challenge = { value: nonce, expiresAt: Date.now() + 10 * 60_000 };

      try {
        const completed = await postJson(`${url}/api/instances/enroll/complete`, { verificationId });
        if (!completed.ok) throw new Error(completed.error ?? "Domain verification failed");

        const { instanceId, instanceToken } = completed.data as {
          instanceId: string;
          instanceToken: string;
        };

        // Re-enrolling replaces the previous registration rather than
        // accumulating rows - one instance, one proxy.
        await fastify.db.delete(pushSettings);
        await fastify.db.insert(pushSettings).values({
          proxyUrl: url,
          instanceId,
          instanceTokenEncrypted: encrypt(instanceToken, encryptionKey),
        });
      } finally {
        // The nonce is single-use at the proxy; keeping it served here longer
        // than the handshake would only widen the window for no benefit.
        challenge = null;
      }
    },

    pendingChallenge() {
      if (!challenge || challenge.expiresAt < Date.now()) return null;
      return challenge.value;
    },

    async disconnect() {
      const creds = await credentials();
      if (creds) {
        // Best effort: tell the proxy to drop us and its device rows with us.
        // A failure here must not prevent local disconnection.
        await call(creds, "DELETE", "/api/instances/me");
      }
      await fastify.db.delete(pushSettings);
    },

    async registerDevice(input) {
      const creds = await credentials();
      if (!creds) return;
      const result = await call(creds, "POST", "/api/devices", input);
      if (!result.ok) {
        fastify.log.warn({ error: result.error }, "Registering device with push proxy failed");
      }
    },

    async unregisterDevice(token) {
      const creds = await credentials();
      if (!creds) return;
      await call(creds, "DELETE", `/api/devices/${encodeURIComponent(token)}`);
    },

    async notifyImport(notification) {
      const creds = await credentials();
      if (!creds) return;

      // No title, no filename, no sender: the proxy learns only that
      // something arrived, from which channel, and an opaque id so a tap can
      // open the right document. The wording lives in the app.
      // No userRefs: the archive is shared, so every user of this instance is
      // a legitimate recipient. Who actually gets a buzz is decided per
      // device by notify_imports, which each person sets in the app.
      const result = await call(creds, "POST", "/api/notify", {
        kind: "import",
        source: notification.source,
        documentId: notification.documentId,
        userRefs: [],
      });
      if (!result.ok) {
        fastify.log.warn({ error: result.error }, "Push proxy notification failed");
      }
    },
  };

  fastify.decorate("push", service);

});
