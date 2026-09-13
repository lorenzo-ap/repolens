/**
 * Nudges the analyzer service so a queued analysis is picked up immediately.
 *
 * Only needed where the analyzer scales to zero. With `ANALYZER_URL` unset — local development,
 * `docker compose`, any self-hosted deployment — this is a no-op and the always-on worker in
 * `apps/analyzer/src/main.ts` polls the queue as usual.
 *
 * Best-effort on purpose. The job is already durable in PostgreSQL before this is called, so a
 * failure delays the analysis until the next scheduled sweep rather than losing it; failing the
 * user's request over a nudge would be both worse and less accurate.
 *
 * The response is deliberately not awaited by the caller: the analyzer holds the connection open
 * until the queue is quiet, which can be minutes.
 */

const METADATA_IDENTITY_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity";

export interface TriggerLogger {
  warn(obj: object, msg: string): void;
  debug(obj: object, msg: string): void;
}

/** Cloud Run requires an identity token whose audience is the target service's URL. */
async function identityToken(audience: string, signal: AbortSignal): Promise<string> {
  const res = await fetch(`${METADATA_IDENTITY_URL}?audience=${encodeURIComponent(audience)}`, {
    headers: { "Metadata-Flavor": "Google" },
    signal,
  });
  if (!res.ok) throw new Error(`metadata server returned ${res.status}`);
  const token = (await res.text()).trim();
  if (!token) throw new Error("metadata server returned an empty identity token");
  return token;
}

/**
 * @param baseUrl Analyzer service base URL. Null disables triggering.
 */
export async function triggerAnalyzer(
  baseUrl: string | null,
  logger: TriggerLogger,
): Promise<boolean> {
  if (!baseUrl) return false;
  const target = `${baseUrl.replace(/\/$/, "")}/drain`;
  // Only the handshake is bounded. Once the analyzer has accepted the request it may hold the
  // connection for the length of the drain, and aborting it would end its CPU allocation.
  const handshake = new AbortController();
  const timeout = setTimeout(() => handshake.abort(), 10_000);
  try {
    const token = await identityToken(baseUrl, handshake.signal);
    clearTimeout(timeout);
    void fetch(target, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    }).catch((err) => logger.warn({ err, target }, "analyzer drain request failed"));
    logger.debug({ target }, "analyzer nudged");
    return true;
  } catch (err) {
    clearTimeout(timeout);
    logger.warn({ err, target }, "could not reach the analyzer; the sweep will pick it up");
    return false;
  }
}
