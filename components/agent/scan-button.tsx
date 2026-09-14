"use client";

import { useState, useTransition } from "react";
import { RefreshCw, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateBriefNow, triggerScanNow } from "@/app/(app)/agent/actions";
import { cn } from "@/lib/utils/cn";

export function ScanNowButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(async () => { const r = await triggerScanNow(); setMsg({ ok: r.ok, text: r.message }); })}>
        <RefreshCw className={cn(pending && "animate-spin")} /> Run scan now
      </Button>
      {msg ? <p className={cn("max-w-xs text-right text-[11px]", msg.ok ? "text-positive" : "text-negative")}>{msg.text}</p> : null}
    </div>
  );
}

export function GenerateBriefButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(async () => { const r = await generateBriefNow(); setMsg({ ok: r.ok, text: r.message }); })}>
        <FileText /> Generate today&apos;s brief
      </Button>
      {msg ? <p className={cn("max-w-xs text-right text-[11px]", msg.ok ? "text-positive" : "text-negative")}>{msg.text}</p> : null}
    </div>
  );
}
