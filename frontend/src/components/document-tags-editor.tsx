"use client";

import { useState } from "react";
import { TagPicker } from "@/components/tag-picker";
import { api } from "@/lib/api";
import type { Tag } from "@/lib/types";

// Persists every add/remove immediately, since this editor is always bound
// to an already-saved document - the picker itself stays purely local-state
// and doesn't know or care whether/how its caller persists.
export function DocumentTagsEditor({ documentId, initialTags }: { documentId: string; initialTags: Tag[] }) {
  const [tags, setTags] = useState<Tag[]>(initialTags);

  async function handleChange(next: Tag[]) {
    const added = next.find((t) => !tags.some((existing) => existing.id === t.id));
    const removed = tags.find((t) => !next.some((existing) => existing.id === t.id));

    setTags(next);
    try {
      if (added) await api.post(`/api/documents/${documentId}/tags`, { tagId: added.id });
      if (removed) await api.delete(`/api/documents/${documentId}/tags/${removed.id}`);
    } catch {
      setTags(tags); // roll back if the request actually failed
    }
  }

  async function handleCreateTag(name: string): Promise<Tag> {
    // Only creates the tag - TagPicker's onChange (above) handles attaching
    // it to this document, so it isn't attached twice.
    const res = await api.post<{ tag: Tag }>("/api/tags", { name });
    return res.tag;
  }

  return <TagPicker value={tags} onChange={handleChange} onCreateTag={handleCreateTag} />;
}
