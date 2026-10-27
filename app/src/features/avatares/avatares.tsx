import { useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, Plus, Trash2, UserRound, X } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button, botao } from "@/components/ui/button";
import { Badge, Card, Toggle } from "@/components/ui/hig";
import { useAcesso } from "@/features/auth/acesso";
import { chamarFuncao } from "@/features/criar/dados";
import { Nota } from "@/features/criar/comum";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export type Avatar = {
  id: string; nome: string; avatar_externo_id: string; voz_externa_id: string; preview_url: string | null;
  consentimento_texto: string; consentimento_em: string; ativo: boolean;
};
type Catalogo = { avatares: { id: string; nome: string; preview: string | null }[]; vozes: { id: string; nome: string; idioma: string; genero: string }[] };

const CONSENTIMENTO = (nome: string) =>
  `Eu, ${nome || "[nome da pessoa]"}, autorizo a WSA Sistemas de IA a usar o meu avatar digital e a minha voz clonada em vídeos ` +
  `publicados nas redes da empresa, e sei que posso pedir a retirada a qualquer momento.`;

export function useAvatares() {
  const { conta, demo } = useAcesso();
  return useQuery({
    queryKey: ["avatares", conta?.conta_id],
    enabled: !!conta && !demo,
    queryFn: async (): Promise<Avatar[]> => {
      const { data, error } = await supabase
        .from("avatares")
        .select("id, nome, avatar_externo_id, voz_externa_id, preview_url, consentimento_texto, consentimento_em, ativo")
        .eq("conta_id", conta!.conta_id)
        .order("criado_em");
      if (error) throw error;
      return (data ?? []) as Avatar[];
    },
  });
}

/** Meus avatares (Fase 7.2): cadastro do avatar treinado na HeyGen e registro do consentimento. */
export function MeusAvatares() {
  const { conta, demo } = useAcesso();
  const dono = conta?.papel === "dono";
  const cliente = useQueryClient();
  const avatares = useAvatares();
  const [novo, setNovo] = useState(false);

  const alternar = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase.from("avatares").update({ ativo }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSettled: () => cliente.invalidateQueries({ queryKey: ["avatares"] }),
  });
  const apagar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("avatares").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSettled: () => cliente.invalidateQueries({ queryKey: ["avatares"] }),
  });

  return (
    <section className="pagina-entra">
      <PageHeader
        titulo="Meus avatares"
        subtitulo="Grave uma vez. Depois é só escrever o roteiro."
        icone={UserRound}
        cor="purple"
        acoes={dono && !demo && !novo ? <Button onClick={() => setNovo(true)}><Plus /> Novo avatar</Button> : undefined}
      />

      {demo && <Nota className="mb-5">Modo demonstração: os avatares vêm da sua conta HeyGen e não aparecem aqui.</Nota>}
      {avatares.error && <Card role="alert" className="mb-5 text-red">{avatares.error.message}</Card>}
      {(alternar.error || apagar.error) && <Card role="alert" className="mb-5 text-red">{(alternar.error ?? apagar.error)!.message}</Card>}
      {novo && conta && <NovoAvatar contaId={conta.conta_id} aoFechar={() => setNovo(false)} />}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(avatares.data ?? []).map((a) => (
          <Card key={a.id} className="text-center">
            {a.preview_url
              ? <img src={a.preview_url} alt="" className="mx-auto mb-4 size-30 rounded-full object-cover" />
              : <div className="mx-auto mb-4 grid size-30 place-items-center rounded-full bg-gradient-to-br from-orange to-red"><UserRound className="size-12 text-white" /></div>}
            <h3>{a.nome}</h3>
            <p className="mt-1 text-foot text-label2">Avatar e voz · HeyGen</p>
            <div className="mt-3 flex items-center justify-center gap-2">
              <Badge tom={a.ativo ? "ok" : "neutro"}>{a.ativo ? "Pronto" : "Desativado"}</Badge>
            </div>
            <details className="mt-3 text-left text-cap1 text-label2">
              <summary className="cursor-pointer">Consentimento registrado em {new Date(a.consentimento_em).toLocaleDateString("pt-BR")}</summary>
              <p className="mt-2">{a.consentimento_texto}</p>
            </details>
            {dono && !demo && (
              <div className="mt-4 flex items-center justify-center gap-3">
                <Toggle ligado={a.ativo} rotulo={`Usar o avatar ${a.nome}`} onChange={(ativo) => alternar.mutate({ id: a.id, ativo })} />
                <Button variante="simples" tamanho="sm" className="text-red" disabled={apagar.isPending}
                  onClick={() => window.confirm(`Apagar o cadastro de ${a.nome}? O avatar continua na HeyGen.`) && apagar.mutate(a.id)}>
                  <Trash2 /> Apagar
                </Button>
              </div>
            )}
          </Card>
        ))}

        <Card>
          <h3>Como criar o seu</h3>
          <ol className="mt-3 ml-5 list-decimal text-foot leading-7 text-label2">
            <li>Na HeyGen, crie o avatar: grave cerca de 2 minutos olhando para a câmera, com boa luz e fundo limpo.</li>
            <li>Leia o texto de consentimento que a HeyGen mostra (exigência dela) e clone a voz.</li>
            <li>Espere a HeyGen treinar o avatar e a voz.</li>
            <li>Aqui, clique em <b>Novo avatar</b>, escolha o avatar e a voz e registre o consentimento.</li>
          </ol>
          <a href="https://app.heygen.com/avatars" target="_blank" rel="noreferrer" className={cn(botao({ tamanho: "sm", variante: "secundario" }), "mt-4")}>
            Abrir a HeyGen
          </a>
          <p className="mt-3 text-cap1 text-label2">
            A chave da HeyGen fica em <Link to="/conexoes" className="text-blue">Conexões e custos</Link>.
          </p>
        </Card>
      </div>

      <Nota className="mt-5">Avatar só da própria pessoa e com consentimento registrado. É regra dos provedores e evita problema de uso de imagem.</Nota>
    </section>
  );
}

