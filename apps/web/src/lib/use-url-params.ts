"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

export type UrlPatch = Record<string, string | string[] | null | undefined>;

/**
 * URL query state that composes correctly under rapid successive updates. `router.replace` is
 * asynchronous, so building each update from the rendered search params (or `window.location`)
 * lets a debounced update clobber a click that happened in between. A ref keeps the latest
 * intended state and every patch is applied on top of it.
 */
export function useUrlParams() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const pending = useRef<URLSearchParams>(new URLSearchParams(sp.toString()));

  useEffect(() => {
    pending.current = new URLSearchParams(sp.toString());
  }, [sp]);

  const update = useCallback(
    (patch: UrlPatch) => {
      const next = new URLSearchParams(pending.current.toString());
      for (const [k, v] of Object.entries(patch)) {
        next.delete(k);
        if (v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0))
          continue;
        if (Array.isArray(v)) for (const item of v) next.append(k, item);
        else next.set(k, v);
      }
      pending.current = next;
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  return { params: sp, update };
}
