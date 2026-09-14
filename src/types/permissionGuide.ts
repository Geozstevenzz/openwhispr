export type PermissionGuideId = "microphone" | "accessibility" | "system-audio" | "screen-context";

export interface PermissionGuideProgress {
  current: PermissionGuideId;
  history: PermissionGuideId[];
  skipped: PermissionGuideId[];
  attempted: PermissionGuideId[];
}

export interface PermissionGuideState {
  sessionId: string;
  permission: PermissionGuideId;
  position: number;
  total: number;
  granted: boolean;
  needsRelaunch: boolean;
  busy: boolean;
  attempted: boolean;
  canGoBack: boolean;
  error: boolean;
  canDrag?: boolean;
  appIcon?: string;
}

export interface PermissionGuideAction {
  sessionId: string;
  permission: PermissionGuideId;
  action: "enable" | "check" | "settings" | "back" | "next" | "skip" | "close" | "restart";
}
