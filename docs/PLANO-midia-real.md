# Fase 12 — Mídia real: fotos e vídeos em post, carrossel, Reels e Stories

Aprovada pelo Wagner em 28/10/2026 (mockup `docs/mockups/midia-real.html`). Checklist em `PLANO-fases.md`.

## Por quê
Hoje o post e o carrossel só saem dos templates da WSA, com texto e cores (Fase 4). O Banco de mídias (Fase 3)
guarda fotos e vídeos, mas o Criar não usa esse material. Também não há Reels montado com fotos e vídeos: a Fase 8
(Remotion no PC) não foi feita. E não há Stories.

## Decisões do Wagner (28/10/2026)
- **Foto inteira + texto opcional.** Cada item do carrossel pode ser uma foto ou um vídeo do Banco em tela cheia, com
  ou sem faixa de texto. Também pode ser uma imagem por IA (Fase 7) ou um slide de template. Os tipos se misturam no
  mesmo carrossel.
- **Vídeo gerado no navegador.** É de graça e não precisa instalar nada. Isto **substitui a Fase 8 (Remotion)**.

## Etapas (checklist binário em PLANO-fases.md quando aprovado)

### 12.1 Post e carrossel com fotos e vídeos do Banco · R$ 0
- Novo tipo de item `midia` no esquema dos slides (`DadosSlide`), com:
  - `midia_id`, enquadramento (foco x/y e zoom) e formato (4:5, 1:1 ou original);
  - texto opcional (sem texto, faixa embaixo, centro ou topo), "escurecer para ler" e logo no canto.
- Seletor do Banco de mídias dentro do editor, com abas Fotos, Vídeos, Logos, Marca e Vids, filtro por pasta e envio
  do computador.
- Item de foto: o PNG sai no navegador, como hoje, com a foto e o texto desenhados juntos.
- Item de vídeo: entra no carrossel como está, sem texto por cima. A `ig-publicar` cria um filho `VIDEO` no
  `CAROUSEL`.
- Item por IA: o botão "Gerar por IA" usa a `ia-imagem` da Fase 7, com teto e confirmação.
- Post único usa o mesmo editor com um item só.

### 12.2 Motor de vídeo no navegador (Reels) · R$ 0
- Saída em 1080 × 1920, 30 fps, H.264 + AAC. O vídeo é desenhado num canvas e codificado com WebCodecs
  (`VideoEncoder`/`AudioEncoder`), e o MP4 é montado com a biblioteca `mp4-muxer`.
- Cenas:
  - foto com movimento (zoom lento ou panorâmica);
  - trecho de vídeo (início e fim) com ou sem som;
  - imagem por IA;
  - cena de CTA com template.
- Texto por cena, trilha do Banco (pasta Trilhas), logo no canto e transição (corte seco ou esmaecer).
- "Roteiro com IA": o Gemini sugere a ordem das cenas e o texto de cada uma a partir do DNA da marca.
- O MP4 vai para o Banco (pasta Reels) e segue o fluxo da Fase 7.2: Publicar Reels com a automação "QUERO".
- Funciona no Chrome e no Edge. Em outros navegadores, a tela avisa. Limite inicial: cerca de 90 s; vídeos mais
  longos seguem pelo Google Vids (Fase 11).

### 12.3 Stories · R$ 0
- Sequência de stories em 9:16. Cada story é uma foto com texto (PNG 1080 × 1920), um vídeo do Banco ou um vídeo
  montado (12.2).
- `ig-publicar`: tipo `STORIES` (`image_url` ou `video_url`), publicação e agendamento pela mesma fila do pg_cron.
- Limite da API da Meta: não dá para pôr figurinhas (link, enquete, menção, contagem regressiva). A tela avisa.

### 12.4 IA escolhe e escreve · cota do Gemini
- "Escrever textos com IA" no carrossel. O Gemini recebe a lista de mídias (nome, pasta e legenda) e o DNA, e devolve
  a ordem dos itens e o texto de cada um, validados com Zod.
- O mesmo vale para as cenas do Reels e para os Stories.

## O que muda no banco
- `posts.formato` já aceita `stories` (Fase 2). A migration nova só acrescenta: `post_itens` para guardar
  `midia_id` e `tipo` por item, caso o JSON dos slides não baste. A decisão fica para a 12.1, depois de ler o
  `ig-publicar`.
- Nenhuma mudança destrutiva.

## Riscos
- **WebCodecs**: AAC no `AudioEncoder` depende do navegador e do sistema. Se não houver, a alternativa é exportar
  sem trilha ou usar Opus/WebM, com aviso. A Meta aceita MP4/MOV para Reels.
- **Memória do navegador** em vídeos longos ou com muitas fotos em 4K: as fotos são reduzidas para 1080 px antes de
  desenhar.
- **Stories pela API**: confirmar a permissão `instagram_content_publish` no app da Meta com o tipo `STORIES`. O
  primeiro teste real decide.
