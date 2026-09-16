const loginView = document.querySelector('#loginView');
const dashboardView = document.querySelector('#dashboardView');
const loginForm = document.querySelector('#loginForm');
const loginError = document.querySelector('#loginError');
const userNameInput = document.querySelector('#userName');
const passwordInput = document.querySelector('#password');
const welcomeName = document.querySelector('#welcomeName');
const authLoginForm = document.querySelector('#authLoginForm');
const signupForm = document.querySelector('#signupForm');
const authLoginError = document.querySelector('#authLoginError');
const signupError = document.querySelector('#signupError');
const authTabs = document.querySelectorAll('.auth-tab');
const accountStorageKey = 'carelyAccounts';
let cloudProfile = null;
let cloudHistory = [];

async function appApi(path, options = {}) {
  if (location.protocol === 'file:') throw new Error('Supabase 계정 기능은 npm run dev로 사이트를 실행해야 사용할 수 있습니다.');
  const response = await fetch(path, {
    ...options,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok && !response.headers.get('Content-Type')?.includes('application/json')) {
    throw new Error('계정 서버를 찾지 못했습니다. npm run dev로 실행한 사이트 주소에서 접속해 주세요.');
  }
  if (!response.ok) throw new Error(data.error || '서버 요청에 실패했습니다.');
  return data;
}

async function loadCloudHistory() {
  if (!cloudProfile) return;
  const data = await appApi('/api/history');
  cloudHistory = data.history || [];
  renderHistory();
}

async function startCloudSession(profile) {
  cloudProfile = profile;
  sessionStorage.setItem('carelyUser', profile.name);
  sessionStorage.setItem('carelyUserId', profile.id);
  cloudHistory = [];
  await loadCloudHistory();
  showDashboard(profile.name);
}

// 회원가입 폼에서는 브라우저가 이전 입력값을 자동으로 제안하지 않도록 합니다.
signupForm.setAttribute('autocomplete', 'off');
signupForm.querySelectorAll('input').forEach((input) => {
  input.setAttribute('autocomplete', input.type === 'password' ? 'new-password' : 'off');
});

function getAccounts() {
  try { return JSON.parse(localStorage.getItem(accountStorageKey) || '[]'); } catch { return []; }
}
function switchAuthTab(tab) {
  authTabs.forEach((button) => button.classList.toggle('active', button.dataset.authTab === tab));
  authLoginForm.classList.toggle('hidden', tab !== 'login');
  signupForm.classList.toggle('hidden', tab !== 'signup');
}
authTabs.forEach((button) => button.addEventListener('click', () => switchAuthTab(button.dataset.authTab)));
authLoginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const id = document.querySelector('#loginId').value.trim();
  const password = document.querySelector('#loginPassword').value;
  if (!id || !password) { authLoginError.textContent = '아이디와 비밀번호를 입력해 주세요.'; return; }
  if (id === '홍길동' && password === getDemoPassword()) {
    if (cloudProfile) await appApi('/api/auth/logout', { method: 'POST' }).catch(() => {});
    cloudProfile = null;
    authLoginError.textContent = '';
    sessionStorage.setItem('carelyUser', '홍길동');
    sessionStorage.setItem('carelyUserId', '홍길동');
    showDashboard('홍길동');
    return;
  }
  const button = authLoginForm.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const data = await appApi('/api/auth/login', { method: 'POST', body: JSON.stringify({ id, password }) });
    authLoginError.textContent = '';
    await startCloudSession(data.profile);
  } catch (error) { authLoginError.textContent = error.message; }
  finally { button.disabled = false; }
});
signupForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = document.querySelector('#signupName').value.trim();
  const gender = document.querySelector('#signupGender').value;
  const birthYear = document.querySelector('#signupBirthYear').value.trim();
  const birthMonth = document.querySelector('#signupBirthMonth').value;
  const birthDay = document.querySelector('#signupBirthDay').value;
  const email = document.querySelector('#signupEmail').value.trim();
  const allergy = document.querySelector('#signupAllergy').value.trim();
  const height = document.querySelector('#signupHeight').value.trim();
  const weight = document.querySelector('#signupWeight').value.trim();
  const id = document.querySelector('#signupId').value.trim();
  const password = document.querySelector('#signupPassword').value;
  const passwordConfirm = document.querySelector('#signupPasswordConfirm').value;
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (email && !emailPattern.test(email)) { signupError.textContent = '올바른 이메일 형식을 입력해 주세요. 예: example@email.com'; return; }
  if (password !== passwordConfirm) { signupError.textContent = '비밀번호가 서로 일치하지 않습니다.'; return; }
  if (!name || !gender || !birthYear || !birthMonth || !birthDay || !email || !allergy || !height || !weight || !id || !password) { signupError.textContent = '모든 항목을 입력해 주세요. 알레르기가 없으면 “없음”이라고 입력해 주세요.'; return; }
  const button = signupForm.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    await appApi('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ name, gender, birthYear, birthMonth, birthDay, email, allergy, height, weight, id, password }),
    });
    signupError.textContent = '';
    signupForm.reset();
    switchAuthTab('login');
    document.querySelector('#loginId').value = id;
    authLoginError.textContent = '회원가입이 완료되었습니다. 비밀번호를 입력해 주세요.';
  } catch (error) { signupError.textContent = error.message; }
  finally { button.disabled = false; }
});
const surgeryForm = document.querySelector('#surgeryForm');
const surgeryName = document.querySelector('#surgeryName');
const surgeryResult = document.querySelector('#surgeryResult');
const interactionForm = document.querySelector('#interactionForm');
const currentMedicine = document.querySelector('#currentMedicine');
const interactionResult = document.querySelector('#interactionResult');
const allergyWarning = document.querySelector('#allergyWarning');
const surgeryAiResult = document.querySelector('#surgeryAiResult');
const medicineAiResult = document.querySelector('#medicineAiResult');
const historyList = document.querySelector('#historyList');
const historyPageList = document.querySelector('#historyPageList');
const clearHistoryButton = document.querySelector('#clearHistoryButton');
const clearHistoryPageButton = document.querySelector('#clearHistoryPageButton');
const historyStorageKey = 'carelySearchHistory';
function getHistoryStorageKey() {
  const accountId = sessionStorage.getItem('carelyUserId') || sessionStorage.getItem('carelyUser') || 'guest';
  return `${historyStorageKey}_${encodeURIComponent(accountId)}`;
}
const profileButton = document.querySelector('#profileButton');
const historyButton = document.querySelector('#historyButton');
const profilePanel = document.querySelector('#profilePanel');
const closeProfileButton = document.querySelector('#closeProfileButton');
const profileForm = document.querySelector('#profileForm');
const profileMessage = document.querySelector('#profileMessage');
const editProfileButton = document.querySelector('#editProfileButton');
const saveProfileButton = document.querySelector('#saveProfileButton');
const profileEditableFields = ['profileName', 'profileGender', 'profileBirthYear', 'profileBirthMonth', 'profileBirthDay', 'profileEmail', 'profileAllergy', 'profileHeight', 'profileWeight', 'profileId', 'profilePassword'];
const currentProfilePassword = document.querySelector('#currentProfilePassword');
const profilePassword = document.querySelector('#profilePassword');
const currentProfilePasswordLabel = document.querySelector('label[for="currentProfilePassword"]');
const profilePasswordLabel = document.querySelector('label[for="profilePassword"]');
const passwordConfirmLabel = document.createElement('label');
const passwordConfirm = document.createElement('input');
passwordConfirmLabel.htmlFor = 'profilePasswordConfirm';
passwordConfirmLabel.textContent = '새 비밀번호 확인';
passwordConfirm.id = 'profilePasswordConfirm';
passwordConfirm.type = 'password';
passwordConfirm.placeholder = '새 비밀번호를 한 번 더 입력해 주세요';
passwordConfirm.autocomplete = 'new-password';
passwordConfirm.className = 'password-confirm-field';
profilePassword.insertAdjacentElement('afterend', passwordConfirmLabel);
passwordConfirmLabel.insertAdjacentElement('afterend', passwordConfirm);
const demoPasswordStorageKey = 'carelyDemoPassword';
['profileHeight', 'profileWeight'].forEach((id) => { const input = document.querySelector(`#${id}`); input.step = '0.1'; input.min = id === 'profileHeight' ? '30' : '2'; input.max = id === 'profileHeight' ? '250' : '300'; });
function populateBirthDateOptions() {
  ['signupBirthMonth', 'profileBirthMonth'].forEach((id) => {
    const select = document.querySelector(`#${id}`);
    for (let month = 1; month <= 12; month += 1) {
      const option = document.createElement('option');
      option.value = String(month).padStart(2, '0');
      option.textContent = `${month}월`;
      select.appendChild(option);
    }
  });
  ['signupBirthDay', 'profileBirthDay'].forEach((id) => {
    const select = document.querySelector(`#${id}`);
    for (let day = 1; day <= 31; day += 1) {
      const option = document.createElement('option');
      option.value = String(day).padStart(2, '0');
      option.textContent = `${day}일`;
      select.appendChild(option);
    }
  });
}
populateBirthDateOptions();
function getDemoPassword() { return localStorage.getItem(demoPasswordStorageKey) || '1234'; }
function showMainMode() {
  dashboardView.classList.remove('history-mode', 'profile-mode');
  profilePanel.classList.add('hidden');
  surgeryForm.reset();
  interactionForm.reset();
  surgeryResult.classList.add('hidden');
  interactionResult.classList.add('hidden');
  surgeryAiResult.classList.add('hidden');
  medicineAiResult.classList.add('hidden');
  surgeryAiResult.innerHTML = '';
  medicineAiResult.innerHTML = '';
}
const allergyMedicationGuidance = [
  { keywords: ['페니실린', '아목시실린', '암피실린', 'ampicillin', 'amoxicillin'], ingredient: '페니실린계 항생제', examples: '오구멘틴, 아모크라', note: '면역 반응으로 두드러기·부종·호흡곤란 등 알레르기 증상이 다시 나타날 수 있습니다.' },
  { keywords: ['세파', '세팔로스포린', 'cephalosporin', 'cef'], ingredient: '세팔로스포린계 항생제', examples: '시클러, 슈프락스, 로세핀', note: '약물 구조가 비슷한 일부 항생제와 교차 알레르기 반응이 나타날 수 있습니다.' },
  { keywords: ['진통소염제', '소염진통제', '진통소염제 알레르기', '소염진통제 알레르기', '아스피린', 'nsaid'], ingredient: '아스피린', examples: '바이엘아스피린, 아스피린프로텍트', note: '알레르기 반응으로 두드러기·혈관부종·기관지 경련 등이 다시 나타날 수 있습니다.' },
  { keywords: ['진통소염제', '소염진통제', '진통소염제 알레르기', '소염진통제 알레르기', '이부프로펜', '부루펜', '이부펜'], ingredient: '이부프로펜', examples: '부루펜, 이부펜, 애드빌', note: 'NSAIDs 계열에 과민반응이 있으면 두드러기·부종·호흡곤란 등이 재발할 수 있습니다.' },
  { keywords: ['진통소염제', '소염진통제', '진통소염제 알레르기', '소염진통제 알레르기', '덱시부프로펜'], ingredient: '덱시부프로펜', examples: '맥시부펜, 덱시부펜', note: '이부프로펜과 유사한 NSAIDs 성분으로 과민반응이 반복될 수 있습니다.' },
  { keywords: ['진통소염제', '소염진통제', '진통소염제 알레르기', '소염진통제 알레르기', '나프록센'], ingredient: '나프록센', examples: '탁센, 알레브', note: 'NSAIDs 과민반응이 있는 경우 피부·호흡기 알레르기 증상이 나타날 수 있습니다.' },
  { keywords: ['설파', '설폰아미드', 'sulfa', 'sulfonamide'], ingredient: '설폰아미드계 성분', examples: '박트림, 셉트린', note: '제품에 포함된 설폰아미드 성분이 면역 반응을 일으켜 발진·부종 등이 나타날 수 있습니다.' },
  { keywords: ['조영제', '요오드', 'iodine', 'contrast'], ingredient: '조영제 관련 성분', examples: '울트라비스트, 옴니파큐, 비지파크', note: '과거 이상반응이 있었다면 같은 조영제 또는 유사 제제에서 반응이 다시 나타날 수 있습니다.' }
];
function renderAllergyWarning() {
  const allergy = String(currentProfile().allergy || '').trim();
  const isNone = !allergy || /^(없음|없어요|없습니다|무|없다|n\/a|na|-|없)$/i.test(allergy);
  if (isNone) { allergyWarning.classList.add('hidden'); allergyWarning.innerHTML = ''; return; }
  const normalizedAllergy = allergy.toLowerCase().replace(/\s+/g, '');
  const matched = allergyMedicationGuidance.filter((item) => item.keywords.some((keyword) => normalizedAllergy.includes(keyword.toLowerCase().replace(/\s+/g, ''))));
  const safeAllergy = safeText(allergy);
  const rows = matched.map((item) => `<tr><td><strong>${item.ingredient}</strong></td><td>${item.examples}</td><td>${item.note}</td></tr>`).join('');
  const fallback = `<div class="allergy-general-note">입력한 알레르기 <strong>${safeAllergy}</strong>와 관련된 약은 제품별 성분이 달라 처방 전 약사·의료진에게 알레르기 정보를 반드시 알려주세요. 포장지의 성분명과 과거 반응을 함께 확인하세요.</div>`;
  allergyWarning.innerHTML = `<div class="allergy-warning-heading"><div><div class="eyebrow">ALLERGY MEDICATION ALERT</div><h3 id="allergyWarningTitle">알레르기 주의 약물</h3></div><span>입력한 알레르기: ${safeAllergy}</span></div>${matched.length ? `<div class="medicine-table-wrap"><table class="medicine-table"><thead><tr><th>관련 성분군</th><th>대표 상품명</th><th>복용하면 안 되는 이유</th></tr></thead><tbody>${rows}</tbody></table></div>` : fallback}<p class="medical-note">※ 알레르기가 의심되는 약은 임의로 복용하거나 중단하지 말고, 처방 의료진·약사에게 확인하세요. 심한 호흡곤란·입술이나 얼굴 부종 등이 나타나면 즉시 응급진료를 받으세요.</p>`;
  allergyWarning.classList.remove('hidden');
}
function currentProfile() {
  if (cloudProfile) return cloudProfile;
  const currentName = sessionStorage.getItem('carelyUser') || '홍길동';
  const currentId = sessionStorage.getItem('carelyUserId');
  const account = getAccounts().find((item) => item.id === currentId) || getAccounts().find((item) => item.name === currentName);
  let override = {};
  try { override = JSON.parse(localStorage.getItem(`carelyProfile_${currentName}`) || '{}'); } catch { override = {}; }
  return { name: currentName, birthYear: '', birthMonth: '', birthDay: '', allergy: '없음', ...(account || {}), ...override };
}
function openProfile() {
  const profile = currentProfile();
  document.querySelector('#profileName').value = profile.name || '';
  document.querySelector('#profileGender').value = profile.gender || '응답하지 않음';
  document.querySelector('#profileBirthYear').value = profile.birthYear || '';
  document.querySelector('#profileBirthMonth').value = profile.birthMonth || '';
  document.querySelector('#profileBirthDay').value = profile.birthDay || '';
  document.querySelector('#profileEmail').value = profile.email || '';
  document.querySelector('#profileAllergy').value = profile.allergy || '없음';
  document.querySelector('#profileHeight').value = profile.height || '';
  document.querySelector('#profileWeight').value = profile.weight || '';
  document.querySelector('#profileId').value = profile.id || sessionStorage.getItem('carelyUserId') || '';
  document.querySelector('#profilePassword').value = '';
  currentProfilePassword.value = '';
  currentProfilePasswordLabel.style.display = 'none';
  currentProfilePassword.style.display = 'none';
  profilePasswordLabel.textContent = '비밀번호';
  document.querySelector('#profilePassword').value = '••••••••';
  passwordConfirmLabel.style.display = 'none';
  passwordConfirm.style.display = 'none';
  profileEditableFields.concat('currentProfilePassword').forEach((id) => { document.querySelector(`#${id}`).readOnly = true; });
  document.querySelector('#profileGender').disabled = true;
  document.querySelector('#profileBirthMonth').disabled = true;
  document.querySelector('#profileBirthDay').disabled = true;
  editProfileButton.classList.remove('hidden');
  saveProfileButton.classList.add('hidden');
  profileMessage.textContent = '';
  profilePanel.classList.remove('hidden');
}
profileButton.addEventListener('click', openProfile);
editProfileButton.addEventListener('click', () => { profileEditableFields.concat('currentProfilePassword').forEach((id) => { document.querySelector(`#${id}`).readOnly = false; }); currentProfilePasswordLabel.style.display = 'block'; currentProfilePassword.style.display = 'block'; profilePasswordLabel.textContent = '새 비밀번호'; document.querySelector('#profilePassword').value = ''; passwordConfirmLabel.style.display = 'block'; passwordConfirm.style.display = 'block'; document.querySelector('#profileGender').disabled = false; document.querySelector('#profileBirthMonth').disabled = false; document.querySelector('#profileBirthDay').disabled = false; editProfileButton.classList.add('hidden'); saveProfileButton.classList.remove('hidden'); });
closeProfileButton.addEventListener('click', () => { profilePanel.classList.add('hidden'); showMainMode(); });
historyButton.addEventListener('click', () => document.querySelector('.history-panel').classList.toggle('history-open'));
document.querySelector('#sidebarHistoryButton').addEventListener('click', () => {
  dashboardView.classList.remove('profile-mode');
  dashboardView.classList.add('history-mode');
  profilePanel.classList.add('hidden');
  document.querySelector('.history-panel').classList.add('history-open');
  document.querySelector('.history-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
document.querySelector('#sidebarProfileButton').addEventListener('click', () => {
  dashboardView.classList.remove('history-mode');
  dashboardView.classList.add('profile-mode');
  openProfile();
});
document.querySelector('.new-chat-button').addEventListener('click', showMainMode);
document.querySelector('.new-chat-button').innerHTML = '⌕ 새 검색';
document.querySelectorAll('.sidebar-nav button:not(#sidebarHistoryButton)').forEach((button) => button.addEventListener('click', showMainMode));
profileForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const oldName = sessionStorage.getItem('carelyUser') || '홍길동';
  const oldId = sessionStorage.getItem('carelyUserId') || '홍길동';
  const profile = { name: document.querySelector('#profileName').value.trim(), gender: document.querySelector('#profileGender').value, birthYear: document.querySelector('#profileBirthYear').value.trim(), birthMonth: document.querySelector('#profileBirthMonth').value, birthDay: document.querySelector('#profileBirthDay').value, email: document.querySelector('#profileEmail').value.trim(), allergy: document.querySelector('#profileAllergy').value.trim() || '없음', height: document.querySelector('#profileHeight').value.trim(), weight: document.querySelector('#profileWeight').value.trim(), id: document.querySelector('#profileId').value.trim() };
  const newPassword = document.querySelector('#profilePassword').value;
  const oldPassword = currentProfilePassword.value;
  const confirmedPassword = passwordConfirm.value;
  if (!profile.name || !profile.gender || !profile.birthYear || !profile.birthMonth || !profile.birthDay || !profile.email || !profile.height || !profile.weight || !profile.id) { profileMessage.textContent = '이름, 성별, 출생연도·월·일, 이메일, 키, 몸무게, 아이디를 입력해 주세요.'; return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) { profileMessage.textContent = '올바른 이메일 형식을 입력해 주세요.'; return; }
  if ((oldPassword || newPassword || confirmedPassword) && (!oldPassword || !newPassword || !confirmedPassword)) { profileMessage.textContent = '비밀번호를 변경하려면 현재 비밀번호와 새 비밀번호 확인을 모두 입력해 주세요.'; return; }
  if (newPassword && newPassword !== confirmedPassword) { profileMessage.textContent = '새 비밀번호가 서로 일치하지 않습니다.'; return; }
  if (cloudProfile) {
    saveProfileButton.disabled = true;
    try {
      const data = await appApi('/api/profile', {
        method: 'PATCH',
        body: JSON.stringify({ ...profile, currentPassword: oldPassword, newPassword }),
      });
      cloudProfile = data.profile;
      sessionStorage.setItem('carelyUser', cloudProfile.name);
      sessionStorage.setItem('carelyUserId', cloudProfile.id);
      showDashboard(cloudProfile.name);
      profileMessage.textContent = '정보가 저장되었습니다.';
    } catch (error) { profileMessage.textContent = error.message; }
    finally { saveProfileButton.disabled = false; }
    return;
  }
  const accounts = getAccounts();
  const accountIndex = accounts.findIndex((item) => item.id === oldId) >= 0 ? accounts.findIndex((item) => item.id === oldId) : accounts.findIndex((item) => item.name === oldName);
  const isDemo = oldName === '홍길동' && oldId === '홍길동';
  if (profile.id !== oldId && accounts.some((item) => item.id === profile.id)) { profileMessage.textContent = '이미 사용 중인 아이디입니다.'; return; }
  if (oldPassword && (isDemo ? oldPassword !== getDemoPassword() : accountIndex < 0 || accounts[accountIndex].password !== oldPassword)) { profileMessage.textContent = '현재 비밀번호가 맞지 않습니다.'; return; }
  if (accountIndex >= 0) { accounts[accountIndex] = { ...accounts[accountIndex], ...profile, ...(newPassword ? { password: newPassword } : {}) }; localStorage.setItem(accountStorageKey, JSON.stringify(accounts)); }
  else if (isDemo && profile.id !== '홍길동') { accounts.push({ ...profile, password: newPassword || getDemoPassword() }); localStorage.setItem(accountStorageKey, JSON.stringify(accounts)); }
  if (isDemo && newPassword) localStorage.setItem(demoPasswordStorageKey, newPassword);
  const oldHistoryKey = `${historyStorageKey}_${encodeURIComponent(oldId)}`;
  const newHistoryKey = `${historyStorageKey}_${encodeURIComponent(profile.id)}`;
  if (oldId !== profile.id) {
    const oldHistory = localStorage.getItem(oldHistoryKey);
    if (oldHistory) localStorage.setItem(newHistoryKey, oldHistory);
    localStorage.removeItem(oldHistoryKey);
  }
  localStorage.setItem(`carelyProfile_${profile.name}`, JSON.stringify(profile));
  if (oldName !== profile.name) localStorage.removeItem(`carelyProfile_${oldName}`);
  sessionStorage.setItem('carelyUser', profile.name);
  sessionStorage.setItem('carelyUserId', profile.id);
  showDashboard(profile.name);
  profileMessage.textContent = '정보가 저장되었습니다.';
  profilePanel.classList.add('hidden');
});

function getHistory() {
  if (cloudProfile) return cloudHistory;
  try { return JSON.parse(localStorage.getItem(getHistoryStorageKey()) || '[]'); } catch { return []; }
}
function removeHistoryEntry(type, query) {
  if (cloudProfile) return;
  const filtered = getHistory().filter((item) => !(item.type === type && item.query.toLowerCase() === query.toLowerCase()));
  localStorage.setItem(getHistoryStorageKey(), JSON.stringify(filtered));
  renderHistory();
}
function saveHistory(type, query, aiAnswer = '', aiTable = null) {
  if (cloudProfile) {
    if (!aiTable || !aiTable.recognized || !Array.isArray(aiTable.rows) || !aiTable.rows.length) return;
    appApi('/api/history', { method: 'POST', body: JSON.stringify({ type, query, aiTable }) })
      .then(loadCloudHistory)
      .catch((error) => { console.error('조회 기록을 저장하지 못했습니다:', error.message); });
    return;
  }
  const history = getHistory().filter((item) => !(item.type === type && item.query.toLowerCase() === query.toLowerCase()));
  history.unshift({ type, query, date: new Date().toISOString(), ...(aiAnswer ? { aiAnswer } : {}), ...(aiTable ? { aiTable } : {}) });
  localStorage.setItem(getHistoryStorageKey(), JSON.stringify(history.slice(0, 20)));
  renderHistory();
}
function renderHistory() {
  const history = getHistory();
  if (!history.length) { historyList.innerHTML = '<p class="history-empty">아직 저장된 조회 기록이 없습니다.</p>'; return; }
  historyList.innerHTML = history.map((item, index) => {
    const typeLabel = item.type === 'surgery' ? '수술' : '복용약';
    const date = new Date(item.date).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });
    const safeQuery = item.query.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
    return `<button class="history-item" type="button" data-history-index="${index}"><span class="history-type ${item.type === 'medicine' ? 'medicine' : ''}">${typeLabel}</span><span><strong>${safeQuery}</strong><small>${date} 조회</small></span><span>›</span></button>`;
  }).join('');
  historyList.querySelectorAll('.history-item').forEach((button) => button.addEventListener('click', () => {
    const item = getHistory()[Number(button.dataset.historyIndex)];
    if (!item) return;
    if (item.type === 'surgery') { surgeryName.value = item.query; surgeryName.focus(); }
    else { currentMedicine.value = item.query; currentMedicine.focus(); }
  }));
}

