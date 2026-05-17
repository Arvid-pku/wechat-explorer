"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Circle,
  AlertCircle,
  Loader2,
  ExternalLink,
  PlayCircle,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { t, type Locale, type TKey } from "@/lib/i18n";

interface OnboardingState {
  brew: boolean;
  wxCli: boolean;
  wechatApp: boolean;
  wechatResigned: boolean | "unknown";
  wechatRunning: boolean;
  wxKeys: boolean;
  indexed: boolean;
  nextStep: string | null;
}

type StepStatus = "pending" | "running" | "done" | "error" | "manual";

interface Step {
  id: string;
  /** Translation key for the step title. */
  titleKey: TKey;
  /** Translation key for the body / explanation. */
  bodyKey: TKey;
  /** Returns true when the prerequisite is satisfied. */
  isDone: (s: OnboardingState) => boolean;
  /** Returns true when this step cannot proceed yet (gating fact). */
  isBlocked?: (s: OnboardingState) => boolean;
  /** API action name — null = pure-manual step (e.g. "log into WeChat"). */
  action: string | null;
  /** Optional external link the user can open if our automation can't help. */
  externalUrl?: string;
  externalLabelKey?: TKey;
  /** Optional caveats (sudo, must quit WeChat, etc.). */
  caveatKey?: TKey;
}

const STEPS: Step[] = [
  {
    id: "brew",
    titleKey: "onboarding.step.brewTitle",
    bodyKey: "onboarding.step.brewBody",
    isDone: (s) => s.brew,
    action: null,
    externalUrl: "https://brew.sh",
    externalLabelKey: "onboarding.step.brewLink",
  },
  {
    id: "wxCli",
    titleKey: "onboarding.step.wxCliTitle",
    bodyKey: "onboarding.step.wxCliBody",
    isDone: (s) => s.wxCli,
    isBlocked: (s) => !s.brew,
    action: "install-wx-cli",
  },
  {
    id: "wechatApp",
    titleKey: "onboarding.step.wechatAppTitle",
    bodyKey: "onboarding.step.wechatAppBody",
    isDone: (s) => s.wechatApp,
    action: null,
    externalUrl: "https://www.wechat.com/en/",
    externalLabelKey: "onboarding.step.wechatAppLink",
  },
  {
    id: "wechatResigned",
    titleKey: "onboarding.step.resignTitle",
    bodyKey: "onboarding.step.resignBody",
    isDone: (s) => s.wechatResigned === true,
    isBlocked: (s) => !s.wechatApp,
    action: "resign-wechat",
    caveatKey: "onboarding.step.resignCaveat",
  },
  {
    id: "wxKeys",
    titleKey: "onboarding.step.initTitle",
    bodyKey: "onboarding.step.initBody",
    isDone: (s) => s.wxKeys,
    isBlocked: (s) => !s.wxCli || !s.wechatApp || s.wechatResigned === false,
    action: "init-wx",
    caveatKey: "onboarding.step.initCaveat",
  },
];

function stepStatus(step: Step, state: OnboardingState, running: string | null): StepStatus {
  if (step.isDone(state)) return "done";
  if (running === step.id) return "running";
  if (step.isBlocked?.(state)) return "pending";
  if (!step.action) return "manual";
  return "pending";
}

