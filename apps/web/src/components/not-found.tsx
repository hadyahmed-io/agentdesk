import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, TerminalSquare } from "lucide-react";

export function NotFoundPage() {
  return (
    <div className="py-20 flex flex-col items-center justify-center text-center space-y-4">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400">
        <TerminalSquare className="w-6 h-6" />
      </div>
      <div className="space-y-1">
        <p className="text-xs font-mono uppercase tracking-wider text-indigo-400">
          404 — Route Not Found
        </p>
        <h1 className="text-xl font-bold text-zinc-100">
          This workspace route does not exist
        </h1>
        <p className="text-xs text-zinc-400 max-w-md">
          The page you requested could not be found in AgentDesk. Use the button below to return to the workspace overview.
        </p>
      </div>
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-500 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Return to Dashboard</span>
      </Link>
    </div>
  );
}