function renderHistoryByDate() {
  const history = getHistory();
  if (!history.length) { const empty = '<p class="history-empty">아직 저장된 조회 기록이 없습니다.</p>'; historyList.innerHTML = empty; historyPageList.innerHTML = empty; return; }
  const groups = history.reduce((result, item, index) => {
    const dateObject = new Date(item.date);
    const key = `${dateObject.getFullYear()}-${dateObject.getMonth()}-${dateObject.getDate()}`;
    if (!result[key]) result[key] = { label: `${dateObject.getMonth() + 1}.${dateObject.getDate()}`, items: [] };
    result[key].items.push({ ...item, index });
    return result;
  }, {});
  const markup = Object.values(groups).map((group) => `<div class="history-date-group"><h4>${group.label}</h4>${group.items.map((item) => { const safeQuery = item.query.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])); const label = item.type === 'medicine' ? '복용중인 약' : '수술 이름'; return `<button class="history-row" type="button" data-history-index="${item.index}"><span>${label}</span><strong>|</strong><b>${safeQuery}</b><i>›</i></button>`; }).join('')}</div>`).join('');
  historyList.innerHTML = markup;
  historyPageList.innerHTML = markup;
  document.querySelectorAll('.history-row').forEach((button) => button.addEventListener('click', () => {
    const item = getHistory()[Number(button.dataset.historyIndex)];
    if (!item) return;
    if (item.type === 'surgery') surgeryName.value = item.query;
    else currentMedicine.value = item.query;
    showMainMode();
  }));
}
renderHistory = renderHistoryByDate;

