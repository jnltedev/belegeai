import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { ThemeProvider } from "@/components/theme-provider";
import { getLogoUrl } from "@/lib/branding";
import { LocaleProvider } from "@/lib/i18n/client";
import { resolveLocale } from "@/lib/i18n/resolve-locale";
import { translate } from "@/lib/i18n/dictionaries";
import "./globals.css";

// Locale-dependent (title/description switch with the resolved language),
// so this needs generateMetadata rather than a static `metadata` export.
export async function generateMetadata(): Promise<Metadata> {
  const locale = await resolveLocale();
  return {
    title: translate(locale, "app.title"),
    description: translate(locale, "app.description"),
  };
}

const themeInitScript = `
(function() {
  try {
    var stored = window.localStorage.getItem('belegeai-theme');
    var theme = stored === 'light' || stored === 'dark' ? stored : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    if (theme === 'dark') document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const logoUrl = getLogoUrl();
  const locale = await resolveLocale();

  return (
    <html lang={locale} suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <head>
        {logoUrl && <link rel="icon" href={logoUrl} type={logoUrl.endsWith(".svg") ? "image/svg+xml" : "image/png"} />}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen font-sans antialiased">
        <LocaleProvider locale={locale}>
          <ThemeProvider>{children}</ThemeProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
