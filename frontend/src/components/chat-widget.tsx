"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, History, MessageCircle, Pencil, Plus, Send, Sparkles, Trash2, X } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useTranslation } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/locale";

interface ChatMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  sources?: { id: string; title: string }[];
}

interface ChatSession {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

// Which session was last active - a small convenience so reopening the
// widget resumes the same conversation without picking from the list again.
// The actual messages/sessions themselves live server-side (see
// /api/chat/sessions*), so this is the only chat-related thing left in
// localStorage, and the only thing logout needs to clear (see topbar.tsx).
export const ACTIVE_CHAT_SESSION_KEY = "belegeai-active-chat-session";

const DATE_LOCALES: Record<Locale, string> = { de: "de-DE", en: "en-GB" };

function formatSessionDate(iso: string, locale: Locale): string {
  return new Date(iso).toLocaleDateString(DATE_LOCALES[locale], { day: "2-digit", month: "2-digit", year: "2-digit" });
}

// Floating bottom-right widget, mounted once at the (app) layout level so it
// persists across client-side navigation and page reloads. Sessions and
// their messages are persisted server-side per user (see routes/chat/*),
// which is what makes them follow the account across devices - this
// component only ever holds the currently-open session's messages in memory.
export function ChatWidget({ logoUrl }: { logoUrl: string | null }) {
  const { t, locale } = useTranslation();
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<"chat" | "sessions">("chat");
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deletingSession, setDeletingSession] = useState<ChatSession | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      setActiveSessionId(localStorage.getItem(ACTIVE_CHAT_SESSION_KEY));
    } catch {
      // storage unavailable - just start with no active session
    }
  }, []);

  async function loadSessions() {
    try {
      const res = await api.get<{ sessions: ChatSession[] }>("/api/chat/sessions");
      setSessions(res.sessions);
      return res.sessions;
    } catch {
      return [];
    } finally {
      setSessionsLoaded(true);
    }
  }

  async function loadMessages(sessionId: string) {
    setMessagesLoading(true);
    try {
      const res = await api.get<{
        messages: { id: string; role: "user" | "assistant"; content: string; sources: { id: string; title: string }[] | null }[];
      }>(`/api/chat/sessions/${sessionId}/messages`);
      setMessages(res.messages.map((m) => ({ id: m.id, role: m.role, content: m.content, sources: m.sources ?? undefined })));
    } catch {
      setMessages([]);
    } finally {
      setMessagesLoading(false);
    }
  }

  // Only fetch once the widget is actually opened for the first time - no
  // point loading a session list nobody may ever look at.
  useEffect(() => {
    if (!open || sessionsLoaded) return;
    (async () => {
      const loaded = await loadSessions();
      if (activeSessionId && loaded.some((s) => s.id === activeSessionId)) {
        await loadMessages(activeSessionId);
      } else {
        setActiveSessionId(null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    try {
      if (activeSessionId) localStorage.setItem(ACTIVE_CHAT_SESSION_KEY, activeSessionId);
      else localStorage.removeItem(ACTIVE_CHAT_SESSION_KEY);
    } catch {
      // ignore
    }
  }, [activeSessionId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  useEffect(() => {
    if (open && panel === "chat") inputRef.current?.focus();
  }, [open, panel]);

  function openSession(session: ChatSession) {
    setActiveSessionId(session.id);
    setPanel("chat");
    setError(null);
    void loadMessages(session.id);
  }

  function startNewChat() {
    setActiveSessionId(null);
    setMessages([]);
    setError(null);
    setPanel("chat");
  }

  async function ensureSessionId(): Promise<string> {
    if (activeSessionId) return activeSessionId;
    const res = await api.post<{ session: ChatSession }>("/api/chat/sessions");
    setSessions((prev) => [res.session, ...prev]);
    setActiveSessionId(res.session.id);
    return res.session.id;
  }

  async function handleSend(e?: React.FormEvent) {
    e?.preventDefault();
    const question = input.trim();
    if (!question || sending) return;

    setInput("");
    setError(null);
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setSending(true);
    try {
      const sessionId = await ensureSessionId();
      const res = await api.post<{
        answer: string;
        sources: { id: string; title: string }[];
        sessionTitle?: string;
      }>("/api/chat/ask", { sessionId, question });
      setMessages((prev) => [...prev, { role: "assistant", content: res.answer, sources: res.sources }]);
      setSessions((prev) => {
        const updated = prev.map((s) =>
          s.id === sessionId
            ? { ...s, title: res.sessionTitle ?? s.title, updatedAt: new Date().toISOString() }
            : s,
        );
        // Bump the just-used session to the top, same ordering the backend
        // list endpoint returns (most recently active first).
        const touched = updated.find((s) => s.id === sessionId);
        return touched ? [touched, ...updated.filter((s) => s.id !== sessionId)] : updated;
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("chatWidget.errorGeneric"));
    } finally {
      setSending(false);
    }
  }

  function startRename(session: ChatSession) {
    setRenamingId(session.id);
    setRenameValue(session.title ?? "");
  }

  async function saveRename(session: ChatSession) {
    const title = renameValue.trim();
    setRenamingId(null);
    if (!title || title === session.title) return;
    try {
      const res = await api.patch<{ session: ChatSession }>(`/api/chat/sessions/${session.id}`, { title });
      setSessions((prev) => prev.map((s) => (s.id === session.id ? res.session : s)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("chatWidget.renameError"));
    }
  }

  async function handleDeleteSession() {
    if (!deletingSession) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/api/chat/sessions/${deletingSession.id}`);
      setSessions((prev) => prev.filter((s) => s.id !== deletingSession.id));
      if (activeSessionId === deletingSession.id) {
        setActiveSessionId(null);
        setMessages([]);
      }
      setDeletingSession(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("chatWidget.deleteError"));
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-3">
      {open && (
        <div className="flex h-[32rem] max-h-[calc(100vh-6rem)] w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-card border border-border bg-surface shadow-elevated">
          <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <LogoIcon logoUrl={logoUrl} />
              <p className="text-sm font-semibold text-foreground">{t("chatWidget.title")}</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={startNewChat}
                title={t("chatWidget.newChat")}
                aria-label={t("chatWidget.newChatAria")}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition hover:bg-surface-hover hover:text-foreground"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
              <button
                type="button"
                onClick={() => setPanel((p) => (p === "sessions" ? "chat" : "sessions"))}
                title={t("chatWidget.sessions")}
                aria-label={t("chatWidget.sessionsAria")}
                aria-pressed={panel === "sessions"}
                className={`flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-surface-hover hover:text-foreground ${
                  panel === "sessions" ? "bg-surface-hover text-foreground" : "text-muted"
                }`}
              >
                <History className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t("chatWidget.close")}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition hover:bg-surface-hover hover:text-foreground"
              >
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>
          </div>

          {panel === "sessions" ? (
            <div className="flex-1 overflow-y-auto px-2 py-2">
              {sessions.length === 0 && (
                <p className="px-2 py-4 text-center text-sm text-muted">{t("chatWidget.emptySessions")}</p>
              )}
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className={`group flex items-center gap-1 rounded-lg px-2 py-2 text-sm transition hover:bg-surface-hover ${
                    session.id === activeSessionId ? "bg-surface-hover" : ""
                  }`}
                >
                  {renamingId === session.id ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveRename(session);
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      onBlur={() => saveRename(session)}
                      maxLength={120}
                      className="min-w-0 flex-1 rounded border border-accent bg-surface-2 px-1.5 py-0.5 text-sm text-foreground focus:outline-none"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => openSession(session)}
                      className="min-w-0 flex-1 truncate text-left text-foreground"
                    >
                      {session.title ?? t("chatWidget.untitledSession")}
                      <span className="ml-2 text-xs text-muted">{formatSessionDate(session.updatedAt, locale)}</span>
                    </button>
                  )}
                  <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                    {renamingId === session.id ? (
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => saveRename(session)}
                        aria-label={t("chatWidget.renameSave")}
                        className="flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-surface hover:text-foreground"
                      >
                        <Check className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startRename(session)}
                        aria-label={t("chatWidget.rename")}
                        className="flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-surface hover:text-foreground"
                      >
                        <Pencil className="h-3 w-3" strokeWidth={2} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setDeletingSession(session)}
                      aria-label={t("chatWidget.delete")}
                      className="flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-danger/10 hover:text-danger"
                    >
                      <Trash2 className="h-3 w-3" strokeWidth={2} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div ref={scrollRef} className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
              {!messagesLoading && messages.length === 0 && (
                <p className="text-sm text-muted">{t("chatWidget.emptyState")}</p>
              )}
              {messages.map((m, i) => (
                <div key={m.id ?? i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                      m.role === "user" ? "bg-accent text-accent-foreground" : "bg-surface-2 text-foreground"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{m.content}</p>
                    {m.sources && m.sources.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5 border-t border-border/50 pt-2">
                        {m.sources.map((s) => (
                          <Link
                            key={s.id}
                            href={`/documents/${s.id}`}
                            className="truncate rounded-full bg-surface px-2 py-0.5 text-xs text-accent hover:underline"
                          >
                            {s.title}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted" />
                  </div>
                </div>
              )}
              {error && <p className="text-xs text-danger">{error}</p>}
            </div>
          )}

          {panel === "chat" && (
            <form onSubmit={handleSend} className="flex shrink-0 items-center gap-2 border-t border-border p-3">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t("chatWidget.inputPlaceholder")}
                disabled={sending}
                className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                aria-label={t("chatWidget.send")}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="h-4 w-4" strokeWidth={2} />
              </button>
            </form>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? t("chatWidget.close") : t("chatWidget.open")}
        className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-elevated transition hover:bg-accent-hover"
      >
        {open ? <X className="h-5 w-5" strokeWidth={2} /> : <MessageCircle className="h-5 w-5" strokeWidth={2} />}
      </button>

      <ConfirmDialog
        open={deletingSession !== null}
        title={t("chatWidget.deleteSessionTitle")}
        description={t("chatWidget.deleteSessionDescription", { title: deletingSession?.title ?? t("chatWidget.untitledSession") })}
        confirmLabel={t("chatWidget.delete")}
        loading={deleteLoading}
        onConfirm={handleDeleteSession}
        onCancel={() => setDeletingSession(null)}
      />
    </div>
  );
}

function LogoIcon({ logoUrl }: { logoUrl: string | null }) {
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logoUrl} alt="" className="h-5 w-5 rounded object-contain" />;
  }
  return <Sparkles className="h-4 w-4 text-accent" strokeWidth={2} />;
}
