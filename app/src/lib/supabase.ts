import { createClient } from "@supabase/supabase-js";

export const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
/** Chave pública (anon). Pode ir no front; quem protege os dados é a RLS. */
export const chave = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** true quando o .env.local ainda não tem as variáveis do Supabase. */
export const supabaseSemConfig = !url || !chave || chave.startsWith("<");

// Todo o estúdio vive no schema próprio `imobinsta` do Supabase compartilhado (ikvj).
export const supabase = createClient(url ?? "http://localhost", chave ?? "sem-chave", {
  db: { schema: "imobinsta" },
  auth: { persistSession: true, autoRefreshToken: true, storageKey: "imobinsta-auth" },
});
