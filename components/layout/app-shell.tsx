import { Brand } from "./brand";
import { SidebarNav } from "./sidebar-nav";
import { Topbar, type TopbarProps } from "./topbar";

export function AppShell({ children, topbar }: { children: React.ReactNode; topbar: TopbarProps }) {
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-border bg-surface lg:flex">
        <div className="border-b border-border px-3 py-3">
          <Brand />
        </div>
        <SidebarNav />
        <div className="border-t border-border px-4 py-3 text-[10px] leading-relaxed text-muted-2">
          <span className="block font-medium text-muted">The AI Operating System for B2B Marketing</span>
          Stop optimizing for clicks. Start optimizing for pipeline.
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar {...topbar} />
        <main className="flex-1 px-4 py-5 lg:px-6 lg:py-6">{children}</main>
      </div>
    </div>
  );
}
