import Link from "next/link";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5 px-1">
      <span className="flex size-7 items-center justify-center rounded-md bg-accent text-accent-fg">
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 18 L11 5 L14 12 L17 8 L20 18" />
          <path d="M4 18 H20" />
        </svg>
      </span>
      {!compact ? (
        <span className="leading-tight">
          <span className="block text-[13px] font-semibold tracking-tight">AdPilot AI</span>
          <span className="block text-[10px] text-muted">for SketchDeck.ai</span>
        </span>
      ) : null}
    </Link>
  );
}
