import type { z } from "zod";
import { supabase } from "@/lib/supabase";

/**
 * Chama a Edge Function ia-texto (Gemini) e valida a resposta com Zod antes de devolver.
 * A chave do Gemini nunca passa pelo front: fica no Vault.
 */
export async function iaTexto<T>(esquema: z.ZodType<T>, corpo: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("ia-texto", { body: corpo });
  if (error) {
    const resp = "context" in error ? (error.context as Response) : null;
    const detalhe = resp ? await resp.json().catch(() => null) : null;
    throw new Error(detalhe?.erro ?? "A IA de texto não respondeu. Confira se a função ia-texto está publicada.");
  }
  const valido = esquema.safeParse(data);
  if (!valido.success) throw new Error("A IA devolveu um formato inesperado. Tente de novo.");
  return valido.data;
}