function renderHistoryAsTable() {
  const history = getHistory();
  if (!history.length) { const empty = '<p class="history-empty">아직 저장된 조회 기록이 없습니다.</p>'; historyList.innerHTML = empty; historyPageList.innerHTML = empty; return; }
  const groups = history.reduce((result, item, index) => {
    const dateObject = new Date(item.date);
    const key = `${dateObject.getFullYear()}-${dateObject.getMonth()}-${dateObject.getDate()}`;
    if (!result[key]) result[key] = { label: `${dateObject.getMonth() + 1}.${dateObject.getDate()}`, items: [] };
    result[key].items.push({ ...item, index });
    return result;
  }, {});
  const makeMarkup = () => Object.values(groups).map((group) => `<div class="history-date-group"><h4>${group.label}</h4><table class="history-table"><thead><tr><th>조회 유형</th><th>검색한 내용</th></tr></thead><tbody>${group.items.map((item) => { const safeQuery = item.query.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])); const label = item.type === 'medicine' ? '복용중인 약' : '수술 이름'; return `<tr class="history-row" tabindex="0" role="button" data-history-index="${item.index}"><td>${label}</td><td><b>${safeQuery}</b></td></tr>`; }).join('')}</tbody></table></div>`).join('');
  historyList.innerHTML = makeMarkup();
  historyPageList.innerHTML = makeMarkup();
  document.querySelectorAll('.history-row').forEach((row) => row.addEventListener('click', () => {
    const item = getHistory()[Number(row.dataset.historyIndex)];
    if (!item) return;
    showMainMode();
    if (item.type === 'surgery') surgeryName.value = item.query;
    else currentMedicine.value = item.query;
  }));
}
renderHistory = renderHistoryAsTable;
function renderHistoryDateTable() {
  const history = getHistory();
  if (!history.length) { const empty = '<p class="history-empty">아직 저장된 조회 기록이 없습니다.</p>'; historyList.innerHTML = empty; historyPageList.innerHTML = empty; return; }
  const markup = `<table class="history-table"><thead><tr><th>날짜</th><th>조회 유형</th><th>검색한 내용</th></tr></thead><tbody>${history.map((item, index) => { const dateObject = new Date(item.date); const date = `${dateObject.getMonth() + 1}.${dateObject.getDate()}`; const label = item.type === 'medicine' ? '복용중인 약' : '수술 이름'; const safeQuery = item.query.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])); return `<tr class="history-row" tabindex="0" role="button" data-history-index="${index}"><td>${date}</td><td>${label}</td><td><b>${safeQuery}</b></td></tr>`; }).join('')}</tbody></table>`;
  historyList.innerHTML = markup;
  historyPageList.innerHTML = markup;
  document.querySelectorAll('.history-row').forEach((row) => row.addEventListener('click', () => {
    const item = getHistory()[Number(row.dataset.historyIndex)];
    if (!item) return;
    showMainMode();
    if (item.type === 'surgery') surgeryName.value = item.query;
    else currentMedicine.value = item.query;
  }));
}
renderHistory = renderHistoryDateTable;

