import { Type, type Schema } from "@google/genai";
import type { DocumentTypeFieldOption, DocumentTypeOption } from "./types.js";

const UNKNOWN_TYPE_NAME = "Unbekannt";

function fieldSchemaKeys(field: DocumentTypeFieldOption): string[] {
  return field.type === "currency" ? [field.key, `${field.key}_currency`] : [field.key];
}

// Deduplicated union of every field key declared across all current document
// types - new admin-defined types/fields flow into extraction automatically,
// without needing a bespoke Gemini schema per type.
function collectFields(documentTypes: DocumentTypeOption[]): DocumentTypeFieldOption[] {
  const seen = new Map<string, DocumentTypeFieldOption>();
  for (const type of documentTypes) {
    for (const field of type.fields) {
      if (!seen.has(field.key)) seen.set(field.key, field);
    }
  }
  return [...seen.values()];
}

export function buildExtractionPrompt(documentTypes: DocumentTypeOption[], knownSenders: string[] = []): string {
  const typeList = documentTypes
    .map((t) => `- "${t.name}"${t.keywords.length > 0 ? ` (Stichwörter: ${t.keywords.join(", ")})` : ""}`)
    .join("\n");

  const senderFields = collectFields(documentTypes).filter((f) => f.type === "sender");
  const senderGuidance =
    senderFields.length > 0
      ? `\n\nRegeln für die Absender-Felder (${senderFields.map((f) => `"${f.key}"`).join(", ")}):
- Der Wert ist die Firma/Institution, die diesen Beleg ausgestellt bzw. verschickt hat (Briefkopf, Logo, Impressum, Absenderzeile) - NIEMALS der Empfänger (die Person, an die der Brief adressiert ist).
- Gib den vollständigen Firmennamen wieder, keine Adresszeile, keine Abteilung, keinen Sachbearbeiternamen.${
          knownSenders.length > 0
            ? `\n- Bereits bekannte Absender in diesem Archiv (exakte, korrekte Schreibweise):\n${knownSenders.map((s) => `  - ${s}`).join("\n")}\n- Entspricht der erkannte Absender einem der obigen eindeutig derselben Firma - auch bei abweichender Groß-/Kleinschreibung, Rechtsform-Kürzel, Tippfehlern ODER vertauschter Wortreihenfolge (z. B. "Zahnarztpraxis Svea Polack" vs. "Svea Polack Zahnarztpraxis" ist dieselbe Praxis) -, verwende EXAKT die oben gelistete Schreibweise. Erfinde keine neue Variante eines bereits bekannten Absenders. Nur wenn der Absender wirklich neu ist, gib ihn so wieder, wie er auf dem Beleg steht.`
            : ""
        }`
      : "";

  return `Du analysierst einen gescannten offiziellen Beleg (Finanzamt-Post, Rechnung, Versicherungsschreiben, Behördenbrief o.ä.) und extrahierst strukturierte Metadaten sowie den vollständigen Text.

Verfügbare Dokumenttypen zur Klassifizierung:
${typeList}
- "${UNKNOWN_TYPE_NAME}" (nutze dies, wenn keiner der obigen Typen mit ausreichender Sicherheit passt - z. B. bei Logos, Icons, Fotos, Screenshots oder anderen Bildern ohne erkennbaren Beleg-Charakter)

Wähle in "document_type" GENAU EINEN der oben genannten Namen. Du bist NICHT verpflichtet, einen der fachlichen Typen zu vergeben - wähle im Zweifel lieber "${UNKNOWN_TYPE_NAME}" als zu raten.

Antworte ausschließlich mit JSON nach dem vorgegebenen Schema. Regeln für die Felder in "fields":
- Fülle nur Felder aus, für die im Dokument tatsächlich ein Anhaltspunkt erkennbar ist. Lasse alles andere null.
- Bei Datumsfeldern: Format YYYY-MM-DD.
- Bei Betragsfeldern (Feldname + "_currency"): Falls auf dem Beleg MEHRERE Beträge stehen, wähle den tatsächlichen Zahlungs-/Endbetrag (z. B. "Zahlungsbetrag", "Gesamtbetrag fällig", "Total", "zu zahlen"), NICHT eine Zwischensumme vor Abzügen, Rabatten oder Bonus-Verrechnung. Prüfe bei Unsicherheit, ob ein Zahlungs- oder QR-Code-Block auf dem Beleg einen abweichenden, maßgeblichen Betrag zeigt, und bevorzuge diesen. Betrag als reine Dezimalzahl mit Punkt (z. B. "63.28"), Währung als ISO-4217-Code (z. B. "EUR").${senderGuidance}

"suggested_tags": 0 bis 5 kurze, kleingeschriebene Schlagworte auf Deutsch.
"full_text": vollständige Transkription des sichtbaren Textes im Dokument.`;
}

export function buildExtractionSchema(documentTypes: DocumentTypeOption[]): Schema {
  const fields = collectFields(documentTypes);
  const fieldProperties: Record<string, Schema> = {};
  for (const field of fields) {
    for (const schemaKey of fieldSchemaKeys(field)) {
      fieldProperties[schemaKey] = { type: Type.STRING, nullable: true };
    }
  }

  return {
    type: Type.OBJECT,
    properties: {
      document_type: {
        type: Type.STRING,
        format: "enum",
        enum: [...documentTypes.map((t) => t.name), UNKNOWN_TYPE_NAME],
      },
      fields: {
        type: Type.OBJECT,
        properties: fieldProperties,
      },
      suggested_tags: { type: Type.ARRAY, items: { type: Type.STRING } },
      full_text: { type: Type.STRING, nullable: true },
    },
    required: ["document_type", "suggested_tags"],
  };
}

