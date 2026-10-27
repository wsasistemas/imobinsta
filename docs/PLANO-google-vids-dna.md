# Plano — Google Vids e "DNA da marca" (estilo Pomelli) no Estúdio imobinsta

**Status:** proposta para aprovação (27/10/2026). Mockup: `docs/mockups/google-vids-dna.html`.

## 1. O que é possível (pesquisa de 27/10/2026)

| Ferramenta | Tem API? | Grátis? | No Brasil? | Como entra no estúdio |
|---|---|---|---|---|
| **Google Vids** (app do Workspace) | **Não** há API pública para criar vídeo | Incluído em planos do Workspace; conta pessoal com recursos limitados (conferir no seu plano) | Sim | **Ponte manual pelo Google Drive**: o estúdio manda o pacote (roteiro, textos, imagens) para uma pasta; você monta no Vids e exporta o MP4 para a pasta "prontos"; o estúdio importa e publica como Reels |
| **Veo 3.1** (motor de vídeo do Google, o mesmo do Vids) | **Sim**, pela Gemini API (mesma chave do AI Studio) | **Não**: cobrado por segundo de vídeo | Sim | Opcional: provedor de vídeo dentro do teto de gasto da Fase 7 (clipes de 8 s) |
| **Pomelli** (Google Labs, "Business DNA") | **Não** há API | Grátis | **Não** (só EUA, Canadá, Austrália, Nova Zelândia) | Não dá para conectar. **Fazemos o mesmo recurso dentro do estúdio** com o Gemini (custo zero na cota gratuita) |

Fontes: Gemini API — Veo 3.1 (ai.google.dev/gemini-api/docs/veo); blog do Google sobre o Pomelli;
guias de terceiros sobre disponibilidade e ausência de API do Pomelli. Disponibilidade muda: reconferir antes de implementar.

## 2. Proposta

### Fase 10 — DNA da marca (o "Pomelli" do estúdio) · custo R$ 0
O estúdio lê o site da empresa e monta o DNA, que passa a guiar tudo que a IA cria.

1. **Ler o site** (Edge Function `ia-texto`, ação `dna`, reaproveitando o leitor de link da Fase 4):
   - cores: `theme-color`, variáveis CSS e as cores mais usadas nas folhas de estilo;
   - fontes: `font-family` e links do Google Fonts;
   - imagens: logo, `og:image` e as maiores imagens da página (até 12, vão para o Banco de mídias, pasta "Marca");
   - textos: título, descrição e corpo das páginas principais (home + até 3 links internos).
2. **Gemini resume** (JSON validado com Zod): tom de voz (3 adjetivos + exemplos de frase), público, pilares de conteúdo,
   palavras a usar e a evitar, proposta de valor. Nada é inventado: o que não estiver no site fica em branco para você preencher.
3. **Tela "DNA da marca"** (menu Conta): tudo editável — paleta, fontes, imagens, tom de voz. Botão "Ler de novo".
4. **O DNA entra em tudo:**
   - prompts de legenda, carrossel, roteiro e pautas (`ia-texto` anexa o DNA à instrução);
   - novo template **"Marca"**, com as cores e a fonte do DNA (além dos 3 templates WSA);
   - imagem por IA (Fase 7) recebe a paleta e o estilo visual.
5. **Campanhas sugeridas** (como o Pomelli): "Sugerir campanha" → a IA propõe 3 campanhas (objetivo, período,
   público, 4 a 8 posts cada) a partir do DNA + ranking real de alcance (Fase 2). Ao aprovar, os posts viram **pautas no
   Calendário** (Fase 6) e cada uma abre o wizard já preenchido → **post editável** no editor.

Migration aditiva: `marca_dna` (conta_id, site_url, cores jsonb, fontes jsonb, imagens jsonb, tom_voz jsonb, publico,
pilares, palavras jsonb, lido_em, editado_em) e `campanhas` (conta_id, nome, objetivo, inicio, fim, status) com
`pautas.campanha_id`. RLS por conta; só o dono edita o DNA.

### Fase 11 — Google Vids pela ponte do Google Drive · custo R$ 0
1. **Conexão Google** em Conexões e custos: OAuth do Google com o escopo mínimo `drive.file` (o estúdio só enxerga as
   pastas e arquivos que ele mesmo criou). Token no Vault, como o Instagram.
2. **"Abrir no Google Vids"** (no wizard de vídeo e no Calendário): o estúdio cria a pasta
   `Estúdio imobinsta/Vids/<título>` com:
   - `roteiro.txt` (roteiro do Gemini, cena a cena, com o DNA da marca),
   - as imagens escolhidas do Banco de mídias e o logo,
   - `legenda.txt` com a legenda do Reels.
   Depois abre o Google Vids numa aba nova (vids.google.com) para você criar (o Vids lê arquivos do Drive).
3. Você exporta o vídeo no Vids (MP4) para a subpasta **`prontos/`** da mesma pasta.
4. **Importar**: o estúdio confere a pasta (botão "Buscar vídeos prontos" e, depois, a cada hora pelo pg_cron),
   copia o MP4 para o Banco de mídias e oferece **"Criar Reels"** → tela Publicar (Fase 7.2) com a automação "QUERO".
5. **Opcional (pago, dentro do teto):** gerar clipes curtos com **Veo 3.1** pela chave do Gemini, para usar como
   cenas no Vids ou direto como Reels.

## 3. O que NÃO dá para fazer (e por quê)
- Gerar o vídeo **dentro** do Vids sem você: não há API. O passo de montar/exportar no Vids é manual.
- Conectar o Pomelli: sem API e fora do Brasil. O recurso equivalente fica no próprio estúdio.
- Avatares do Vids: recurso do app, sem acesso externo. Para avatar automático continua a HeyGen (Fase 7.2).

## 4. Fases e checklist (para aprovar)

**Fase 10 — DNA da marca**
- [ ] Migration `marca_dna`, `campanhas`, `pautas.campanha_id` (testada no PGlite)
- [ ] `ia-texto` ação `dna` (ler site + Gemini) e anexar o DNA aos prompts
- [ ] Tela DNA da marca (editável) e card em Conexões
- [ ] Template "Marca" com cores e fonte do DNA
- [ ] Campanhas sugeridas → pautas no Calendário → post editável

**Fase 11 — Google Vids**
- [ ] Conexão Google (OAuth `drive.file`, token no Vault) — app OAuth do Google Cloud em modo de teste
- [ ] "Abrir no Google Vids": pasta com roteiro, imagens e legenda no Drive
- [ ] Importar MP4 da pasta `prontos/` (botão + pg_cron) → Banco de mídias → Reels
- [ ] (Opcional) Veo 3.1 pela chave do Gemini, dentro do teto

**Para ligar (Wagner):** criar um projeto no Google Cloud com a tela de consentimento OAuth em modo de teste
e cadastrar o seu e-mail como testador (passo a passo no próprio estúdio, como foi o app da Meta).

## 5. Ordem sugerida
1. Fase 10 (DNA) primeiro: não depende de nada novo e melhora tudo que já existe.
2. Fase 11 (Vids) depois: depende do OAuth do Google.
