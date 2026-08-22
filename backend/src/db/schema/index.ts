import { relations } from "drizzle-orm";
import { users } from "./users.js";
import { documents } from "./documents.js";
import { tags, documentTags } from "./tags.js";
import { extractionReview } from "./extraction-review.js";
import { documentTypes } from "./document-types.js";
import { apiKeys } from "./api-keys.js";
import { chatSessions, chatMessages } from "./chat-sessions.js";

export * from "./users.js";
export * from "./documents.js";
export * from "./tags.js";
export * from "./extraction-review.js";
export * from "./document-types.js";
export * from "./imap-settings.js";
export * from "./api-keys.js";
export * from "./senders.js";
export * from "./document-embeddings.js";
export * from "./chat-sessions.js";
export * from "./push-settings.js";
export * from "./password-reset-tokens.js";
export * from "./notification-settings.js";

export const usersRelations = relations(users, ({ many }) => ({
  documents: many(documents),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  uploadedByUser: one(users, {
    fields: [documents.uploadedBy],
    references: [users.id],
  }),
  documentType: one(documentTypes, {
    fields: [documents.documentTypeId],
    references: [documentTypes.id],
  }),
  documentTags: many(documentTags),
  extractionReviews: many(extractionReview),
  parent: one(documents, {
    fields: [documents.parentDocumentId],
    references: [documents.id],
    relationName: "documentParent",
  }),
  children: many(documents, { relationName: "documentParent" }),
  apiKey: one(apiKeys, {
    fields: [documents.apiKeyId],
    references: [apiKeys.id],
  }),
}));

export const documentTypesRelations = relations(documentTypes, ({ many }) => ({
  documents: many(documents),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  documentTags: many(documentTags),
}));

export const documentTagsRelations = relations(documentTags, ({ one }) => ({
  document: one(documents, {
    fields: [documentTags.documentId],
    references: [documents.id],
  }),
  tag: one(tags, {
    fields: [documentTags.tagId],
    references: [tags.id],
  }),
}));

export const extractionReviewRelations = relations(extractionReview, ({ one }) => ({
  document: one(documents, {
    fields: [extractionReview.documentId],
    references: [documents.id],
  }),
  reviewedByUser: one(users, {
    fields: [extractionReview.reviewedBy],
    references: [users.id],
  }),
}));

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  createdByUser: one(users, {
    fields: [apiKeys.createdBy],
    references: [users.id],
  }),
}));

export const chatSessionsRelations = relations(chatSessions, ({ one, many }) => ({
  user: one(users, {
    fields: [chatSessions.userId],
    references: [users.id],
  }),
  messages: many(chatMessages),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  session: one(chatSessions, {
    fields: [chatMessages.sessionId],
    references: [chatSessions.id],
  }),
}));
