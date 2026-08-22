import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { Sidebar } from "@/components/app-shell/sidebar";
import { Topbar } from "@/components/app-shell/topbar";
import { ChatWidget } from "@/components/chat-widget";
import { getLogoUrl } from "@/lib/branding";
import { Footer } from "@/components/app-shell/footer";
import { UpdateNotice } from "@/components/app-shell/update-notice";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  const logoUrl = getLogoUrl();

  return (
    <div className="flex min-h-screen">
      <Sidebar isAdmin={user.role === "admin"} logoUrl={logoUrl} />
      {/* min-w-0 overrides flexbox's default min-width:auto, which would
          otherwise force this column as wide as its widest descendant (e.g.
          a table) instead of letting inner overflow-x-auto wrappers scroll
          locally - without it, any wide content blows out the whole page's
          width on narrow viewports. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Suspense fallback={<div className="h-16 border-b border-border bg-surface" />}>
          <Topbar user={user} isAdmin={user.role === "admin"} logoUrl={logoUrl} />
        </Suspense>
        {/* pb-24 reserves space for the floating ChatWidget button (fixed
            bottom-4 right-4) so it never sits on top of page content like a
            list's pagination controls. */}
        <main className="min-w-0 flex-1 bg-background p-6 pb-24 md:p-8 md:pb-24">{children}</main>
        <Footer />
      </div>
      <ChatWidget logoUrl={logoUrl} />
      <UpdateNotice isAdmin={user.role === "admin"} />
    </div>
  );
}
