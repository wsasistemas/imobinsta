# Fase 2 — proposta do tipo de app da Meta

Status: **aprovado pelo Wagner em 26/10/2026**. Página: https://www.facebook.com/profile.php?id=61595954939588
Passo a passo de criação: `docs/fase2-passo-a-passo-app-meta.md`.
Responde à pergunta 2 do `docs/PRD-v2-estudio.md`.

## O que a documentação atual da Meta diz

Conferido em 26/10/2026 em developers.facebook.com/docs/instagram-platform.

| Recurso | Instagram Login | Facebook Login for Business |
|---|---|---|
| Página do Facebook vinculada | não precisa | **precisa** |
| Host / token | `graph.instagram.com`, token de usuário do Instagram | `graph.facebook.com`, token de usuário/página do Facebook |
| Publicar post, carrossel e reels | sim (`instagram_business_content_publish`) | sim (`instagram_content_publish`) |
| Insights por post e da conta | sim (`instagram_business_manage_insights`) | sim (`instagram_manage_insights` + `pages_read_engagement`) |
| `total_views` / `total_likes` agregados da conta | **não** | sim |
| Busca por hashtag (radar, Fase 9) | **não existe** | sim, com o recurso *Instagram Public Content Access* |
| Comentários e mensagens | sim | sim |

Limite da busca por hashtag: até 30 hashtags diferentes a cada 7 dias.

## Recomendação: Facebook Login for Business

Só ele cobre o PRD inteiro: publicação, insights e radar por hashtag. Com Instagram Login,
a Fase 9 (radar) não teria API oficial, e raspagem é proibida pelo projeto.

Custo da escolha:
- a @wsasistemas.ia precisa estar vinculada a uma Página do Facebook, e o Wagner precisa
  ter função nessa Página;
- o recurso *Instagram Public Content Access* passa por análise da Meta (App Review) antes de
  valer fora do modo de desenvolvimento. Ainda não está confirmado se ele funciona em modo de
  desenvolvimento só para a própria conta. Isso será testado na Fase 2, e se não funcionar, o
  radar espera a aprovação.

## O que muda no plano

- `ig-oauth` usa o diálogo do Facebook Login for Business e troca o código por token de longa
  duração (60 dias), guardado no Vault.
- `ig-sync` lê `graph.facebook.com/{ig-user-id}/media` e `/insights`.
- Permissões pedidas: `instagram_basic`, `instagram_content_publish`, `instagram_manage_insights`,
  `instagram_manage_comments`, `pages_show_list`, `pages_read_engagement`.
  `instagram_manage_messages` fica de fora: as DMs continuam com o Chatfyre.

## Antes de codar, o Wagner precisa

1. Confirmar que a @wsasistemas.ia está vinculada a uma Página do Facebook (Instagram →
   Configurações → Central de Contas) e dizer qual é a Página.
2. Criar o app em developers.facebook.com, tipo **Business**, com o caso de uso
   "Gerenciar mensagens e conteúdo no Instagram", ou autorizar que eu prepare o passo a passo.
