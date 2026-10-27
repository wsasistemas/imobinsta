# Obtém (ou renova) o token OAuth do Chatfyre para o Claude Code usar o MCP com header Bearer.
#
# Por que existe: o Chatfyre só aceita o redirect dos conectores do claude.ai
# (https://claude.ai/api/mcp/auth_callback), então o /mcp do Claude Code não autentica.
# Este script faz o fluxo OAuth (PKCE) com esse redirect e você copia o código da barra
# de endereço.
#
# Uso, a partir da pasta do projeto:
#   .\scripts\chatfyre-token.ps1            # primeiro login
#   .\scripts\chatfyre-token.ps1 -Renovar   # renova com o refresh token salvo
#
# Grava em .env (fora do Git) e na variável de ambiente do usuário CHATFYRE_TOKEN.
# Nunca cole o token ou a URL de retorno no chat.

#   .\scripts\chatfyre-token.ps1 -Escrita   # login com permissão de criar/editar automações
#   .\scripts\chatfyre-token.ps1 -Exportar  # login SEPARADO para o estúdio (Edge Functions):
#        não mexe no .env; copia um pacote para a área de transferência. Cole em
#        Conexões e custos → Chatfyre. O pacote não aparece na tela e não vai para o chat.

param([switch]$Renovar, [switch]$Escrita, [switch]$Exportar)

$ErrorActionPreference = "Stop"

$Servidor    = "https://chatfyre.com"
$Recurso     = "https://chatfyre.com/api/mcp"
$Redirect    = "https://claude.ai/api/mcp/auth_callback"
$Escopo      = if ($Escrita -or $Exportar) { "automacoes:ler automacoes:escrever" } else { "automacoes:ler" }
$ArquivoEnv  = Join-Path (Split-Path $PSScriptRoot -Parent) ".env"

