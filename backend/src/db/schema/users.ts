import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["admin", "member"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: userRoleEnum("role").notNull().default("member"),
  passwordHash: text("password_hash"),
  ssoSubjectId: text("sso_subject_id").unique(),
  // Null until the user explicitly picks one via the navbar language menu -
  // resolves to env.DEFAULT_LANGUAGE at login/register time (see
  // routes/auth/login.ts, register.ts). Plain text rather than a pgEnum:
  // more languages are expected later, and this codebase already learned the
  // hard way (document_source) that dropping/adding pg enum values needs an
  // awkward multi-step migration - a plain column validated at the API
  // boundary (zod) avoids that entirely.
  language: text("language"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
});
