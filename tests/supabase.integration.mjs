import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const env = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8'))
  .split(/\r?\n/).map((line) => line.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean)
  .map((match) => [match[1], match[2]]));
const baseUrl = process.env.TEST_BASE_URL || 'http://127.0.0.1:3001';
const suffix = randomBytes(5).toString('hex');
const username = `codextest${suffix}`;
const email = `${username}@example.com`;
const updatedEmail = `${username}updated@example.com`;
const secondUsername = `codextestb${suffix}`;
const secondEmail = `${secondUsername}@example.com`;
const password = `Test!${randomBytes(10).toString('hex')}`;
const newPassword = `Changed!${randomBytes(10).toString('hex')}`;
let userId = null;
let secondUserId = null;

async function appRequest(path, method = 'GET', body, cookie = '') {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { response, data: await response.json() };
}

async function findTestUser(name = username) {
  const params = new URLSearchParams({ select: 'id', username: `eq.${name}` });
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/profiles?${params}`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
  });
  assert.equal(response.status, 200);
  return (await response.json())[0]?.id || null;
}

try {
  const signup = await appRequest('/api/auth/signup', 'POST', {
    name: '연동테스트', gender: '기타', birthYear: '1994', birthMonth: '02', birthDay: '14',
    email, allergy: '없음', height: '171.5', weight: '62.3', id: username, password,
  });
  assert.equal(signup.response.status, 201, JSON.stringify(signup.data));
  userId = await findTestUser();
  assert.ok(userId, '회원가입 후 profiles 행이 만들어져야 합니다.');

  const login = await appRequest('/api/auth/login', 'POST', { id: username, password });
  assert.equal(login.response.status, 200, JSON.stringify(login.data));
  const cookie = login.response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
  assert.ok(cookie.includes('carely_access='));

  const me = await appRequest('/api/auth/me', 'GET', undefined, cookie);
  assert.equal(me.response.status, 200, JSON.stringify(me.data));
  assert.equal(me.data.profile.name, '연동테스트');
  assert.equal(me.data.profile.email, email);
  assert.equal(me.data.profile.height, 171.5);
  assert.equal(me.data.profile.weight, 62.3);
  assert.equal(me.data.profile.birthMonth, '02');

  const aiTable = { recognized: true, rows: [{ medicine: '테스트약', ingredients: ['성분'], brandNames: ['상품'], risk: 'caution', reason: '테스트' }] };
  const save = await appRequest('/api/history', 'POST', { type: 'medicine', query: '테스트약', aiTable }, cookie);
  assert.equal(save.response.status, 200, JSON.stringify(save.data));
  const history = await appRequest('/api/history', 'GET', undefined, cookie);
  assert.equal(history.response.status, 200, JSON.stringify(history.data));
  assert.equal(history.data.history[0].query, '테스트약');

  const update = await appRequest('/api/profile', 'PATCH', {
    ...me.data.profile, height: '172.1', weight: '62.3',
  }, cookie);
  assert.equal(update.response.status, 200, JSON.stringify(update.data));
  assert.equal(update.data.profile.height, 172.1);

  const credentialUpdate = await appRequest('/api/profile', 'PATCH', {
    ...update.data.profile, email: updatedEmail, currentPassword: password, newPassword,
  }, cookie);
  assert.equal(credentialUpdate.response.status, 200, JSON.stringify(credentialUpdate.data));
  assert.equal(credentialUpdate.data.profile.email, updatedEmail);
  const oldLogin = await appRequest('/api/auth/login', 'POST', { id: username, password });
  assert.equal(oldLogin.response.status, 401);
  const newLogin = await appRequest('/api/auth/login', 'POST', { id: username, password: newPassword });
  assert.equal(newLogin.response.status, 200, JSON.stringify(newLogin.data));

  const secondSignup = await appRequest('/api/auth/signup', 'POST', {
    name: '두번째테스트', gender: '기타', birthYear: '1995', birthMonth: '01', birthDay: '01',
    email: secondEmail, allergy: '없음', height: '170', weight: '60', id: secondUsername, password,
  });
  assert.equal(secondSignup.response.status, 201, JSON.stringify(secondSignup.data));
  secondUserId = await findTestUser(secondUsername);
  const secondLogin = await appRequest('/api/auth/login', 'POST', { id: secondUsername, password });
  assert.equal(secondLogin.response.status, 200, JSON.stringify(secondLogin.data));
  const secondCookie = secondLogin.response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
  const secondHistory = await appRequest('/api/history', 'GET', undefined, secondCookie);
  assert.equal(secondHistory.response.status, 200, JSON.stringify(secondHistory.data));
  assert.equal(secondHistory.data.history.length, 0, '다른 계정의 조회 기록이 보이면 안 됩니다.');

  const logout = await appRequest('/api/auth/logout', 'POST', undefined, cookie);
  assert.equal(logout.response.status, 200);
  console.log('회원가입 → profiles 저장 → 아이디 로그인 → 프로필·비밀번호 수정 → 조회 기록·계정 격리 → 로그아웃 확인 완료');
} finally {
  userId ||= await findTestUser(username);
  secondUserId ||= await findTestUser(secondUsername);
  for (const [id, name] of [[userId, username], [secondUserId, secondUsername]]) {
    if (!id) continue;
    const response = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
    });
    assert.ok(response.ok, `테스트 계정 정리 실패: ${response.status}`);
    assert.equal(await findTestUser(name), null, '테스트 프로필이 함께 삭제되어야 합니다.');
  }
  console.log('테스트 계정 및 프로필 정리 완료');
}
