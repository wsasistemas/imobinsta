# Fase 2 — passo a passo do app da Meta (Facebook Login for Business)

Para o Wagner fazer no navegador. Decisão aprovada em 26/10/2026, ver `docs/fase2-proposta-app-meta.md`.
Página do Facebook vinculada à @wsasistemas.ia: https://www.facebook.com/profile.php?id=61595954939588

Os nomes das telas seguem a documentação da Meta de outubro/2026. Se algum botão estiver com
outro nome, me mande um print e eu ajusto o passo.

---

## Etapa 0 — Conferir a conta (2 min)

- [ ] No app do Instagram, em **Configurações → Tipo de conta e ferramentas**, a @wsasistemas.ia
      aparece como conta **Comercial** ou **Criador de conteúdo**.
- [ ] Na **Central de Contas**, a Página acima aparece vinculada à @wsasistemas.ia.
- [ ] Seu perfil pessoal do Facebook tem **controle total** da Página: Página → Configurações →
      Acesso à Página.

## Etapa 1 — Criar o app

1. Entre em https://developers.facebook.com/apps com o seu Facebook pessoal, o mesmo que
   administra a Página.
2. Se for o primeiro app, a Meta pede para **se cadastrar como desenvolvedor**. Aceite os termos
   e confirme o e-mail ou o telefone.
3. Clique em **Criar app**.
4. Em **Detalhes do app**, use o nome `imobinsta` e o seu e-mail de contato.
5. Em **Casos de uso**, marque **Gerenciar mensagens e conteúdo no Instagram**
   (*Manage messaging and content on Instagram*).
6. Em **Empresa**, escolha o portfólio empresarial da WSA, se existir. Se não existir,
   escolha "Ainda não quero conectar um portfólio".
7. Revise e clique em **Criar app**. A Meta pede a sua senha.

## Etapa 2 — Escolher o caminho com Facebook Login

1. No painel do app, abra **Painel** no menu da esquerda e clique em
   **Personalizar o caso de uso Gerenciar mensagens e conteúdo no Instagram**.
2. No menu da esquerda, escolha **Configuração da API com login do Facebook**
   (*API setup with Facebook Login*).
   Atenção: o app aceita **só um** dos dois caminhos. Não clique no de "login do Instagram".
3. Em gerenciamento de conteúdo, clique em **Adicionar todas as permissões necessárias**.
   Devem entrar: `business_management`, `instagram_basic`, `instagram_content_publish`,
   `pages_read_engagement` e `pages_show_list`.
4. Em **Permissões e recursos**, no menu da esquerda, adicione também:
   - `instagram_manage_insights` (métricas por post e da conta)
   - `instagram_manage_comments` (ler comentários)
   - o recurso **Instagram Public Content Access** (busca por hashtag, para o radar)
   - **Não** adicione `instagram_manage_messages`. As DMs continuam no Chatfyre.
5. **Não** configure webhooks agora.

## Etapa 3 — Configurar o Facebook Login for Business

1. Em **Concluir configuração**, clique em **Configurar o Login do Facebook para Empresas**.
2. Em **Configurações**, no campo **URIs de redirecionamento do OAuth válidos**, cole:
   ```
   https://ikvjaowvpvxojvcfwnct.supabase.co/functions/v1/ig-oauth
   ```
   Deixe ligados **Login no OAuth do cliente** e **Login no OAuth da Web**. Salve.
3. Em **Configurações** (*Configurations*), clique em **Criar configuração**:
   - Nome: `imobinsta-estudio`
   - Tipo de token: **Token de acesso do usuário**
   - Ativos: **Páginas** e **Contas do Instagram**
   - Permissões: as mesmas da Etapa 2
   - Salve e **anote o ID da configuração**.

## Etapa 4 — Dados básicos do app

Vá em **Configurações do app → Básico**:

1. **URL da Política de Privacidade:** use uma página da WSA. Se não houver, me avise que eu
   preparo uma.
2. **Categoria:** Negócios e páginas.
3. **Ícone:** o logo da WSA (1024×1024).
4. Salve.

## Etapa 5 — Me passar os dados (e só estes)

**Pode mandar no chat:**
- [ ] **ID do app**, que aparece no topo do painel
- [ ] **ID da configuração**, da Etapa 3

**Não mande no chat:** a **Chave secreta do app** (*App Secret*). Ela vai direto para o Supabase:

1. Abra o painel do Supabase, projeto ikvj → **Edge Functions → Secrets**.
2. Clique em **Add new secret**:
   - Nome: `META_APP_SECRET`
   - Valor: a chave secreta, de **Configurações do app → Básico → Mostrar**
3. Salve e me avise que salvou.

## Etapa 6 — Modo do app

**Deixe o app em modo de Desenvolvimento.** Nesse modo, você, como administrador do app, consegue
conectar a sua própria conta sem análise da Meta. Isso basta para a Fase 2.

A análise da Meta (*App Review*) só será necessária se:
- a busca por hashtag não funcionar em modo de desenvolvimento (será testado na Fase 2); ou
- o estúdio passar a conectar contas de clientes, porque esses dados não são seus.
