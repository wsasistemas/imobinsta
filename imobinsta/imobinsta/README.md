# imobinsta

Análise do Instagram **@wsasistemas.ia** via **Chatfyre MCP**, dentro do VS Code com Claude Code.

## 1. Criar o repositório e abrir no VS Code

No PowerShell (precisa do Git e do GitHub CLI `gh` logado na conta `wsasistemas`):

```powershell
.\scripts\setup.ps1
```

Ou manualmente:

```powershell
gh repo create wsasistemas/imobinsta --private --source . --remote origin --push
code .
```

## 2. Conectar o Chatfyre

**Claude Code** (terminal do VS Code): o arquivo `.mcp.json` já registra o servidor.
Abra o `claude` na pasta, aprove o servidor `chatfyre` quando perguntado e rode `/mcp`
para autenticar.

**Copilot / modo agente do VS Code**: abra `.vscode/mcp.json` e clique em **Start**.

Se o Chatfyre pedir chave de API em vez de login, copie `.env.example` para `.env`,
preencha `CHATFYRE_API_KEY` e acrescente no `.mcp.json`:

```json
"headers": { "Authorization": "Bearer ${CHATFYRE_API_KEY}" }
```

## 3. Rodar os prompts (nesta ordem)

1. `prompts/01-conectar-chatfyre.md` — valida a conexão e documenta as ferramentas
2. `prompts/02-analisar-instagram.md` — coleta os dados e gera o diagnóstico

No Claude Code: `cole o conteúdo do prompt` ou digite
`siga as instruções de prompts/01-conectar-chatfyre.md`.

## Estrutura

```
.mcp.json              MCP para o Claude Code
.vscode/mcp.json       MCP para o VS Code (Copilot)
CLAUDE.md              regras do projeto
docs/PRD.md            requisitos
prompts/               prompts de conexão e análise
data/raw/              coletas brutas (fora do Git)
reports/               relatórios gerados
```
