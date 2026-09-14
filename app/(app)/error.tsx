"use client";

import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-negative/40 bg-negative-soft px-6 py-10 text-center">
      <p className="text-sm font-semibold">Something went wrong loading this page.</p>
      <p className="max-w-lg text-xs text-muted">{error.message}</p>
      <Button size="sm" variant="secondary" onClick={reset}>Try again</Button>
    </div>
  );
}