export function extractFieldValues(
  matchedType: DocumentTypeOption | undefined,
  rawFields: Record<string, unknown>,
): Record<string, unknown> {
  if (!matchedType) return {};

  const values: Record<string, unknown> = {};
  for (const field of matchedType.fields) {
    if (field.type === "currency") {
      const amount = rawFields[field.key];
      const currency = rawFields[`${field.key}_currency`];
      if (typeof amount === "string" && amount.trim().length > 0) {
        values[field.key] = { amount, currency: typeof currency === "string" ? currency : null };
      }
    } else {
      const value = rawFields[field.key];
      if (typeof value === "string" && value.trim().length > 0) {
        values[field.key] = value;
      }
    }
  }
  return values;
}

// Built as the opening turn of a fake system-instruction exchange (a "user"
// message followed by a canned "model" acknowledgment) rather than the
// SDK's dedicated systemInstruction config field - that field's exact shape
// has shifted across @google/genai versions, while a plain contents-array
// turn is the one mechanism proven to work against the installed package
// (see gemini-provider.ts's extractDocument, which already relies on
// contents/config in the same verified shape).
// The retrieval step deliberately casts a wide net (OR-of-keywords, see
// ask.ts) so it doesn't miss the right document - but that means most of
// what's "provided" below is irrelevant noise for any given question, e.g.
// a dozen unrelated invoices that merely share the word "Rechnung". Asking
// for used_titles lets the route show the user only the documents the
// answer actually drew on, not the whole noisy candidate pool.
export function buildChatSystemPrompt(context: string): string {
  return `Du bist "BelegeAI", der Assistent des persönlichen Dokumentenarchivs "Belege-Archiv". Du beantwortest Fragen des Nutzers ausschließlich auf Basis der unten bereitgestellten Dokumente.

Die bereitgestellten Dokumente wurden per Stichwortsuche vorausgewählt - die meisten sind für die konkrete Frage vermutlich NICHT relevant (z. B. viele Rechnungen von verschiedenen Absendern, wenn nur nach einer bestimmten gefragt wird). Wähle sorgfältig nur die tatsächlich relevanten aus.

Antworte AUSSCHLIESSLICH mit JSON nach diesem Schema:
{
  "answer": "deine Antwort auf Deutsch, präzise, in normalem Fließtext",
  "used_titles": ["exakter Titel jedes Dokuments, auf das sich deine Antwort tatsächlich stützt"]
}

Regeln:
- Nutze ausschließlich Informationen aus den bereitgestellten Dokumenten. Erfinde nichts hinzu.
- Wenn sich die Frage damit nicht beantworten lässt, sage das klar in "answer" (z. B. "Dazu finde ich keine Information in deinen archivierten Dokumenten.") und lasse "used_titles" leer.
- "used_titles" enthält NUR Dokumente, die wirklich zur Antwort beigetragen haben - nicht alle bereitgestellten. Meistens sind das nur eines oder wenige.
- Die Titel in "used_titles" müssen exakt den bereitgestellten Titeln entsprechen.

Bereitgestellte Dokumente:
${context || "(keine Dokumente gefunden)"}`;
}

export { UNKNOWN_TYPE_NAME };

/// The same extraction shape as buildExtractionSchema, expressed as plain
/// JSON Schema for providers that speak it (OpenAI, Anthropic) rather than
/// Google's Schema type. `additionalProperties: false` and a fully populated
/// `required` array are what OpenAI's strict mode demands; nullable is
/// expressed as a type union, which both providers accept.
export function buildExtractionJsonSchema(documentTypes: DocumentTypeOption[]): Record<string, unknown> {
  const fields = collectFields(documentTypes);
  const fieldProperties: Record<string, unknown> = {};
  const fieldKeys: string[] = [];
  for (const field of fields) {
    for (const schemaKey of fieldSchemaKeys(field)) {
      fieldProperties[schemaKey] = { type: ["string", "null"] };
      fieldKeys.push(schemaKey);
    }
  }

  return {
    type: "object",
    additionalProperties: false,
    properties: {
      document_type: {
        type: "string",
        enum: [...documentTypes.map((t) => t.name), UNKNOWN_TYPE_NAME],
      },
      fields: {
        type: "object",
        additionalProperties: false,
        properties: fieldProperties,
        required: fieldKeys,
      },
      suggested_tags: { type: "array", items: { type: "string" } },
      full_text: { type: ["string", "null"] },
    },
    required: ["document_type", "fields", "suggested_tags", "full_text"],
  };
}

/// Answer plus the subset of supplied titles the answer actually drew on.
export const CHAT_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    answer: { type: "string" },
    used_titles: { type: "array", items: { type: "string" } },
  },
  required: ["answer", "used_titles"],
};

/// Suggested classification keywords and fields for a new document type.
export const TYPE_SUGGESTION_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    keywords: { type: "array", items: { type: "string" } },
    fields: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          key: { type: "string" },
          label: { type: "string" },
          type: { type: "string", enum: ["text", "date", "currency"] },
        },
        required: ["key", "label", "type"],
      },
    },
  },
  required: ["keywords", "fields"],
};
