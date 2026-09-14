import { useEffect, useState, type CSSProperties, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, CircleCheck, X } from "../icons";
import type { PermissionGuideAction, PermissionGuideState } from "../../types/permissionGuide";

interface CardProps {
  state: PermissionGuideState;
  onAction: (action: PermissionGuideAction["action"]) => void;
  onDrag: () => void;
}

export function PermissionGuideCard({ state, onAction, onDrag }: CardProps): ReactElement {
  const { t } = useTranslation();
  const titles = {
    microphone: t("onboarding.permissions.microphoneTitle"),
    accessibility: t("onboarding.permissions.accessibilityTitle"),
    "system-audio": t("onboarding.rehaul.permissions.systemAudioTitle"),
    "screen-context": t("dictationAgent.screenContext.title"),
  };
  const descriptions = {
    microphone: t("onboarding.rehaul.permissions.microphoneDescription"),
    accessibility: t("onboarding.rehaul.permissions.accessibilityDescription"),
    "system-audio": t("onboarding.rehaul.permissions.systemAudioDescription"),
    "screen-context": t("onboarding.rehaul.permissions.screenContextDescription"),
  };
  const instructions = {
    microphone: t("onboarding.permissionGuide.microphone"),
    accessibility: t("onboarding.permissionGuide.accessibility"),
    "system-audio": t("onboarding.permissionGuide.systemAudio"),
    "screen-context": t("onboarding.permissionGuide.screenContext"),
  };
  const button =
    "onboarding-pressable rounded-full px-3 py-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--onboarding-accent)] disabled:opacity-45";
  const optional = state.permission !== "microphone";
  const dragStep = state.permission === "accessibility" || state.permission === "screen-context";

  return (
    <section
      className="onboarding-canvas flex h-screen flex-col overflow-hidden rounded-3xl border border-[var(--onboarding-control-border)] bg-[var(--onboarding-surface)] text-[var(--onboarding-text-primary)]"
      aria-label={titles[state.permission]}
    >
      <header
        className="flex shrink-0 items-center justify-between px-5 pb-3 pt-4"
        style={{ WebkitAppRegion: "drag" } as CSSProperties}
      >
        <span className="text-xs font-medium">
          OpenWhispr{" "}
          <span className="ms-2 font-normal text-[var(--onboarding-text-secondary)]">
            {t("onboarding.permissionGuide.progress", {
              current: state.position,
              total: state.total,
            })}
          </span>
        </span>
        <button
          type="button"
          className={button}
          style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
          onClick={() => onAction("close")}
          aria-label={t("onboarding.permissionGuide.return")}
        >
          <X className="size-4" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5" aria-live="polite">
        <div className="flex items-center gap-2">
          <h1 className="text-xl! font-semibold tracking-tight">{titles[state.permission]}</h1>
          {optional && (
            <span className="rounded-full bg-[var(--onboarding-surface-tertiary)] px-2 py-1 text-[10px] text-[var(--onboarding-text-secondary)]">
              {t("onboarding.permissions.optional")}
            </span>
          )}
        </div>
        <p className="mt-2 text-sm leading-5 text-[var(--onboarding-text-secondary)]">
          {descriptions[state.permission]}
        </p>
        {state.granted ? (
          <div className="mt-4 flex items-start gap-2 rounded-2xl bg-[var(--onboarding-surface-secondary)] p-3 text-sm">
            <CircleCheck className="mt-0.5 size-4 shrink-0 text-[var(--onboarding-accent)]" />
            <p>
              {state.needsRelaunch
                ? t("onboarding.permissionGuide.restartRequired")
                : t("onboarding.rehaul.permissions.enabled")}
            </p>
          </div>
        ) : (
          state.attempted && (
            <div className="mt-3 rounded-2xl bg-[var(--onboarding-surface-secondary)] p-3">
              <p className="text-xs leading-5">{instructions[state.permission]}</p>
              {dragStep && (
                <>
                  {state.canDrag && (
                    <div
                      draggable
                      onDragStart={(event) => {
                        event.preventDefault();
                        onDrag();
                      }}
                      className="mt-2 flex cursor-grab items-center gap-3 rounded-xl border border-[var(--onboarding-control-border)] bg-[var(--onboarding-surface)] px-3 py-2 active:cursor-grabbing"
                    >
                      {state.appIcon && (
                        <img src={state.appIcon} alt="" draggable={false} className="size-8" />
                      )}
                      <div>
                        <p className="text-sm font-medium">OpenWhispr</p>
                        <p className="text-xs text-[var(--onboarding-text-secondary)]">
                          {t("onboarding.permissionGuide.drag")}
                        </p>
                      </div>
                    </div>
                  )}
                  <p className="mt-2 text-xs leading-4 text-[var(--onboarding-text-secondary)]">
                    {t("onboarding.permissionGuide.missingApp")}
                  </p>
                </>
              )}
            </div>
          )
        )}
        {state.error && (
          <p role="alert" className="mt-2 text-xs leading-4 text-warning">
            {t("onboarding.permissionGuide.failed")}
          </p>
        )}
      </div>
      <footer className="shrink-0 px-4 pb-3 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            className={`${button} inline-flex items-center gap-1`}
            disabled={!state.canGoBack || state.busy}
            onClick={() => onAction("back")}
          >
            <ArrowLeft className="size-3 rtl:rotate-180" />
            {t("common.back")}
          </button>
          <div className="flex flex-wrap items-center justify-end gap-1">
            {state.granted && state.permission === "system-audio" && (
              <button
                type="button"
                className={button}
                disabled={state.busy}
                onClick={() => onAction("check")}
              >
                {t("onboarding.permissionGuide.check")}
              </button>
            )}
            {optional && !state.granted && (
              <button
                type="button"
                className={button}
                disabled={state.busy}
                onClick={() => onAction("skip")}
              >
                {t("common.skip")}
              </button>
            )}
            {!state.granted && state.attempted && (
              <button
                type="button"
                className={button}
                disabled={state.busy}
                onClick={() => onAction("settings")}
              >
                {t("onboarding.permissionGuide.settings")}
              </button>
            )}
            {state.granted && state.needsRelaunch && (
              <button
                type="button"
                className={button}
                disabled={state.busy}
                onClick={() => onAction("next")}
              >
                {t("onboarding.permissionGuide.later")}
              </button>
            )}
            <button
              type="button"
              className={`${button} bg-[var(--onboarding-accent)] text-white`}
              disabled={state.busy}
              onClick={() =>
                onAction(
                  state.granted
                    ? state.needsRelaunch
                      ? "restart"
                      : "next"
                    : state.attempted
                      ? "check"
                      : "enable"
                )
              }
            >
              {state.busy
                ? t("common.loading")
                : state.granted
                  ? state.needsRelaunch
                    ? t("onboarding.permissionGuide.restart")
                    : t("common.next")
                  : state.attempted
                    ? t("onboarding.permissionGuide.check")
                    : t("onboarding.rehaul.permissions.enable")}
            </button>
          </div>
        </div>
        <button
          type="button"
          className={`${button} mt-1 w-full text-[var(--onboarding-text-secondary)]`}
          onClick={() => onAction("close")}
        >
          {t("onboarding.permissionGuide.return")}
        </button>
      </footer>
    </section>
  );
}

export function PermissionGuideOverlay(): ReactElement | null {
  const [state, setState] = useState<PermissionGuideState | null>(null);
  useEffect(() => {
    let disposed = false;
    let received = false;
    const unsubscribe = window.electronAPI.onPermissionGuideState?.((next) => {
      received = true;
      setState(next);
    });
    void window.electronAPI.getPermissionGuideState?.().then((initial) => {
      if (!disposed && !received && initial) setState(initial);
    });
    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (!state) return;
    const keydown = (event: KeyboardEvent): void => {
      if (event.key === "Escape")
        window.electronAPI.permissionGuideAction?.({
          sessionId: state.sessionId,
          permission: state.permission,
          action: "close",
        });
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [state]);

  if (!state) return null;
  const target = { sessionId: state.sessionId, permission: state.permission };
  return (
    <PermissionGuideCard
      state={state}
      onAction={(action) => window.electronAPI.permissionGuideAction?.({ ...target, action })}
      onDrag={() => window.electronAPI.startPermissionGuideDrag?.(target)}
    />
  );
}