function ConvertTo-Base64Url([byte[]]$bytes) {
    [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function New-Aleatorio([int]$tamanho) {
    $bytes = New-Object byte[] $tamanho
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    ConvertTo-Base64Url $bytes
}

function Read-Env {
    $valores = [ordered]@{}
    if (Test-Path $ArquivoEnv) {
        foreach ($linha in [IO.File]::ReadAllLines($ArquivoEnv)) {
            if ($linha -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$') { $valores[$Matches[1]] = $Matches[2] }
        }
    }
    $valores
}

function Write-Env($valores) {
    $linhas = foreach ($k in $valores.Keys) { "$k=$($valores[$k])" }
    [IO.File]::WriteAllLines($ArquivoEnv, [string[]]$linhas, (New-Object System.Text.UTF8Encoding($false)))
}

function Get-DetalheErro($erro) {
    if ($erro.ErrorDetails -and $erro.ErrorDetails.Message) { return $erro.ErrorDetails.Message }
    $resp = $erro.Exception.Response
    if ($resp) {
        try {
            $leitor = New-Object IO.StreamReader($resp.GetResponseStream())
            return "HTTP $([int]$resp.StatusCode): $($leitor.ReadToEnd())"
        } catch {}
    }
    $erro.Exception.Message
}

function Invoke-Token($corpo, $clientSecret) {
    if ($clientSecret) { $corpo["client_secret"] = $clientSecret }
    try {
        Invoke-RestMethod -Method Post -Uri "$Servidor/api/oauth/mcp/token" `
            -ContentType "application/x-www-form-urlencoded" -Body $corpo
    } catch {
        throw "Falha ao obter token: $(Get-DetalheErro $_)"
    }
}

function Save-Token($resposta, $clientId, $clientSecret) {
    if (-not $resposta.access_token) { throw "Resposta sem access_token." }
    $env_ = Read-Env
    $env_.Remove("CHATFYRE_API_KEY")
    $env_["CHATFYRE_CLIENT_ID"] = $clientId
    if ($clientSecret) { $env_["CHATFYRE_CLIENT_SECRET"] = $clientSecret }
    $env_["CHATFYRE_TOKEN"] = $resposta.access_token
    if ($resposta.refresh_token) { $env_["CHATFYRE_REFRESH_TOKEN"] = $resposta.refresh_token }
    if ($resposta.expires_in) {
        $env_["CHATFYRE_TOKEN_EXPIRA"] = (Get-Date).AddSeconds([int]$resposta.expires_in).ToString("yyyy-MM-dd HH:mm")
    }
    Write-Env $env_
    [Environment]::SetEnvironmentVariable("CHATFYRE_TOKEN", $resposta.access_token, "User")

    Write-Host ""
    Write-Host "Token salvo em .env e na variável de usuário CHATFYRE_TOKEN." -ForegroundColor Green
    if ($env_["CHATFYRE_TOKEN_EXPIRA"]) { Write-Host "Expira em: $($env_["CHATFYRE_TOKEN_EXPIRA"])" }
    Write-Host "Feche e reabra o VS Code para o Claude Code enxergar a variável."
}

# --- Renovação -------------------------------------------------------------------------
if ($Renovar) {
    $env_ = Read-Env
    if (-not $env_["CHATFYRE_REFRESH_TOKEN"] -or -not $env_["CHATFYRE_CLIENT_ID"]) {
        Write-Error "Sem CHATFYRE_REFRESH_TOKEN/CHATFYRE_CLIENT_ID no .env. Rode sem -Renovar."
    }
    $resposta = Invoke-Token @{
        grant_type    = "refresh_token"
        refresh_token = $env_["CHATFYRE_REFRESH_TOKEN"]
        client_id     = $env_["CHATFYRE_CLIENT_ID"]
        resource      = $Recurso
    } $env_["CHATFYRE_CLIENT_SECRET"]
    Save-Token $resposta $env_["CHATFYRE_CLIENT_ID"] $env_["CHATFYRE_CLIENT_SECRET"]
    exit 0
}

# --- 1. Registro do cliente (Dynamic Client Registration) ------------------------------
$registro = @{
    client_name                = $(if ($Exportar) { "imobinsta (Estúdio)" } else { "imobinsta (Claude Code)" })
    redirect_uris              = @($Redirect)
    grant_types                = @("authorization_code", "refresh_token")
    response_types             = @("code")
    token_endpoint_auth_method = "client_secret_post"
    scope                      = $Escopo
} | ConvertTo-Json

try {
    $cliente = Invoke-RestMethod -Method Post -Uri "$Servidor/api/oauth/mcp/register-client" `
        -ContentType "application/json" -Body $registro
} catch {
    throw "Falha ao registrar cliente: $(Get-DetalheErro $_)"
}
$clientId = $cliente.client_id
$clientSecret = $cliente.client_secret
Write-Host "Cliente registrado (método de autenticação: $($cliente.token_endpoint_auth_method), secret: $(if ($clientSecret) { 'sim' } else { 'não' }))."

# --- 2. PKCE + URL de autorização ------------------------------------------------------
$verificador = New-Aleatorio 48
$sha = [System.Security.Cryptography.SHA256]::Create()
$desafio = ConvertTo-Base64Url ($sha.ComputeHash([Text.Encoding]::ASCII.GetBytes($verificador)))
$estado = New-Aleatorio 16

$parametros = [ordered]@{
    response_type         = "code"
    client_id             = $clientId
    redirect_uri          = $Redirect
    scope                 = $Escopo
    state                 = $estado
    code_challenge        = $desafio
    code_challenge_method = "S256"
    resource              = $Recurso
}
$query = ($parametros.Keys | ForEach-Object { "$_=$([uri]::EscapeDataString($parametros[$_]))" }) -join "&"
$urlAutorizacao = "$Servidor/api/oauth/mcp/authorize?$query"

Write-Host ""
Write-Host "1. O navegador vai abrir o login do Chatfyre. Entre com a conta ligada à @wsasistemas.ia e autorize."
Write-Host "   ANTES de autorizar: F12 > aba Network (Rede) > marque 'Preserve log' > filtre por auth_callback."
Write-Host "2. Depois de autorizar, o claude.ai mostra erro e redireciona. É esperado."
Write-Host "3. No Network, botão direito na linha auth_callback > Copy > Copy URL. Cole aqui RÁPIDO (o código vence)."
Write-Host ""
Start-Process $urlAutorizacao

do {
    $retorno = (Read-Host "Cole aqui a URL de retorno (começa com https://claude.ai/api/mcp/auth_callback?code=)").Trim()
    if ($retorno -and $retorno -notmatch '\?') { Write-Host "Essa não é a URL completa. Copie de novo (Copy URL)." -ForegroundColor Yellow; $retorno = "" }
} until ($retorno)

# --- 3. Valida o retorno e troca o código pelo token -----------------------------------
$params = @{}
$parteQuery = ($retorno -split '\?', 2)[1]
if (-not $parteQuery) { Write-Error "URL sem parâmetros. Copie a URL completa, com ?code=..." }
foreach ($par in ($parteQuery -split '#')[0] -split '&') {
    $kv = $par -split '=', 2
    if ($kv.Count -eq 2) { $params[$kv[0]] = [uri]::UnescapeDataString($kv[1]) }
}

if ($params["error"]) { throw "O Chatfyre recusou: $($params["error"]) $($params["error_description"])" }
if (-not $params["code"]) { throw "Não achei 'code' na URL colada." }
if ($params["state"] -ne $estado) { throw "O 'state' não confere: a URL é de outra execução. Rode o script de novo." }

$resposta = Invoke-Token @{
    grant_type    = "authorization_code"
    code          = $params["code"]
    redirect_uri  = $Redirect
    client_id     = $clientId
    code_verifier = $verificador
    resource      = $Recurso
} $clientSecret

if ($Exportar) {
    if (-not $resposta.access_token -or -not $resposta.refresh_token) { throw "O Chatfyre não devolveu refresh_token: o estúdio não conseguiria renovar o acesso." }
    $pacote = [ordered]@{
        client_id     = $clientId
        client_secret = $clientSecret
        refresh_token = $resposta.refresh_token
        access_token  = $resposta.access_token
        expira_em     = (Get-Date).ToUniversalTime().AddSeconds([int]($(if ($resposta.expires_in) { $resposta.expires_in } else { 3600 }))).ToString("o")
    } | ConvertTo-Json -Compress
    [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($pacote)) | Set-Clipboard
    Write-Host ""
    Write-Host "Pacote do estúdio copiado para a área de transferência." -ForegroundColor Green
    Write-Host "Abra o estúdio > Conexões e custos > Chatfyre > cole e clique em Salvar. Não cole no chat."
    exit 0
}
Save-Token $resposta $clientId $clientSecret
