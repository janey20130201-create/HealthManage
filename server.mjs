import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(fileURLToPath(import.meta.url));

async function loadEnv() {
  let contents;
  try {
    contents = await readFile(join(projectRoot, '.env'), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
  const values = {};
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

const config = await loadEnv();
const port = Number(process.env.API_PORT || config.API_PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('API_PORT는 1부터 65535 사이의 정수여야 합니다.');
}
const apiKey = config.OPENAI_API_KEY || '';
const model = config.OPENAI_MODEL || 'gpt-5.3-chat-latest';
const apiBaseUrl = (config.OPENAI_API_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const timeoutMs = Math.max(5000, Number(config.API_REQUEST_TIMEOUT_MS) || 30000);
const allowedOrigins = new Set((config.CLIENT_ORIGIN || 'http://127.0.0.1:5500,http://localhost:5500')
  .split(',').map((origin) => origin.trim().replace(/\/$/, '')).filter(Boolean));
const supabaseUrl = (config.SUPABASE_URL || '').replace(/\/$/, '');
const supabaseAnonKey = config.SUPABASE_ANON_KEY || '';
const supabaseServiceKey = config.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseReady = Boolean(supabaseUrl && supabaseAnonKey && supabaseServiceKey);

const responseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    recognized: { type: 'boolean' },
    title: { type: 'string' },
    intro: { type: 'string' },
    rows: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          medicine: { type: 'string' },
          ingredients: { type: 'array', items: { type: 'string', minLength: 1 }, minItems: 1 },
          brandNames: { type: 'array', items: { type: 'string', minLength: 1 }, minItems: 1, maxItems: 3 },
          risk: { type: 'string', enum: ['high', 'caution'] },
          reason: { type: 'string' },
        },
        required: ['medicine', 'ingredients', 'brandNames', 'risk', 'reason'],
      },
    },
    disclaimer: { type: 'string' },
  },
  required: ['recognized', 'title', 'intro', 'rows', 'disclaimer'],
};

const instructions = `당신은 한국 사용자를 위한 의료 정보 안내 보조자입니다. 진단이나 처방을 하지 마세요. 다음 규칙을 반드시 지키세요.
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
13. medicine 한 행에는 약 일반명 하나만 작성합니다. 서로 다른 약을 '·', 쉼표, 슬래시 또는 '및'으로 묶지 말고 각각 별도 행으로 작성합니다. 약물 계열명 대신 확인 가능한 개별 약 이름을 우선 작성합니다.`;

function sendJson(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(data));
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function cookieValue(request, name) {
  const entry = (request.headers.cookie || '').split(';').map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : '';
}

function setSessionCookies(response, session) {
  const secure = false; // Development server listens on local HTTP only.
  const suffix = `HttpOnly; SameSite=Lax; Path=/; ${secure ? 'Secure; ' : ''}`;
  response.setHeader('Set-Cookie', [
    `carely_access=${encodeURIComponent(session.access_token)}; Max-Age=${Math.min(session.expires_in || 3600, 3600)}; ${suffix}`,
    `carely_refresh=${encodeURIComponent(session.refresh_token)}; Max-Age=2592000; ${suffix}`,
  ]);
}

function clearSessionCookies(response) {
  response.setHeader('Set-Cookie', [
    'carely_access=; Max-Age=0; HttpOnly; SameSite=Lax; Path=/',
    'carely_refresh=; Max-Age=0; HttpOnly; SameSite=Lax; Path=/',
  ]);
}

