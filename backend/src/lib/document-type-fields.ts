import type { DocumentTypeField } from "../db/schema/document-types.js";

const DEFAULT_SENDER_FIELD: DocumentTypeField = { key: "sender", type: "sender", label: "Absender" };

// Every document type always has exactly one "sender" field, first in the
// list - not removable, its key/type locked to "sender" regardless of what
// the client submits, but its label is renamable. Called on both create and
// update so a request can never strip it or corrupt its key/type, whether
// that's a deliberate client bug or just an admin editing a type that
// pre-dates this rule.
export function enforceSenderField(fields: DocumentTypeField[]): DocumentTypeField[] {
  const existing = fields.find((f) => f.key === "sender");
  const rest = fields.filter((f) => f.key !== "sender");
  const senderField: DocumentTypeField = existing
    ? { key: "sender", type: "sender", label: existing.label }
    : DEFAULT_SENDER_FIELD;
  return [senderField, ...rest];
}
