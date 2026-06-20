const STORAGE_KEY = 'ffxiv_echo_log_characters';

  function loadCharacters() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveCharacters() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(characters));
    } catch (e) { /* localStorage 사용 불가 시 무시 */ }
  }

  let characters = loadCharacters();

  /* ---------- 표시 설정 (로그 배경색 등) ---------- */
  const SETTINGS_KEY = 'ffxiv_echo_log_settings';
  const DEFAULT_BG = '#161d28';

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  let settings = loadSettings();
  if (!settings.bgColor) settings.bgColor = DEFAULT_BG;

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) { /* localStorage 사용 불가 시 무시 */ }
  }

  function applyLogBackground() {
    const frame = document.querySelector('.preview-frame');
    const preview = document.getElementById('preview');
    if (frame) frame.style.background = settings.bgColor;
    if (preview) preview.style.background = settings.bgColor;
  }

  // 예전 버전의 기본 아바타(🙂 또는 ＃)가 남아있으면 '비어있음(색만 표시)'으로 정리해요.
  let migrated = false;
  characters.forEach(c => {
    if (c.avatarType === 'emoji' && (c.avatarValue === '🙂' || c.avatarValue === '＃')) {
      c.avatarValue = '';
      migrated = true;
    }
  });
  if (migrated) saveCharacters();

  function uid() {
    return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // 파판14 한국 서버명. 닉네임 뒤에 서버명이 붙어 나오는 경우(예: 찹쌀망개떡펜리르)가 있어요.
  const SERVER_NAMES = ['초코보', '모그리', '펜리르', '카벙클', '톤베리'];

  function stripServerSuffix(name) {
    const n = (name || '').trim();
    // 맨 끝 세 글자가 서버명과 같을 때만 떼어내요. 앞이나 가운데에 있으면 닉네임의 일부로 봐요.
    if (n.length > 3 && SERVER_NAMES.includes(n.slice(-3))) {
      return n.slice(0, -3).trim();
    }
    return n;
  }

  function normalizeNick(name) {
    return stripServerSuffix((name || '').split('@')[0].trim());
  }

  function resizeImageToSquare(file, size) {
    // 업로드한 이미지를 가운데 기준 정사각형으로 잘라서 작은 크기로 미리 변환해둬요.
    // 이렇게 미리 압축해두면, 나중에 복-붙(클립보드 복사)했을 때 원본 사진이 그대로
    // 튀어나오는 게 아니라 항상 이 작고 동그랗게 잘릴 수 있는 정사각형 이미지가 붙어요.
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');

          const srcSize = Math.min(img.naturalWidth, img.naturalHeight);
          const srcX = (img.naturalWidth - srcSize) / 2;
          const srcY = (img.naturalHeight - srcSize) / 2;
          ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, size, size);

          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = () => reject(new Error('이미지를 불러오지 못했어요.'));
        img.src = reader.result;
      };
      reader.onerror = () => reject(new Error('파일을 읽지 못했어요.'));
      reader.readAsDataURL(file);
    });
  }

  function findCharacterByNickname(nickname) {
    const norm = normalizeNick(nickname);
    if (!norm) return undefined;
    return characters.find(c => normalizeNick(c.nickname) === norm);
  }

  function getMyCharacter() {
    return characters.find(c => c.isMe);
  }

  // 닉네임 하나를 화면용 이름으로 — 등록돼 있고 표시 이름이 있으면 그 이름, 없으면 닉네임 그대로.
  function nickToDisplay(nick) {
    const c = findCharacterByNickname(nick);
    return (c && c.displayName) ? c.displayName : (normalizeNick(nick) || nick || '');
  }

  // '내 캐릭터'의 화면용 이름 (지정 안 했으면 '나').
  function myDisplayName() {
    const my = getMyCharacter();
    return my ? (my.displayName || my.nickname || '나') : '나';
  }

  function charForEntry(entry) {
    // 내가 보낸 귓속말은 받는 상대가 아니라 '내 캐릭터'를 기준으로 표시·필터링해요.
    if (entry.channelType === 'whisper-out') return getMyCharacter();
    return findCharacterByNickname(entry.nickname);
  }

  function hexToRgba(hex, alpha) {
    const h = (hex || '').replace('#', '');
    if (h.length !== 6) return hex;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
  }

  // 감정표현 문장 안에 등장하는 등록된 닉네임을, 표시 이름이 지정돼 있으면 그 이름으로 바꿔요.
  // (예: "카페르티가 섬가를 껴안습니다" → 표시 이름이 있으면 그 이름으로) 긴 닉네임부터 치환해
  // 짧은 닉네임이 긴 닉네임의 일부를 잘못 바꾸는 일을 막아요.
  function applyDisplayNames(text) {
    let result = text;
    const subs = characters
      .map(c => ({ nick: normalizeNick(c.nickname), disp: (c.displayName || '').trim() }))
      .filter(s => s.nick && s.disp && s.nick !== s.disp)
      .sort((a, b) => b.nick.length - a.nick.length);
    for (const s of subs) {
      result = result.split(s.nick).join(s.disp);
    }
    return result;
  }

  /* ---------- 편집 목록/출력 선택용 세션 상태 ----------
     모두 새로고침하면 초기화돼요. 캐릭터 데이터(localStorage)에는 저장하지 않아요.
     - pinnedIds: 이번 세션에 새로 추가한 캐릭터 (로그 narrowing과 무관하게 항상 편집 목록에 보임)
     - hiddenOutputIds: 출력에서 제외한 캐릭터
     - narrowToLog: '이 로그에 등장하는 캐릭터만 보기' 토글
     - charSearchQuery: 캐릭터 검색어 */
  const pinnedIds = new Set();
  const hiddenOutputIds = new Set();
  let narrowToLog = true;
  let charSearchQuery = '';
  let hiddenSectionOpen = false; // '숨긴 캐릭터' 접이식 섹션 펼침 여부

  function computePresentCharIds(logText) {
    const ids = new Set();
    parseLog(logText).forEach(e => {
      const c = charForEntry(e);
      if (c) ids.add(c.id);
    });
    return ids;
  }

  // 편집 목록에 보여줄 캐릭터를 추려요.
  // 검색 중이면 전체에서 검색(라이브러리 조회), 아니면 narrowing 규칙 적용.
  function getEditorChars() {
    const q = charSearchQuery.trim().toLowerCase();
    if (q) {
      return characters.filter(c =>
        (c.nickname || '').toLowerCase().includes(q) ||
        (c.displayName || '').toLowerCase().includes(q));
    }
    const logText = document.getElementById('logInput').value;
    if (!narrowToLog || logText.trim() === '') return characters;
    const present = computePresentCharIds(logText);
    // 등장 캐릭터 + 이번 세션에 추가한 캐릭터 + 닉네임이 비어있는(작성 중) 캐릭터
    return characters.filter(c =>
      present.has(c.id) || pinnedIds.has(c.id) || normalizeNick(c.nickname) === '');
  }

  /* ---------- 캐릭터 CRUD ---------- */

  function addCharacter() {
    const c = {
      id: uid(),
      nickname: '',
      displayName: '',
      bg: '#26303f',
      color: '#e9e4d6',
      avatarType: 'emoji',
      avatarValue: ''
    };
    characters.push(c);
    pinnedIds.add(c.id); // 새로 추가한 캐릭터는 narrowing 중에도 사라지지 않게 고정
    saveCharacters();
    renderCharList();
  }

  function removeCharacter(id) {
    characters = characters.filter(c => c.id !== id);
    pinnedIds.delete(id);
    hiddenOutputIds.delete(id);
    saveCharacters();
    renderCharList();
    renderPreview();
  }

  function updateCharacter(id, patch) {
    const c = characters.find(c => c.id === id);
    if (!c) return;
    Object.assign(c, patch);
    saveCharacters();
  }

  function createCharRow(c) {
      const row = document.createElement('div');
      row.className = 'char-row';
      row.dataset.id = c.id;

      // 아바타 영역
      const avatarWrap = document.createElement('div');
      avatarWrap.className = 'avatar-edit';

      const avatarPreview = document.createElement('div');
      avatarPreview.className = 'avatar-preview';
      avatarPreview.style.background = c.bg;
      avatarPreview.style.color = c.color;
      if (c.avatarType === 'image' && c.avatarValue) {
        avatarPreview.innerHTML = '<img src="' + c.avatarValue + '" alt="">';
      } else {
        // 비어있으면 색상만 — 글씨/이모지를 넣었을 때만 표시
        avatarPreview.textContent = c.avatarValue || '';
      }
      avatarWrap.appendChild(avatarPreview);

      const emojiInput = document.createElement('input');
      emojiInput.type = 'text';
      emojiInput.className = 'avatar-emoji-input';
      emojiInput.maxLength = 4;
      emojiInput.placeholder = '이모지';
      emojiInput.value = c.avatarType === 'emoji' ? (c.avatarValue || '') : '';
      emojiInput.addEventListener('input', () => {
        updateCharacter(c.id, { avatarType: 'emoji', avatarValue: emojiInput.value });
        avatarPreview.innerHTML = '';
        avatarPreview.textContent = emojiInput.value || '';
        renderPreview();
      });
      avatarWrap.appendChild(emojiInput);

      const uploadLabel = document.createElement('label');
      uploadLabel.className = 'upload-btn';
      uploadLabel.textContent = '사진 올리기';
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      fileInput.hidden = true;
      fileInput.addEventListener('change', async () => {
        const file = fileInput.files[0];
        if (!file) return;
        try {
          const resized = await resizeImageToSquare(file, 200);
          updateCharacter(c.id, { avatarType: 'image', avatarValue: resized });
          avatarPreview.innerHTML = '<img src="' + resized + '" alt="">';
          renderPreview();
        } catch (e) {
          alert('이미지를 처리하는 중 문제가 발생했습니다. 다른 이미지로 다시 시도해주세요.');
        }
      });
      uploadLabel.appendChild(fileInput);
      avatarWrap.appendChild(uploadLabel);

      row.appendChild(avatarWrap);

      // 닉네임 / 표시이름 / 색상
      const fields = document.createElement('div');
      fields.className = 'char-fields';

      const nickInput = document.createElement('input');
      nickInput.type = 'text';
      nickInput.placeholder = '게임 닉네임 (필수)';
      nickInput.value = c.nickname;
      nickInput.addEventListener('input', () => {
        updateCharacter(c.id, { nickname: nickInput.value });
        renderPreview();
      });
      fields.appendChild(nickInput);

      const dispInput = document.createElement('input');
      dispInput.type = 'text';
      dispInput.placeholder = '표시 이름 (선택, 비우면 닉네임 표시)';
      dispInput.value = c.displayName;
      dispInput.addEventListener('input', () => {
        updateCharacter(c.id, { displayName: dispInput.value });
        renderPreview();
      });
      fields.appendChild(dispInput);

      const bgLabel = document.createElement('label');
      bgLabel.className = 'color-label';
      bgLabel.textContent = '배경';
      const bgInput = document.createElement('input');
      bgInput.type = 'color';
      bgInput.value = c.bg;
      bgInput.addEventListener('input', () => {
        updateCharacter(c.id, { bg: bgInput.value });
        avatarPreview.style.background = bgInput.value;
        renderPreview();
      });
      bgLabel.appendChild(bgInput);

      const colorLabel = document.createElement('label');
      colorLabel.className = 'color-label';
      colorLabel.textContent = '글씨';
      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.value = c.color;
      colorInput.addEventListener('input', () => {
        updateCharacter(c.id, { color: colorInput.value });
        avatarPreview.style.color = colorInput.value;
        renderPreview();
      });
      colorLabel.appendChild(colorInput);

      // '내 캐릭터' 지정 — 내가 보낸 귓속말을 이 캐릭터 이름으로 표시해요. 한 명만 지정돼요.
      const meLabel = document.createElement('label');
      meLabel.className = 'me-check';
      const meInput = document.createElement('input');
      meInput.type = 'checkbox';
      meInput.checked = !!c.isMe;
      meInput.addEventListener('change', () => {
        if (meInput.checked) {
          characters.forEach(o => { o.isMe = (o.id === c.id); });
        } else {
          c.isMe = false;
        }
        saveCharacters();
        renderCharList();
        renderPreview();
      });
      meLabel.appendChild(meInput);
      meLabel.appendChild(document.createTextNode(' 내 캐릭터'));

      // 출력 포함 여부 (세션 상태) — 끄면 이 캐릭터 대사가 미리보기/이미지/복사에서 빠져요.
      const outLabel = document.createElement('label');
      outLabel.className = 'out-check';
      const outInput = document.createElement('input');
      outInput.type = 'checkbox';
      outInput.checked = !hiddenOutputIds.has(c.id);
      outInput.addEventListener('change', () => {
        if (outInput.checked) hiddenOutputIds.delete(c.id);
        else hiddenOutputIds.add(c.id);
        renderCharList(); // 숨김/표시에 따라 접이식 섹션으로 이동
        renderPreview();
      });
      outLabel.appendChild(outInput);
      outLabel.appendChild(document.createTextNode(' 출력에 표시'));

      // 배경/글씨 + 내캐릭터/출력을 2열 격자로 가지런히 정렬 (배경↔내캐릭터, 글씨↔출력 정렬)
      const metaGrid = document.createElement('div');
      metaGrid.className = 'char-meta-grid';
      metaGrid.appendChild(bgLabel);
      metaGrid.appendChild(colorLabel);
      metaGrid.appendChild(meLabel);
      metaGrid.appendChild(outLabel);
      fields.appendChild(metaGrid);

      if (hiddenOutputIds.has(c.id)) row.classList.add('char-hidden');

      row.appendChild(fields);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'remove-btn';
      removeBtn.title = '삭제';
      removeBtn.textContent = '✕';
      removeBtn.addEventListener('click', () => {
        const label = c.displayName || c.nickname || '이 캐릭터';
        if (confirm('‘' + label + '’ 캐릭터 설정을 삭제할까요? 되돌릴 수 없습니다.')) {
          removeCharacter(c.id);
        }
      });
      row.appendChild(removeBtn);

      return row;
  }

  function renderCharList() {
    const container = document.getElementById('charList');
    container.innerHTML = '';

    if (characters.length === 0) {
      const hint = document.createElement('p');
      hint.className = 'char-empty-hint';
      hint.textContent = '아직 등록된 캐릭터가 없습니다. 아래 + 버튼으로 추가해주세요.';
      container.appendChild(hint);
      return;
    }

    const visible = getEditorChars();
    if (visible.length === 0) {
      const hint = document.createElement('p');
      hint.className = 'char-empty-hint';
      hint.textContent = charSearchQuery.trim()
        ? '검색 결과가 없습니다.'
        : '이 로그에 등장하는 등록 캐릭터가 없습니다. 위 토글을 끄면 전체 목록을 볼 수 있습니다.';
      container.appendChild(hint);
      return;
    }

    // 출력에 표시되는 캐릭터는 그대로, 숨긴 캐릭터는 아래 접이식 섹션으로 모아요.
    const shown = visible.filter(c => !hiddenOutputIds.has(c.id));
    const hidden = visible.filter(c => hiddenOutputIds.has(c.id));

    shown.forEach(c => container.appendChild(createCharRow(c)));

    if (shown.length === 0) {
      const note = document.createElement('p');
      note.className = 'char-empty-hint';
      note.textContent = '표시 중인 캐릭터가 없습니다. 아래 숨긴 캐릭터에서 다시 켜거나 "모두 표시"를 누르세요.';
      container.appendChild(note);
    }

    if (hidden.length > 0) {
      const section = document.createElement('div');
      section.className = 'hidden-section';

      const header = document.createElement('button');
      header.type = 'button';
      header.className = 'hidden-section-header';
      header.textContent = (hiddenSectionOpen ? '▾' : '▸') + ' 숨긴 캐릭터 ' + hidden.length + '명';
      header.addEventListener('click', () => {
        hiddenSectionOpen = !hiddenSectionOpen;
        renderCharList();
      });
      section.appendChild(header);

      if (hiddenSectionOpen) {
        hidden.forEach(c => section.appendChild(createCharRow(c)));
      }
      container.appendChild(section);
    }
  }

  /* ---------- 로그 파싱 ---------- */

  function stripDecoration(name) {
    // 닉네임 맨 앞에 붙는 파판 전용 아이콘 문자(파티 번호 등)는 한글/영문/숫자가 아니므로 제거
    const cleaned = (name || '').replace(/^[^0-9A-Za-z가-힣]+/, '').trim();
    // 닉네임 끝에 붙은 서버명(펜리르 등)도 떼어내요.
    return stripServerSuffix(cleaned);
  }

  function tryParseEmote(rest) {
    const sorted = characters
      .map(c => ({ nick: normalizeNick(c.nickname) }))
      .filter(c => c.nick)
      .sort((a, b) => b.nick.length - a.nick.length);
    for (const c of sorted) {
      if (rest.startsWith(c.nick + '가 ') || rest.startsWith(c.nick + '이 ')) {
        return { channelType: 'emote', channel: '감정표현', nickname: c.nick, message: rest };
      }
    }
    return null;
  }

  function parseRest(rest) {
    let m = rest.match(/^>>\s*([^:：]+)[:：]\s?(.*)$/);
    if (m) {
      const to = stripDecoration(m[1]);
      // nickname에는 받는 상대를 넣어두되, 표시는 렌더링 단계에서 '내 캐릭터'로 바꿔요.
      return { channelType: 'whisper-out', channel: '귓속말', nickname: to, recipient: to, message: m[2] };
    }

    m = rest.match(/^\[([^\]]+)\]<([^>]+)>\s?(.*)$/);
    if (m) {
      let channel = m[1].trim();
      if (/^\d+$/.test(channel)) channel = '링크셸 ' + channel;
      return { channelType: 'bracket', channel, nickname: stripDecoration(m[2]), message: m[3] };
    }

    m = rest.match(/^([^:：>]+)\s*>>\s*(.*)$/);
    if (m) return { channelType: 'whisper-in', channel: '귓속말', nickname: stripDecoration(m[1]), message: m[2] };

    m = rest.match(/^\(([^)]+)\)\s?(.*)$/);
    if (m) return { channelType: 'party', channel: '파티', nickname: stripDecoration(m[1]), message: m[2] };

    m = rest.match(/^\[([^\]]+)\]\s*(.*)$/);
    if (m) return { channelType: 'system', channel: m[1].trim(), nickname: '', message: m[2] };

    m = rest.match(/^([^:：]+)[:：]\s?(.*)$/);
    if (m) return { channelType: 'say', channel: '말하기', nickname: stripDecoration(m[1]), message: m[2] };

    return { channelType: 'unknown', channel: '', nickname: '', message: rest, unparsed: true };
  }

  function parseLog(text) {
    const lines = text.split(/\r?\n/);
    const entries = [];
    for (const line of lines) {
      if (line.trim() === '') continue;

      let time = '';
      let rest = line;
      const timeMatch = line.match(/^\[(\d{1,2}:\d{2}(?::\d{2})?)\]/);
      if (timeMatch) {
        time = timeMatch[1];
        rest = line.slice(timeMatch[0].length);
      }

      const emoteResult = tryParseEmote(rest);
      if (emoteResult) {
        entries.push(Object.assign({ time, raw: line }, emoteResult));
        continue;
      }

      const parsed = parseRest(rest);

      // 시간 표시가 꺼져 있어서 [HH:MM]이 없고, 채널/닉네임 패턴도 못 알아본 줄은
      // 직전 메시지가 줄바꿈으로 이어진 것으로 보고 합쳐줘요.
      if (parsed.unparsed && !timeMatch && entries.length > 0) {
        entries[entries.length - 1].message += '\n' + line;
      } else {
        entries.push(Object.assign({ time, raw: line }, parsed));
      }
    }
    return entries;
  }

  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  /* ---------- 채널 필터 ---------- */

  let channelFilterState = {};

  function getFilterKey(entry) {
    return entry.channel || '시스템/기타';
  }

  function shouldShowChannel() {
    return document.getElementById('showChannelToggle').checked;
  }

  function shouldShowTime() {
    return document.getElementById('showTimeToggle').checked;
  }

  function renderChannelFilter(entries) {
    const container = document.getElementById('channelFilterList');
    const seen = [];
    entries.forEach(entry => {
      const key = getFilterKey(entry);
      if (!seen.includes(key)) seen.push(key);
      if (!(key in channelFilterState)) channelFilterState[key] = false;
    });

    container.innerHTML = '';
    if (seen.length === 0) {
      const hint = document.createElement('p');
      hint.className = 'char-empty-hint';
      hint.textContent = '로그를 변환하면 채널 목록이 여기에 나타납니다.';
      container.appendChild(hint);
      return;
    }

    seen.forEach(key => {
      const label = document.createElement('label');
      label.className = 'channel-check';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = channelFilterState[key] !== false;
      cb.addEventListener('change', () => {
        channelFilterState[key] = cb.checked;
        renderPreview();
      });
      label.appendChild(cb);

      const span = document.createElement('span');
      span.textContent = key;
      label.appendChild(span);

      container.appendChild(label);
    });
  }

  function getFilteredEntries(text) {
    const onlyRegistered = document.getElementById('filterToggle').checked;
    const entries = parseLog(text);
    renderChannelFilter(entries);
    return entries.filter(entry => {
      if (channelFilterState[getFilterKey(entry)] === false) return false;
      // 시스템 알림(닉네임 없음)은 사람의 대화가 아니므로 '등록된 닉네임만 표시'와 무관하게,
      // 채널 필터만 켜져 있으면 보여줘요.
      if (!entry.nickname) return true;
      const char = charForEntry(entry);
      // 출력에서 제외한 캐릭터의 대사는 숨겨요.
      if (char && hiddenOutputIds.has(char.id)) return false;
      if (onlyRegistered && !char) return false;
      return true;
    });
  }

  /* ---------- 미리보기 렌더링 ---------- */

  // 감정표현(/em 등 행위 묘사)은 RP에서 중요하므로, 캐릭터 색을 살린 가운데 정렬 알약으로 강조해요.
  function buildEmoteLineNode(entry, char) {
    const line = document.createElement('div');
    line.className = 'log-line is-emote';

    const inner = document.createElement('div');
    inner.className = 'log-emote';
    if (char) {
      inner.style.background = char.bg;
      inner.style.color = char.color;
    }

    // 이미지나 이모지가 있을 때만 아바타를 붙이고, 비어있으면 아예 생략해 알약을 깔끔하게 둬요.
    const hasImage = char && char.avatarType === 'image' && char.avatarValue;
    const hasEmoji = char && char.avatarType !== 'image' && char.avatarValue;
    if (hasImage || hasEmoji) {
      const avatar = document.createElement('span');
      avatar.className = 'log-emote-avatar';
      if (hasImage) {
        avatar.innerHTML = '<img src="' + char.avatarValue + '" alt="">';
      } else {
        avatar.textContent = char.avatarValue;
      }
      inner.appendChild(avatar);
    }

    const msg = document.createElement('span');
    msg.className = 'log-emote-msg';
    msg.innerHTML = escapeHtml(applyDisplayNames(entry.message)).replace(/\n/g, '<br>');
    inner.appendChild(msg);

    if (entry.time && shouldShowTime()) {
      const t = document.createElement('span');
      t.className = 'log-emote-time';
      t.textContent = entry.time;
      inner.appendChild(t);
    }

    line.appendChild(inner);
    return line;
  }

  // 귓속말은 사적인 느낌이 나도록 반투명·이탤릭으로 조용하게 표시해요.
  // 보낸 귓속말은 '내 캐릭터' 이름으로 왼쪽에, 받은 귓속말은 상대 아바타를 오른쪽에 두고 우측 정렬해요.
  function buildWhisperNode(entry) {
    const isOut = entry.channelType === 'whisper-out';
    const char = isOut ? getMyCharacter() : findCharacterByNickname(entry.nickname);

    const line = document.createElement('div');
    line.className = 'log-line is-whisper ' + (isOut ? 'whisper-out' : 'whisper-in');

    const avatar = document.createElement('div');
    avatar.className = 'log-avatar';
    if (char) {
      avatar.style.background = char.bg;
      avatar.style.color = char.color;
      if (char.avatarType === 'image' && char.avatarValue) {
        avatar.innerHTML = '<img src="' + char.avatarValue + '" alt="">';
      } else {
        avatar.textContent = char.avatarValue || '';
      }
    } else {
      avatar.classList.add('log-avatar-default');
      avatar.textContent = isOut ? '나' : ((entry.nickname || '?').charAt(0) || '?');
    }
    line.appendChild(avatar);

    const bubble = document.createElement('div');
    bubble.className = 'log-bubble';
    bubble.style.background = char ? hexToRgba(char.bg, 0.72) : 'rgba(36, 44, 57, 0.72)';
    bubble.style.color = char ? char.color : 'var(--text-primary)';

    const meta = document.createElement('div');
    meta.className = 'log-meta';

    // 보낸/받은 귓속말 모두 "보낸사람 → 받은사람" 형식으로 통일해요.
    const senderName = isOut ? myDisplayName() : nickToDisplay(entry.nickname);
    const receiverName = isOut ? nickToDisplay(entry.recipient) : myDisplayName();

    const nameSpan = document.createElement('span');
    nameSpan.className = 'log-name';
    nameSpan.textContent = senderName;
    meta.appendChild(nameSpan);

    const tagSpan = document.createElement('span');
    tagSpan.className = 'log-whisper-tag';
    tagSpan.textContent = '→ ' + receiverName;
    meta.appendChild(tagSpan);

    const timeSpan = document.createElement('span');
    timeSpan.className = 'log-time';
    timeSpan.textContent = entry.time;
    if (entry.time && shouldShowTime()) meta.appendChild(timeSpan);

    bubble.appendChild(meta);

    const msg = document.createElement('div');
    msg.className = 'log-message';
    msg.innerHTML = escapeHtml(entry.message).replace(/\n/g, '<br>');
    bubble.appendChild(msg);

    line.appendChild(bubble);
    return line;
  }

  // 시스템 알림(공지·토벌 종료 등)은 조용한 한 줄로. 'unknown'은 라벨 없이 본문만, [이벤트]처럼
  // 의미있는 대괄호 채널만 작은 태그로 붙여요.
  function buildSystemLineNode(entry) {
    const line = document.createElement('div');
    line.className = 'log-line is-system';

    const inner = document.createElement('div');
    inner.className = 'log-system';

    if (entry.time && shouldShowTime()) {
      const t = document.createElement('span');
      t.className = 'log-system-time';
      t.textContent = entry.time;
      inner.appendChild(t);
    }
    if (entry.channel && entry.channelType === 'system') {
      const tag = document.createElement('span');
      tag.className = 'log-system-tag';
      tag.textContent = entry.channel;
      inner.appendChild(tag);
    }
    const msg = document.createElement('span');
    msg.className = 'log-system-msg';
    msg.innerHTML = escapeHtml(entry.message).replace(/\n/g, '<br>');
    inner.appendChild(msg);

    line.appendChild(inner);
    return line;
  }

  function renderPreview() {
    const text = document.getElementById('logInput').value;
    const filtered = getFilteredEntries(text);

    const preview = document.getElementById('preview');
    preview.innerHTML = '';

    filtered.forEach(entry => {
      const char = findCharacterByNickname(entry.nickname);
      const isEmote = entry.channelType === 'emote';
      const isSystem = !entry.nickname;

      if (entry.channelType === 'whisper-out' || entry.channelType === 'whisper-in') {
        preview.appendChild(buildWhisperNode(entry));
        return;
      }
      if (isSystem) {
        preview.appendChild(buildSystemLineNode(entry));
        return;
      }
      if (isEmote) {
        preview.appendChild(buildEmoteLineNode(entry, char));
        return;
      }

      const line = document.createElement('div');
      line.className = 'log-line';

      const avatar = document.createElement('div');
      avatar.className = 'log-avatar';
      if (char) {
        avatar.style.background = char.bg;
        avatar.style.color = char.color;
        if (char.avatarType === 'image' && char.avatarValue) {
          avatar.innerHTML = '<img src="' + char.avatarValue + '" alt="">';
        } else {
          avatar.textContent = char.avatarValue || '';
        }
      } else {
        avatar.classList.add('log-avatar-default');
        avatar.textContent = (entry.nickname || '?').charAt(0) || '?';
      }
      line.appendChild(avatar);

      const bubble = document.createElement('div');
      bubble.className = 'log-bubble';
      bubble.style.background = char ? char.bg : 'var(--panel-raised)';
      bubble.style.color = char ? char.color : 'var(--text-primary)';

      const meta = document.createElement('div');
      meta.className = 'log-meta';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'log-name';
      nameSpan.textContent = (char && char.displayName) ? char.displayName : (entry.nickname || '???');
      meta.appendChild(nameSpan);

      if (entry.channel && shouldShowChannel()) {
        const chSpan = document.createElement('span');
        chSpan.className = 'log-channel';
        chSpan.textContent = '[' + entry.channel + ']';
        meta.appendChild(chSpan);
      }

      const timeSpan = document.createElement('span');
      timeSpan.className = 'log-time';
      timeSpan.textContent = entry.time;
      if (entry.time && shouldShowTime()) meta.appendChild(timeSpan);

      bubble.appendChild(meta);

      const msg = document.createElement('div');
      msg.className = 'log-message';
      msg.innerHTML = escapeHtml(entry.message).replace(/\n/g, '<br>');
      bubble.appendChild(msg);

      line.appendChild(bubble);
      preview.appendChild(line);
    });

    if (filtered.length === 0) {
      preview.innerHTML = '<p class="empty-notice">표시할 로그가 없습니다. 로그를 붙여넣고, 닉네임을 등록했는지 확인해주세요.</p>';
    }
  }

  /* ---------- 이미지 내보내기 ---------- */

  function exportImage() {
    const node = document.getElementById('preview');
    if (!node.children.length || node.querySelector('.empty-notice')) {
      alert('내보낼 로그가 없습니다. 먼저 변환하기를 눌러주세요.');
      return;
    }
    if (typeof html2canvas === 'undefined') {
      alert('이미지 저장 기능을 불러오지 못했습니다. 인터넷 연결을 확인해주세요.');
      return;
    }
    html2canvas(node, { backgroundColor: settings.bgColor, scale: 2 }).then(canvas => {
      const link = document.createElement('a');
      link.download = 'ffxiv_log_' + Date.now() + '.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    }).catch(err => {
      alert('이미지 저장 중 문제가 발생했습니다: ' + err.message);
    });
  }

  /* ---------- 서식 복사 (클립보드) ---------- */
  /* 구글 문서·워드 등은 div의 배경/둥근모서리/패딩이나 표 폭을 제멋대로 바꿔서 큰 색 덩어리로
     둔탁해져요. 그래서 여기서는 '대화록' 스타일로 가볍게 포장합니다 — 이름만 캐릭터 색 칩으로
     강조하고, 메시지는 그 아래 일반 텍스트로. 어떤 에디터에 붙여도 깔끔하게 읽혀요. */
  const COPY_FONT = "font-family:'Malgun Gothic','Noto Sans KR',sans-serif;";

  function copyAvatarInline(char) {
    // 이름 앞에 붙는 작은 아바타. 비어있으면 생략해 깔끔하게.
    if (char && char.avatarType === 'image' && char.avatarValue) {
      return '<img src="' + char.avatarValue + '" width="18" height="18" style="width:18px;height:18px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:5px;">';
    }
    if (char && char.avatarValue) {
      return '<span style="vertical-align:middle;margin-right:4px;">' + escapeHtml(char.avatarValue) + '</span>';
    }
    return '';
  }

  // 왼쪽 얇은 색 줄 = 폭 좁은 '색칠된 셀'. 이름은 칩 없이 굵은 글씨, 메시지는 일반 텍스트.
  function copyBarRow(barColor, headerHtml, bodyHtml, italic) {
    return '<tr>' +
      '<td width="4" style="width:4px;background:' + barColor + ';border:none;padding:0;font-size:1px;line-height:1px;">&nbsp;</td>' +
      '<td style="border:none;padding:3px 0 11px 11px;' + COPY_FONT + '">' +
        '<div style="font-size:14px;line-height:1.5;">' + headerHtml + '</div>' +
        '<div style="font-size:14px;line-height:1.55;color:#222;' + (italic ? 'font-style:italic;' : '') + '">' + bodyHtml + '</div>' +
      '</td></tr>';
  }

  // 가운데 정렬 행 (시스템/감정표현) — 왼쪽 줄 없음
  function copyCenterRow(innerHtml, extraStyle) {
    return '<tr>' +
      '<td style="border:none;padding:0;"></td>' +
      '<td style="border:none;padding:4px 0;text-align:center;' + COPY_FONT + (extraStyle || '') + '">' + innerHtml + '</td>' +
    '</tr>';
  }

  // 메시지 하나를 표의 '행(tr)'으로 만들어요. 전체는 copyFormatted에서 표 하나로 감쌉니다.
  function buildLineHtml(entry) {
    const char = findCharacterByNickname(entry.nickname);
    const isEmote = entry.channelType === 'emote';
    const isWhisper = entry.channelType === 'whisper-out' || entry.channelType === 'whisper-in';
    const isSystem = !entry.nickname && !isWhisper;
    const messageHtml = escapeHtml(entry.message).replace(/\n/g, '<br>');
    const timeLabel = (entry.time && shouldShowTime()) ? entry.time : '';
    const metaStyle = 'color:#999;font-size:12px;';

    // 시스템 알림: 가운데 정렬 회색 한 줄
    if (isSystem) {
      const bits = [timeLabel, (entry.channel && entry.channelType === 'system') ? entry.channel : ''].filter(Boolean).join(' · ');
      const prefix = bits ? escapeHtml(bits) + '  ' : '';
      return copyCenterRow(prefix + messageHtml, 'color:#999;font-size:12px;');
    }

    // 감정표현: 가운데 정렬 이탤릭 (본문에 행위자 이름이 들어있어 이름 생략)
    if (isEmote) {
      const av = copyAvatarInline(char);
      const t = timeLabel ? ' <span style="' + metaStyle + 'font-style:normal;">' + escapeHtml(timeLabel) + '</span>' : '';
      const emoteHtml = escapeHtml(applyDisplayNames(entry.message)).replace(/\n/g, '<br>');
      return copyCenterRow(av + emoteHtml + t, 'font-style:italic;font-size:14px;color:#333;');
    }

    // 귓속말: 왼쪽 색 줄 + 이름(굵게) + "→ 상대 · 귓속말", 메시지는 이탤릭
    if (isWhisper) {
      const isOut = entry.channelType === 'whisper-out';
      const wChar = isOut ? getMyCharacter() : findCharacterByNickname(entry.nickname);
      const bar = wChar ? wChar.bg : '#cccccc';
      const name = isOut ? myDisplayName() : nickToDisplay(entry.nickname);
      const meta = ['→ ' + (isOut ? nickToDisplay(entry.recipient) : myDisplayName()), '귓속말', timeLabel].filter(Boolean).join(' · ');
      const av = copyAvatarInline(wChar);
      const header = av + '<b style="font-size:14px;">' + escapeHtml(name) + '</b> <span style="' + metaStyle + '">' + escapeHtml(meta) + '</span>';
      return copyBarRow(bar, header, messageHtml, true);
    }

    // 일반 대화: 왼쪽 색 줄 + 이름(굵게)
    const bar = char ? char.bg : '#cccccc';
    const name = (char && char.displayName) ? char.displayName : (entry.nickname || '???');
    const metaBits = [(entry.channel && shouldShowChannel()) ? '[' + entry.channel + ']' : '', timeLabel].filter(Boolean).join(' ');
    const av = copyAvatarInline(char);
    const header = av + '<b style="font-size:14px;">' + escapeHtml(name) + '</b>' +
      (metaBits ? ' <span style="' + metaStyle + '">' + escapeHtml(metaBits) + '</span>' : '');
    return copyBarRow(bar, header, messageHtml, false);
  }

  /* ---------- HTML 코드 복사용 (티스토리 등 HTML 편집 모드) ----------
     티스토리·블로그 HTML 모드나 웹페이지는 진짜 브라우저로 렌더링하므로, 미리보기 모습
     (둥근 말풍선·아바타 원·귓속말 반투명·감정표현 알약)을 그대로 인라인 스타일로 재현해요. */

  function richAvatarHtml(char, fallback, size, opacity) {
    const op = (opacity != null && opacity < 1) ? 'opacity:' + opacity + ';' : '';
    const base = 'width:' + size + 'px;height:' + size + 'px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;overflow:hidden;';
    if (!char) {
      return '<div style="' + base + 'border:1px dashed #313b4b;color:#8b93a3;font-weight:700;font-size:14px;' + op + '">' + escapeHtml(fallback || '?') + '</div>';
    }
    const inner = (char.avatarType === 'image' && char.avatarValue)
      ? '<img src="' + char.avatarValue + '" style="width:100%;height:100%;object-fit:cover;display:block;">'
      : escapeHtml(char.avatarValue || '');
    return '<div style="' + base + 'background:' + char.bg + ';color:' + char.color + ';font-size:16px;' + op + '">' + inner + '</div>';
  }

  function richRowHtml(av, bg, color, header, body, dashed) {
    const border = dashed ? 'border:1px dashed rgba(255,255,255,0.2);' : '';
    return '<div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:12px;">' +
      av +
      '<div style="flex:1;border-radius:10px;padding:9px 12px;background:' + bg + ';color:' + color + ';' + border + '">' +
        '<div style="margin-bottom:3px;">' + header + '</div>' +
        '<div style="font-size:14px;line-height:1.55;word-break:break-word;">' + body + '</div>' +
      '</div></div>';
  }

  function buildRichLineHtml(entry) {
    const char = findCharacterByNickname(entry.nickname);
    const isEmote = entry.channelType === 'emote';
    const isWhisper = entry.channelType === 'whisper-out' || entry.channelType === 'whisper-in';
    const isSystem = !entry.nickname && !isWhisper;
    const time = (entry.time && shouldShowTime()) ? entry.time : '';
    const msgHtml = escapeHtml(entry.message).replace(/\n/g, '<br>');

    // 시스템 알림
    if (isSystem) {
      const t = time ? '<span style="font-size:11px;opacity:0.55;margin-right:6px;">' + escapeHtml(time) + '</span>' : '';
      const tag = (entry.channel && entry.channelType === 'system')
        ? '<span style="font-size:10.5px;color:#a8843f;border:1px solid #2c3648;border-radius:4px;padding:0 5px;margin-right:6px;">' + escapeHtml(entry.channel) + '</span>' : '';
      return '<div style="text-align:center;color:#8a93a6;font-size:12px;margin-bottom:10px;">' + t + tag + msgHtml + '</div>';
    }

    // 감정표현
    if (isEmote) {
      const bg = char ? char.bg : '#242c39';
      const color = char ? char.color : '#e9e4d6';
      let av = '';
      if (char && char.avatarType === 'image' && char.avatarValue) {
        av = '<span style="display:inline-block;width:22px;height:22px;border-radius:50%;overflow:hidden;vertical-align:middle;margin-right:8px;"><img src="' + char.avatarValue + '" style="width:100%;height:100%;object-fit:cover;"></span>';
      } else if (char && char.avatarValue) {
        av = '<span style="margin-right:6px;">' + escapeHtml(char.avatarValue) + '</span>';
      }
      const t = time ? '<span style="font-style:normal;font-size:11px;opacity:0.65;margin-left:8px;">' + escapeHtml(time) + '</span>' : '';
      const emoteHtml = escapeHtml(applyDisplayNames(entry.message)).replace(/\n/g, '<br>');
      return '<div style="text-align:center;margin-bottom:12px;">' +
        '<span style="display:inline-block;background:' + bg + ';color:' + color + ';border-radius:999px;padding:9px 16px;font-style:italic;font-size:14px;">' +
          av + emoteHtml + t +
        '</span></div>';
    }

    // 귓속말
    if (isWhisper) {
      const isOut = entry.channelType === 'whisper-out';
      const wChar = isOut ? getMyCharacter() : findCharacterByNickname(entry.nickname);
      const bg = wChar ? hexToRgba(wChar.bg, 0.72) : 'rgba(36, 44, 57, 0.72)';
      const color = wChar ? wChar.color : '#e9e4d6';
      const name = isOut ? myDisplayName() : nickToDisplay(entry.nickname);
      const meta = ['→ ' + (isOut ? nickToDisplay(entry.recipient) : myDisplayName()), time].filter(Boolean).join(' ');
      const av = richAvatarHtml(wChar, isOut ? '나' : ((entry.nickname || '?').charAt(0) || '?'), 36, 0.72);
      const header = '<b style="font-size:14px;">' + escapeHtml(name) + '</b> <span style="font-size:11px;opacity:0.7;">' + escapeHtml(meta) + '</span>';
      return richRowHtml(av, bg, color, header, '<span style="font-style:italic;">' + msgHtml + '</span>', true);
    }

    // 일반 대화
    const bg = char ? char.bg : '#242c39';
    const color = char ? char.color : '#e9e4d6';
    const name = (char && char.displayName) ? char.displayName : (entry.nickname || '???');
    const ch = (entry.channel && shouldShowChannel()) ? ' <span style="font-size:11px;opacity:0.75;">[' + escapeHtml(entry.channel) + ']</span>' : '';
    const t = time ? ' <span style="font-size:11px;opacity:0.6;">' + escapeHtml(time) + '</span>' : '';
    const av = richAvatarHtml(char, (entry.nickname || '?').charAt(0) || '?', 36, 1);
    const header = '<b style="font-size:14px;">' + escapeHtml(name) + '</b>' + ch + t;
    return richRowHtml(av, bg, color, header, msgHtml, false);
  }

  function buildRichHtmlDocument(filtered) {
    const inner = filtered.map(buildRichLineHtml).join('');
    return '<div style="background:' + settings.bgColor + ';padding:18px 20px;border-radius:10px;max-width:680px;' + COPY_FONT + '">' + inner + '</div>';
  }

  function buildPlainText(entry) {
    const char = findCharacterByNickname(entry.nickname);
    const isEmote = entry.channelType === 'emote';
    const isSystem = !entry.nickname && entry.channelType !== 'whisper-out';
    const timeLabel = (entry.time && shouldShowTime()) ? '[' + entry.time + '] ' : '';

    if (entry.channelType === 'whisper-out') {
      return timeLabel + myDisplayName() + ' → ' + nickToDisplay(entry.recipient) + ' (귓속말): ' + entry.message;
    }
    if (entry.channelType === 'whisper-in') {
      return timeLabel + nickToDisplay(entry.nickname) + ' → ' + myDisplayName() + ' (귓속말): ' + entry.message;
    }

    // 감정표현은 본문에 행위자가 들어있고, 시스템은 이름·채널 라벨이 불필요해요.
    if (isEmote) {
      return timeLabel + applyDisplayNames(entry.message);
    }
    if (isSystem) {
      return timeLabel + entry.message;
    }

    const name = (char && char.displayName) ? char.displayName : (entry.nickname || '???');
    const channelLabel = (entry.channel && shouldShowChannel()) ? '[' + entry.channel + '] ' : '';
    return timeLabel + channelLabel + name + ': ' + entry.message;
  }

  function flashCopyButton(btnId, success) {
    const btn = document.getElementById(btnId);
    const original = btn.textContent;
    btn.textContent = success ? '복사됨!' : '복사 실패';
    setTimeout(() => { btn.textContent = original; }, 1500);
  }

  async function copyFormatted() {
    const text = document.getElementById('logInput').value;
    const filtered = getFilteredEntries(text);
    if (filtered.length === 0) {
      alert('복사할 로그가 없습니다. 먼저 변환하기를 눌러주세요.');
      return;
    }

    // 메시지 행들을 표 하나로 감싸요 (메시지마다 표를 따로 만들면 에디터가 사이에 빈 줄을 넣어요).
    const htmlContent = '<table border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:none;' + COPY_FONT + '"><tbody>' +
      filtered.map(buildLineHtml).join('') + '</tbody></table>';
    const plainText = filtered.map(buildPlainText).join('\n');

    // 1차: 최신 Clipboard API (서식 있는 HTML 복사)
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        const item = new ClipboardItem({
          'text/html': new Blob([htmlContent], { type: 'text/html' }),
          'text/plain': new Blob([plainText], { type: 'text/plain' })
        });
        await navigator.clipboard.write([item]);
        flashCopyButton('copyBtn', true);
        return;
      }
    } catch (e) {
      // 실패하면 아래 구형 방식으로 시도
    }

    // 2차 fallback: 화면 밖에 임시 영역을 만들어 선택한 뒤 execCommand로 복사
    const temp = document.createElement('div');
    temp.style.position = 'fixed';
    temp.style.left = '-9999px';
    temp.style.top = '0';
    temp.setAttribute('contenteditable', 'true');
    temp.innerHTML = htmlContent;
    document.body.appendChild(temp);

    const range = document.createRange();
    range.selectNodeContents(temp);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    let success = false;
    try {
      success = document.execCommand('copy');
    } catch (e) {
      success = false;
    }

    selection.removeAllRanges();
    document.body.removeChild(temp);
    flashCopyButton('copyBtn', success);
    if (!success) {
      alert('클립보드 복사에 실패했습니다. 사용 중인 브라우저에서 지원하지 않을 수 있습니다.');
    }
  }

  async function copyPlainText() {
    const text = document.getElementById('logInput').value;
    const filtered = getFilteredEntries(text);
    if (filtered.length === 0) {
      alert('복사할 로그가 없습니다. 먼저 변환하기를 눌러주세요.');
      return;
    }

    const plainText = filtered.map(buildPlainText).join('\n');

    // 1차: 최신 Clipboard API
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(plainText);
        flashCopyButton('textCopyBtn', true);
        return;
      }
    } catch (e) {
      // 실패하면 아래 구형 방식으로 시도
    }

    // 2차 fallback: 임시 textarea로 선택 후 execCommand 복사
    const temp = document.createElement('textarea');
    temp.value = plainText;
    temp.style.position = 'fixed';
    temp.style.left = '-9999px';
    document.body.appendChild(temp);
    temp.select();

    let success = false;
    try {
      success = document.execCommand('copy');
    } catch (e) {
      success = false;
    }

    document.body.removeChild(temp);
    flashCopyButton('textCopyBtn', success);
    if (!success) {
      alert('클립보드 복사에 실패했습니다. 사용 중인 브라우저에서 지원하지 않을 수 있습니다.');
    }
  }

  // HTML '코드 자체'를 텍스트로 복사 — 티스토리/블로그 HTML 편집 모드에 붙여넣으면 모습 그대로 살아나요.
  async function copyHtmlCode() {
    const text = document.getElementById('logInput').value;
    const filtered = getFilteredEntries(text);
    if (filtered.length === 0) {
      alert('복사할 로그가 없습니다. 먼저 변환하기를 눌러주세요.');
      return;
    }

    const code = buildRichHtmlDocument(filtered);

    // 1차: 최신 Clipboard API (코드를 '일반 텍스트'로 복사)
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(code);
        flashCopyButton('htmlCopyBtn', true);
        return;
      }
    } catch (e) {
      // 실패하면 아래 구형 방식으로 시도
    }

    // 2차 fallback: 임시 textarea로 선택 후 execCommand 복사
    const temp = document.createElement('textarea');
    temp.value = code;
    temp.style.position = 'fixed';
    temp.style.left = '-9999px';
    document.body.appendChild(temp);
    temp.select();

    let success = false;
    try {
      success = document.execCommand('copy');
    } catch (e) {
      success = false;
    }

    document.body.removeChild(temp);
    flashCopyButton('htmlCopyBtn', success);
    if (!success) {
      alert('클립보드 복사에 실패했습니다. 사용 중인 브라우저에서 지원하지 않을 수 있습니다.');
    }
  }

  /* ---------- 이벤트 연결 ---------- */

  document.getElementById('addCharBtn').addEventListener('click', addCharacter);
  document.getElementById('renderBtn').addEventListener('click', renderPreview);
  document.getElementById('filterToggle').addEventListener('change', renderPreview);
  document.getElementById('showChannelToggle').addEventListener('change', renderPreview);
  document.getElementById('showTimeToggle').addEventListener('change', renderPreview);
  document.getElementById('copyBtn').addEventListener('click', copyFormatted);
  document.getElementById('htmlCopyBtn').addEventListener('click', copyHtmlCode);
  document.getElementById('textCopyBtn').addEventListener('click', copyPlainText);
  document.getElementById('exportBtn').addEventListener('click', exportImage);

  const logBgColorInput = document.getElementById('logBgColor');
  logBgColorInput.value = settings.bgColor;
  logBgColorInput.addEventListener('input', () => {
    settings.bgColor = logBgColorInput.value;
    saveSettings();
    applyLogBackground();
  });
  document.getElementById('logBgReset').addEventListener('click', () => {
    settings.bgColor = DEFAULT_BG;
    logBgColorInput.value = DEFAULT_BG;
    saveSettings();
    applyLogBackground();
  });

  // 캐릭터 검색
  const charSearchInput = document.getElementById('charSearch');
  charSearchInput.addEventListener('input', () => {
    charSearchQuery = charSearchInput.value;
    renderCharList();
  });

  // '이 로그에 등장하는 캐릭터만 보기' 토글
  document.getElementById('narrowToggle').addEventListener('change', (e) => {
    narrowToLog = e.target.checked;
    renderCharList();
  });

  // 출력 일괄 표시/숨김 (현재 편집 목록에 보이는 캐릭터 기준)
  document.getElementById('showAllChars').addEventListener('click', () => {
    hiddenOutputIds.clear();
    renderCharList();
    renderPreview();
  });
  document.getElementById('hideAllChars').addEventListener('click', () => {
    getEditorChars().forEach(c => hiddenOutputIds.add(c.id));
    renderCharList();
    renderPreview();
  });

  document.getElementById('clearBtn').addEventListener('click', () => {
    document.getElementById('logInput').value = '';
    renderPreview();
    renderCharList(); // 로그가 비면 편집 목록은 전체로 돌아가요.
  });

  document.getElementById('resetBtn').addEventListener('click', () => {
    if (confirm('등록된 모든 캐릭터 설정을 삭제할까요? 되돌릴 수 없습니다.')) {
      characters = [];
      pinnedIds.clear();
      hiddenOutputIds.clear();
      saveCharacters();
      renderCharList();
      renderPreview();
    }
  });

  let debounceTimer;
  document.getElementById('logInput').addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      renderPreview();
      renderCharList(); // 로그 내용이 바뀌면 등장 캐릭터 기준으로 편집 목록도 다시 좁혀요.
    }, 250);
  });

  renderCharList();
  applyLogBackground();