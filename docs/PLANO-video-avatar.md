# Fases 13 e 14: vídeo explicativo com avatar + telas do sistema, e LinkedIn

**Proposta de 28/10/2026, aguardando aprovação do Wagner.** Mockup: `docs/mockups/video-avatar.html`.

## Pedido
O Wagner quer vídeos em que ele mesmo, como avatar da HeyGen, explica os sistemas da WSA. As telas do sistema entram no vídeo:
- avatar em qualquer lugar da tela, sobre um print ou vídeo do sistema (layout de "remix");
- ou avatar sentado, explicando em tela cheia.

O vídeo é publicado no Instagram e, se der, no LinkedIn.

## O que já foi feito antes desta proposta (commit 5ecc168)
- Vínculo do avatar corrigido. O estúdio listava os avatares pela API v2, que não mostra os looks de foto (como "Professional in blue blazer"). Por isso o cadastro pegou o avatar gravado no treino. Agora a lista vem de `/v3/avatars/looks?ownership=private`, com foto, agrupada pelo personagem, e a voz clonada vem primeiro.
- `ia-avatar` migrada para a API v3. A HeyGen desliga as rotas v1/v2 em **01/11/2026**.

## Fatos da API da HeyGen v3 que definem o desenho (docs de 28/10/2026)
- `POST /v3/videos` com `type: "avatar"` aceita fundo de cor ou de imagem, `fit` (cover/contain), `aspect_ratio` 9:16/4:5/1:1/16:9 e `resolution` 1080p.
- Para avatar de foto há também `motion_prompt` (gestos) e `expressiveness`.
- **A API não deixa posicionar nem redimensionar o avatar sobre o fundo.** Só a marca d'água tem posição.
- `output_format: "webm"` devolve o avatar **com fundo transparente** (canal alfa) e já remove o fundo. Funciona com Avatar IV, inclusive com avatar de foto (a confirmar no primeiro teste).
- O vídeo traz a legenda em SRT (`subtitle_url`).
- O custo é em **crédito de API**, separado do crédito do plano do site. A documentação não traz o preço por segundo; o estúdio usa `HEYGEN_USD_POR_MINUTO`.

**Desenho:** cada cena gera um vídeo do avatar na HeyGen.
- Cena de apresentador: MP4 com o cenário do próprio look.
- Cena com o sistema ao fundo: WebM transparente.
- A montagem (posição, tamanho, forma, fundo, legenda, logo, trilha e formato) é feita no navegador com o motor da Fase 12.2. Mudar a montagem não gasta crédito.

## Etapas

### 13.1 Roteiro em cenas · R$ 0 (Gemini)
- `ia-texto`, nova ação `roteiro_cenas`, com entradas sistema, objetivo, duração e mídias do Banco (pasta Sistemas). Devolve uma lista de cenas `{ fala, layout, midia_sugerida }`, validada com Zod.
- Migration aditiva: `roteiros.cenas_json` (jsonb) e `roteiros.projeto_json` (montagem). Nenhuma mudança destrutiva.
- Tela "Roteiro em cenas" igual ao mockup: editar a fala, trocar o layout e escolher o fundo de cada cena.

### 13.2 Avatar por cena na HeyGen · crédito de API
- `ia-avatar`, ação `gerar_cenas`: uma chamada `POST /v3/videos` por cena, com o mesmo teto mensal e a confirmação da Fase 7.
  - Apresentador: MP4 (`fit: cover`).
  - Demais layouts: `output_format: "webm"`.
  - Look de foto: `motion_prompt` do tipo "sitting at a desk, explaining with natural hand gestures".
- `status_cenas`: baixa cada vídeo e o SRT para o Banco (pasta Avatar). O custo é registrado uma vez por cena.
- Mudar só a fala de uma cena gera só aquela cena de novo.

### 13.3 Montagem no navegador · R$ 0
- Motor `video.ts` com camada de avatar:
  - WebM com alfa desenhado no canvas;
  - posição arrastável, tamanho, forma (recorte, bolha ou cartão);
  - fundo de print, vídeo do sistema ou cor da marca;
  - layouts apresentador, canto, bolha e tela dividida.
- Áudio: a fala vem dos vídeos do avatar, com a trilha baixa (cerca de 15%).
- Legenda automática pelo SRT, palavra a palavra ou por frase. Logo no canto.
- Formatos do mesmo projeto: 9:16 (Reels), 4:5 e 1:1 (LinkedIn), 16:9.
- O MP4 vai para o Banco (pasta Reels) e segue para o Publicar (Reels + "QUERO"), que já existe.

### 14.1 LinkedIn · perfil pessoal · R$ 0
- App no LinkedIn Developer Portal (Wagner) com os produtos "Share on LinkedIn" (`w_member_social`) e "Sign In with LinkedIn using OpenID Connect".
- Edge Function `li-oauth`: conexão, com o token no Vault, como no Instagram.
- Edge Function `li-publicar`: `POST /rest/videos?action=initializeUpload` → upload em partes → finalizar → esperar o status AVAILABLE → criar o post com `author = urn:li:person:…`.
  - MP4 de 3 s a 30 min e até 500 MB (fonte de terceiros; confirmar).
- A IA adapta a legenda para o LinkedIn, sem "comente QUERO".
- A página da empresa fica para depois: exige a Community Management API, com análise da LinkedIn.

## Riscos
- **WebM transparente com avatar de foto:** a documentação diz que funciona no Avatar IV, mas falta confirmar com o look "Professional in blue blazer". Se falhar, as cenas de sistema usam MP4 com fundo de cor sólida e recorte por chroma key no navegador.
- **Preço da API da HeyGen:** conferir no painel de API antes de publicar o primeiro vídeo e ajustar `HEYGEN_USD_POR_MINUTO`.
- **LinkedIn:** a liberação automática do "Share on LinkedIn" vem de fontes de terceiros. Confirmar no portal.

## Checklist (quando aprovado, entra no PLANO-fases.md)
- [ ] 13.1 Roteiro em cenas
- [ ] 13.2 Avatar por cena na HeyGen
- [ ] 13.3 Montagem com avatar posicionável
- [ ] 14.1 LinkedIn perfil pessoal