export function OnboardingClient({
  initialState,
  locale,
}: {
  initialState: OnboardingState;
  locale: Locale;
}) {
  const router = useRouter();
  const [state, setState] = useState(initialState);
  const [running, setRunning] = useState<string | null>(null);
  const [logs, setLogs] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const logTailRef = useRef<HTMLDivElement | null>(null);
  const tr = useCallback((k: TKey) => t(k, locale), [locale]);

  // Periodic re-check while not yet done — catches state changes the user
  // makes outside the app (e.g. opening WeChat after a re-sign).
  useEffect(() => {
    if (state.nextStep === null && state.indexed) return;
    const id = setInterval(refreshState, 4000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.nextStep, state.indexed]);

  async function refreshState() {
    try {
      const res = await fetch("/api/onboarding/state", { cache: "no-store" });
      if (res.ok) setState(await res.json());
    } catch {
      // ignore — we'll retry on the next tick
    }
  }

  async function runAction(stepId: string, action: string) {
    setRunning(stepId);
    setLogs((l) => ({ ...l, [stepId]: "" }));
    setErrors((e) => ({ ...e, [stepId]: "" }));

    const res = await fetch(`/api/onboarding/run?action=${encodeURIComponent(action)}`, {
      method: "POST",
    });
    if (!res.ok || !res.body) {
      setErrors((e) => ({ ...e, [stepId]: `HTTP ${res.status}` }));
      setRunning(null);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      // SSE events are `data: <json>\n\n` — parse line by line.
      let idx;
      while ((idx = buf.indexOf("\n\n")) !== -1) {
        const block = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 2);
        if (!block.startsWith("data:")) continue;
        try {
          const evt = JSON.parse(block.slice(5).trim()) as {
            stage: string;
            chunk?: string;
            message?: string;
            code?: number | null;
            userCancelled?: boolean;
          };
          if (evt.stage === "stdout" || evt.stage === "stderr") {
            setLogs((l) => ({
              ...l,
              [stepId]: (l[stepId] ?? "") + (evt.chunk ?? ""),
            }));
          } else if (evt.stage === "error") {
            setErrors((e) => ({ ...e, [stepId]: evt.message ?? "spawn failed" }));
          } else if (evt.stage === "done") {
            if (evt.code !== 0) {
              setErrors((e) => ({
                ...e,
                [stepId]: evt.userCancelled
                  ? tr("onboarding.userCancelled")
                  : tr("onboarding.exited") + ` ${evt.code}`,
              }));
            }
          }
        } catch {
          // skip malformed
        }
      }
    }
    setRunning(null);
    // Re-check state — the action probably moved us forward.
    await refreshState();
  }

  const allReady = state.nextStep === null;
  return (
    <div className="space-y-4">
      <ol className="space-y-3">
        {STEPS.map((step) => {
          const status = stepStatus(step, state, running);
          const isNext = state.nextStep === step.id && status !== "running";
          const log = logs[step.id];
          const err = errors[step.id];

          return (
            <li key={step.id}>
              <Card
                className={
                  status === "done"
                    ? "border-emerald-500/30 bg-emerald-50/30 dark:bg-emerald-900/10"
                    : isNext
                      ? "border-primary/40"
                      : ""
                }
              >
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    {status === "done" ? (
                      <CheckCircle2 className="size-4 text-emerald-600" />
                    ) : status === "running" ? (
                      <Loader2 className="size-4 text-primary animate-spin" />
                    ) : status === "error" ? (
                      <AlertCircle className="size-4 text-rose-600" />
                    ) : (
                      <Circle className="size-4 text-muted-foreground" />
                    )}
                    {tr(step.titleKey)}
                  </CardTitle>
                  <CardDescription>{tr(step.bodyKey)}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {step.caveatKey && status !== "done" && (
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      {tr(step.caveatKey)}
                    </p>
                  )}
                  {status !== "done" && (
                    <div className="flex items-center gap-2 flex-wrap">
                      {step.action && (
                        <Button
                          onClick={() => runAction(step.id, step.action!)}
                          disabled={!!running || step.isBlocked?.(state)}
                          size="sm"
                        >
                          {status === "running" ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <PlayCircle className="size-3.5" />
                          )}
                          {status === "running"
                            ? tr("onboarding.running")
                            : tr("onboarding.runIt")}
                        </Button>
                      )}
                      {step.externalUrl && (
                        <a
                          href={step.externalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
                        >
                          <ExternalLink className="size-3" />
                          {step.externalLabelKey
                            ? tr(step.externalLabelKey)
                            : tr("onboarding.openLink")}
                        </a>
                      )}
                    </div>
                  )}
                  {(log || err) && (
                    <div
                      ref={status === "running" ? logTailRef : undefined}
                      className="rounded-md bg-muted/60 px-3 py-2 font-mono text-[11px] whitespace-pre-wrap break-all max-h-40 overflow-auto"
                    >
                      {log}
                      {err && (
                        <div className="text-rose-600 dark:text-rose-400 mt-1">
                          {err}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ol>

      {allReady && !state.indexed && (
        <FirstIndexCard locale={locale} onDone={() => router.push("/")} />
      )}

      {allReady && state.indexed && (
        <Card className="border-emerald-500/40">
          <CardContent className="py-4 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="font-medium">{tr("onboarding.allDoneTitle")}</p>
              <p className="text-sm text-muted-foreground">
                {tr("onboarding.allDoneBody")}
              </p>
            </div>
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90"
            >
              {tr("onboarding.openApp")}
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function FirstIndexCard({
  locale,
  onDone,
}: {
  locale: Locale;
  onDone: () => void;
}) {
  const tr = useCallback((k: TKey) => t(k, locale), [locale]);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function runIndex() {
    setRunning(true);
    setLog("");
    setError(null);
    try {
      const res = await fetch(`/api/index/stream?mode=quick`, { method: "POST" });
      if (!res.ok || !res.body) {
        setError(`HTTP ${res.status}`);
        setRunning(false);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) !== -1) {
          const block = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 2);
          if (!block.startsWith("data:")) continue;
          try {
            const evt = JSON.parse(block.slice(5).trim()) as {
              stage: string;
              detail?: string;
              current?: number;
              total?: number;
            };
            setLog(
              (l) =>
                `${l}${evt.stage}${
                  evt.detail
                    ? `: ${evt.detail}`
                    : evt.current && evt.total
                      ? ` (${evt.current}/${evt.total})`
                      : ""
                }\n`,
            );
            if (evt.stage === "done") {
              setRunning(false);
              onDone();
            }
            if (evt.stage === "error") {
              setError(evt.detail ?? "Index failed");
              setRunning(false);
            }
          } catch {}
        }
      }
    } catch (err) {
      setError((err as Error).message);
      setRunning(false);
    }
  }

  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle>{tr("onboarding.firstIndexTitle")}</CardTitle>
        <CardDescription>{tr("onboarding.firstIndexBody")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button onClick={runIndex} disabled={running} size="sm">
          {running ? <Loader2 className="size-3.5 animate-spin" /> : <PlayCircle className="size-3.5" />}
          {running ? tr("onboarding.indexRunning") : tr("onboarding.runQuickIndex")}
        </Button>
        {log && (
          <div className="rounded-md bg-muted/60 px-3 py-2 font-mono text-[11px] whitespace-pre-wrap max-h-48 overflow-auto">
            {log}
          </div>
        )}
        {error && (
          <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
        )}
      </CardContent>
    </Card>
  );
}