function showDashboard(name) {
  welcomeName.textContent = name;
  showMainMode();
  dashboardView.classList.remove('history-mode', 'profile-mode');
  profilePanel.classList.add('hidden');
  loginView.classList.add('hidden');
  dashboardView.classList.remove('hidden');
  renderHistory();
  renderAllergyWarning();
  document.title = `${name}님의 마이페이지 | 건강 관리 프로젝트`;
}

function showLogin() {
  dashboardView.classList.remove('history-mode', 'profile-mode');
  dashboardView.classList.add('hidden');
  loginView.classList.remove('hidden');
  document.title = '건강 관리 프로젝트';
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = userNameInput.value.trim();
  const password = passwordInput.value.trim();
  if (name === '홍길동' && password === getDemoPassword()) {
    if (cloudProfile) await appApi('/api/auth/logout', { method: 'POST' }).catch(() => {});
    cloudProfile = null;
    sessionStorage.setItem('carelyUser', name);
    sessionStorage.setItem('carelyUserId', name);
    loginError.textContent = '';
    showDashboard(name);
  } else {
    loginError.textContent = '이름 또는 비밀번호를 다시 확인해 주세요.';
    passwordInput.focus();
  }
});

document.querySelector('#logoutButton').addEventListener('click', async () => {
  if (cloudProfile) {
    try { await appApi('/api/auth/logout', { method: 'POST' }); }
    catch (error) { console.error('로그아웃 요청 실패:', error.message); }
  }
  cloudProfile = null;
  cloudHistory = [];
  sessionStorage.removeItem('carelyUser');
  sessionStorage.removeItem('carelyUserId');
  loginForm.reset();
  showLogin();
});

surgeryForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const operation = surgeryName.value.trim();
  if (!operation) {
    surgeryName.focus();
    surgeryName.setCustomValidity('수술 이름을 입력해 주세요.');
    surgeryName.reportValidity();
    return;
  }
  surgeryName.setCustomValidity('');
  saveHistory('surgery', operation);
  const safeOperation = operation.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  surgeryResult.innerHTML = `<div class="result-heading"><h4>${safeOperation} 전후 확인 항목</h4><span>일반 안내 · 의료진 확인 필수</span></div><ul class="caution-list"><li><b>복용 중인 약</b>아스피린·항응고제, 당뇨약 등은 임의로 중단하지 말고 처방 의료진에게 반드시 알려주세요.</li><li><b>음식·음료</b>금식 시작 시각과 물 섭취 가능 여부는 수술·마취 방법에 따라 다르므로 병원 안내를 따르세요.</li><li><b>건강보조제</b>한약, 오메가-3, 비타민·허브 제품도 복용 사실을 수술팀에 미리 공유하세요.</li></ul><p class="medical-note">※ 이 내용은 준비를 돕기 위한 일반 정보입니다. 약이나 음식 섭취를 스스로 중단·재개하지 말고, 수술 병원에 수술명·복용약·알레르기를 확인받으세요.</p>`;
  surgeryResult.querySelector('.caution-list').outerHTML = `<div class="medicine-table-wrap"><table class="medicine-table"><thead><tr><th>약 이름</th><th>주요 성분</th><th>구분</th><th>확인할 내용</th></tr></thead><tbody><tr><td>와파린 (Warfarin)</td><td>와파린나트륨</td><td><span class="risk-badge risk-high">반드시 확인</span></td><td>중단·용량 조절 여부를 수술팀과 결정</td></tr><tr><td>아픽사반 (Eliquis)</td><td>아픽사반</td><td><span class="risk-badge risk-high">반드시 확인</span></td><td>복용 시간과 신장 기능 등을 의료진에게 알림</td></tr><tr><td>클로피도그렐 (Plavix)</td><td>클로피도그렐 황산염</td><td><span class="risk-badge risk-high">반드시 확인</span></td><td>중단 시점은 수술 종류와 처방 목적에 따라 결정</td></tr><tr><td>아스피린</td><td>아세틸살리실산</td><td><span class="risk-badge risk-caution">주의 필요</span></td><td>심혈관 질환 예방 목적 복용 여부를 반드시 알림</td></tr><tr><td>이부프로펜·나프록센</td><td>이부프로펜·나프록센</td><td><span class="risk-badge risk-caution">주의 필요</span></td><td>진통제·감기약 속 같은 성분도 함께 확인</td></tr><tr><td>비타민 E·은행잎</td><td>토코페롤·은행잎 추출물</td><td><span class="risk-badge risk-caution">주의 필요</span></td><td>건강보조제와 한약도 복용 목록에 포함</td></tr></tbody></table></div>`;
  surgeryResult.querySelectorAll('.medicine-table tbody tr td:first-child').forEach((cell) => {
    const text = cell.textContent.toLowerCase();
    const matchedBrandKey = Object.keys(brandNames).find((name) => text.includes(name));
    if (matchedBrandKey) cell.insertAdjacentHTML('beforeend', `<small class="brand-names">대표 상품명: ${brandNames[matchedBrandKey]}</small>`);
  });
  surgeryResult.classList.remove('hidden');
});

const interactionData = {
  '와파린': { name: '와파린 (Warfarin)', ingredient: '와파린나트륨', pairs: [['아스피린', '아세틸살리실산', '출혈 위험 증가 가능성'], ['이부프로펜·나프록센', 'NSAIDs', '위장관 출혈 위험 증가 가능성'], ['클로피도그렐', '클로피도그렐 황산염', '항응고·항혈소판 작용 중복 가능성']] },
  'warfarin': { name: '와파린 (Warfarin)', ingredient: '와파린나트륨', pairs: [['아스피린', '아세틸살리실산', '출혈 위험 증가 가능성'], ['이부프로펜·나프록센', 'NSAIDs', '위장관 출혈 위험 증가 가능성'], ['클로피도그렐', '클로피도그렐 황산염', '항응고·항혈소판 작용 중복 가능성']] },
  '아픽사반': { name: '아픽사반 (Eliquis)', ingredient: '아픽사반', pairs: [['아스피린', '아세틸살리실산', '출혈 위험 증가 가능성'], ['이부프로펜·나프록센', 'NSAIDs', '출혈 위험 증가 가능성'], ['클로피도그렐', '클로피도그렐 황산염', '출혈 위험 증가 가능성']] },
  'apixaban': { name: '아픽사반 (Eliquis)', ingredient: '아픽사반', pairs: [['아스피린', '아세틸살리실산', '출혈 위험 증가 가능성'], ['이부프로펜·나프록센', 'NSAIDs', '출혈 위험 증가 가능성'], ['클로피도그렐', '클로피도그렐 황산염', '출혈 위험 증가 가능성']] },
  '아스피린': { name: '아스피린 (Aspirin)', ingredient: '아세틸살리실산', pairs: [['이부프로펜', '이부프로펜', '복용 시점·효과에 영향 가능성'], ['와파린', '와파린나트륨', '출혈 위험 증가 가능성'], ['아픽사반', '아픽사반', '출혈 위험 증가 가능성']] },
  'aspirin': { name: '아스피린 (Aspirin)', ingredient: '아세틸살리실산', pairs: [['이부프로펜', '이부프로펜', '복용 시점·효과에 영향 가능성'], ['와파린', '와파린나트륨', '출혈 위험 증가 가능성'], ['아픽사반', '아픽사반', '출혈 위험 증가 가능성']] },
  '이부프로펜': { name: '이부프로펜 (Ibuprofen)', ingredient: '이부프로펜', pairs: [['아스피린', '아세틸살리실산', '위장관 출혈 및 효과 영향 가능성'], ['와파린', '와파린나트륨', '출혈 위험 증가 가능성'], ['아픽사반', '아픽사반', '출혈 위험 증가 가능성']] },
  'ibuprofen': { name: '이부프로펜 (Ibuprofen)', ingredient: '이부프로펜', pairs: [['아스피린', '아세틸살리실산', '위장관 출혈 및 효과 영향 가능성'], ['와파린', '와파린나트륨', '출혈 위험 증가 가능성'], ['아픽사반', '아픽사반', '출혈 위험 증가 가능성']] },
  '클로피도그렐': { name: '클로피도그렐 (Plavix)', ingredient: '클로피도그렐 황산염', pairs: [['아스피린', '아세틸살리실산', '출혈 위험 증가 가능성'], ['이부프로펜', '이부프로펜', '출혈 위험 증가 가능성'], ['와파린', '와파린나트륨', '출혈 위험 증가 가능성']] },
  'clopidogrel': { name: '클로피도그렐 (Plavix)', ingredient: '클로피도그렐 황산염', pairs: [['아스피린', '아세틸살리실산', '출혈 위험 증가 가능성'], ['이부프로펜', '이부프로펜', '출혈 위험 증가 가능성'], ['와파린', '와파린나트륨', '출혈 위험 증가 가능성']] }
};

