import type {
  PermissionGuideAction,
  PermissionGuideId,
  PermissionGuideProgress,
  PermissionGuideState,
} from "../../types/permissionGuide";
import {
  advancePermissionGuide,
  reconcilePermissionGuide,
  startPermissionGuide,
  type PermissionGuideRow,
} from "./permissionGuideState";

export interface GuideAccess {
  granted: boolean;
  needsRelaunch?: boolean;
}

export interface GuidePermission extends PermissionGuideRow {
  needsRelaunch?: boolean;
  request: () => Promise<unknown>;
  check: () => Promise<GuideAccess>;
  verify?: () => Promise<GuideAccess>;
  openSettings: () => Promise<unknown>;
}

interface ControllerOptions {
  sessionId: string;
  rows: () => GuidePermission[];
  save: (progress: PermissionGuideProgress | null) => void;
  publish: (state: PermissionGuideState) => Promise<boolean>;
  close: () => void;
  restart: () => Promise<unknown>;
}

export function createPermissionGuideController(options: ControllerOptions): {
  start: (requested?: PermissionGuideId, saved?: PermissionGuideProgress) => Promise<void>;
  act: (action: PermissionGuideAction) => Promise<void>;
  refresh: () => Promise<void>;
  reconcile: () => Promise<void>;
  dispose: () => void;
} {
  let progress: PermissionGuideProgress | null = null;
  let busy = false;
  let checking = false;
  let error = false;
  let revision = 0;
  let access: GuideAccess | null = null;

  const rows = (): GuidePermission[] =>
    options
      .rows()
      .map((row) => (row.id === progress?.current && access ? { ...row, ...access } : row));

  const close = (): void => {
    revision++;
    progress = null;
    busy = false;
    access = null;
    options.save(null);
    options.close();
  };

  const publish = async (): Promise<void> => {
    if (!progress) return;
    const available = rows();
    const row = available.find((item) => item.id === progress.current);
    if (!row) return;
    const currentRevision = revision;
    const opened = await options.publish({
      sessionId: options.sessionId,
      permission: progress.current,
      position: available.indexOf(row) + 1,
      total: available.length,
      granted: row.granted,
      needsRelaunch: row.needsRelaunch ?? false,
      attempted: progress.attempted.includes(row.id),
      canGoBack: progress.history.some((id) => available.some((item) => item.id === id)),
      busy,
      error,
    });
    if (!opened && revision === currentRevision) close();
  };

  const move = async (next: PermissionGuideProgress | null): Promise<void> => {
    revision++;
    busy = false;
    error = false;
    access = null;
    progress = next;
    if (!next) {
      close();
      return;
    }
    options.save(next);
    await publish();
  };

  const reconcile = async (): Promise<void> => {
    const next = reconcilePermissionGuide(progress, rows());
    if (next !== progress) await move(next);
  };

  const refresh = async (): Promise<void> => {
    await reconcile();
    if (!progress || busy || checking || progress.current === "system-audio") return;
    const row = rows().find((item) => item.id === progress.current);
    if (!row) return;
    const currentRevision = revision;
    checking = true;
    try {
      const result = await row.check();
      if (revision !== currentRevision) return;
      access = result;
      await publish();
    } catch {
      if (revision === currentRevision) {
        error = true;
        await publish();
      }
    } finally {
      checking = false;
    }
  };

  const act = async (message: PermissionGuideAction): Promise<void> => {
    if (
      !progress ||
      message.sessionId !== options.sessionId ||
      message.permission !== progress.current
    )
      return;
    if (message.action === "close") {
      close();
      return;
    }
    if (busy) return;
    await reconcile();
    if (!progress || busy || message.permission !== progress.current) return;
    const row = rows().find((item) => item.id === progress.current);
    if (!row) return;
    if (["back", "next", "skip"].includes(message.action)) {
      const next = advancePermissionGuide(
        progress,
        rows(),
        message.action as "back" | "next" | "skip"
      );
      if (next !== progress) await move(next);
      return;
    }
    if (message.action === "restart" && !row.needsRelaunch) return;
    if (message.action === "check" && !row.granted && !progress.attempted.includes(row.id)) return;
    busy = true;
    error = false;
    const currentRevision = ++revision;
    if (message.action === "enable" || message.action === "check") {
      progress = { ...progress, attempted: [...new Set([...progress.attempted, row.id])] };
    }
    // Persist before native requests: macOS may quit and reopen the app to apply a grant.
    options.save(progress);
    try {
      await publish();
      if (revision !== currentRevision) return;
      switch (message.action) {
        case "enable":
          await row.request();
          break;
        case "settings":
          await row.openSettings();
          break;
        case "check": {
          const result = await (row.verify ?? row.check)();
          if (revision !== currentRevision) return;
          access = result;
          break;
        }
        case "restart":
          await options.restart();
          break;
      }
      if (revision !== currentRevision) return;
      if (message.action !== "check") {
        const result = await row.check();
        if (revision !== currentRevision) return;
        access = result;
      }
    } catch {
      if (revision === currentRevision) error = true;
    } finally {
      if (revision === currentRevision) {
        busy = false;
        await publish();
      }
    }
  };

  return {
    start: async (requested, saved): Promise<void> => {
      await move(
        saved
          ? reconcilePermissionGuide(saved, options.rows())
          : startPermissionGuide(options.rows(), requested)
      );
    },
    act,
    refresh,
    reconcile,
    dispose: (): void => {
      revision++;
      progress = null;
      busy = false;
    },
  };
}
