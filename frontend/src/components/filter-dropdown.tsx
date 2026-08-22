"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { useTranslation } from "@/lib/i18n/client";

export interface FilterOption {
  id: string;
  label: string;
  color?: string;
}

// A dropdown-button-plus-popover used for both the "Typ" and "Tags" filters
// on the documents list: a compact summary on the trigger, a searchable
// checkbox list inside. The caller renders the removable-chip row for the
// active selection separately (documents-explorer.tsx) - this component is
// just the picker.
export function FilterDropdown({
  label,
  options,
  selectedIds,
  onChange,
}: {
  label: string;
  options: FilterOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const filtered = options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()));

  function toggle(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((s) => s !== id) : [...selectedIds, id]);
  }

  const summary =
    selectedIds.length === 0
      ? t("filterDropdown.all")
      : selectedIds.length === 1
        ? (options.find((o) => o.id === selectedIds[0])?.label ?? t("filterDropdown.oneSelected"))
        : `${options.find((o) => o.id === selectedIds[0])?.label ?? ""} +${selectedIds.length - 1}`;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition ${
          selectedIds.length > 0
            ? "border-accent/40 bg-accent/10 text-accent"
            : "border-border bg-surface-2 text-foreground hover:bg-surface-hover"
        }`}
      >
        <span className="text-muted">{label}:</span>
        <span className="max-w-[10rem] truncate font-medium">{summary}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-lg border border-border bg-surface shadow-elevated">
          <div className="relative border-b border-border p-2">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" strokeWidth={2} />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("filterDropdown.searchPlaceholder")}
              className="w-full rounded-md border border-border bg-surface-2 py-1.5 pl-7 pr-2 text-xs text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 && <p className="px-3 py-2 text-xs text-muted">{t("filterDropdown.noResults")}</p>}
            {filtered.map((option) => (
              <label
                key={option.id}
                className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-foreground hover:bg-surface-hover"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(option.id)}
                  onChange={() => toggle(option.id)}
                  className="h-3.5 w-3.5 rounded border-border accent-accent"
                />
                {option.color && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: option.color }} />}
                <span className="truncate">{option.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
