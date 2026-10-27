import { Link } from "react-router";
import { ChartColumn, Download } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/hig";
import { useAcesso } from "@/features/auth/acesso";
import { dataCurta, FORMATO_ROTULO, numero, tituloDoPost, useMetricasConta, usePosts, type Post } from "./dados";

const DIA = 24 * 3600 * 1000;

function Kpi({ rotulo, valor, nota }: { rotulo: string; valor: string; nota?: string }) {
  return (
    <Card className="p-5">
      <small className="text-foot font-medium text-label2">{rotulo}</small>
      <div className="mt-3 mb-2 text-[40px] leading-none font-bold tracking-[-0.03em] tabular-nums">{valor}</div>
      <Badge tom="ok">{nota ?? "dado real"}</Badge>
    </Card>
  );
}

function exportarCsv(posts: Post[]) {
  const cab = ["publicado_em", "formato", "titulo", "alcance", "views", "curtidas", "comentarios", "salvamentos", "compartilhamentos", "permalink"];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const linhas = posts.map((p) =>
    [p.publicado_em, FORMATO_ROTULO[p.formato], tituloDoPost(p), p.alcance, p.views, p.curtidas, p.comentarios, p.salvamentos, p.compartilhamentos, p.permalink]
      .map(esc)
      .join(";"),
  );
  const blob = new Blob(["﻿" + [cab.join(";"), ...linhas].join("\n")], { type: "text/csv;charset=utf-8" });
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(blob),
    download: `imobinsta-posts-${new Date().toISOString().slice(0, 10)}.csv`,
  });
  a.click();
  URL.revokeObjectURL(a.href);
}

