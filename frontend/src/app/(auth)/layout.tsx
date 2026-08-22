import { Archive } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { getLogoUrl } from "@/lib/branding";
import { Footer } from "@/components/app-shell/footer";
import { resolveLocale } from "@/lib/i18n/resolve-locale";
import { translate } from "@/lib/i18n/dictionaries";

// Login/register have no dynamic data dependency of their own, so Next
// would otherwise statically prerender them at build time - freezing
// getLogoUrl()'s result to whatever LOGO_FILENAME was set during `next
// build` instead of reading it fresh per request. Force dynamic rendering
// so a docker-compose restart with a new value takes effect immediately,
// same as everywhere else this env var is read.
export const dynamic = "force-dynamic";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const logoUrl = getLogoUrl();
  const locale = await resolveLocale();

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="absolute right-6 top-6">
        <ThemeToggle />
      </div>
      <div className="mb-8 flex items-center gap-2.5">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="Logo" className="h-9 w-9 rounded-lg object-contain" />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Archive className="h-5 w-5" strokeWidth={2.25} />
          </div>
        )}
        <span className="text-lg font-semibold tracking-tight">{translate(locale, "authLayout.brand")}</span>
      </div>
      {children}
      <div className="absolute bottom-0 left-0 right-0">
        <Footer />
      </div>
    </div>
  );
}
