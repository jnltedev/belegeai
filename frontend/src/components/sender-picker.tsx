"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { api } from "@/lib/api";
import type { Sender } from "@/lib/types";
import { useTranslation } from "@/lib/i18n/client";

// Single-value autocomplete against known senders - search-as-you-type
// suggestions, pick an existing one, or create a new one inline (find-or-
// create, same pattern as TagPicker). Stores/returns the plain sender NAME
// string, matching how metadata.sender is stored on a document - not an id,
// since sender isn't a foreign key.
export function SenderPicker({ value, onChange }: { value: string; onChange: (name: string) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<Sender[]>([]);
  // Index into the combined [...suggestions, createOption?] list; -1 means
  // nothing is keyboard-highlighted yet.
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  // Populated whenever `value` arrives pre-filled (an AI suggestion on an
  // IMAP/API-imported document, or an extraction on manual upload) and
  // doesn't exactly match a known sender - surfaced as clickable chips below
  // the input without requiring the user to open/type anything first, so
  // near-duplicates from AI/OCR variance ("Telekom" vs "Telekom Deutschland
  // GmbH") get caught before they turn into a whole new sender entity.
  const [similar, setSimilar] = useState<Sender[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    const trimmedValue = value.trim();
    if (!trimmedValue) {
      setSimilar([]);
      return;
    }
    let cancelled = false;
    api.get<{ senders: Sender[] }>(`/api/senders?search=${encodeURIComponent(trimmedValue)}`).then((res) => {
      if (cancelled) return;
      const exact = res.senders.some((s) => s.name.toLowerCase() === trimmedValue.toLowerCase());
      setSimilar(exact ? [] : res.senders);
    });
    return () => {
      cancelled = true;
    };
  }, [value]);

  useEffect(() => {
    if (!open) return;
    api.get<{ senders: Sender[] }>(`/api/senders?search=${encodeURIComponent(query.trim())}`).then((res) => setSuggestions(res.senders));
  }, [open, query]);

  // A fresh set of suggestions invalidates whatever was highlighted before.
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [suggestions, query]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  useEffect(() => {
    optionRefs.current[highlightedIndex]?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex]);

  function selectExisting(sender: Sender) {
    setQuery(sender.name);
    onChange(sender.name);
    setOpen(false);
    setSimilar([]);
  }

  async function createAndSelect(name: string) {
    const res = await api.post<{ sender: Sender }>("/api/senders", { name });
    setQuery(res.sender.name);
    onChange(res.sender.name);
    setOpen(false);
    setSimilar([]);
  }

  const trimmed = query.trim();
  const exactMatch = suggestions.some((s) => s.name.toLowerCase() === trimmed.toLowerCase());
  const showCreateOption = Boolean(trimmed) && !exactMatch;
  const optionCount = suggestions.length + (showCreateOption ? 1 : 0);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (optionCount > 0) setHighlightedIndex((i) => (i + 1 >= optionCount ? 0 : i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (optionCount > 0) setHighlightedIndex((i) => (i - 1 < 0 ? optionCount - 1 : i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
        selectExisting(suggestions[highlightedIndex]);
      } else if (highlightedIndex === suggestions.length && showCreateOption) {
        createAndSelect(trimmed);
      } else if (suggestions.length > 0) {
        // Nothing arrowed to yet - Enter takes the top suggestion, matching
        // what's visually first in the list.
        selectExisting(suggestions[0]);
      } else if (showCreateOption) {
        createAndSelect(trimmed);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        placeholder={t("senderPicker.searchOrCreatePlaceholder")}
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      />
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-border bg-surface py-1 shadow-elevated">
          {suggestions.map((s, i) => (
            <button
              key={s.id}
              ref={(el) => {
                optionRefs.current[i] = el;
              }}
              type="button"
              onMouseEnter={() => setHighlightedIndex(i)}
              onClick={() => selectExisting(s)}
              className={`flex w-full items-center px-3 py-1.5 text-left text-sm text-foreground ${
                highlightedIndex === i ? "bg-surface-hover" : "hover:bg-surface-hover"
              }`}
            >
              {s.name}
            </button>
          ))}
          {showCreateOption && (
            <button
              ref={(el) => {
                optionRefs.current[suggestions.length] = el;
              }}
              type="button"
              onMouseEnter={() => setHighlightedIndex(suggestions.length)}
              onClick={() => createAndSelect(trimmed)}
              className={`flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-sm font-medium text-accent ${
                highlightedIndex === suggestions.length ? "bg-surface-hover" : "hover:bg-surface-hover"
              }`}
            >
              <Plus className="h-3 w-3" strokeWidth={2} />
              {t("senderPicker.createOption", { name: trimmed })}
            </button>
          )}
          {suggestions.length === 0 && !trimmed && <p className="px-3 py-1.5 text-xs text-muted">{t("senderPicker.typeToSearch")}</p>}
        </div>
      )}
      {!open && similar.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted">{t("senderPicker.similarSenders")}</span>
          {similar.slice(0, 5).map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => selectExisting(s)}
              className="rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-xs text-foreground transition hover:border-accent hover:text-accent"
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
