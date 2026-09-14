import { WindowSelect } from "./window-select";

export function PageHeader({ title, subtitle, windowKey, right, children }: { title: string; subtitle?: string; windowKey?: string; right?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-sm text-muted">{subtitle}</p> : null}
        {children}
      </div>
      <div className="flex items-center gap-2">
        {right}
        {windowKey ? <WindowSelect current={windowKey} /> : null}
      </div>
    </div>
  );
}
