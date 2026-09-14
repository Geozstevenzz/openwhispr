import type { PermissionGuideId, PermissionGuideProgress } from "../../types/permissionGuide";

export const PERMISSION_GUIDE_ORDER: PermissionGuideId[] = [
  "microphone",
  "accessibility",
  "system-audio",
  "screen-context",
];

export interface PermissionGuideRow {
  id: PermissionGuideId;
  granted: boolean;
}

export function isPermissionGuideId(value: unknown): value is PermissionGuideId {
  return PERMISSION_GUIDE_ORDER.some((id) => id === value);
}

export function parsePermissionGuideProgress(value: unknown): PermissionGuideProgress | null {
  if (!value || typeof value !== "object") return null;
  const progress = value as Partial<PermissionGuideProgress>;
  if (!isPermissionGuideId(progress.current)) return null;
  const validList = (list: unknown): list is PermissionGuideId[] =>
    Array.isArray(list) && list.length <= 4 && list.every(isPermissionGuideId);
  if (
    !validList(progress.history) ||
    !validList(progress.skipped) ||
    !validList(progress.attempted)
  )
    return null;
  return {
    current: progress.current,
    history: progress.history,
    skipped: progress.skipped,
    attempted: progress.attempted,
  };
}

export function startPermissionGuide(
  rows: PermissionGuideRow[],
  requested?: PermissionGuideId
): PermissionGuideProgress | null {
  const current =
    rows.find((row) => row.id === requested)?.id ?? rows.find((row) => !row.granted)?.id;
  return current ? { current, history: [], skipped: [], attempted: [] } : null;
}

export function advancePermissionGuide(
  progress: PermissionGuideProgress,
  rows: PermissionGuideRow[],
  action: "back" | "next" | "skip"
): PermissionGuideProgress | null {
  if (action === "back") {
    const history = progress.history.filter((id) => rows.some((row) => row.id === id));
    const current = history.pop();
    return current
      ? { ...progress, current, history, skipped: progress.skipped.filter((id) => id !== current) }
      : progress;
  }
  const current = rows.find((row) => row.id === progress.current);
  if (
    current &&
    ((action === "skip" && current.id === "microphone") || (action === "next" && !current.granted))
  )
    return progress;
  const skipped =
    action === "skip" ? [...new Set([...progress.skipped, progress.current])] : progress.skipped;
  const index = PERMISSION_GUIDE_ORDER.indexOf(progress.current);
  const next = rows.find(
    (row) =>
      PERMISSION_GUIDE_ORDER.indexOf(row.id) > index && !row.granted && !skipped.includes(row.id)
  );
  return next
    ? { ...progress, current: next.id, skipped, history: [...progress.history, progress.current] }
    : null;
}

export function reconcilePermissionGuide(
  progress: PermissionGuideProgress | null,
  rows: PermissionGuideRow[]
): PermissionGuideProgress | null {
  if (!progress || rows.some((row) => row.id === progress.current)) return progress;
  return advancePermissionGuide(progress, rows, "next");
}
