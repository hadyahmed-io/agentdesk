import React from "react";
import {
  AlertTriangle,
  Ban,
  Bot,
  CheckCircle2,
  Clock,
  Cpu,
  Flame,
  Loader2,
  PlayCircle,
  ShieldAlert,
  ShieldCheck,
  TimerOff,
  XCircle,
} from "lucide-react";
import {
  RUN_STATUS_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
} from "../lib/utils";
import type { AgentRunStatus, TaskPriority, TaskStatus } from "../types/api";

export function RunStatusBadge({
  status,
  size = "sm",
}: {
  status: AgentRunStatus | null | undefined;
  size?: "xs" | "sm";
}) {
  if (!status) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-zinc-800/70 px-2 py-0.5 text-xs text-zinc-400 border border-zinc-700/60">
        No runs
      </span>
    );
  }

  const sizeCls = size === "xs" ? "px-1.5 py-0.5 text-[11px]" : "px-2.5 py-0.5 text-xs";

  const styles: Record<
    AgentRunStatus,
    { cls: string; icon: React.ReactNode }
  > = {
    queued: {
      cls: "bg-amber-500/10 text-amber-300 border-amber-500/30",
      icon: <Clock className="w-3.5 h-3.5 text-amber-400" />,
    },
    starting: {
      cls: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
      icon: <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin" />,
    },
    running: {
      cls: "bg-indigo-500/15 text-indigo-300 border-indigo-500/40",
      icon: <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin" />,
    },
    completed: {
      cls: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
      icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />,
    },
    failed: {
      cls: "bg-rose-500/10 text-rose-300 border-rose-500/30",
      icon: <XCircle className="w-3.5 h-3.5 text-rose-400" />,
    },
    cancelled: {
      cls: "bg-zinc-800/80 text-zinc-300 border-zinc-700",
      icon: <Ban className="w-3.5 h-3.5 text-zinc-400" />,
    },
    timed_out: {
      cls: "bg-rose-500/10 text-rose-300 border-rose-500/30",
      icon: <TimerOff className="w-3.5 h-3.5 text-rose-400" />,
    },
  };

  const current = styles[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md font-medium border ${sizeCls} ${current.cls}`}
    >
      {current.icon}
      <span>{RUN_STATUS_LABELS[status]}</span>
    </span>
  );
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const styles: Record<TaskStatus, { cls: string; icon: React.ReactNode }> = {
    backlog: {
      cls: "bg-zinc-800/80 text-zinc-300 border-zinc-700",
      icon: <Clock className="w-3 h-3 text-zinc-400" />,
    },
    todo: {
      cls: "bg-amber-500/10 text-amber-300 border-amber-500/30",
      icon: <Clock className="w-3 h-3 text-amber-400" />,
    },
    in_progress: {
      cls: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
      icon: <PlayCircle className="w-3 h-3 text-indigo-400" />,
    },
    in_review: {
      cls: "bg-amber-500/15 text-amber-300 border-amber-500/30",
      icon: <AlertTriangle className="w-3 h-3 text-amber-400" />,
    },
    done: {
      cls: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
      icon: <CheckCircle2 className="w-3 h-3 text-emerald-400" />,
    },
    cancelled: {
      cls: "bg-zinc-800/70 text-zinc-400 border-zinc-700/70",
      icon: <Ban className="w-3 h-3 text-zinc-500" />,
    },
  };

  const current = styles[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium border ${current.cls}`}
    >
      {current.icon}
      <span>{TASK_STATUS_LABELS[status]}</span>
    </span>
  );
}

export function TaskPriorityBadge({ priority }: { priority: TaskPriority }) {
  const styles: Record<TaskPriority, { cls: string; icon?: React.ReactNode }> = {
    low: {
      cls: "bg-zinc-800/70 text-zinc-300 border-zinc-700",
    },
    medium: {
      cls: "bg-indigo-500/10 text-indigo-300 border-indigo-500/25",
    },
    high: {
      cls: "bg-amber-500/10 text-amber-300 border-amber-500/30",
    },
    urgent: {
      cls: "bg-rose-500/15 text-rose-300 border-rose-500/35",
      icon: <Flame className="w-3 h-3 text-rose-400" />,
    },
  };

  const current = styles[priority];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium border ${current.cls}`}
    >
      {current.icon}
      <span>{TASK_PRIORITY_LABELS[priority]}</span>
    </span>
  );
}

export function ExecutionModeBadge({
  isSimulated,
  mode,
}: {
  isSimulated: boolean;
  mode?: "demo" | "local";
}) {
  if (isSimulated || mode === "demo") {
    return (
      <span
        title="Simulated demonstration execution — no real files or repositories are modified"
        className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-300 border border-amber-500/30"
      >
        <Bot className="w-3 h-3 text-amber-400" />
        <span>Simulated Demo</span>
      </span>
    );
  }

  return (
    <span
      title="Genuine local CLI child_process execution inside verified workspace"
      className="inline-flex items-center gap-1 rounded-md bg-indigo-500/15 px-2 py-0.5 text-[11px] font-medium text-indigo-300 border border-indigo-500/30"
    >
      <Cpu className="w-3 h-3 text-indigo-400" />
      <span>Local CLI Process</span>
    </span>
  );
}

export function ProviderVerificationBadge({
  isVerified,
  enabled,
}: {
  isVerified: boolean;
  enabled: boolean;
}) {
  if (!enabled) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-400 border border-zinc-700">
        <Ban className="w-3 h-3" />
        <span>Disabled</span>
      </span>
    );
  }

  if (isVerified) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-300 border border-emerald-500/30">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
        <span>Verified</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-300 border border-amber-500/30">
      <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
      <span>Unverified</span>
    </span>
  );
}
