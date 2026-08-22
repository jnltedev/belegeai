import { Archive } from "lucide-react";
import { NavLinks } from "./nav-items";

export function Sidebar({ isAdmin, logoUrl }: { isAdmin: boolean; logoUrl: string | null }) {
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col overflow-y-auto border-r border-border bg-surface-2 md:flex">
      <div className="flex h-16 items-center gap-2.5 px-5">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="Logo" className="h-8 w-8 rounded-lg object-contain" />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Archive className="h-4.5 w-4.5" strokeWidth={2.25} />
          </div>
        )}
        <span className="text-sm font-semibold tracking-tight">Belege-Archiv</span>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-3 py-2">
        <NavLinks isAdmin={isAdmin} />
      </nav>
    </aside>
  );
}
