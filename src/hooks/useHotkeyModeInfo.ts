import { useEffect, useMemo, useState } from "react";
import logger from "../utils/logger";

export interface HyprlandConfigStatus {
  canWrite: boolean;
  path: string;
}

export interface HotkeyModeInfo {
  isUsingNativeShortcut: boolean;
  isUsingHyprland: boolean;
  supportsPushToTalk: boolean;
  pushToTalkUnavailableReason: string | null;
  hyprlandConfigStatus: HyprlandConfigStatus | null;
  /** False until main has answered; the defaults above are optimistic placeholders. */
  loaded: boolean;
}

const DEFAULT_INFO: HotkeyModeInfo = {
  isUsingNativeShortcut: false,
  isUsingHyprland: false,
  supportsPushToTalk: true,
  pushToTalkUnavailableReason: null,
  hyprlandConfigStatus: null,
  loaded: false,
};

/**
 * Resolves how a slot's hotkey is registered for the current session
 * (native shortcut, Hyprland) and, on Hyprland, whether its config is
 * persistable. `scope` tags log output for the calling surface; `slot`
 * defaults to dictation.
 */
export function useHotkeyModeInfo(
  scope: string,
  hotkey?: string,
  slot?: "dictation" | "voiceAgent" | "translation"
): HotkeyModeInfo {
  const request = useMemo(() => ({ scope, hotkey, slot }), [scope, hotkey, slot]);
  const [resolved, setResolved] = useState<{
    request: typeof request;
    info: HotkeyModeInfo;
  } | null>(null);

  useEffect(() => {
    const { scope, hotkey, slot } = request;
    let cancelled = false;
    const checkHotkeyMode = async () => {
      try {
        const info = await window.electronAPI?.getHotkeyModeInfo?.(hotkey, slot);
        if (!info || cancelled) return;
        const hyprlandConfigStatus = info.isUsingHyprland
          ? ((await window.electronAPI?.getHyprlandConfigStatus?.()) ?? null)
          : null;
        if (cancelled) return;
        setResolved({
          request,
          info: {
            isUsingNativeShortcut: info.isUsingNativeShortcut,
            isUsingHyprland: info.isUsingHyprland,
            supportsPushToTalk: info.supportsPushToTalk,
            pushToTalkUnavailableReason: info.pushToTalkUnavailableReason,
            hyprlandConfigStatus,
            loaded: true,
          },
        });
      } catch (error) {
        logger.error("Failed to check hotkey mode", { error }, scope);
      }
    };
    checkHotkeyMode();
    return () => {
      cancelled = true;
    };
  }, [request]);

  // Keep backend/editor limits stable while a new key is checked, but never
  // present the previous key's capability as a completed check for this one.
  return {
    ...(resolved?.info ?? DEFAULT_INFO),
    loaded: resolved?.request === request,
  };
}
