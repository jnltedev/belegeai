import { getSessionUser } from "../session";
import { isLocale, type Locale } from "./locale";

// Effective locale for the current request: the logged-in user's saved
// choice, else the server's DEFAULT_LANGUAGE env var, else "en". Called
// independently from each layout that needs it (root, auth, app) - an extra
// cheap internal getSessionUser() call per layout is a fine tradeoff for not
// having to thread locale through props across unrelated route groups.
export async function resolveLocale(): Promise<Locale> {
  const user = await getSessionUser();
  if (isLocale(user?.language)) return user.language;
  const envDefault = process.env.DEFAULT_LANGUAGE;
  return isLocale(envDefault) ? envDefault : "en";
}
