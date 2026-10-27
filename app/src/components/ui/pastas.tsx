import { useState } from "react";
import { Check, FolderPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Filtro de pastas em chips, com criação inline ("Nova pasta"). `valor` null = todas. */
export function Pastas({
  pastas,
  valor,
  onChange,
  onNova,
}: {
  pastas: { nome: string; n: number }[];
  valor: string | null;
  onChange: (pasta: string | null) => void;
  onNova: (nome: string) => void;
}) {
  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState("");

  function salvar() {
    const limpo = nome.trim().slice(0, 40);
    if (limpo) {
      onNova(limpo);
      onChange(limpo);
    }
    setNome("");
    setCriando(false);
  }

  const chip = (ativo: boolean) =>
    cn(
      "inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-foot font-medium transition-colors",
      ativo ? "bg-blue text-white" : "bg-fill2 text-label hover:bg-fill",
    );

  return (
    <div className="mb-5 flex flex-wrap items-center gap-2" role="group" aria-label="Pastas">
      <button type="button" className={chip(valor === null)} aria-pressed={valor === null} onClick={() => onChange(null)}>
        Todas as pastas
      </button>
      {pastas.map((p) => (
        <button key={p.nome} type="button" className={chip(valor === p.nome)} aria-pressed={valor === p.nome} onClick={() => onChange(p.nome)}>
          {p.nome}
          <span className={valor === p.nome ? "text-white/75" : "text-label2"}>{p.n}</span>
        </button>
      ))}
      {criando ? (
        <form
          className="inline-flex items-center gap-1 rounded-full bg-fill3 py-0.5 pr-1 pl-3"
          onSubmit={(e) => {
            e.preventDefault();
            salvar();
          }}
        >
          <input
            autoFocus
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setCriando(false)}
            placeholder="Nome da pasta"
            aria-label="Nome da nova pasta"
            maxLength={40}
            className="w-36 bg-transparent text-foot outline-none"
          />
          <Button type="submit" variante="simples" tamanho="sm" aria-label="Criar pasta"><Check /></Button>
          <Button variante="simples" tamanho="sm" aria-label="Cancelar" onClick={() => setCriando(false)}><X /></Button>
        </form>
      ) : (
        <Button variante="simples" tamanho="sm" className="ml-auto" onClick={() => setCriando(true)}>
          <FolderPlus /> Nova pasta
        </Button>
      )}
    </div>
  );
}
