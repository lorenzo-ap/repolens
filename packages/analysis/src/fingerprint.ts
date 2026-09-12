import { createHash } from "node:crypto";
import type { FindingInput } from "@repolens/shared";

/**
 * Stable identity of a finding across analyses. Uses the rule, the file and a symbol when the
 * analyzer provides one; otherwise falls back to a coarse line bucket so small edits above a
 * finding do not make it look "new".
 */
export function fingerprintOf(f: FindingInput): string {
  const locator = f.symbol ?? (f.line ? `L${Math.floor(f.line / 25)}` : "");
  const material = [f.ruleId, f.filePath ?? "", locator].join("|");
  return createHash("sha1").update(material).digest("hex");
}
