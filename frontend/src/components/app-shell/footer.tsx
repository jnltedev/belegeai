const COPYRIGHT_FROM = 2020;
const AUTHOR = "Justin Nolte";
const AUTHOR_URL = "https://jnlte.de";
const GITHUB_URL = "https://github.com/jnltedev";

/// Inline rather than from lucide: brand marks were removed from that icon
/// set, and GitHub's own mark is the one thing here that has to look right.
function GithubMark() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

/// Rendered on the server, so the closing year comes from the machine's clock
/// rather than the visitor's - a footer that reads differently depending on
/// who is looking would be odd.
export function Footer() {
  const year = new Date().getFullYear();
  const range = year > COPYRIGHT_FROM ? `${COPYRIGHT_FROM} - ${year}` : String(COPYRIGHT_FROM);

  return (
    <footer className="mt-auto border-t border-border px-6 py-4">
      <div className="mx-auto flex max-w-5xl items-center justify-center gap-3 text-xs text-muted">
        <span>
          © {range}{" "}
          <a
            href={AUTHOR_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="font-medium text-foreground hover:text-accent hover:underline"
          >
            {AUTHOR}
          </a>
        </span>
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noreferrer noopener"
          aria-label="GitHub"
          className="text-muted transition-colors hover:text-foreground"
        >
          <GithubMark />
        </a>
      </div>
    </footer>
  );
}