function NovoAvatar({ contaId, aoFechar }: { contaId: string; aoFechar: () => void }) {
  const cliente = useQueryClient();
  const catalogo = useQuery({
    queryKey: ["heygen-catalogo", contaId],
    retry: false,
    staleTime: 10 * 60_000,
    queryFn: () => chamarFuncao<Catalogo>("ia-avatar", { acao: "catalogo", conta_id: contaId }),
  });
  const [avatarId, setAvatarId] = useState("");
  const [vozId, setVozId] = useState("");
  const [nome, setNome] = useState("");
  const [aceite, setAceite] = useState(false);
  const escolhido = catalogo.data?.avatares.find((a) => a.id === avatarId);
  const texto = CONSENTIMENTO(nome.trim());

  const salvar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("avatares").insert({
        conta_id: contaId, nome: nome.trim(), avatar_externo_id: avatarId, voz_externa_id: vozId,
        preview_url: escolhido?.preview ?? null, consentimento_texto: texto,
      });
      if (error) throw new Error(error.code === "23505" ? "Este avatar já está cadastrado." : error.message);
    },
    onSuccess: () => { cliente.invalidateQueries({ queryKey: ["avatares"] }); aoFechar(); },
  });

  return (
    <Card className="mb-5">
      <div className="flex items-center gap-3">
        <h2>Novo avatar</h2>
        <Button variante="simples" tamanho="sm" className="ml-auto" aria-label="Fechar" onClick={aoFechar}><X /></Button>
      </div>
      {catalogo.isLoading && <p className="mt-3 flex items-center gap-2 text-foot text-label2"><LoaderCircle className="size-4 animate-spin" /> Lendo sua conta HeyGen…</p>}
      {catalogo.error && <p role="alert" className="mt-3 text-foot text-red">{catalogo.error.message}</p>}
      {catalogo.data && (
        <form className="mt-4 grid gap-3 sm:grid-cols-[140px_1fr] sm:items-center" onSubmit={(e) => { e.preventDefault(); salvar.mutate(); }}>
          <label htmlFor="av-avatar" className="text-foot text-label2">Avatar da HeyGen</label>
          <select id="av-avatar" className="campo" required value={avatarId} onChange={(e) => {
            setAvatarId(e.target.value);
            if (!nome) setNome(catalogo.data!.avatares.find((a) => a.id === e.target.value)?.nome ?? "");
          }}>
            <option value="">Escolha…</option>
            {catalogo.data.avatares.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
          </select>
          {escolhido?.preview && (
            <>
              <span />
              <img src={escolhido.preview} alt="" className="size-24 rounded-hig-lg object-cover" />
            </>
          )}
          <label htmlFor="av-voz" className="text-foot text-label2">Voz</label>
          <select id="av-voz" className="campo" required value={vozId} onChange={(e) => setVozId(e.target.value)}>
            <option value="">Escolha…</option>
            {catalogo.data.vozes.map((v) => <option key={v.id} value={v.id}>{v.nome}{v.idioma ? ` · ${v.idioma}` : ""}{v.genero ? ` · ${v.genero}` : ""}</option>)}
          </select>
          <label htmlFor="av-nome" className="text-foot text-label2">Nome da pessoa</label>
          <input id="av-nome" className="campo" required maxLength={80} value={nome} onChange={(e) => setNome(e.target.value)} />
          <span className="text-foot text-label2 sm:self-start sm:pt-1">Consentimento</span>
          <label className="flex items-start gap-3 rounded-hig-lg bg-fill3 p-3 text-foot">
            <input type="checkbox" className="mt-1 size-4 accent-blue" checked={aceite} onChange={(e) => setAceite(e.target.checked)} />
            <span>Declaro que a pessoa deste avatar é quem autorizou, por escrito ou na gravação da HeyGen: <i>“{texto}”</i></span>
          </label>
          {salvar.error && <p role="alert" className="text-foot text-red sm:col-start-2">{salvar.error.message}</p>}
          <div className="sm:col-start-2">
            <Button type="submit" disabled={!avatarId || !vozId || !nome.trim() || !aceite || salvar.isPending}>
              {salvar.isPending && <LoaderCircle className="animate-spin" />} Cadastrar avatar
            </Button>
          </div>
          {!catalogo.data.avatares.length && <p className="text-foot text-orange sm:col-start-2">Sua conta HeyGen ainda não tem avatares. Crie o seu lá primeiro.</p>}
        </form>
      )}
    </Card>
  );
}
