"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { api } from "@/lib/api";
import type { Tag } from "@/lib/types";
import { useTranslation } from "@/lib/i18n/client";

// Local-state chip picker: search existing tags, create new ones inline,
// remove selected ones - no eager persistence. Shared by the upload form
// (collects tagIds, saved once on submit) and the document detail editor
// (wraps this and persists each add/remove immediately via its own API
// calls) - same search/create/chip interaction everywhere tags are picked.
export function TagPicker({
  value,
  onChange,
  onCreateTag,
}: {
  value: Tag[];
  onChange: (tags: Tag[]) => void;
  // Tag creation always needs the backend (to get a real id + deterministic
  // color) - the caller just decides what to do with the result.
  onCreateTag: (name: string) => Promise<Tag>;
}) {
  const { t } = useTranslation();
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [adding, setAdding] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (adding) {
      api.get<{ tags: Tag[] }>("/api/tags").then((res) => setAllTags(res.tags));
      inputRef.current?.focus();
    }
  }, [adding]);

  useEffect(() => {
    if (!adding) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setAdding(false);
        setInputValue("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [adding]);

  const suggestions = allTags.filter(
    (t) => !value.some((existing) => existing.id === t.id) && t.name.toLowerCase().includes(inputValue.trim().toLowerCase()),
  );
  const exactMatch = allTags.some((t) => t.name.toLowerCase() === inputValue.trim().toLowerCase());

  function addExisting(tag: Tag) {
    onChange(value.some((t) => t.id === tag.id) ? value : [...value, tag]);
    setInputValue("");
    inputRef.current?.focus();
  }

  async function createAndAdd(name: string) {
    setError(null);
    try {
      const tag = await onCreateTag(name);
      setAllTags((prev) => (prev.some((t) => t.id === tag.id) ? prev : [...prev, tag]));
      addExisting(tag);
    } catch {
      setError(t("tagPicker.createFailed"));
    }
  }

  function removeTag(tagId: string) {
    onChange(value.filter((t) => t.id !== tagId));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && inputValue.trim()) {
      e.preventDefault();
      if (suggestions.length > 0) {
        addExisting(suggestions[0]);
      } else if (!exactMatch) {
        createAndAdd(inputValue.trim());
      }
    } else if (e.key === "Escape") {
      setAdding(false);
      setInputValue("");
    }
  }

  return (
    <div ref={containerRef} className="flex flex-wrap items-center gap-1.5">
      {value.map((tag) => (
        <span
          key={tag.id}
          className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium"
          style={{ borderColor: `${tag.color}55`, backgroundColor: `${tag.color}1a`, color: tag.color }}
        >
          {tag.name}
          <button
            type="button"
            onClick={() => removeTag(tag.id)}
            aria-label={t("tagPicker.removeTag", { name: tag.name })}
            className="rounded-full hover:opacity-60"
          >
            <X className="h-3 w-3" strokeWidth={2.5} />
          </button>
        </span>
      ))}

      {adding ? (
        <div className="relative">
          <input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("tagPicker.searchOrCreatePlaceholder")}
            className="w-40 rounded-full border border-border bg-surface px-2.5 py-0.5 text-xs text-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          {inputValue.trim() && (
            <div className="absolute left-0 top-full z-10 mt-1 w-48 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-elevated">
              {suggestions.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => addExisting(tag)}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-foreground hover:bg-surface-hover"
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.color }} />
                  {tag.name}
                </button>
              ))}
              {!exactMatch && (
                <button
                  type="button"
                  onClick={() => createAndAdd(inputValue.trim())}
                  className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-xs font-medium text-accent hover:bg-surface-hover"
                >
                  <Plus className="h-3 w-3" strokeWidth={2} />
                  {t("tagPicker.createOption", { name: inputValue.trim() })}
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-0.5 text-xs font-medium text-muted transition hover:border-accent hover:text-accent"
        >
          <Plus className="h-3 w-3" strokeWidth={2} />
          {t("tagPicker.addButton")}
        </button>
      )}

      {error && <p className="w-full text-xs text-danger">{error}</p>}
    </div>
  );
}
