export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: "admin" | "member";
  createdAt: string;
  lastLoginAt: string | null;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  documentCount?: number;
}

export interface DocumentTypeField {
  key: string;
  label: string;
  type: "text" | "date" | "currency" | "sender";
}

export interface Sender {
  id: string;
  name: string;
  documentCount?: number;
}

export interface DocumentType {
  id: string;
  name: string;
  icon: string;
  color: string;
  keywords: string[];
  fields: DocumentTypeField[];
}

export interface ExtractionSuggestion {
  documentTypeId: string | null;
  documentTypeName: string;
  fieldValues: Record<string, unknown>;
  suggestedTags: string[];
  fullText: string | null;
}

export interface DocumentRecord {
  id: string;
  title: string;
  documentTypeId: string | null;
  documentType: DocumentType | null;
  metadata: Record<string, unknown>;
  fileKey: string;
  mimetype: string | null;
  ocrText: string | null;
  source: "manual" | "imap" | "api";
  reviewStatus: "pending" | "confirmed";
  createdAt: string;
  tags: Tag[];
  parent: { id: string; title: string } | null;
  children: { id: string; title: string; documentType: { name: string; icon: string; color: string } | null }[];
  pendingChildrenCount: number;
}

export interface QueueDocument {
  id: string;
  title: string;
  documentTypeId: string | null;
  documentType: DocumentType | null;
  metadata: Record<string, unknown>;
  fileKey: string;
  mimetype: string | null;
  ocrText: string | null;
  source: "imap" | "api";
  reviewStatus: "pending";
  createdAt: string;
  parentDocumentId: string | null;
  parent: { id: string; title: string; metadata: Record<string, unknown> } | null;
  apiKey: { id: string; name: string } | null;
}

export interface ImapSettings {
  id: string;
  host: string;
  port: number;
  username: string;
  folder: string;
  pollIntervalMinutes: number;
  allowAllSenders: boolean;
  allowedSenders: string[];
  enabled: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  updatedAt: string;
  hasPassword: boolean;
}

export interface AdminStats {
  totalDocuments: number;
  totalStorageBytes: number;
  totalTags: number;
  pendingImportCount: number;
  totalUsers: number;
  lastImapSyncAt: string | null;
  lastApiImportAt: string | null;
  documentsByType: { name: string; color: string; count: number }[];
  documentsBySource: { source: string; count: number }[];
  oldestPendingAgeDays: number | null;
  topTags: { name: string; color: string; count: number }[];
}

export interface ApiKey {
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}
