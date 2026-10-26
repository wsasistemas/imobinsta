# Cria o repositório wsasistemas/imobinsta no GitHub e abre no VS Code.
# Rode a partir da pasta do projeto: .\scripts\setup.ps1

$ErrorActionPreference = "Stop"

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-Error "GitHub CLI (gh) não encontrado. Instale: winget install GitHub.cli"
}

$conta = gh api user --jq .login
if ($conta -ne "wsasistemas") {
    Write-Warning "gh está logado como '$conta'. Rode 'gh auth switch' para a conta wsasistemas."
    exit 1
}

if (-not (Test-Path .git)) {
    git init -b main
}
git add .
git commit -m "chore: estrutura inicial do imobinsta (Chatfyre MCP, PRD e prompts)"

gh repo create wsasistemas/imobinsta --private --source . --remote origin --push

code .
Write-Host "Pronto. Abra o terminal do VS Code, rode 'claude' e depois '/mcp'."
