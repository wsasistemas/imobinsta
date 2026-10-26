# Prompt 01 — Conectar no Chatfyre e documentar as ferramentas

Cole no Claude Code, dentro da pasta `imobinsta`:

---

Leia `CLAUDE.md` e `docs/PRD.md` antes de começar. Estamos na Fase 0, requisitos R1 e R2.

Objetivo: confirmar a conexão com o servidor MCP `chatfyre` e documentar tudo o que ele oferece.

1. Verifique se o servidor `chatfyre` está conectado e autenticado. Se não estiver,
   pare e me diga exatamente o que fazer (ex.: rodar `/mcp` e autenticar, ou configurar
   chave de API no `.env`).
2. Liste todas as ferramentas do `chatfyre`. Para cada uma, registre: nome, descrição,
   parâmetros (tipo e se é obrigatório) e classifique como LEITURA ou ESCRITA.
3. Chame UMA ferramenta de leitura simples (perfil ou dados da conta) para confirmar que
   a conta conectada é a @wsasistemas.ia. Não chame nenhuma ferramenta de ESCRITA.
4. Para cada ferramenta de leitura relevante para análise (perfil, posts, insights,
   comentários), faça uma chamada pequena de teste (ex.: limite de 3 itens) e guarde um
   exemplo resumido do retorno.
5. Crie `docs/chatfyre-tools.md` com:
   - tabela de ferramentas (nome | leitura/escrita | para que serve | parâmetros)
   - exemplo de retorno de cada ferramenta de leitura testada
   - comparação com as métricas da seção 6 do PRD: o que está disponível e o que falta
   - limites ou erros encontrados (paginação, período máximo, permissões)
6. Atualize a tabela de "Perguntas em aberto" do `docs/PRD.md` com o que você descobriu
   sobre as perguntas 1, 2 e 3.

Termine com um checklist:
- [ ] Servidor conectado e autenticado
- [ ] Conta confirmada como @wsasistemas.ia
- [ ] Ferramentas listadas e classificadas
- [ ] Testes de leitura executados
- [ ] docs/chatfyre-tools.md criado
- [ ] PRD atualizado

Se qualquer item falhar, explique a causa e o próximo passo. Não invente ferramentas nem dados.