interactionData['아세트아미노펜'] = { name: '아세트아미노펜 (Acetaminophen)', ingredient: '아세트아미노펜', pairs: [['와파린', '와파린나트륨', '반복·고용량 복용 시 INR에 영향 가능성'], ['이부프로펜', '이부프로펜', '같은 성분이 섞인 복합 진통제 중복 주의'], ['아세트아미노펜 함유 감기약', '아세트아미노펜', '성분 중복으로 1일 총량 초과 주의']] };
interactionData['acetaminophen'] = interactionData['아세트아미노펜'];
interactionData['오메가-3'] = { name: '오메가-3 (Omega-3)', ingredient: 'EPA·DHA 등 오메가-3 지방산', pairs: [['와파린', '와파린나트륨', '고용량 보충제는 출혈 및 INR 변화 가능성이 있어 복용량과 검사 계획을 의료진과 확인'], ['아스피린', '아세틸살리실산', '출혈 위험을 함께 확인하고 수술 전 복용 사실을 의료진에게 알림'], ['클로피도그렐', '클로피도그렐 황산염', '항혈소판 작용이 겹칠 수 있어 복용 중인 제품과 용량을 의료진에게 알림']] };
interactionData['아이눈퓨'] = { name: '아이하이 아이눈퓨', ingredient: '마리골드꽃추출물(루테인)·비타민 A·정제어유 등 복합 성분', pairs: [['와파린·항응고제', '정제어유 등 제품별 복합 성분', '제품의 전체 성분표와 1일 섭취량을 의료진·약사에게 보여주고 출혈 관련 약과의 병용을 확인'], ['비타민 A 제제', '비타민 A', '다른 눈 건강 제품·종합비타민과 성분이 겹칠 수 있어 총 섭취량을 확인'], ['수술 전 복용 약', '제품별 복합 성분', '건강기능식품도 복용 목록에 포함해 수술팀에 미리 알림']] };

const brandNames = {
  '와파린': '쿠마딘, 와파린정', 'warfarin': 'Coumadin, Jantoven',
  '아픽사반': '엘리퀴스', 'apixaban': 'Eliquis',
  '아스피린': '바이엘 아스피린, 아스피린프로텍트', 'aspirin': 'Bayer Aspirin',
  '이부프로펜': '부루펜, 이부펜, 애드빌, 모트린', 'ibuprofen': 'Brufen, Ibupen, Advil, Motrin', '이부프로펜·나프록센': '부루펜, 이부펜, 애드빌 · 탁센, 알레브',
  '클로피도그렐': '플라빅스', 'clopidogrel': 'Plavix',
  '나프록센': '탁센, 알레브', 'naproxen': 'Aleve',
  '비타민 e': '비타맘정', '은행잎': '징코민, 타나민', '비타민 e·은행잎': '비타맘정 · 징코민, 타나민',
  '아세트아미노펜': '타이레놀, 챔프', 'acetaminophen': 'Tylenol, Champ',
  '오메가-3': '종근당건강 프로메가, 세노비스 오메가-3, 뉴트리코어 오메가-3', 'omega-3': 'Omega-3 fish oil products',
  '아이눈퓨': '아이하이 아이눈퓨'
};
const medicineAliases = {
  '쿠마딘': '와파린', 'coumadin': 'warfarin', 'jantoven': 'warfarin',
  '엘리퀴스': '아픽사반', 'eliquis': 'apixaban',
  '바이엘 아스피린': '아스피린', '아스피린프로텍트': '아스피린', 'bayer aspirin': 'aspirin',
  '부루펜': '이부프로펜', '이부펜': '이부프로펜', '애드빌': 'ibuprofen', '모트린': 'ibuprofen', 'brufen': 'ibuprofen', 'ibupen': 'ibuprofen', 'advil': 'ibuprofen', 'motrin': 'ibuprofen',
  '플라빅스': '클로피도그렐', 'plavix': 'clopidogrel',
  '탁센': '나프록센', '알레브': 'naproxen', 'aleve': 'naproxen',
  '타이레놀': '아세트아미노펜', 'tylenol': 'acetaminophen', '챔프': '아세트아미노펜', '챔프시럽': '아세트아미노펜',
  '오메가-3': '오메가-3', '오메가3': '오메가-3', 'omega-3': '오메가-3', 'omega3': '오메가-3',
  '프로메가': '오메가-3', '세노비스': '오메가-3', '뉴트리코어': '오메가-3',
  'fish oil': '오메가-3', '피쉬오일': '오메가-3', 'epa': '오메가-3', 'dha': '오메가-3',
  '아이눈퓨': '아이눈퓨', '아이하이 아이눈퓨': '아이눈퓨', 'i-noonpure': '아이눈퓨'
};
function brandsFor(name) {
  const key = name.toLowerCase();
  return brandNames[key] || brandNames[medicineAliases[key]] || '제품별 상품명은 포장지 확인';
}

interactionForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const query = currentMedicine.value.trim();
  if (!query) { currentMedicine.focus(); return; }
  saveHistory('medicine', query);
  const safeQuery = query.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const key = query.toLowerCase();
  const alias = Object.keys(medicineAliases).find((item) => key.includes(item));
  const medicine = alias ? medicineAliases[alias] : Object.keys(interactionData).find((item) => key.includes(item));
  if (!medicine) {
    interactionResult.innerHTML = `<div class="interaction-empty"><strong>${safeQuery}</strong>에 대한 대표 상호작용 정보가 등록되어 있지 않습니다.<br />처방약·일반의약품·건강보조제를 모두 포함한 복용 목록을 약사 또는 수술 의료진에게 확인해 주세요.</div>`;
  } else {
    const data = interactionData[medicine];
    const rows = data.pairs.map(([name, ingredient, note]) => `<tr><td>${name}<small class="brand-names">대표 상품명: ${brandsFor(name)}</small></td><td>${ingredient}</td><td><span class="risk-badge risk-high">병용 전 확인</span></td><td>${note}</td></tr>`).join('');
    interactionResult.innerHTML = `<div class="result-heading"><h4>${data.name}과 함께 복용 전 확인할 약</h4><span>대표 사례 · 전체 목록 아님</span></div><p class="interaction-intro">입력한 약의 대표 상품명: ${brandsFor(medicine)}</p><div class="medicine-table-wrap"><table class="medicine-table"><thead><tr><th>함께 확인할 약</th><th>주요 성분</th><th>구분</th><th>주의 내용</th></tr></thead><tbody>${rows}</tbody></table></div><p class="medical-note">※ 상호작용은 용량·복용 목적·기저질환에 따라 달라집니다. 복용 중인 약을 임의로 중단하거나 새 약을 추가하지 말고 의사·약사에게 확인하세요.</p>`;
  }
  interactionResult.classList.remove('hidden');
});

