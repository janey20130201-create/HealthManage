param(
  [int]$Port = 0,
  [string]$ProjectRoot = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRoot = if ($ProjectRoot) { (Resolve-Path -LiteralPath $ProjectRoot).Path } else { (Get-Location).Path }

function Import-DotEnv {
  param([string]$Path)
  $values = @{}
  if (-not (Test-Path -LiteralPath $Path)) { return $values }

  foreach ($line in Get-Content -LiteralPath $Path -Encoding utf8) {
    if ($line -match '^\s*#' -or $line -notmatch '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') { continue }
    $name = $matches[1]
    $value = $matches[2].Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    $values[$name] = $value
  }
  return $values
}

$config = Import-DotEnv -Path (Join-Path $projectRoot '.env')
if ($Port -le 0) {
  $configuredPort = if ($config.ContainsKey('API_PORT')) { $config['API_PORT'] } else { '3000' }
  if (-not [int]::TryParse($configuredPort, [ref]$Port)) { $Port = 3000 }
}

$openAiApiKey = if ($config.ContainsKey('OPENAI_API_KEY')) { $config['OPENAI_API_KEY'] } else { '' }
$openAiModel = if ($config.ContainsKey('OPENAI_MODEL')) { $config['OPENAI_MODEL'] } else { 'gpt-5.3-chat-latest' }
$openAiBaseUrl = if ($config.ContainsKey('OPENAI_API_BASE_URL')) { $config['OPENAI_API_BASE_URL'].TrimEnd('/') } else { 'https://api.openai.com/v1' }
$requestTimeoutSeconds = 30
if ($config.ContainsKey('API_REQUEST_TIMEOUT_MS')) {
  $timeoutMs = 0
  if ([int]::TryParse($config['API_REQUEST_TIMEOUT_MS'], [ref]$timeoutMs)) {
    $requestTimeoutSeconds = [Math]::Max(5, [Math]::Ceiling($timeoutMs / 1000))
  }
}
$allowedOrigins = @('http://127.0.0.1:5500', 'http://localhost:5500')
if ($config.ContainsKey('CLIENT_ORIGIN') -and $config['CLIENT_ORIGIN']) {
  $allowedOrigins = @($config['CLIENT_ORIGIN'].Split(',') | ForEach-Object { $_.Trim().TrimEnd('/') } | Where-Object { $_ })
}

function Write-JsonResponse {
  param($Response, [int]$StatusCode, $Data)
  $json = $Data | ConvertTo-Json -Depth 12 -Compress
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  $Response.StatusCode = $StatusCode
  $Response.ContentType = 'application/json; charset=utf-8'
  $Response.ContentLength64 = $bytes.Length
  $Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $Response.OutputStream.Close()
}

function Write-FileResponse {
  param($Response, [string]$Path)
  $extension = [IO.Path]::GetExtension($Path).ToLowerInvariant()
  $contentTypes = @{ '.html' = 'text/html; charset=utf-8'; '.css' = 'text/css; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8' }
  if (-not $contentTypes.ContainsKey($extension) -or -not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    Write-JsonResponse -Response $Response -StatusCode 404 -Data @{ ok = $false; error = '파일을 찾을 수 없습니다.' }
    return
  }
  $bytes = [IO.File]::ReadAllBytes($Path)
  $Response.StatusCode = 200
  $Response.ContentType = $contentTypes[$extension]
  $Response.ContentLength64 = $bytes.Length
  $Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $Response.OutputStream.Close()
}

function Request-MedicalAdvice {
  param([string]$Type, [string]$Query, [string]$Allergy)
  if ([string]::IsNullOrWhiteSpace($openAiApiKey)) { throw 'OPENAI_API_KEY가 .env에 설정되지 않았습니다.' }

  $category = if ($Type -eq 'surgery') { '수술 전후 약물 주의사항' } else { '복용약 성분·상품명·상호작용' }
  $inputText = @"
질문 분야: $category
사용자 입력: $Query
사용자가 등록한 알레르기: $Allergy

한국어로 간결하게 답하세요. 상품명이면 가능한 경우 유효성분을 먼저 확인하고, 확실하지 않으면 추측하지 마세요.
"@
  $instructions = @'
당신은 한국 사용자를 위한 의료 정보 안내 보조자입니다. 진단이나 처방을 하지 마세요. 다음 규칙을 반드시 지키세요.
1. 수술 전후 약물 중단·재개 시점을 단정하지 말고 수술팀·처방 의료진과 결정하도록 안내합니다.
2. 사용자가 약을 임의로 끊거나 추가하도록 지시하지 않습니다.
3. medicine에는 와파린·아세트아미노펜처럼 약의 일반명만 작성합니다. 타이레놀·쿠마딘 같은 판매 상품명은 medicine에 쓰지 말고 brandNames에만 작성합니다. 사용자가 상품명을 입력하면 확인된 일반명으로 변환합니다.
4. 가능한 경우 식품의약품안전처, 의약품안전나라, 병원·학회 등 신뢰 가능한 최신 출처를 우선 확인합니다.
5. 확인할 약은 빠뜨리지 말고 각각 한 행으로 구분합니다. 행 개수를 임의로 제한하지 않습니다.
6. 호흡곤란, 의식 저하, 얼굴·입술·혀 부종, 심한 출혈 같은 응급 증상은 즉시 119 또는 응급실을 이용하도록 안내합니다.
7. 입력된 이름·이메일·생년월일 같은 개인정보를 요구하거나 추론하지 않습니다.
8. risk는 사망·중대한 출혈·영구 손상 등 심각한 위해 가능성을 의료진이 반드시 검토해야 하는 경우에만 high로 분류하고, 그 밖에는 caution으로 분류합니다.
9. 행은 high를 먼저, caution을 나중에 배치합니다. 정확히 같은 약 일반명만 한 행으로 합칩니다. 주요 성분이 같더라도 약 이름이 다르면 서로 다른 약으로 보고 별도 행으로 작성합니다.
10. 수술명 또는 의약품·건강기능식품 상품명을 신뢰할 만한 근거로 확인할 수 없으면 recognized를 false로 하고 rows를 비웁니다.
11. 각 행의 ingredients에는 그 약을 이루는 확인된 주요 성분을 하나 이상 작성합니다.
12. 각 행의 brandNames에는 국내에서 확인 가능한 대표 상품명을 하나 이상, 최대 3개까지만 작성합니다. 상품명을 추측하거나 일반명·성분명을 상품명처럼 작성하지 않습니다.
13. medicine 한 행에는 약 일반명 하나만 작성합니다. 서로 다른 약을 '·', 쉼표, 슬래시 또는 '및'으로 묶지 말고 각각 별도 행으로 작성합니다. 약물 계열명 대신 확인 가능한 개별 약 이름을 우선 작성합니다.
'@
  $responseSchema = @{
    type = 'object'
    additionalProperties = $false
    properties = @{
      recognized = @{ type = 'boolean' }
      title = @{ type = 'string' }
      intro = @{ type = 'string' }
      rows = @{
        type = 'array'
        items = @{
          type = 'object'
          additionalProperties = $false
          properties = @{
            medicine = @{ type = 'string' }
            ingredients = @{
              type = 'array'
              items = @{ type = 'string'; minLength = 1 }
              minItems = 1
            }
            brandNames = @{
              type = 'array'
              items = @{ type = 'string'; minLength = 1 }
              minItems = 1
              maxItems = 3
            }
            risk = @{ type = 'string'; enum = @('high', 'caution') }
            reason = @{ type = 'string' }
          }
          required = @('medicine', 'ingredients', 'brandNames', 'risk', 'reason')
        }
      }
      disclaimer = @{ type = 'string' }
    }
    required = @('recognized', 'title', 'intro', 'rows', 'disclaimer')
  }
  $requestBody = @{
    model = $openAiModel
    instructions = $instructions
    input = $inputText
    max_output_tokens = 3000
    store = $false
    tools = @(@{ type = 'web_search_preview'; search_context_size = 'medium' })
    text = @{
      format = @{
        type = 'json_schema'
        name = 'medical_advice_table'
        strict = $true
        schema = $responseSchema
      }
    }
  } | ConvertTo-Json -Depth 12

  $headers = @{ Authorization = "Bearer $openAiApiKey" }
  $response = Invoke-RestMethod -Uri "$openAiBaseUrl/responses" -Method Post -Headers $headers -ContentType 'application/json; charset=utf-8' -Body $requestBody -TimeoutSec $requestTimeoutSeconds
  $answerParts = [Collections.Generic.List[string]]::new()
  $sources = [Collections.Generic.List[object]]::new()

  foreach ($item in @($response.output)) {
    if ($item.type -ne 'message') { continue }
    foreach ($content in @($item.content)) {
      if ($content.type -eq 'output_text' -and $content.text) { $answerParts.Add([string]$content.text) }
      foreach ($annotation in @($content.annotations)) {
        if ($annotation.type -eq 'url_citation' -and $annotation.url) {
          $alreadyAdded = $sources | Where-Object { $_.url -eq $annotation.url }
          if (-not $alreadyAdded) { $sources.Add(@{ title = [string]$annotation.title; url = [string]$annotation.url }) }
        }
      }
    }
  }
  $answer = ($answerParts -join "`n").Trim()
  if (-not $answer) { throw 'OpenAI 응답에서 답변 텍스트를 찾지 못했습니다.' }
  try {
    $table = $answer | ConvertFrom-Json
  } catch {
    throw 'OpenAI 응답을 표 데이터로 변환하지 못했습니다.'
  }
  return @{ ok = $true; table = $table; answer = [string]$table.intro; sources = @($sources); model = [string]$response.model }
}

$listener = [Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "caring server: http://localhost:$Port"
Write-Host "OpenAI model: $openAiModel"
Write-Host "OpenAI key configured: $(-not [string]::IsNullOrWhiteSpace($openAiApiKey))"

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response
    try {
      $requestOrigin = [string]$request.Headers['Origin']
      if ($requestOrigin -and $allowedOrigins -contains $requestOrigin.TrimEnd('/')) {
        $response.Headers['Access-Control-Allow-Origin'] = $requestOrigin
        $response.Headers['Vary'] = 'Origin'
        $response.Headers['Access-Control-Allow-Headers'] = 'Content-Type'
        $response.Headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
      }
      if ($request.HttpMethod -eq 'OPTIONS') {
        $response.StatusCode = 204
        $response.Close()
        continue
      }
      if ($request.HttpMethod -eq 'GET' -and $request.Url.AbsolutePath -eq '/api/health') {
        Write-JsonResponse -Response $response -StatusCode 200 -Data @{ ok = $true; openaiConfigured = (-not [string]::IsNullOrWhiteSpace($openAiApiKey)); model = $openAiModel }
        continue
      }
      if ($request.HttpMethod -eq 'POST' -and $request.Url.AbsolutePath -eq '/api/medical-advice') {
        $reader = [IO.StreamReader]::new($request.InputStream, [Text.Encoding]::UTF8)
        $rawBody = $reader.ReadToEnd()
        $reader.Dispose()
        if ($rawBody.Length -gt 32768) { Write-JsonResponse -Response $response -StatusCode 413 -Data @{ ok = $false; error = '요청이 너무 깁니다.' }; continue }
        $body = $rawBody | ConvertFrom-Json
        $type = [string]$body.type
        $query = ([string]$body.query).Trim()
        $allergy = ([string]$body.allergy).Trim()
        if ($type -notin @('surgery', 'medicine') -or -not $query -or $query.Length -gt 500) {
          Write-JsonResponse -Response $response -StatusCode 400 -Data @{ ok = $false; error = '올바른 검색 내용을 입력해 주세요.' }
          continue
        }
        $result = Request-MedicalAdvice -Type $type -Query $query -Allergy $allergy
        Write-JsonResponse -Response $response -StatusCode 200 -Data $result
        continue
      }
      if ($request.HttpMethod -eq 'GET') {
        $relativePath = [Uri]::UnescapeDataString($request.Url.AbsolutePath.TrimStart('/'))
        if (-not $relativePath) { $relativePath = 'index.html' }
        if ($relativePath.Contains('..') -or $relativePath.StartsWith('.')) {
          Write-JsonResponse -Response $response -StatusCode 403 -Data @{ ok = $false; error = '접근할 수 없습니다.' }
          continue
        }
        Write-FileResponse -Response $response -Path (Join-Path $projectRoot $relativePath)
        continue
      }
      Write-JsonResponse -Response $response -StatusCode 405 -Data @{ ok = $false; error = '지원하지 않는 요청입니다.' }
    } catch {
      $message = $_.Exception.Message
      if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $message = [string]$_.ErrorDetails.Message }
      if ($message -match '401|invalid_api_key') { $message = 'OpenAI API 키가 유효하지 않습니다.' }
      elseif ($message -match '404|model_not_found') { $message = "모델 '$openAiModel'을 현재 API 계정에서 사용할 수 없습니다." }
      elseif ($message -match '429') { $message = 'OpenAI API 사용량 또는 속도 한도를 확인해 주세요.' }
      Write-JsonResponse -Response $response -StatusCode 502 -Data @{ ok = $false; error = $message }
    }
  }
} finally {
  $listener.Stop()
  $listener.Close()
}
