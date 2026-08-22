import { jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const chatSessions = pgTable("chat_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // Null until the first message is sent, at which point it's auto-derived
  // from that question (truncated) - see routes/chat/ask.ts. The user can
  // rename it anytime afterward.
  title: text("title"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // Bumped on every new message - the sessions list sorts by this so the
  // most recently active conversation surfaces first.
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const chatMessageRoleEnum = pgEnum("chat_message_role", ["user", "assistant"]);

export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => chatSessions.id, { onDelete: "cascade" }),
  role: chatMessageRoleEnum("role").notNull(),
  content: text("content").notNull(),
  // Only ever set on assistant messages - the subset of retrieved documents
  // the model actually drew its answer from (see routes/chat/ask.ts).
  // Persisted so reopening a session on another device still shows the same
  // source chips, not just the raw reply text.
  sources: jsonb("sources").$type<{ id: string; title: string }[] | null>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