const surgeryGuidance = {
  '백내장': [['아스피린', '아세틸살리실산', '복용 사실과 심혈관 질환 예방 목적을 안과·마취 의료진에게 알림'], ['와파린', '와파린나트륨', '중단 여부와 검사 필요성을 수술팀과 결정'], ['아픽사반', '아픽사반', '복용 시간과 신장 기능을 수술팀에 알림'], ['클로피도그렐', '클로피도그렐 황산염', '중단 시점은 안과·처방 의료진이 함께 결정']],
  '대장내시경': [['와파린', '와파린나트륨', '용종 절제 여부와 출혈 위험을 고려해 의료진이 결정'], ['아픽사반', '아픽사반', '검사·시술 여부에 따라 복용 계획을 확인'], ['클로피도그렐', '클로피도그렐 황산염', '검사 전 복용 사실을 내시경실에 알림'], ['인슐린·당뇨약', '인슐린·당뇨병 치료제', '금식 여부에 따라 당일 복용 방법을 확인']],
  '위내시경': [['와파린', '와파린나트륨', '조직검사·시술 여부를 포함해 중단 여부를 의료진과 결정'], ['아픽사반', '아픽사반', '검사 전 복용 계획을 내시경실에 알림'], ['클로피도그렐', '클로피도그렐 황산염', '복용 사실과 처방 목적을 의료진에게 알림'], ['인슐린·당뇨약', '인슐린·당뇨병 치료제', '금식 전후 복용 방법을 의료진에게 확인']],
  '제왕절개': [['아픽사반·리바록사반', '아픽사반·리바록사반', '마취 방법과 출혈 위험에 따라 계획을 산부인과·마취과와 결정'], ['와파린', '와파린나트륨', '복용 사실과 마지막 복용 시간을 의료진에게 알림'], ['인슐린·당뇨약', '인슐린·당뇨병 치료제', '금식과 혈당 관리 계획을 의료진에게 확인'], ['한약·건강보조제', '제품별 복합 성분', '복용 중인 제품명과 성분을 수술팀에 공유']],
  '치과': [['와파린·아픽사반', '항응고제', '발치·임플란트 전 중단 여부를 치과와 처방 의료진에게 확인'], ['아스피린·클로피도그렐', '항혈소판제', '심혈관 질환 처방 목적을 알리고 임의로 중단하지 않음'], ['이부프로펜·나프록센', 'NSAIDs', '시술 전 진통제 선택을 치과 의료진에게 확인']]
};
function safeText(value) { return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])); }
function isHighRiskMedication(name) { return /(항응고|항혈소판|와파린|아픽사반|리바록사반|다비가트란|헤파린|클로피도그렐|프라수그렐|티카그렐러)/i.test(name); }
function renderSurgerySpecificResult(operation) {
  const safeOperation = safeText(operation);
  const key = operation.toLowerCase();
  const normalizedKey = key.replace(/\s+/g, '');
  const matched = Object.keys(surgeryGuidance).find((name) => key.includes(name));
  const surgeryTermPattern = /(수술|술$|절제|절개|소파|봉합|이식|치환|성형|재건|교정|내시경|박리|고정|삽입|천자|절개|적출|절삭|소작|문합)/;
  const isRecognizedSurgery = Boolean(matched) || surgeryTermPattern.test(normalizedKey);
  if (!isRecognizedSurgery) {
    removeHistoryEntry('surgery', operation);
    surgeryResult.innerHTML = `<div class="interaction-empty"><strong>${safeOperation}</strong>에 대한 수술 정보가 없습니다.<br />등록된 수술명과 정확히 일치하는지 확인해 주세요.</div>`;
    surgeryResult.classList.remove('hidden');
    return;
  }
  const commonGuidance = [['항응고제·항혈소판제', '약물별 상이', '출혈 위험과 수술 종류에 따라 중단 여부를 의료진과 결정'], ['소염진통제(NSAIDs)', '이부프로펜·나프록센 등', '수술 전 복용 사실을 수술팀에 알리고 복용 여부를 확인'], ['당뇨약·인슐린', '당뇨병 치료제', '금식·혈당 관리 계획에 따라 수술 당일 복용 방법을 확인'], ['스테로이드', '프레드니솔론 등', '장기 복용 중이면 갑자기 중단하지 말고 수술팀에 알림'], ['한약·건강보조제', '제품별 복합 성분', '제품명과 성분을 포함한 복용 목록을 의료진에게 전달'], ['복합 감기약·진통제', '아세트아미노펜·NSAIDs 등', '같은 성분이 중복될 수 있어 제품 포장지의 성분을 함께 확인']];
  const guidance = (matched ? [...surgeryGuidance[matched], ...commonGuidance] : commonGuidance).filter((item, index, list) => list.findIndex((candidate) => candidate[0].replace(/\s+/g, '').toLowerCase() === item[0].replace(/\s+/g, '').toLowerCase()) === index).sort((a, b) => Number(isHighRiskMedication(b[0])) - Number(isHighRiskMedication(a[0])));
  const rows = guidance.map(([name, ingredient, note]) => { const highRisk = isHighRiskMedication(name); return `<tr><td>${name}<small class="brand-names">대표 상품명: ${brandsFor(name)}</small></td><td>${ingredient}</td><td><span class="risk-badge ${highRisk ? 'risk-high' : 'risk-caution'}">${highRisk ? '고위험 · 반드시 확인' : '주의'}</span></td><td>${note}</td></tr>`; }).join('');
  surgeryResult.innerHTML = `<div class="result-heading"><h4>${safeOperation} 전후 약물 확인</h4><span>수술별 안내 · 의료진 확인 필수</span></div><div class="medicine-table-wrap"><table class="medicine-table"><thead><tr><th>약 이름</th><th>주요 성분</th><th>구분</th><th>확인할 내용</th></tr></thead><tbody>${rows}</tbody></table></div><p class="medical-note">※ 수술 종류와 환자 상태에 따라 복용 계획이 달라질 수 있습니다. 약을 임의로 중단하지 말고 수술팀·처방 의료진에게 확인하세요.</p>`;
  surgeryResult.querySelectorAll('.medicine-table tbody tr td:first-child').forEach((cell) => { const brandKey = Object.keys(brandNames).find((name) => cell.textContent.toLowerCase().includes(name)); if (brandKey && !cell.querySelector('.brand-names')) cell.insertAdjacentHTML('beforeend', `<small class="brand-names">대표 상품명: ${brandNames[brandKey]}</small>`); });
  surgeryResult.classList.remove('hidden');
}
surgeryForm.addEventListener('submit', () => { setTimeout(() => renderSurgerySpecificResult(surgeryName.value.trim()), 0); });

function lookupInteractionMedicine(value) {
  const key = value.toLowerCase();
  const alias = Object.keys(medicineAliases).find((name) => key.includes(name));
  const canonical = alias ? medicineAliases[alias] : Object.keys(interactionData).find((name) => key.includes(name));
  return canonical ? interactionData[canonical] : null;
}
function renderMedicationSpecificResult(query) {
  const values = query.split(/[,，]/).map((value) => value.trim()).filter(Boolean);
  const matchedData = values.map(lookupInteractionMedicine).filter(Boolean);
  if (!matchedData.length) { removeHistoryEntry('medicine', query); return; }
  const uniquePairs = [];
  matchedData.forEach((data) => data.pairs.forEach((pair) => { if (!uniquePairs.some((item) => item[0].replace(/\s+/g, '').toLowerCase() === pair[0].replace(/\s+/g, '').toLowerCase())) uniquePairs.push(pair); }));
  uniquePairs.sort((a, b) => Number(isHighRiskMedication(b[0])) - Number(isHighRiskMedication(a[0])));
  const rows = uniquePairs.map(([name, ingredient, note]) => { const highRisk = isHighRiskMedication(name); return `<tr><td>${name}<small class="brand-names">대표 상품명: ${brandsFor(name)}</small></td><td>${ingredient}</td><td><span class="risk-badge ${highRisk ? 'risk-high' : 'risk-caution'}">${highRisk ? '고위험 · 반드시 확인' : '주의'}</span></td><td>${note}</td></tr>`; }).join('');
  interactionResult.innerHTML = `<div class="result-heading"><h4>${safeText(query)}과 함께 복용 전 확인할 약</h4><span>입력 약물별 대표 사례</span></div><div class="medicine-table-wrap"><table class="medicine-table"><thead><tr><th>함께 확인할 약</th><th>주요 성분</th><th>구분</th><th>주의 내용</th></tr></thead><tbody>${rows}</tbody></table></div><p class="medical-note">※ 상호작용 목록은 전체가 아닙니다. 약을 임의로 중단·추가하지 말고 의사·약사에게 복용 목록 전체를 확인받으세요.</p>`;
  interactionResult.classList.remove('hidden');
}
interactionForm.addEventListener('submit', () => { setTimeout(() => renderMedicationSpecificResult(currentMedicine.value.trim()), 0); });