export function Analytics() {
  const { conta } = useAcesso();
  const posts = usePosts();
  const metricas = useMetricasConta();
  const carregando = posts.isLoading || metricas.isLoading;

  const publicados = (posts.data ?? []).filter((p) => p.status === "publicado" && p.publicado_em);
  const serie = metricas.data ?? [];
  const atual = serie.at(-1);
  const primeira = serie[0];

  const agora = Date.now();
  const posts90 = publicados.filter((p) => agora - new Date(p.publicado_em!).getTime() <= 90 * DIA).length;
  const ultimoPost = publicados.reduce<number | null>((m, p) => Math.max(m ?? 0, new Date(p.publicado_em!).getTime()), null);
  const diasSemPostar = ultimoPost == null ? null : Math.floor((agora - ultimoPost) / DIA);
  const comAlcance = publicados.filter((p) => p.alcance != null);
  const alcanceMedio = comAlcance.length
    ? Math.round(comAlcance.reduce((s, p) => s + p.alcance!, 0) / comAlcance.length)
    : null;
  const ganho = atual?.seguidores != null && primeira?.seguidores != null && serie.length > 1 ? atual.seguidores - primeira.seguidores : null;

  const ultimos = serie.slice(-30);
  const valores = ultimos.map((m) => m.seguidores ?? 0);
  const min = Math.min(...valores, Infinity);
  const max = Math.max(...valores, -Infinity);
  const altura = (v: number) => (max === min ? 60 : 15 + ((v - min) / (max - min)) * 85);

  const ranking = [...comAlcance].sort((a, b) => b.alcance! - a.alcance!).slice(0, 10);

  return (
    <section className="pagina-entra">
      <PageHeader
        titulo="Analytics"
        subtitulo={`Estatísticas da @${conta?.ig_username ?? "conta"} — API oficial do Instagram${atual ? ` · atualizado em ${dataCurta(atual.data)}` : ""}`}
        icone={ChartColumn}
        cor="indigo"
        acoes={
          <Button variante="secundario" onClick={() => exportarCsv(publicados)} disabled={!publicados.length}>
            <Download /> Exportar CSV
          </Button>
        }
      />

      {(posts.error || metricas.error) && <Card className="mb-6 text-red">Não foi possível carregar as métricas. Atualize a página.</Card>}

      {!carregando && !serie.length && !publicados.length && (
        <Card className="mb-6 text-label2">
          Ainda não há dados. Em <Link to="/conexoes" className="text-blue">Conexões e custos</Link>, clique em Sincronizar agora.
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy={carregando}>
        <Kpi rotulo="SEGUIDORES" valor={numero(atual?.seguidores)} nota={ganho != null ? `${ganho >= 0 ? "+" : ""}${ganho} desde ${dataCurta(primeira!.data)}` : undefined} />
        <Kpi rotulo="POSTS EM 90 DIAS" valor={numero(posts90)} />
        <Kpi rotulo="DIAS SEM POSTAR" valor={numero(diasSemPostar)} />
        <Kpi rotulo="ALCANCE MÉDIO POR POST" valor={numero(alcanceMedio)} nota={`${comAlcance.length} posts com métrica`} />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_1.4fr]">
        <Card>
          <b className="text-body">Seguidores por dia</b>
          {ultimos.length ? (
            <div className="mt-3 flex h-[220px] items-end gap-2 py-3" role="img" aria-label={`Seguidores nos últimos ${ultimos.length} registros`}>
              {ultimos.map((m) => (
                <div key={m.data} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${dataCurta(m.data)}: ${numero(m.seguidores)}`}>
                  <span className="text-cap2 text-label2 tabular-nums">{ultimos.length <= 10 ? numero(m.seguidores) : ""}</span>
                  <i
                    className="block w-full max-w-12 rounded-t-[6px] rounded-b-[2px] bg-[linear-gradient(180deg,var(--indigo),var(--blue))]"
                    style={{ height: `${altura(m.seguidores ?? 0)}%` }}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3 grid h-[220px] place-items-center text-foot text-label2">Sem registros ainda.</div>
          )}
          <small className="text-cap1 text-label2">
            Um ponto por sincronização. O histórico cresce a cada dia{ultimos.length < 2 ? "; com um ponto só ainda não há tendência" : ""}.
          </small>
        </Card>

        <Card className="overflow-x-auto">
          <b className="text-body">Ranking de posts por alcance</b>
          <table className="mt-2 w-full min-w-[520px] text-sub">
            <thead>
              <tr className="text-left text-foot text-label2">
                <th className="border-b-[0.5px] px-2 py-3 font-medium">Post</th>
                <th className="border-b-[0.5px] px-2 py-3 font-medium">Formato</th>
                <th className="border-b-[0.5px] px-2 py-3 text-right font-medium">Alcance</th>
                <th className="border-b-[0.5px] px-2 py-3 text-right font-medium">Curt.</th>
                <th className="border-b-[0.5px] px-2 py-3 text-right font-medium">Salv.</th>
                <th className="border-b-[0.5px] px-2 py-3 text-right font-medium">Comp.</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((p) => (
                <tr key={p.id}>
                  <td className="max-w-[260px] border-b-[0.5px] px-2 py-3">
                    <a href={p.permalink ?? undefined} target="_blank" rel="noreferrer" className="line-clamp-1 hover:text-blue">
                      {tituloDoPost(p)}
                    </a>
                    <small className="text-cap1 text-label2">{dataCurta(p.publicado_em)}</small>
                  </td>
                  <td className="border-b-[0.5px] px-2 py-3 text-label2">{FORMATO_ROTULO[p.formato]}</td>
                  <td className="border-b-[0.5px] px-2 py-3 text-right font-semibold tabular-nums">{numero(p.alcance)}</td>
                  <td className="border-b-[0.5px] px-2 py-3 text-right tabular-nums">{numero(p.curtidas)}</td>
                  <td className="border-b-[0.5px] px-2 py-3 text-right tabular-nums">{numero(p.salvamentos)}</td>
                  <td className="border-b-[0.5px] px-2 py-3 text-right tabular-nums">{numero(p.compartilhamentos)}</td>
                </tr>
              ))}
              {!carregando && !ranking.length && (
                <tr>
                  <td colSpan={6} className="px-2 py-6 text-center text-label2">Nenhum post com métrica de alcance ainda.</td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>
    </section>
  );
}
