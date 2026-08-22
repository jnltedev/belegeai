import type { FastifyInstance } from "fastify";
import { APP_VERSION, compareVersions } from "./version.js";

export interface UpdateInfo {
  /// The version this instance is running.
  current: string;
  /// The newest published release, or null when it could not be determined
  /// (check disabled, GitHub unreachable, no release yet).
  latest: string | null;
  releaseUrl: string | null;
  releaseName: string | null;
  publishedAt: string | null;
  updateAvailable: boolean;
}

// The releases this project publishes. A constant rather than a setting:
// checking for its own updates is what the app does, not something a
// deployment decides.
const REPOSITORY = "jnltedev/belegeai";

// Checked at most this often. A self-hosted archive gains nothing from
// asking more, and GitHub rate-limits unauthenticated callers to 60 requests
// an hour per address.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
// Long enough for a slow network, short enough that a hanging GitHub never
// holds up the page that asked.
const REQUEST_TIMEOUT_MS = 5_000;
// Remembered for a shorter time than a success, so a transient outage does
// not hide a release for six hours.
const FAILURE_TTL_MS = 15 * 60 * 1000;

interface CacheEntry {
  info: UpdateInfo;
  expiresAt: number;
}

let cache: CacheEntry | null = null;
let inFlight: Promise<UpdateInfo> | null = null;

function offline(): UpdateInfo {
  return {
    current: APP_VERSION,
    latest: null,
    releaseUrl: null,
    releaseName: null,
    publishedAt: null,
    updateAvailable: false,
  };
}

async function fetchLatest(fastify: FastifyInstance): Promise<UpdateInfo> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/releases/latest`, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": `BelegeAI/${APP_VERSION}`,
      },
      signal: controller.signal,
    });

    // 404 is the normal answer for a repository with no published release
    // yet, not a fault worth reporting.
    if (!response.ok) return offline();

    const release = (await response.json()) as {
      tag_name?: string;
      name?: string;
      html_url?: string;
      published_at?: string;
      draft?: boolean;
      prerelease?: boolean;
    };

    if (!release.tag_name || release.draft) return offline();

    const latest = release.tag_name.replace(/^v/, "");
    return {
      current: APP_VERSION,
      latest,
      releaseUrl: release.html_url ?? null,
      releaseName: release.name || release.tag_name,
      publishedAt: release.published_at ?? null,
      // Prereleases are never announced: someone running a self-hosted
      // archive should not be nudged towards a release candidate.
      updateAvailable: !release.prerelease && compareVersions(latest, APP_VERSION) > 0,
    };
  } catch {
    // Deliberately quiet at info level: an instance with no outbound
    // internet access would otherwise log an error every quarter hour for
    // something entirely optional.
    fastify.log.info("Could not reach GitHub for the update check.");
    return offline();
  } finally {
    clearTimeout(timer);
  }
}

/// Returns the cached update state, refreshing it when stale. Never throws
/// and never blocks longer than the request timeout: an update check is a
/// convenience, and the footer has to render either way.
export async function getUpdateInfo(fastify: FastifyInstance): Promise<UpdateInfo> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.info;

  // Concurrent callers share one request rather than each starting their own.
  if (!inFlight) {
    inFlight = fetchLatest(fastify).then((info) => {
      cache = { info, expiresAt: Date.now() + (info.latest ? CACHE_TTL_MS : FAILURE_TTL_MS) };
      inFlight = null;
      return info;
    });
  }
  return inFlight;
}