const renderHistoryWithYear = renderHistory;
renderHistory = () => {
  renderHistoryWithYear();
  const history = getHistory();
  document.querySelectorAll('#historyPageList .history-row, #historyList .history-row').forEach((row) => {
    const item = history[Number(row.dataset.historyIndex)];
    if (!item) return;
    const dateObject = new Date(item.date);
    const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
    row.querySelector('td:first-child').textContent = `${dateObject.getFullYear()}.${dateObject.getMonth() + 1}.${dateObject.getDate()} (${weekdays[dateObject.getDay()]})`;
  });
};

async function clearSavedHistory() {
  if (cloudProfile) {
    try {
      await appApi('/api/history', { method: 'DELETE' });
      cloudHistory = [];
    } catch (error) { alert(`조회 기록을 삭제하지 못했습니다: ${error.message}`); return; }
  } else {
    localStorage.removeItem(getHistoryStorageKey());
  }
  renderHistory();
}
clearHistoryButton.addEventListener('click', () => {
  clearSavedHistory();
});
clearHistoryPageButton.addEventListener('click', () => {
  clearSavedHistory();
});
renderHistory();

function getHistoryDetail(item) {
  const safeQuery = item.query.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  if (item.aiTable) return `<div class="history-detail">${buildAiMedicalTable(item.aiTable, item.type)}</div>`;
  if (item.aiAnswer) return `<div class="history-detail"><strong>${safeQuery} AI 검색 결과</strong><p>${safeText(String(item.aiAnswer)).replace(/\r?\n/g, '<br>')}</p></div>`;
  if (item.type === 'surgery') return `<div class="history-detail"><strong>${safeQuery} 검색 결과</strong><p>수술팀에 복용 중인 항응고제·항혈소판제·소염진통제·건강보조제 목록을 알리고, 중단 여부는 의료진과 확인하세요.</p></div>`;
  const key = item.query.toLowerCase();
  const alias = Object.keys(medicineAliases).find((name) => key.includes(name));
  const medicine = alias ? medicineAliases[alias] : Object.keys(interactionData).find((name) => key.includes(name));
  if (!medicine) return `<div class="history-detail"><strong>${safeQuery} 검색 결과</strong><p>등록된 대표 상호작용 정보가 없습니다. 복용 목록을 약사 또는 의료진에게 확인해 주세요.</p></div>`;
  const data = interactionData[medicine];
  return `<div class="history-detail"><strong>${data.name}과 함께 복용 전 확인할 약</strong><p>${data.pairs.map(([name, ingredient, note]) => `${name}(${ingredient}) · ${note}`).join('<br>')}</p></div>`;
}
historyPageList.addEventListener('click', (event) => {
  const row = event.target.closest('.history-row');
  if (!row || !historyPageList.contains(row)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const oldDetail = row.nextElementSibling;
  if (oldDetail && oldDetail.classList.contains('history-detail-row')) { oldDetail.remove(); return; }
  const item = getHistory()[Number(row.dataset.historyIndex)];
  if (!item) return;
  const detailRow = document.createElement('tr');
  detailRow.className = 'history-detail-row';
  detailRow.innerHTML = `<td colspan="3">${getHistoryDetail(item)}</td>`;
  row.after(detailRow);
}, true);

function buildAiMedicalTable(table, type) {
  const rawRows = Array.isArray(table && table.rows) ? [...table.rows].sort((a, b) => Number(b.risk === 'high') - Number(a.risk === 'high')) : [];
  const seenMedicines = new Set();
  const rows = rawRows.map((row) => {
    const ingredientValues = Array.isArray(row.ingredients) ? row.ingredients : String(row.ingredient || '').split(/[,，·;]/);
    const ingredientText = [...new Set(ingredientValues.map((value) => String(value).trim()).filter(Boolean))].join(' · ');
    return { ...row, ingredientText };
  }).filter((row) => {
    const medicineKey = String(row.medicine || '').toLowerCase().replace(/[^0-9a-z가-힣]/g, '');
    if (!medicineKey || seenMedicines.has(medicineKey)) return false;
    seenMedicines.add(medicineKey);
    return true;
  });
  const firstHeader = type === 'surgery' ? '약 이름' : '함께 확인할 약';
  const lastHeader = type === 'surgery' ? '확인할 내용' : '주의 내용';
  const rowMarkup = rows.map((row) => {
    const highRisk = row.risk === 'high';
    const brandValues = Array.isArray(row.brandNames) ? row.brandNames : String(row.brandNames || '').split(/[,，·;]/);
    const brands = [...new Set(brandValues.map((value) => String(value).trim()).filter(Boolean))].slice(0, 3).join(', ');
    return `<tr><td>${safeText(String(row.medicine || '확인 필요'))}<small class="brand-names">대표 상품명: ${safeText(brands || '확인 필요')}</small></td><td>${safeText(row.ingredientText || '주요 성분 확인 필요')}</td><td><span class="risk-badge ${highRisk ? 'risk-high' : 'risk-caution'}">${highRisk ? '고위험 · 반드시 확인' : '주의'}</span></td><td>${safeText(String(row.reason || '의료진에게 확인하세요.'))}</td></tr>`;
  }).join('');
  if (!rowMarkup) return '<div class="interaction-empty">확인된 결과가 없습니다.</div>';
  return `<div class="medicine-table-wrap"><table class="medicine-table"><thead><tr><th>${firstHeader}</th><th>주요 성분</th><th>구분</th><th>${lastHeader}</th></tr></thead><tbody>${rowMarkup}</tbody></table></div>`;
}
async function requestAiMedicalAdvice(type, query, target) {
  if (!query) return;
  surgeryResult.classList.add('hidden');
  interactionResult.classList.add('hidden');
  target.classList.remove('hidden');
  target.innerHTML = '<div class="ai-loading"><span></span> AI가 최신 의료 정보를 확인하고 있습니다.</div>';
  try {
    const response = await fetch('/api/medical-advice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, query, allergy: currentProfile().allergy || '없음' })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || 'AI 의료 안내를 불러오지 못했습니다.');
    const table = data.table && typeof data.table === 'object' ? data.table : null;
    if (!table) throw new Error('AI 결과를 표 형식으로 불러오지 못했습니다.');
    if (table.recognized && Array.isArray(table.rows) && table.rows.length) saveHistory(type, query, '', table);
    target.innerHTML = buildAiMedicalTable(table, type);
  } catch (error) {
    const directFileMessage = location.protocol === 'file:' ? 'AI 기능은 npm run dev로 사이트를 실행해야 사용할 수 있습니다.' : error.message;
    target.innerHTML = `<div class="interaction-empty"><strong>AI 연결 실패</strong><br>${safeText(directFileMessage)}</div>`;
  }
}
surgeryForm.addEventListener('submit', (event) => { event.preventDefault(); event.stopImmediatePropagation(); requestAiMedicalAdvice('surgery', surgeryName.value.trim(), surgeryAiResult); }, true);
interactionForm.addEventListener('submit', (event) => { event.preventDefault(); event.stopImmediatePropagation(); requestAiMedicalAdvice('medicine', currentMedicine.value.trim(), medicineAiResult); }, true);

async function restoreSession() {
  if (location.protocol !== 'file:') {
    try {
      const data = await appApi('/api/auth/me');
      if (data.profile) { await startCloudSession(data.profile); return; }
    } catch { /* No active Supabase session. */ }
  }
  const savedUser = sessionStorage.getItem('carelyUser');
  if (savedUser === '홍길동' && sessionStorage.getItem('carelyUserId') === '홍길동') showDashboard(savedUser);
  else {
    sessionStorage.removeItem('carelyUser');
    sessionStorage.removeItem('carelyUserId');
  }
}
restoreSession();
