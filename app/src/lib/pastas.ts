/** Conta itens por pasta, incluindo pastas recém-criadas ainda vazias. */
export function contarPastas(itens: { pasta: string | null }[], extras: string[]) {
  const mapa = new Map<string, number>(extras.map((e) => [e, 0]));
  for (const i of itens) if (i.pasta) mapa.set(i.pasta, (mapa.get(i.pasta) ?? 0) + 1);
  return [...mapa].map(([nome, n]) => ({ nome, n })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}