async function supabaseRequest(path, { method = 'GET', body, token, admin = false, prefer } = {}) {
  if (!supabaseReady) throw httpError(503, 'Supabase 환경 변수가 설정되지 않았습니다.');
  const key = admin ? supabaseServiceKey : supabaseAnonKey;
  let response;
  try {
    response = await fetch(`${supabaseUrl}${path}`, {
      method,
      headers: {
        apikey: key,
        Authorization: `Bearer ${token || key}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(prefer ? { Prefer: prefer } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw httpError(502, 'Supabase 서버에 연결할 수 없습니다.');
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = httpError(response.status, data?.msg || data?.message || data?.error_description || data?.error || 'Supabase 요청에 실패했습니다.');
    error.code = data?.code || data?.error_code;
    throw error;
  }
  return data;
}

async function sessionFor(request, response) {
  let access = cookieValue(request, 'carely_access');
  const refresh = cookieValue(request, 'carely_refresh');
  let user = null;
  if (access) {
    try { user = await supabaseRequest('/auth/v1/user', { token: access }); } catch (error) {
      if (error.status !== 401) throw error;
    }
  }
  if (!user && refresh) {
    try {
      const session = await supabaseRequest('/auth/v1/token?grant_type=refresh_token', {
        method: 'POST', body: { refresh_token: refresh },
      });
      access = session.access_token;
      setSessionCookies(response, session);
      user = session.user || await supabaseRequest('/auth/v1/user', { token: access });
    } catch (error) {
      if (error.status !== 400 && error.status !== 401) throw error;
      clearSessionCookies(response);
    }
  }
  if (!user) throw httpError(401, '다시 로그인해 주세요.');
  return { user, access };
}

async function getProfile(user, access) {
  const params = new URLSearchParams({ select: 'id,username,full_name,email,gender,birth_date,allergy,height_cm,weight_kg', id: `eq.${user.id}` });
  const rows = await supabaseRequest(`/rest/v1/profiles?${params}`, { token: access });
  if (!rows?.length) throw httpError(404, '프로필을 찾을 수 없습니다.');
  const profile = rows[0];
  const [birthYear = '', birthMonth = '', birthDay = ''] = (profile.birth_date || '').split('-');
  return {
    name: profile.full_name || '', id: profile.username || '', email: profile.email || user.email || '',
    gender: profile.gender || '', birthYear, birthMonth, birthDay,
    allergy: profile.allergy || '없음', height: profile.height_cm ?? '', weight: profile.weight_kg ?? '',
  };
}

function validateProfile(body, withPassword = false) {
  const username = String(body.id || '').trim();
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const gender = String(body.gender || '');
  const birthDate = `${body.birthYear}-${String(body.birthMonth || '').padStart(2, '0')}-${String(body.birthDay || '').padStart(2, '0')}`;
  const height = Number(body.height);
  const weight = Number(body.weight);
  if (!/^[A-Za-z0-9가-힣_-]{2,50}$/.test(username) || username === '홍길동') throw httpError(400, '아이디는 2~50자의 한글·영문·숫자·_·-만 사용할 수 있습니다.');
  if (!name || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw httpError(400, '이름과 이메일을 확인해 주세요.');
  if (!['남성', '여성', '기타', '응답하지 않음'].includes(gender)) throw httpError(400, '성별을 선택해 주세요.');
  const parsed = new Date(`${birthDate}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== birthDate || parsed > new Date()) {
    throw httpError(400, '올바른 생년월일을 입력해 주세요.');
  }
  const allergy = String(body.allergy || '').trim();
  if (!allergy || allergy.length > 2000 || !Number.isFinite(height) || height < 30 || height > 250 || !Number.isFinite(weight) || weight < 2 || weight > 300) {
    throw httpError(400, '알레르기·키·몸무게를 확인해 주세요.');
  }
  if (withPassword && String(body.password || '').length < 6) throw httpError(400, '비밀번호는 6자 이상 입력해 주세요.');
  return { username, name, email, gender, birthDate, allergy, height, weight };
}

async function handleAppApi(request, response, pathname) {
  if (!supabaseReady) throw httpError(503, 'Supabase 환경 변수가 설정되지 않았습니다.');
  const origin = request.headers.origin;
  if (origin && origin !== `http://${request.headers.host}`) throw httpError(403, '사이트 주소에서 다시 시도해 주세요.');

  if (pathname === '/api/auth/signup' && request.method === 'POST') {
    const body = await readJsonBody(request);
    const profile = validateProfile(body, true);
    const lookup = new URLSearchParams({ select: 'id', username: `eq.${profile.username}` });
    if ((await supabaseRequest(`/rest/v1/profiles?${lookup}`, { admin: true })).length) throw httpError(409, '이미 사용 중인 아이디입니다.');
    try {
      await supabaseRequest('/auth/v1/admin/users', {
        method: 'POST', admin: true,
        body: {
          email: profile.email, password: body.password, email_confirm: true,
          user_metadata: {
            username: profile.username, full_name: profile.name, gender: profile.gender,
            birth_date: profile.birthDate, allergy: profile.allergy,
            height_cm: profile.height, weight_kg: profile.weight,
          },
        },
      });
    } catch (error) {
      if (error.code === '23505' || error.status === 422) throw httpError(409, '이미 사용 중인 아이디 또는 이메일입니다.');
      throw error;
    }
    sendJson(response, 201, { ok: true });
    return;
  }

  if (pathname === '/api/auth/login' && request.method === 'POST') {
    const body = await readJsonBody(request);
    const identifier = String(body.id || '').trim();
    const password = String(body.password || '');
    if (!identifier || !password) throw httpError(400, '아이디와 비밀번호를 입력해 주세요.');
    let email = identifier;
    if (!identifier.includes('@')) {
      const params = new URLSearchParams({ select: 'id', username: `eq.${identifier}` });
      const rows = await supabaseRequest(`/rest/v1/profiles?${params}`, { admin: true });
      if (!rows?.length) throw httpError(401, '아이디 또는 비밀번호가 맞지 않습니다.');
      const account = await supabaseRequest(`/auth/v1/admin/users/${encodeURIComponent(rows[0].id)}`, { admin: true });
      email = account.email || account.user?.email;
    }
    try {
      const session = await supabaseRequest('/auth/v1/token?grant_type=password', {
        method: 'POST', body: { email, password },
      });
      setSessionCookies(response, session);
      sendJson(response, 200, { ok: true, profile: await getProfile(session.user, session.access_token) });
    } catch (error) {
      if (error.status === 400 || error.status === 401) throw httpError(401, '아이디 또는 비밀번호가 맞지 않습니다.');
      throw error;
    }
    return;
  }

  if (pathname === '/api/auth/logout' && request.method === 'POST') {
    clearSessionCookies(response);
    sendJson(response, 200, { ok: true });
    return;
  }

  const { user, access } = await sessionFor(request, response);
  if (pathname === '/api/auth/me' && request.method === 'GET') {
    sendJson(response, 200, { ok: true, profile: await getProfile(user, access) });
    return;
  }

  if (pathname === '/api/profile' && request.method === 'PATCH') {
    const body = await readJsonBody(request);
    const profile = validateProfile(body);
    const current = await getProfile(user, access);
    const newPassword = String(body.newPassword || '');
    const oldPassword = String(body.currentPassword || '');
    if (newPassword || profile.email !== current.email) {
      if (!oldPassword) throw httpError(400, '이메일 또는 비밀번호 변경 시 현재 비밀번호를 입력해 주세요.');
      if (newPassword && newPassword.length < 6) throw httpError(400, '새 비밀번호는 6자 이상 입력해 주세요.');
      try {
        await supabaseRequest('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: user.email, password: oldPassword } });
      } catch { throw httpError(401, '현재 비밀번호가 맞지 않습니다.'); }
      await supabaseRequest(`/auth/v1/admin/users/${encodeURIComponent(user.id)}`, {
        method: 'PUT', admin: true,
        body: { ...(newPassword ? { password: newPassword } : {}), ...(profile.email !== current.email ? { email: profile.email, email_confirm: true } : {}) },
      });
    }
    const params = new URLSearchParams({ id: `eq.${user.id}` });
    try {
      await supabaseRequest(`/rest/v1/profiles?${params}`, {
        method: 'PATCH', token: access,
        body: {
          username: profile.username, full_name: profile.name, gender: profile.gender,
          birth_date: profile.birthDate, allergy: profile.allergy,
          height_cm: profile.height, weight_kg: profile.weight,
        },
      });
    } catch (error) {
      if (error.code === '23505') throw httpError(409, '이미 사용 중인 아이디 또는 이메일입니다.');
      throw error;
    }
    sendJson(response, 200, { ok: true, profile: await getProfile({ ...user, email: profile.email }, access) });
    return;
  }

  if (pathname === '/api/history' && request.method === 'GET') {
    const params = new URLSearchParams({ select: 'id,search_type,query,result,searched_at', user_id: `eq.${user.id}`, order: 'searched_at.desc', limit: '20' });
    const rows = await supabaseRequest(`/rest/v1/search_history?${params}`, { token: access });
    sendJson(response, 200, { ok: true, history: rows.map((row) => ({
      type: row.search_type, query: row.query, date: row.searched_at, aiTable: row.result?.aiTable || null,
    })) });
    return;
  }
  if (pathname === '/api/history' && request.method === 'POST') {
    const body = await readJsonBody(request);
    const type = body.type;
    const query = String(body.query || '').trim();
    const aiTable = body.aiTable;
    if (!['surgery', 'medicine'].includes(type) || !query || query.length > 500 || !aiTable?.recognized || !Array.isArray(aiTable.rows) || !aiTable.rows.length) {
      throw httpError(400, '저장할 검색 결과가 없습니다.');
    }
    const params = new URLSearchParams({ select: 'id,query', user_id: `eq.${user.id}`, search_type: `eq.${type}` });
    const rows = await supabaseRequest(`/rest/v1/search_history?${params}`, { token: access });
    const existing = rows.find((row) => row.query.toLocaleLowerCase() === query.toLocaleLowerCase());
    if (existing) {
      const update = new URLSearchParams({ id: `eq.${existing.id}` });
      await supabaseRequest(`/rest/v1/search_history?${update}`, { method: 'PATCH', token: access, body: { query, result: { aiTable }, searched_at: new Date().toISOString() } });
    } else {
      await supabaseRequest('/rest/v1/search_history', { method: 'POST', token: access, body: { user_id: user.id, search_type: type, query, result: { aiTable } } });
    }
    sendJson(response, 200, { ok: true });
    return;
  }
  if (pathname === '/api/history' && request.method === 'DELETE') {
    const params = new URLSearchParams({ user_id: `eq.${user.id}` });
    await supabaseRequest(`/rest/v1/search_history?${params}`, { method: 'DELETE', token: access });
    sendJson(response, 200, { ok: true });
    return;
  }
  throw httpError(404, '요청한 API를 찾을 수 없습니다.');
}

async function readJsonBody(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 32768) {
      const error = new Error('요청이 너무 깁니다.');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('JSON 요청 형식이 올바르지 않습니다.');
    error.status = 400;
    throw error;
  }
}

async function requestMedicalAdvice(type, query, allergy) {
  if (!apiKey) throw new Error('OPENAI_API_KEY가 .env에 설정되지 않았습니다.');
  const category = type === 'surgery' ? '수술 전후 약물 주의사항' : '복용약 성분·상품명·상호작용';
  const body = {
    model,
    instructions,
    input: `질문 분야: ${category}\n사용자 입력: ${query}\n사용자가 등록한 알레르기: ${allergy}\n\n한국어로 간결하게 답하세요. 상품명이면 가능한 경우 유효성분을 먼저 확인하고, 확실하지 않으면 추측하지 마세요.`,
    max_output_tokens: 3000,
    store: false,
    tools: [{ type: 'web_search_preview', search_context_size: 'medium' }],
    text: { format: { type: 'json_schema', name: 'medical_advice_table', strict: true, schema: responseSchema } },
  };
  const response = await fetch(`${apiBaseUrl}/responses`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await response.json();
  if (!response.ok) {
    const code = data.error?.code || '';
    if (response.status === 401 || code === 'invalid_api_key') throw new Error('OpenAI API 키가 유효하지 않습니다.');
    if (response.status === 404 || code === 'model_not_found') throw new Error(`모델 '${model}'을 현재 API 계정에서 사용할 수 없습니다.`);
    if (response.status === 429) throw new Error('OpenAI API 사용량 또는 속도 한도를 확인해 주세요.');
    throw new Error(data.error?.message || `OpenAI API 요청 실패 (${response.status})`);
  }
  const answerParts = [];
  const sources = [];
  for (const item of data.output || []) {
    if (item.type !== 'message') continue;
    for (const content of item.content || []) {
      if (content.type === 'output_text' && content.text) answerParts.push(content.text);
      for (const annotation of content.annotations || []) {
        if (annotation.type === 'url_citation' && annotation.url && !sources.some((source) => source.url === annotation.url)) {
          sources.push({ title: annotation.title || '', url: annotation.url });
        }
      }
    }
  }
  if (!answerParts.length) throw new Error('OpenAI 응답에서 답변 텍스트를 찾지 못했습니다.');
  let table;
  try {
    table = JSON.parse(answerParts.join('\n'));
  } catch {
    throw new Error('OpenAI 응답을 표 데이터로 변환하지 못했습니다.');
  }
  return { ok: true, table, answer: table.intro || '', sources, model: data.model || model };
}

const staticFiles = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/script.js', ['script.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/ai.css', ['ai.css', 'text/css; charset=utf-8']],
]);

const server = createServer(async (request, response) => {
  try {
    const origin = request.headers.origin?.replace(/\/$/, '');
    if (origin && allowedOrigins.has(origin)) {
      response.setHeader('Access-Control-Allow-Origin', origin);
      response.setHeader('Vary', 'Origin');
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    }
    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }
    const pathname = new URL(request.url, `http://localhost:${port}`).pathname;
    if (pathname.startsWith('/api/auth/') || pathname === '/api/profile' || pathname === '/api/history') {
      await handleAppApi(request, response, pathname);
      return;
    }
    if (request.method === 'GET' && pathname === '/api/health') {
      sendJson(response, 200, { ok: true, openaiConfigured: Boolean(apiKey), supabaseConfigured: supabaseReady, model });
      return;
    }
    if (request.method === 'POST' && pathname === '/api/medical-advice') {
      const body = await readJsonBody(request);
      const type = body?.type;
      const query = typeof body?.query === 'string' ? body.query.trim() : '';
      const allergy = typeof body?.allergy === 'string' ? body.allergy.trim() : '';
      if (!['surgery', 'medicine'].includes(type) || !query || query.length > 500) {
        sendJson(response, 400, { ok: false, error: '올바른 검색 내용을 입력해 주세요.' });
        return;
      }
      sendJson(response, 200, await requestMedicalAdvice(type, query, allergy));
      return;
    }
    if (request.method === 'GET' && staticFiles.has(pathname)) {
      const [name, contentType] = staticFiles.get(pathname);
      const path = join(projectRoot, name);
      const fileInfo = await stat(path);
      response.writeHead(200, { 'Content-Type': contentType, 'Content-Length': fileInfo.size });
      response.end(await readFile(path));
      return;
    }
    sendJson(response, request.method === 'GET' ? 404 : 405, { ok: false, error: '요청한 경로를 찾을 수 없습니다.' });
  } catch (error) {
    if (!response.headersSent) sendJson(response, error.status || 502, { ok: false, error: error.message });
    else response.destroy(error);
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`caring server: http://127.0.0.1:${port}`);
  console.log(`OpenAI model: ${model}`);
  console.log(`OpenAI key configured: ${Boolean(apiKey)}`);
  console.log(`Supabase configured: ${supabaseReady}`);
});
