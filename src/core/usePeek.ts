import { useCallback, useEffect, useRef, useState } from "react";
import type { ModuleEntry } from "./types";

const PEEK_DURATION = 3800;

/**
 * Briefly shows a module when it reports new activity (its `activityKey`
 * changes), or on demand with `peek`.
 */
export function usePeek(entries: ModuleEntry[]) {
  const [peekId, setPeekId] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  /** Set only when the peek came from an activity key, so manual peeks keep working. */
  const autoPeek = useRef<string | null>(null);

  const peek = useCallback((moduleId: string, auto = false) => {
    autoPeek.current = auto ? moduleId : null;
    setPeekId(moduleId);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      autoPeek.current = null;
      setPeekId(null);
    }, PEEK_DURATION);
  }, []);

  const endPeek = useCallback(() => {
    window.clearTimeout(timer.current);
    autoPeek.current = null;
    setPeekId(null);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const lastKeys = useRef(new Map<string, string | undefined>());
  const keySignature = entries.map((e) => `${e.module.id}=${e.view.activityKey ?? ""}`).join("|");
  useEffect(() => {
    for (const { module, view } of entries) {
      const seen = lastKeys.current.has(module.id);
      const prev = lastKeys.current.get(module.id);
      lastKeys.current.set(module.id, view.activityKey);
      if (seen && view.activityKey && view.activityKey !== prev) peek(module.id, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keySignature]);

  // A one-shot alert can expire before the peek timer: close the empty panel
  // as soon as the peeked module has nothing left to show.
  const activeSignature = entries.map((e) => `${e.module.id}:${e.view.active}`).join("|");
  useEffect(() => {
    if (!peekId || autoPeek.current !== peekId) return;
    const entry = entries.find((e) => e.module.id === peekId);
    if (!entry || !entry.view.active) endPeek();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peekId, activeSignature]);

  return { peekId, peek, endPeek };
}
