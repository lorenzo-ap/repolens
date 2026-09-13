/**
 * Starts a Cloud Run Job execution so a queued analysis is picked up immediately.
 *
 * Only used where the worker is not a long-running process. With `ANALYZER_JOB` unset — local
 * development, `docker compose`, any self-hosted deployment — this is a no-op and the
 * always-on worker in `apps/analyzer/src/main.ts` polls the queue as usual.
 *
 * Triggering is best-effort on purpose. The job is already durably queued in PostgreSQL before
 * this is called, so a failure here delays the analysis until the next scheduled sweep rather
 * than losing it; failing the user's request instead would be worse and less accurate.
 */

const METADATA_TOKEN_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";

export interface JobTriggerLogger {
  warn(obj: object, msg: string): void;
  debug(obj: object, msg: string): void;
}

async function accessToken(signal: AbortSignal): Promise<string> {
  const res = await fetch(METADATA_TOKEN_URL, {
    headers: { "Metadata-Flavor": "Google" },
    signal,
  });
  if (!res.ok) throw new Error(`metadata server returned ${res.status}`);
  const body = (await res.json()) as { access_token?: string };
  if (!body.access_token) throw new Error("metadata server returned no access_token");
  return body.access_token;
}

/**
 * @param job Full resource name, `projects/{p}/locations/{l}/jobs/{j}`. Null disables triggering.
 */
export async function triggerAnalyzerJob(
  job: string | null,
  logger: JobTriggerLogger,
): Promise<boolean> {
  if (!job) return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const token = await accessToken(controller.signal);
    const res = await fetch(`https://run.googleapis.com/v2/${job}:run`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: "{}",
      signal: controller.signal,
    });
    if (!res.ok) {
      // 409 means an execution is already running, which is exactly what we wanted: it will
      // pick this job up. Anything else is worth knowing about.
      if (res.status === 409) {
        logger.debug({ job }, "analyzer job already running");
        return true;
      }
      throw new Error(`Cloud Run returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    logger.debug({ job }, "analyzer job triggered");
    return true;
  } catch (err) {
    logger.warn({ err, job }, "could not trigger the analyzer job; the sweep will pick it up");
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
