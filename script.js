const STORAGE_KEY = 'ffxiv_echo_log_characters';

  function loadCharacters() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  let storageWarned = false;
  function saveCharacters() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(characters));
      storageWarned = false;
    } catch (e) {
      // 저장 실패(용량 초과 등) 시 한 번만 알림
      if (!storageWarned) {
        storageWarned = true;
        alert('저장 공간이 부족해 캐릭터 설정을 저장하지 못했습니다.\n이미지 아바타 수를 줄이거나 일부 캐릭터를 삭제해주세요.');
      }
    }
  }

  let characters = loadCharacters();

  /* ---------- 표시 설정 (로그 배경색 등) ---------- */
  const SETTINGS_KEY = 'ffxiv_echo_log_settings';
  const DEFAULT_BG = '#161d28';
  const DEFAULT_SYS_COLOR = '#8a93a6';

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
  if (!settings.sysColor) settings.sysColor = DEFAULT_SYS_COLOR;
  // 구버전 웜톤 기본값 마이그레이션 (직접 고른 색은 유지)
  if (settings.bgColor === '#211d19') settings.bgColor = DEFAULT_BG;
  if (settings.sysColor === '#a59d92') settings.sysColor = DEFAULT_SYS_COLOR;

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

  // 구버전 기본 아바타(🙂/＃) 정리
  let migrated = false;
  characters.forEach(c => {
    if (c.avatarType === 'emoji' && (c.avatarValue === '🙂' || c.avatarValue === '＃')) {
      c.avatarValue = '';
      migrated = true;
    }
    // 이모지 텍스트는 사진과 별도로 보관
    if (c.emojiText === undefined) {
      c.emojiText = (c.avatarType === 'emoji') ? (c.avatarValue || '') : '';
      migrated = true;
    }
    // 구버전 웜톤 말풍선 기본색 마이그레이션
    if (c.bg === '#38322b') {
      c.bg = '#26303f';
      migrated = true;
    }
  });
  if (migrated) saveCharacters();

  function uid() {
    return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // 한국 서버명 — 닉네임 뒤에 붙어 나오는 경우 제거용
  const SERVER_NAMES = ['초코보', '모그리', '펜리르', '카벙클', '톤베리'];

  function stripServerSuffix(name) {
    const n = (name || '').trim();
    // 맨 끝이 서버명일 때만 제거 (앞·가운데는 닉네임 일부)
    if (n.length > 3 && SERVER_NAMES.includes(n.slice(-3))) {
      return n.slice(0, -3).trim();
    }
    return n;
  }

  function normalizeNick(name) {
    return stripServerSuffix((name || '').split('@')[0].trim());
  }

  // 아바타 dataURL → 원형 PNG 썸네일 (서식 복사용 — 에디터가 둥근 모서리를 못 살려도 원형 유지)
  function downscaleDataUrl(dataUrl, size) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.save();
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(img, 0, 0, size, size);
        ctx.restore();
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => resolve(dataUrl); // 실패 시 원본 유지
      img.src = dataUrl;
    });
  }

  // 색/이모지 아바타를 원형 이미지로 렌더링
  function copyCircleDataUrl(bg, color, text, size) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = bg || '#3a4252';
    ctx.fill();
    if (text) {
      ctx.clip(); // 글자가 원 밖으로 안 나가게
      ctx.fillStyle = color || '#ffffff';
      const fontPx = Math.round(size * (text.length <= 1 ? 0.52 : text.length === 2 ? 0.38 : 0.28));
      ctx.font = '700 ' + fontPx + "px 'Malgun Gothic','Noto Sans KR',sans-serif";
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, size / 2, size / 2 + Math.round(size * 0.04));
    }
    return canvas.toDataURL('image/png');
  }

  // 서식 복사용 아바타 크기(px)
  const AVATAR_THUMB_SIZE = 36;
  const AVATAR_THUMB_VERSION = 6; // 규격 변경 시 올려서 썸네일 재생성

  // 썸네일이 없거나 구규격이면 재생성
  function ensureAvatarThumbs() {
    const need = characters.filter(c => c.avatarType === 'image' && c.avatarValue &&
      (!c.avatarThumb || c.avatarThumbV !== AVATAR_THUMB_VERSION));
    if (need.length === 0) return;
    Promise.all(need.map(c => downscaleDataUrl(c.avatarValue, AVATAR_THUMB_SIZE).then(t => {
      c.avatarThumb = t;
      c.avatarThumbV = AVATAR_THUMB_VERSION;
    }))).then(() => saveCharacters());
  }

  /* ---------- 사진 크롭 편집기 (드래그 + 확대) ----------
     업로드한 사진을 원형 틀 안에서 끌어 위치를 맞추고 확대/축소한 뒤 잘라요.
     원본은 편집 중에만 메모리에 두고, 잘라낸 200px 결과만 저장하므로 저장 용량 부담은 그대로예요. */
  function openCropEditor(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => showCropUI(img, resolve);
        img.onerror = () => { alert('이미지를 불러오지 못했습니다. 다른 이미지로 시도해주세요.'); resolve(null); };
        img.src = reader.result;
      };
      reader.onerror = () => { alert('파일을 읽지 못했습니다.'); resolve(null); };
      reader.readAsDataURL(file);
    });
  }

  function showCropUI(img, resolve) {
    const VP = 260;                 // 원형 미리보기 틀 한 변(px)
    const OUT = 200;                // 저장될 정사각형 크기(px)
    const natW = img.naturalWidth, natH = img.naturalHeight;
    const coverScale = VP / Math.min(natW, natH); // 줌 1일 때 틀을 꽉 채우는 배율
    let zoom = 1, tx = 0, ty = 0;

    const overlay = document.createElement('div');
    overlay.className = 'crop-overlay';
    const box = document.createElement('div');
    box.className = 'crop-box';

    const title = document.createElement('div');
    title.className = 'crop-title';
    title.textContent = '사진 위치 조정';
    box.appendChild(title);

    const viewport = document.createElement('div');
    viewport.className = 'crop-viewport';
    viewport.style.width = VP + 'px';
    viewport.style.height = VP + 'px';
    const imgEl = document.createElement('img');
    imgEl.className = 'crop-img';
    imgEl.src = img.src;
    imgEl.draggable = false;
    viewport.appendChild(imgEl);
    box.appendChild(viewport);

    const zoomRow = document.createElement('div');
    zoomRow.className = 'crop-zoom';
    const minLabel = document.createElement('span'); minLabel.textContent = '축소';
    const slider = document.createElement('input');
    slider.type = 'range'; slider.min = '1'; slider.max = '3'; slider.step = '0.01'; slider.value = '1';
    const maxLabel = document.createElement('span'); maxLabel.textContent = '확대';
    zoomRow.appendChild(minLabel); zoomRow.appendChild(slider); zoomRow.appendChild(maxLabel);
    box.appendChild(zoomRow);

    const hint = document.createElement('p');
    hint.className = 'crop-hint';
    hint.textContent = '사진을 끌어 위치를 맞추고, 슬라이더로 확대/축소하세요.';
    box.appendChild(hint);

    const btns = document.createElement('div');
    btns.className = 'crop-btns';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button'; cancelBtn.className = 'btn btn-outline'; cancelBtn.textContent = '취소';
    const applyBtn = document.createElement('button');
    applyBtn.type = 'button'; applyBtn.className = 'btn btn-primary'; applyBtn.textContent = '적용';
    btns.appendChild(cancelBtn); btns.appendChild(applyBtn);
    box.appendChild(btns);

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const eff = () => coverScale * zoom;
    function clampAndRender() {
      const w = natW * eff(), h = natH * eff();
      const minTx = VP - w, minTy = VP - h;
      tx = Math.min(0, Math.max(minTx, tx));
      ty = Math.min(0, Math.max(minTy, ty));
      imgEl.style.width = w + 'px';
      imgEl.style.height = h + 'px';
      imgEl.style.transform = 'translate(' + tx + 'px,' + ty + 'px)';
    }
    clampAndRender();

    let dragging = false, startX = 0, startY = 0, baseTx = 0, baseTy = 0;
    function pointerStart(x, y) { dragging = true; startX = x; startY = y; baseTx = tx; baseTy = ty; }
    function pointerMove(x, y) { if (!dragging) return; tx = baseTx + (x - startX); ty = baseTy + (y - startY); clampAndRender(); }
    function pointerEnd() { dragging = false; }

    const onMouseDown = e => { pointerStart(e.clientX, e.clientY); e.preventDefault(); };
    const onMouseMove = e => pointerMove(e.clientX, e.clientY);
    const onMouseUp = () => pointerEnd();
    viewport.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    viewport.addEventListener('touchstart', e => { if (e.touches[0]) pointerStart(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
    viewport.addEventListener('touchmove', e => { if (e.touches[0]) { pointerMove(e.touches[0].clientX, e.touches[0].clientY); e.preventDefault(); } }, { passive: false });
    viewport.addEventListener('touchend', pointerEnd);

    slider.addEventListener('input', () => {
      // 틀 중심을 기준으로 확대/축소해 보던 부분이 유지되게
      const c = VP / 2;
      const oldEff = eff();
      zoom = parseFloat(slider.value);
      const newEff = eff();
      tx = c - (c - tx) * (newEff / oldEff);
      ty = c - (c - ty) * (newEff / oldEff);
      clampAndRender();
    });

    function cleanup() {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      overlay.remove();
    }
    function close(result) { cleanup(); resolve(result); }

    cancelBtn.addEventListener('click', () => close(null));
    overlay.addEventListener('click', e => { if (e.target === overlay) close(null); });
    applyBtn.addEventListener('click', () => {
      const canvas = document.createElement('canvas');
      canvas.width = OUT; canvas.height = OUT;
      const ctx = canvas.getContext('2d');
      const e2 = eff();
      const sSize = VP / e2;
      ctx.drawImage(img, -tx / e2, -ty / e2, sSize, sSize, 0, 0, OUT, OUT);
      const full = canvas.toDataURL('image/jpeg', 0.85);
      downscaleDataUrl(full, AVATAR_THUMB_SIZE).then(thumb => close({ full, thumb }));
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

  // 닉네임 → 화면용 이름 (표시 이름 우선)
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
    // 보낸 귓속말은 '내 캐릭터' 기준으로 표시·필터링
    if (entry.channelType === 'whisper-out') return getMyCharacter();
    return findCharacterByNickname(entry.nickname);
  }

  // 색 선택기와 동기화되는 색상코드(#RRGGBB) 입력칸 생성
  function linkHexInput(colorInput) {
    const tx = document.createElement('input');
    tx.type = 'text';
    tx.className = 'hex-input';
    tx.maxLength = 7;
    tx.spellcheck = false;
    tx.placeholder = '#RRGGBB';
    tx.value = colorInput.value;
    tx.addEventListener('input', () => {
      let v = tx.value.trim();
      if (v && v[0] !== '#') v = '#' + v;
      if (/^#[0-9a-fA-F]{6}$/.test(v)) {
        colorInput.value = v;
        colorInput.dispatchEvent(new Event('input', { bubbles: true })); // 색 선택기의 기존 처리도 실행
      }
    });
    colorInput.addEventListener('input', () => {
      if (tx.value.toLowerCase() !== colorInput.value.toLowerCase()) tx.value = colorInput.value;
    });
    return tx;
  }

  // 색을 ratio만큼 어둡게 (투명도와 달리 배경색 영향 없음)
  function darkenHex(hex, ratio) {
    const h = (hex || '').replace('#', '');
    if (h.length !== 6) return hex || '#1c232e';
    const f = 1 - ratio;
    const r = Math.round(parseInt(h.slice(0, 2), 16) * f);
    const g = Math.round(parseInt(h.slice(2, 4), 16) * f);
    const b = Math.round(parseInt(h.slice(4, 6), 16) * f);
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
  }

  // 감표 문장 속 등록 닉네임 → 표시 이름 치환 (긴 닉네임부터 — 부분 오치환 방지)
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

  // 시스템 로그의 닉네임 뒤 서버명 제거 (앞에 글자가 있고 뒤에 '님'이 올 때만)
  const SYSTEM_SERVER_RE = new RegExp('([^\\s])(' + SERVER_NAMES.join('|') + ')(?=\\s?님)', 'g');
  function stripSystemServerNames(text) {
    return (text || '').replace(SYSTEM_SERVER_RE, '$1');
  }

  // 시스템 로그 본문 정리: 서버명 제거 후 등록 닉네임을 표시 이름으로.
  function formatSystemText(text) {
    return applyDisplayNames(stripSystemServerNames(text));
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
  let expandedCharId = null; // 펼쳐서 편집 중인 캐릭터 행 — 아코디언(한 번에 하나만)
  // 감표↔시스템 수동 전환 기록: raw → 'emote' | 'system' (새로고침 시 초기화)
  const swapOverrides = new Map();

  function computePresentCharIds(logText) {
    const ids = new Set();
    parseLog(logText).forEach(e => {
      const c = charForEntry(e);
      if (c) ids.add(c.id);
    });
    return ids;
  }

  // 편집 목록에 보여줄 캐릭터 선별 — 검색 중엔 전체에서, 아니면 narrowing 규칙
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

  // nickname을 넘기면 그 이름으로 미리 채워 등록 ('발견된 닉네임' 칩)
  function addCharacter(nickname) {
    const c = {
      id: uid(),
      nickname: (typeof nickname === 'string') ? nickname : '',
      displayName: '',
      bg: '#26303f',
      color: '#e9e4d6',
      avatarType: 'emoji',
      avatarValue: '',
      emojiText: ''
    };
    characters.push(c);
    pinnedIds.add(c.id); // 새로 추가한 캐릭터는 narrowing 중에도 사라지지 않게 고정
    expandedCharId = c.id; // 새 캐릭터는 펼친 채로 시작해 바로 입력으로 이어지게
    saveCharacters();
    renderCharList();
    renderPreview(); // 미리보기·발견된 닉네임 칩 갱신
    const firstInput = document.querySelector('.char-row[data-id="' + c.id + '"] .char-fields input');
    if (firstInput) firstInput.focus();
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

  /* ---------- 캐릭터 순서 바꾸기 ---------- */

  // 화면(#charList)의 행 순서를 characters 배열에 반영.
  // 필터로 일부만 보일 땐 보이는 캐릭터끼리의 상대 순서만 바꾸고 나머지는 제자리 유지.
  function persistOrderFromDom() {
    const domIds = Array.from(document.querySelectorAll('#charList .char-row')).map(r => r.dataset.id);
    const shown = new Set(domIds);
    const slots = [];
    characters.forEach((c, i) => { if (shown.has(c.id)) slots.push(i); });
    const byId = new Map(characters.map(c => [c.id, c]));
    domIds.forEach((id, k) => {
      const c = byId.get(id);
      if (c && slots[k] !== undefined) characters[slots[k]] = c;
    });
    saveCharacters();
    renderCharList();
  }

  // 드래그 핸들 — 마우스·터치 드래그와 키보드 ↑/↓로 순서 변경. 같은 목록 안에서만 이동.
  function attachRowDrag(handle, row) {
    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      const container = row.parentElement;
      row.classList.add('dragging');
      try { handle.setPointerCapture(e.pointerId); } catch (err) { /* 포인터 캡처 미지원 시 무시 */ }

      const onMove = (ev) => {
        const y = ev.clientY;
        const rows = Array.from(container.children).filter(el => el !== row && el.classList && el.classList.contains('char-row'));
        let target = null;
        for (const sib of rows) {
          const r = sib.getBoundingClientRect();
          if (y < r.top + r.height / 2) { target = sib; break; }
        }
        if (target) {
          if (row.nextSibling !== target) container.insertBefore(row, target);
        } else {
          const last = rows[rows.length - 1];
          if (last) last.after(row);
        }
      };
      const onUp = () => {
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onUp);
        handle.removeEventListener('pointercancel', onUp);
        row.classList.remove('dragging');
        persistOrderFromDom();
      };
      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onUp);
      handle.addEventListener('pointercancel', onUp);
    });

    handle.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      const container = row.parentElement;
      const rows = Array.from(container.children).filter(el => el.classList && el.classList.contains('char-row'));
      const idx = rows.indexOf(row);
      if (e.key === 'ArrowUp' && idx > 0) container.insertBefore(row, rows[idx - 1]);
      else if (e.key === 'ArrowDown' && idx < rows.length - 1) rows[idx + 1].after(row);
      else return;
      persistOrderFromDom();
      // 리렌더 후에도 같은 핸들에 포커스 유지 (연속 이동용)
      const again = document.querySelector('.char-row[data-id="' + row.dataset.id + '"] .char-drag-handle');
      if (again) again.focus();
    });
  }

  function createCharRow(c) {
      const row = document.createElement('div');
      row.className = 'char-row';
      row.dataset.id = c.id;
      const isOpen = expandedCharId === c.id;
      if (isOpen) row.classList.add('open');

      /* ----- 머리줄 (항상 표시): 핸들 + 아바타 칩 + 이름 + [나] 배지 + 출력 토글 + 화살표 ----- */
      const head = document.createElement('div');
      head.className = 'char-head';

      const summary = document.createElement('button');
      summary.type = 'button';
      summary.className = 'char-summary';
      summary.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      summary.title = isOpen ? '접기' : '펼쳐서 편집';

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
      summary.appendChild(avatarPreview);

      // 아바타 미리보기 갱신 (이미지 → 이모지 → 색상만 순)
      function refreshAvatarPreview() {
        if (c.avatarType === 'image' && c.avatarValue) {
          avatarPreview.innerHTML = '<img src="' + c.avatarValue + '" alt="">';
        } else {
          avatarPreview.innerHTML = '';
          avatarPreview.textContent = c.emojiText || '';
        }
      }

      // 머리줄 이름 (표시 이름 → 닉네임)
      const nameEl = document.createElement('span');
      nameEl.className = 'char-name';
      function refreshName() {
        const label = c.displayName || c.nickname;
        nameEl.textContent = label || '새 캐릭터';
        nameEl.classList.toggle('is-placeholder', !label);
      }
      refreshName();
      summary.appendChild(nameEl);

      if (c.isMe) {
        const badge = document.createElement('span');
        badge.className = 'char-me-badge';
        badge.textContent = '나';
        summary.appendChild(badge);
      }

      const chevron = document.createElement('span');
      chevron.className = 'char-chevron';
      chevron.textContent = '▾';
      summary.appendChild(chevron);

      summary.addEventListener('click', () => {
        expandedCharId = isOpen ? null : c.id;
        renderCharList();
      });
      const dragHandle = document.createElement('button');
      dragHandle.type = 'button';
      dragHandle.className = 'char-drag-handle';
      dragHandle.textContent = '⠿';
      dragHandle.title = '끌어서 순서 바꾸기 (키보드 ↑↓)';
      dragHandle.setAttribute('aria-label', '순서 바꾸기');
      attachRowDrag(dragHandle, row);
      head.appendChild(dragHandle);
      head.appendChild(summary);

      // 출력 포함 토글 (세션 상태)
      const outLabel = document.createElement('label');
      outLabel.className = 'out-check';
      outLabel.title = '끄면 이 캐릭터 대사가 미리보기·이미지·복사에서 빠져요.';
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
      outLabel.appendChild(document.createTextNode(' 출력'));
      head.appendChild(outLabel);

      row.appendChild(head);

      /* ----- 본문 (펼쳤을 때만): 이름·색상·아바타·기타 설정 ----- */
      const body = document.createElement('div');
      body.className = 'char-body';
      const bodyInner = document.createElement('div');
      bodyInner.className = 'char-body-inner';

      const emojiInput = document.createElement('input');
      emojiInput.type = 'text';
      emojiInput.className = 'avatar-emoji-input';
      emojiInput.maxLength = 4;
      emojiInput.placeholder = '이모지';
      emojiInput.value = c.emojiText || '';
      emojiInput.addEventListener('input', () => {
        const val = emojiInput.value;
        // 이모지는 항상 기억, 사진이 있으면 사진 우선
        const patch = { emojiText: val };
        if (c.avatarType !== 'image') {
          patch.avatarType = 'emoji';
          patch.avatarValue = val;
        }
        updateCharacter(c.id, patch);
        refreshAvatarPreview();
        renderPreview();
      });

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
          const result = await openCropEditor(file);
          fileInput.value = ''; // 같은 파일 다시 올릴 수 있게 초기화
          if (!result) return;  // 취소
          updateCharacter(c.id, { avatarType: 'image', avatarValue: result.full, avatarThumb: result.thumb, avatarThumbV: AVATAR_THUMB_VERSION });
          refreshAvatarPreview();
          renderPreview();
        } catch (e) {
          alert('이미지를 처리하는 중 문제가 발생했습니다. 다른 이미지로 다시 시도해주세요.');
        }
      });
      uploadLabel.appendChild(fileInput);

      // 사진 비우기 — 지우면 이모지 아바타로 복귀
      const clearPhotoBtn = document.createElement('button');
      clearPhotoBtn.type = 'button';
      clearPhotoBtn.className = 'clear-photo-btn';
      clearPhotoBtn.textContent = '사진 비우기';
      clearPhotoBtn.addEventListener('click', () => {
        // 사진 없으면 무시
        if (c.avatarType !== 'image' || !c.avatarValue) return;
        if (!confirm('이 캐릭터의 프로필 사진을 지울까요?')) return;
        updateCharacter(c.id, { avatarType: 'emoji', avatarValue: c.emojiText || '', avatarThumb: '' });
        refreshAvatarPreview();
        renderPreview();
      });

      // ----- 필드 그리드: [라벨 | 컨트롤] 줄 정렬 -----
      const fields = document.createElement('div');
      fields.className = 'char-fields';

      function fieldRow(labelText, ...controls) {
        const line = document.createElement('div');
        line.className = 'field-row';
        const lab = document.createElement('span');
        lab.className = 'field-label';
        lab.textContent = labelText;
        line.appendChild(lab);
        controls.forEach(el => line.appendChild(el));
        return line;
      }

      function fieldSep() {
        const sep = document.createElement('div');
        sep.className = 'field-sep';
        return sep;
      }

      // 실시간 대사 미리보기 칩
      const sample = document.createElement('div');
      sample.className = 'char-sample';
      const sampleName = document.createElement('span');
      sampleName.className = 'char-sample-name';
      const sampleMsg = document.createElement('span');
      sampleMsg.className = 'char-sample-msg';
      sampleMsg.textContent = '대사가 이렇게 보여요';
      sample.appendChild(sampleName);
      sample.appendChild(sampleMsg);
      function refreshSample() {
        sample.style.background = c.bg;
        sample.style.color = c.color;
        sampleName.textContent = c.displayName || c.nickname || '이름';
      }
      refreshSample();

      const nickInput = document.createElement('input');
      nickInput.type = 'text';
      nickInput.placeholder = '게임 속 닉네임 (필수)';
      nickInput.setAttribute('aria-label', '게임 닉네임 (필수)');
      nickInput.value = c.nickname;
      nickInput.addEventListener('input', () => {
        updateCharacter(c.id, { nickname: nickInput.value });
        refreshName(); // 머리줄 이름도 실시간 갱신
        refreshSample();
        renderPreview();
      });

      const dispInput = document.createElement('input');
      dispInput.type = 'text';
      dispInput.placeholder = '공란이면 닉네임 그대로';
      dispInput.setAttribute('aria-label', '표시 이름');
      dispInput.value = c.displayName;
      dispInput.addEventListener('input', () => {
        updateCharacter(c.id, { displayName: dispInput.value });
        refreshName(); // 머리줄 이름도 실시간 갱신
        refreshSample();
        renderPreview();
      });

      const bgInput = document.createElement('input');
      bgInput.type = 'color';
      bgInput.value = c.bg;
      bgInput.setAttribute('aria-label', '말풍선 배경색');
      bgInput.addEventListener('input', () => {
        updateCharacter(c.id, { bg: bgInput.value });
        avatarPreview.style.background = bgInput.value;
        refreshSample();
        renderPreview();
      });

      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.value = c.color;
      colorInput.setAttribute('aria-label', '말풍선 글씨색');
      colorInput.addEventListener('input', () => {
        updateCharacter(c.id, { color: colorInput.value });
        avatarPreview.style.color = colorInput.value;
        refreshSample();
        renderPreview();
      });

      // '내 캐릭터' 지정 — 보낸 귓속말의 화자. 한 명만 가능
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

      // ① 이름 — 로그 속 닉네임과 화면에 표시할 이름
      fields.appendChild(fieldRow('닉네임', nickInput));
      fields.appendChild(fieldRow('표시 이름', dispInput));
      fields.appendChild(fieldSep());

      // ② 모습 — 색·아바타·미리보기 칩
      fields.appendChild(fieldRow('배경색', bgInput, linkHexInput(bgInput)));
      fields.appendChild(fieldRow('글씨색', colorInput, linkHexInput(colorInput)));
      fields.appendChild(fieldRow('아바타', emojiInput, uploadLabel, clearPhotoBtn));
      fields.appendChild(fieldRow('미리보기', sample));
      fields.appendChild(fieldSep());

      // ③ 기타 — 내 캐릭터 / 삭제
      const foot = document.createElement('div');
      foot.className = 'char-foot';
      foot.appendChild(meLabel);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'char-remove';
      removeBtn.textContent = '삭제';
      removeBtn.addEventListener('click', () => {
        const label = c.displayName || c.nickname || '이 캐릭터';
        if (confirm('‘' + label + '’ 캐릭터 설정을 삭제할까요? 되돌릴 수 없습니다.')) {
          removeCharacter(c.id);
        }
      });
      foot.appendChild(removeBtn);
      fields.appendChild(foot);

      if (hiddenOutputIds.has(c.id)) row.classList.add('char-hidden');

      bodyInner.appendChild(fields);
      body.appendChild(bodyInner);
      row.appendChild(body);

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

    // 숨긴 캐릭터는 접이식 섹션으로 분리
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
    // 닉네임 끝의 서버명 제거
    return stripServerSuffix(cleaned);
  }

  // 감정표현(나래이션) 판정: 등록된 닉네임으로 시작하는 줄.
  //   - "○○: 대사"는 콜론이 있어 감표 아님
  //   - "○○ 님이 …"(공백+님)는 게임 시스템 로그라 감표 아님
  // 한글 조사 목록 (긴 것부터 — "이랑"이 "이"로 끊기지 않게)
  const EMOTE_PARTICLES = ['에게서', '이랑', '에게', '께서', '에서', '으로', '이', '가', '은', '는',
    '을', '를', '와', '과', '도', '만', '의', '랑', '께', '에', '로'];
  // 닉네임/조사 뒤에 올 수 있는 경계 문자(공백·문장부호) — 더 긴 이름 오인 방지
  const EMOTE_BOUNDARY = /^[\s.,!?~…·"'\-]/;

  function tryParseEmote(rest) {
    // "닉네임 >> 메시지"(받은 귓속말)는 감표 아님 → parseRest로
    if (/^[^:：>]+>>/.test(rest)) return null;
    const sorted = characters
      .map(c => ({ nick: normalizeNick(c.nickname) }))
      .filter(c => c.nick)
      .sort((a, b) => b.nick.length - a.nick.length);
    for (const c of sorted) {
      if (!rest.startsWith(c.nick)) continue;
      let after = rest.slice(c.nick.length);
      // 로그엔 닉네임 뒤에 서버명이 붙어 나옴("○○카벙클은 …") → 건너뛰고 판정, 표시에서도 제거
      let body = rest;
      for (const s of SERVER_NAMES) {
        if (after.startsWith(s)) {
          after = after.slice(s.length);
          body = c.nick + after;
          break;
        }
      }
      if (after === '' || after[0] === ':' || after[0] === '：') continue; // 닉네임만/대사 → 감표 아님
      // "○○ 님이 …"(공백+님) → 시스템 로그, 감표 아님
      if (/^\s+님/.test(after)) continue;
      // "○○님 …"(붙은 님) → 사용자 표현, 감표
      if (after.startsWith('님')) {
        return { channelType: 'emote', channel: '감정표현', nickname: c.nick, message: body };
      }

      // 1) 닉네임 바로 뒤가 공백·문장부호 → 사용자 지정 감표("○○ 웃는다", "○○. ---한다")
      if (EMOTE_BOUNDARY.test(after)) {
        return { channelType: 'emote', channel: '감정표현', nickname: c.nick, message: body };
      }
      // 2) 닉네임 뒤에 한글 조사 + 경계(공백·문장부호·줄 끝) → 기본 감표("○○이 인사한다")
      for (const p of EMOTE_PARTICLES) {
        if (after.startsWith(p)) {
          const tail = after.slice(p.length);
          if (tail === '' || EMOTE_BOUNDARY.test(tail)) {
            return { channelType: 'emote', channel: '감정표현', nickname: c.nick, message: body };
          }
        }
      }
      // 경계 없이 한글이 이어지면 감표 아님 → parseRest로
    }
    return null;
  }

  // 메시지 맨 앞의 등록 닉네임 탐색 (스왑된 감표의 알약 색용)
  function leadingRegisteredNick(text) {
    const t = text || '';
    const sorted = characters
      .map(c => normalizeNick(c.nickname))
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);
    for (const n of sorted) {
      if (t.startsWith(n)) return n;
    }
    return '';
  }

  function parseRest(rest) {
    let m = rest.match(/^>>\s*([^:：]+)[:：]\s?(.*)$/);
    if (m) {
      const to = stripDecoration(m[1]);
      // nickname엔 받는 상대 저장, 표시는 렌더링 때 '내 캐릭터'로
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

    // 닉네임엔 공백이 없으므로 콜론 앞 첫 단어에 공백이 없을 때만 대사로 판정
    m = rest.match(/^([^\s:：]+)[:：]\s?(.*)$/);
    if (m) return { channelType: 'say', channel: '말하기', nickname: stripDecoration(m[1]), message: m[2] };

    return { channelType: 'unknown', channel: '', nickname: '', message: rest, unparsed: true };
  }

  const TIME_RE = /^\[(\d{1,2}:\d{2}(?::\d{2})?)\]/;

  // 게임 전용 글리프(PUA)·제어문자 등 깨진 문자만 제거. 일반 글자·공백·이모지는 보존
  function sanitizeLogText(text) {
    return (text || '')
      .replace(/[\uE000-\uF8FF]/g, '')                // 사설영역(게임 아이콘 글리프)
      .replace(/[\uDB80-\uDBFF][\uDC00-\uDFFF]/g, '') // 보충 사설영역(플레인 15·16)
      .replace(/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g, '') // 제로폭·방향제어·BOM
      .replace(/\uFFFD/g, '')                         // 인코딩 깨짐 표시
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, ''); // 제어문자(개행·탭 제외)
  }

  function parseLog(text) {
    const lines = sanitizeLogText(text).split(/\r?\n/);
    // 시간 표기가 하나라도 있으면 [HH:MM] 없는 줄을 직전 메시지의 줄바꿈으로 연결.
    // 시간 표기가 아예 없는 로그에서는 이 규칙을 꺼서 시스템 줄이 흡수되지 않게 함.
    const anyTimed = lines.some(l => TIME_RE.test(l));
    const entries = [];
    for (const line of lines) {
      if (line.trim() === '') continue;

      let time = '';
      let rest = line;
      const timeMatch = line.match(TIME_RE);
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

      // [HH:MM]도 채널/닉네임 패턴도 없는 줄은 직전 메시지에 줄바꿈으로 연결
      if (parsed.unparsed && !timeMatch && anyTimed && entries.length > 0) {
        entries[entries.length - 1].message += '\n' + line;
      } else {
        entries.push(Object.assign({ time, raw: line }, parsed));
      }
    }
    // 감표↔시스템 수동 전환 반영
    entries.forEach(applySwapOverride);
    return entries;
  }

  // 감표↔시스템 수동 전환 적용 (감표/시스템 줄에만 의미)
  function applySwapOverride(entry) {
    const ov = swapOverrides.get(entry.raw);
    if (!ov) return;
    if (ov === 'emote' && entry.channelType !== 'emote') {
      entry.channelType = 'emote';
      entry.channel = '감정표현';
      entry.nickname = leadingRegisteredNick(entry.message); // 알약 색을 위해 행위자 추정
    } else if (ov === 'system' && entry.channelType === 'emote') {
      entry.channelType = 'system';
      entry.channel = '';
      entry.nickname = ''; // 시스템 줄은 닉네임 없음
    }
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

  function shouldShowName() {
    return document.getElementById('showNameToggle').checked;
  }

  function renderChannelFilter(entries) {
    const container = document.getElementById('channelFilterList');
    const seen = [];
    entries.forEach(entry => {
      const key = getFilterKey(entry);
      if (!seen.includes(key)) seen.push(key);
      // 처음 보는 채널은 기본 켜짐. 태그 없는 시스템 줄이 모이는 '시스템/기타'만 기본 꺼짐
      if (!(key in channelFilterState)) channelFilterState[key] = (key !== '시스템/기타');
    });

    // 가나다순 정렬. 단 '시스템/기타'는 맨 아래로.
    const SYS = '시스템/기타';
    seen.sort((a, b) => a.localeCompare(b, 'ko'));
    if (seen.includes(SYS)) {
      seen.splice(seen.indexOf(SYS), 1);
      seen.push(SYS);
    }

    container.innerHTML = '';
    if (seen.length === 0) {
      const hint = document.createElement('p');
      hint.className = 'char-empty-hint';
      hint.textContent = '로그를 붙여넣으면 채널 목록이 여기에 나타납니다.';
      container.appendChild(hint);
      return;
    }

    // 전체 선택 (모두 체크면 켜짐, 일부만 체크면 중간 상태)
    const allLabel = document.createElement('label');
    allLabel.className = 'channel-check channel-check-all';
    const allCb = document.createElement('input');
    allCb.type = 'checkbox';
    const allChecked = seen.every(k => channelFilterState[k] !== false);
    const someChecked = seen.some(k => channelFilterState[k] !== false);
    allCb.checked = allChecked;
    allCb.addEventListener('change', () => {
      const v = allCb.checked;
      seen.forEach(k => { channelFilterState[k] = v; });
      renderPreview();
    });
    allLabel.appendChild(allCb);
    const allSpan = document.createElement('span');
    allSpan.textContent = '전체 선택';
    allLabel.appendChild(allSpan);
    container.appendChild(allLabel);
    allCb.indeterminate = someChecked && !allChecked;

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

  // 마지막 파싱 결과 — 빈 미리보기 진단과 '발견된 닉네임' 칩에 사용
  let lastParsedEntries = [];

  function getFilteredEntries(text) {
    const onlyRegistered = document.getElementById('filterToggle').checked;
    const entries = parseLog(text);
    lastParsedEntries = entries;
    renderChannelFilter(entries);
    return entries.filter(entry => {
      if (channelFilterState[getFilterKey(entry)] === false) return false;
      // 시스템 알림(닉네임 없음)은 '등록된 닉네임만 표시'와 무관, 채널 필터만 적용
      if (!entry.nickname) return true;
      const char = charForEntry(entry);
      // 출력 제외 캐릭터는 숨김
      if (char && hiddenOutputIds.has(char.id)) return false;
      if (onlyRegistered && !char) return false;
      return true;
    });
  }

  /* ---------- 미리보기 렌더링 ---------- */

  // 감정표현: 캐릭터 색 알약 가운데, 시간은 오른쪽 끝
  function buildEmoteLineNode(entry, char) {
    const line = document.createElement('div');
    line.className = 'log-line is-emote';

    const row = document.createElement('div');
    row.className = 'log-emote-line';

    const leftSpacer = document.createElement('span');
    leftSpacer.className = 'log-system-spacer';
    row.appendChild(leftSpacer);

    const pill = document.createElement('span');
    pill.className = 'log-emote';
    if (char) {
      pill.style.background = char.bg;
      pill.style.color = char.color;
    }
    const msg = document.createElement('span');
    msg.className = 'log-emote-msg';
    msg.innerHTML = escapeHtml(applyDisplayNames(entry.message)).replace(/\n/g, '<br>');
    pill.appendChild(msg);
    row.appendChild(pill);

    const timeWrap = document.createElement('span');
    timeWrap.className = 'log-system-timewrap';
    if (entry.time && shouldShowTime()) {
      const t = document.createElement('span');
      t.className = 'log-emote-time';
      t.textContent = entry.time;
      timeWrap.appendChild(t);
    }
    row.appendChild(timeWrap);

    line.appendChild(row);
    return line;
  }

  // 말풍선 내용 채우기:
  // - 메타(이름·채널) 있으면 메타 줄 + 메시지
  // - 메타 없고 시간만 있으면 메시지·시간 한 줄
  // - 둘 다 없으면 메시지만
  function fillBubble(bubble, meta, msg, timeText) {
    const mkTime = () => {
      const s = document.createElement('span');
      s.className = 'log-time';
      s.textContent = timeText;
      return s;
    };
    if (meta.childNodes.length > 0) {
      if (timeText) meta.appendChild(mkTime());
      bubble.appendChild(meta);
      bubble.appendChild(msg);
    } else if (timeText) {
      const row = document.createElement('div');
      row.className = 'log-inline-row';
      row.appendChild(msg);
      row.appendChild(mkTime());
      bubble.appendChild(row);
    } else {
      bubble.appendChild(msg);
    }
  }

  // 귓속말: 반투명 테두리 + 이탤릭
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
    bubble.style.background = char ? darkenHex(char.bg, 0.22) : '#1c232e';
    bubble.style.color = char ? char.color : '#e9e4d6';

    const meta = document.createElement('div');
    meta.className = 'log-meta';

    // "보낸사람 → 받은사람" 형식으로 통일
    const senderName = isOut ? myDisplayName() : nickToDisplay(entry.nickname);
    const receiverName = isOut ? nickToDisplay(entry.recipient) : myDisplayName();

    // 이름은 '이름 표시', '귓속말' 라벨은 '채널 이름 표시' 설정을 따름
    if (shouldShowName()) {
      const nameSpan = document.createElement('span');
      nameSpan.className = 'log-name';
      nameSpan.textContent = senderName;
      meta.appendChild(nameSpan);
      const dirSpan = document.createElement('span');
      dirSpan.className = 'log-whisper-tag';
      dirSpan.textContent = '→ ' + receiverName + (shouldShowChannel() ? ' · 귓속말' : '');
      meta.appendChild(dirSpan);
    } else if (shouldShowChannel()) {
      const tagSpan = document.createElement('span');
      tagSpan.className = 'log-whisper-tag';
      tagSpan.textContent = '귓속말';
      meta.appendChild(tagSpan);
    }

    const msg = document.createElement('div');
    msg.className = 'log-message';
    msg.innerHTML = escapeHtml(entry.message).replace(/\n/g, '<br>');

    fillBubble(bubble, meta, msg, (entry.time && shouldShowTime()) ? entry.time : '');

    line.appendChild(bubble);
    return line;
  }

  // 시스템 알림: 조용한 한 줄. 'unknown'은 본문만, 의미 있는 대괄호 채널만 태그로
  function buildSystemLineNode(entry) {
    const line = document.createElement('div');
    line.className = 'log-line is-system';

    const inner = document.createElement('div');
    inner.className = 'log-system';
    inner.style.color = settings.sysColor;

    // 좌우 spacer 동일 너비 → 본문 중앙, 시간 오른쪽 끝
    const leftSpacer = document.createElement('span');
    leftSpacer.className = 'log-system-spacer';
    inner.appendChild(leftSpacer);

    const center = document.createElement('span');
    center.className = 'log-system-center';
    if (entry.channel && entry.channelType === 'system') {
      const tag = document.createElement('span');
      tag.className = 'log-system-tag';
      tag.textContent = entry.channel;
      center.appendChild(tag);
    }
    const msg = document.createElement('span');
    msg.className = 'log-system-msg';
    // 서버명 제거 + 등록 닉네임 → 표시 이름
    msg.innerHTML = escapeHtml(formatSystemText(entry.message)).replace(/\n/g, '<br>');
    center.appendChild(msg);
    inner.appendChild(center);

    const timeWrap = document.createElement('span');
    timeWrap.className = 'log-system-timewrap';
    if (entry.time && shouldShowTime()) {
      const t = document.createElement('span');
      t.className = 'log-system-time';
      t.textContent = entry.time;
      timeWrap.appendChild(t);
    }
    inner.appendChild(timeWrap);

    line.appendChild(inner);
    return line;
  }

  // 감표 ⇄ 시스템 전환 버튼 — hover 시 표시, 내보내기에는 미포함(미리보기 전용 DOM)
  function addSwapButton(lineNode, entry) {
    const toEmote = entry.channelType !== 'emote'; // 지금이 시스템이면 감표로, 감표면 시스템으로
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'log-swap-btn';
    btn.textContent = toEmote ? '감표로' : '시스템으로';
    btn.title = toEmote ? '이 줄을 감정표현으로 바꾸기' : '이 줄을 시스템 로그로 바꾸기';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      swapOverrides.set(entry.raw, toEmote ? 'emote' : 'system');
      renderPreview();
    });
    lineNode.classList.add('has-swap');
    lineNode.appendChild(btn);
  }

  // 미등록 닉네임 칩 — 클릭 한 번으로 등록
  const FOUND_NICKS_MAX = 15;
  function renderFoundNicks(entries) {
    const box = document.getElementById('foundNicks');
    const chips = document.getElementById('foundNicksChips');
    if (!box || !chips) return;
    const seen = new Set();
    const unregistered = [];
    (entries || []).forEach(e => {
      const nick = normalizeNick(e.nickname);
      if (!nick || seen.has(nick)) return;
      seen.add(nick);
      if (!findCharacterByNickname(nick)) unregistered.push(nick);
    });
    chips.innerHTML = '';
    if (unregistered.length === 0) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    unregistered.slice(0, FOUND_NICKS_MAX).forEach(nick => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'found-nick-chip';
      chip.title = '‘' + nick + '’ 캐릭터로 등록하기';
      const plus = document.createElement('span');
      plus.className = 'chip-plus';
      plus.textContent = '+';
      const name = document.createElement('span');
      name.className = 'chip-nick';
      name.textContent = nick;
      chip.appendChild(plus);
      chip.appendChild(name);
      chip.addEventListener('click', () => addCharacter(nick));
      chips.appendChild(chip);
    });
    if (unregistered.length > FOUND_NICKS_MAX) {
      const more = document.createElement('span');
      more.className = 'found-nicks-more';
      more.textContent = '외 ' + (unregistered.length - FOUND_NICKS_MAX) + '명';
      chips.appendChild(more);
    }
  }

  // 빈 미리보기 원인 진단 문구
  function emptyNoticeText(text) {
    if (!text.trim()) return '로그를 붙여넣으면 자동으로 변환됩니다.';
    const entries = lastParsedEntries || [];
    if (entries.length === 0) return '인식할 수 있는 로그 줄이 없습니다. 게임에서 복사한 채팅 로그인지 확인해주세요.';
    const afterChannel = entries.filter(e => channelFilterState[getFilterKey(e)] !== false);
    if (afterChannel.length === 0) return '모든 줄이 채널 필터에 걸러졌습니다. 위 표시 옵션에서 채널을 체크해주세요.';
    const onlyRegistered = document.getElementById('filterToggle').checked;
    if (onlyRegistered && afterChannel.every(e => e.nickname && !charForEntry(e))) {
      return '등록된 닉네임이 없어 모든 줄이 걸러졌습니다. 닉네임 설정의 ‘발견된 닉네임’에서 클릭 한 번으로 등록하거나, ‘등록된 닉네임만 표시’를 꺼보세요.';
    }
    return '남은 줄이 캐릭터의 ‘출력’ 체크 해제로 모두 숨겨져 있습니다. 캐릭터 행 오른쪽의 출력 체크를 확인해주세요.';
  }

  function renderPreview() {
    const text = document.getElementById('logInput').value;
    const filtered = getFilteredEntries(text);
    renderFoundNicks(lastParsedEntries);

    const preview = document.getElementById('preview');
    preview.innerHTML = '';

    filtered.forEach(entry => {
      const char = findCharacterByNickname(entry.nickname);
      const isEmote = entry.channelType === 'emote';
      // 감표 먼저 판정, 그 외 닉네임 없는 줄은 시스템
      const isSystem = !isEmote && !entry.nickname;

      if (entry.channelType === 'whisper-out' || entry.channelType === 'whisper-in') {
        preview.appendChild(buildWhisperNode(entry));
        return;
      }
      if (isEmote) {
        const node = buildEmoteLineNode(entry, char);
        addSwapButton(node, entry);
        preview.appendChild(node);
        return;
      }
      if (isSystem) {
        const node = buildSystemLineNode(entry);
        addSwapButton(node, entry);
        preview.appendChild(node);
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
      bubble.style.background = char ? char.bg : '#242c39';
      bubble.style.color = char ? char.color : '#e9e4d6';

      const meta = document.createElement('div');
      meta.className = 'log-meta';

      if (shouldShowName()) {
        const nameSpan = document.createElement('span');
        nameSpan.className = 'log-name';
        nameSpan.textContent = (char && char.displayName) ? char.displayName : (entry.nickname || '???');
        meta.appendChild(nameSpan);
      }

      if (entry.channel && shouldShowChannel()) {
        const chSpan = document.createElement('span');
        chSpan.className = 'log-channel';
        chSpan.textContent = '[' + entry.channel + ']';
        meta.appendChild(chSpan);
      }

      const msg = document.createElement('div');
      msg.className = 'log-message';
      msg.innerHTML = escapeHtml(entry.message).replace(/\n/g, '<br>');

      fillBubble(bubble, meta, msg, (entry.time && shouldShowTime()) ? entry.time : '');

      line.appendChild(bubble);
      preview.appendChild(line);
    });

    if (filtered.length === 0) {
      const p = document.createElement('p');
      p.className = 'empty-notice';
      p.textContent = emptyNoticeText(text);
      preview.appendChild(p);
    }
  }

  /* ---------- 이미지 내보내기 ---------- */

  // cropToView=false: 박스 크기와 상관없이 로그 전체를 캡처
  // cropToView=true: 미리보기 박스에 '보이는 만큼만' 캡처
  function capturePreview(cropToView, btnId) {
    const node = document.getElementById('preview');
    if (!node.children.length || node.querySelector('.empty-notice')) {
      alert('내보낼 로그가 없습니다. 로그를 붙여넣어 주세요.');
      return;
    }
    // 캡처 중 버튼 비활성화로 중복 클릭 방지
    const busyBtn = btnId ? document.getElementById(btnId) : null;
    if (busyBtn && busyBtn.disabled) return;
    const busyText = busyBtn ? busyBtn.textContent : '';
    const setBusy = (on) => {
      if (!busyBtn) return;
      busyBtn.disabled = on;
      busyBtn.textContent = on ? '저장 중…' : busyText;
    };
    if (typeof html2canvas === 'undefined') {
      alert('이미지 저장 기능을 불러오지 못했습니다. 인터넷 연결을 확인해주세요.');
      return;
    }
    setBusy(true);

    const scale = 2;
    // 보이는 영역 정보(펼치기 전에 기록)
    const view = { top: node.scrollTop, left: node.scrollLeft, w: node.clientWidth, h: node.clientHeight };
    // 전체 캡처를 위해 잠시 펼침
    const prev = { height: node.style.height, maxHeight: node.style.maxHeight, overflow: node.style.overflow };
    function restore() {
      node.style.height = prev.height;
      node.style.maxHeight = prev.maxHeight;
      node.style.overflow = prev.overflow;
    }
    node.style.height = 'auto';
    node.style.maxHeight = 'none';
    node.style.overflow = 'visible';

    html2canvas(node, {
      backgroundColor: settings.bgColor,
      scale,
      ignoreElements: el => el.classList && el.classList.contains('log-swap-btn')
    }).then(full => {
      restore();
      let out = full;
      if (cropToView) {
        out = document.createElement('canvas');
        out.width = Math.max(1, Math.round(view.w * scale));
        out.height = Math.max(1, Math.round(view.h * scale));
        out.getContext('2d').drawImage(
          full,
          view.left * scale, view.top * scale, view.w * scale, view.h * scale,
          0, 0, view.w * scale, view.h * scale
        );
      }
      const link = document.createElement('a');
      link.download = 'ffxiv_log_' + Date.now() + '.png';
      link.href = out.toDataURL('image/png');
      link.click();
      setBusy(false);
    }).catch(err => {
      restore();
      setBusy(false);
      alert('이미지 저장 중 문제가 발생했습니다: ' + err.message);
    });
  }

  /* ---------- 서식 복사 (클립보드) ---------- */
  /* 에디터가 서식을 왜곡해도 안전한 '대화록' 스타일 — 이름만 색 칩, 메시지는 일반 텍스트 */
  const COPY_FONT = "font-family:'Malgun Gothic','Noto Sans KR',sans-serif;";

  // 아바타는 항상 원형 이미지(사진 썸네일 또는 즉석 색 동그라미) — 에디터에서 형태 유지
  function copyAvatarCellHtml(char, fallbackText) {
    let url;
    if (char && char.avatarType === 'image' && char.avatarThumb) {
      url = char.avatarThumb;
    } else {
      const bg = char ? char.bg : '#3a4252';
      const color = char ? char.color : '#cfd6e4';
      const text = (char && char.avatarType !== 'image' && char.avatarValue)
        ? char.avatarValue
        : (char ? '' : (fallbackText || '?'));
      url = copyCircleDataUrl(bg, color, text, AVATAR_THUMB_SIZE);
    }
    return '<img src="' + url + '" width="36" height="36" style="width:36px;height:36px;border-radius:50%;object-fit:cover;display:inline-block;vertical-align:middle;">';
  }

  // 오른쪽 끝 시간 칸 (시간 표시 시)
  function copyTimeCell(timeHtml) {
    return '<td width="46" valign="middle" style="width:46px;border:none;padding:7px 4px 7px 4px;text-align:right;color:#999;font-size:11px;font-family:\'DM Mono\',Consolas,monospace;white-space:nowrap;">' + (timeHtml || '') + '</td>';
  }

  // [색 줄][아바타][이름·메시지][시간] 행. 색 줄은 캐릭터 배경색. 이름·채널 없으면 머리글 생략
  function copyMsgRow(barColor, avatarHtml, headerHtml, bodyHtml, italic, timeHtml) {
    const headerDiv = headerHtml ? '<div style="font-size:14px;line-height:1.5;">' + headerHtml + '</div>' : '';
    return '<tr>' +
      '<td width="3" style="width:3px;background:' + barColor + ';border:none;padding:0;font-size:1px;line-height:1px;">&nbsp;</td>' +
      '<td width="46" valign="middle" style="width:46px;border:none;padding:7px 0 7px 6px;text-align:center;">' + avatarHtml + '</td>' +
      '<td valign="middle" style="border:none;padding:7px 0 7px 10px;' + COPY_FONT + '">' +
        headerDiv +
        '<div style="font-size:14px;line-height:1.55;color:#222;white-space:pre-wrap;' + (italic ? 'font-style:italic;' : '') + '">' + bodyHtml + '</div>' +
      '</td>' +
      (shouldShowTime() ? copyTimeCell(timeHtml) : '') +
    '</tr>';
  }

  // 가운데 정렬 행 (시스템/감정표현). 시간 표시 시: [빈칸][가운데][시간]으로 좌우 대칭을 맞춰 가운데 유지.
  function copyCenterRow(innerHtml, extraStyle, timeHtml, timeColor) {
    if (shouldShowTime()) {
      return '<tr>' +
        '<td colspan="2" style="border:none;padding:0;"></td>' +
        '<td style="border:none;padding:4px 0;text-align:center;' + COPY_FONT + (extraStyle || '') + '">' + innerHtml + '</td>' +
        '<td width="46" valign="top" style="width:46px;border:none;padding:4px 4px 0 4px;text-align:right;font-size:11px;font-family:\'DM Mono\',Consolas,monospace;color:' + (timeColor || '#999') + ';white-space:nowrap;">' + (timeHtml || '') + '</td>' +
      '</tr>';
    }
    return '<tr>' +
      '<td colspan="3" style="border:none;padding:4px 0;text-align:center;' + COPY_FONT + (extraStyle || '') + '">' + innerHtml + '</td>' +
    '</tr>';
  }

  // 메시지 하나 → 표의 행(tr). 전체는 copyFormatted에서 표 하나로 묶음
  function buildLineHtml(entry) {
    const char = findCharacterByNickname(entry.nickname);
    const isEmote = entry.channelType === 'emote';
    const isWhisper = entry.channelType === 'whisper-out' || entry.channelType === 'whisper-in';
    const isSystem = !entry.nickname && !isWhisper && !isEmote;
    const messageHtml = escapeHtml(entry.message).replace(/\n/g, '<br>');
    const timeLabel = (entry.time && shouldShowTime()) ? entry.time : '';
    const timeHtml = timeLabel ? escapeHtml(timeLabel) : '';
    const metaStyle = 'color:#999;font-size:12px;';

    // 시스템 알림: 가운데 정렬, 시간은 오른쪽 칸. 색은 설정값. 등록 닉네임은 표시 이름으로.
    if (isSystem) {
      const tag = (entry.channel && entry.channelType === 'system') ? escapeHtml(entry.channel) + ' · ' : '';
      const sysHtml = escapeHtml(formatSystemText(entry.message)).replace(/\n/g, '<br>');
      return copyCenterRow(tag + sysHtml, 'color:' + settings.sysColor + ';font-size:12px;', timeHtml, settings.sysColor);
    }

    // 감정표현: 가운데 정렬 이탤릭, 시간은 오른쪽 칸 (나래이션이라 아바타·이름 없이 본문만)
    if (isEmote) {
      const emoteHtml = escapeHtml(applyDisplayNames(entry.message)).replace(/\n/g, '<br>');
      return copyCenterRow(emoteHtml, 'font-style:italic;font-size:14px;color:#333;', timeHtml);
    }

    // 귓속말: 아바타 + 이름(굵게) + "→ 상대 · 귓속말", 메시지는 이탤릭, 시간은 오른쪽 칸
    if (isWhisper) {
      const isOut = entry.channelType === 'whisper-out';
      const wChar = isOut ? getMyCharacter() : findCharacterByNickname(entry.nickname);
      const name = isOut ? myDisplayName() : nickToDisplay(entry.nickname);
      const metaParts = [];
      if (shouldShowName()) metaParts.push('→ ' + (isOut ? nickToDisplay(entry.recipient) : myDisplayName()));
      if (shouldShowChannel()) metaParts.push('귓속말'); // '귓속말' 라벨은 채널 표시 설정을 따름
      const meta = metaParts.join(' · ');
      const header = (shouldShowName() ? '<b style="font-size:14px;">' + escapeHtml(name) + '</b>' : '') +
        (meta ? (shouldShowName() ? ' ' : '') + '<span style="' + metaStyle + '">' + escapeHtml(meta) + '</span>' : '');
      const fallback = isOut ? '나' : ((entry.nickname || '?').charAt(0) || '?');
      return copyMsgRow(wChar ? wChar.bg : '#cccccc', copyAvatarCellHtml(wChar, fallback), header, messageHtml, true, timeHtml);
    }

    // 일반 대화: 색 줄 + 아바타 + 이름(굵게), 시간은 오른쪽 칸
    const name = (char && char.displayName) ? char.displayName : (entry.nickname || '???');
    const channelLabel = (entry.channel && shouldShowChannel()) ? '[' + entry.channel + ']' : '';
    const namePart = shouldShowName() ? '<b style="font-size:14px;">' + escapeHtml(name) + '</b>' : '';
    const channelPart = channelLabel ? '<span style="' + metaStyle + '">' + escapeHtml(channelLabel) + '</span>' : '';
    const header = [namePart, channelPart].filter(Boolean).join(' ');
    return copyMsgRow(char ? char.bg : '#cccccc', copyAvatarCellHtml(char, (entry.nickname || '?').charAt(0) || '?'), header, messageHtml, false, timeHtml);
  }

  /* ---------- HTML 코드 복사용 (티스토리 등 HTML 편집 모드) ----------
     티스토리·블로그 HTML 모드나 웹페이지는 진짜 브라우저로 렌더링하므로, 미리보기 모습
     (둥근 말풍선·아바타 원·귓속말 반투명·감정표현 알약)을 그대로 인라인 스타일로 재현해요. */

  // 시간 span — 미리보기(.log-time)와 동일한 모노스페이스
  function richTimeHtml(time) {
    if (!time) return '';
    return '<span style="margin-left:auto;font-size:10.5px;opacity:0.6;font-family:\'DM Mono\',monospace;white-space:nowrap;">' + escapeHtml(time) + '</span>';
  }

  function richAvatarHtml(char, fallback, size, opacity) {
    const op = (opacity != null && opacity < 1) ? 'opacity:' + opacity + ';' : '';
    const base = 'width:' + size + 'px;height:' + size + 'px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;overflow:hidden;';
    if (!char) {
      return '<div style="' + base + 'border:1px dashed #313b4b;color:#8b93a3;font-weight:700;font-size:14px;' + op + '">' + escapeHtml(fallback || '?') + '</div>';
    }
    const inner = (char.avatarType === 'image' && char.avatarValue)
      ? '<img src="' + char.avatarValue + '" style="width:100%;height:100%;object-fit:cover;display:block;">'
      : escapeHtml(char.avatarValue || '');
    return '<div style="' + base + 'background:' + char.bg + ';color:' + char.color + ';font-size:16px;box-shadow:0 0 0 1px rgba(255,255,255,0.09), 0 1px 4px rgba(0,0,0,0.3);' + op + '">' + inner + '</div>';
  }

  function richRowHtml(av, bg, color, header, body, dashed, time) {
    // 귓속말은 반투명 테두리(그림자 없음), 일반 대화는 미세 하이라이트 테두리 + 낮은 그림자 — 미리보기와 동일.
    const border = dashed
      ? 'border:1px solid rgba(255,255,255,0.14);'
      : 'border:1px solid rgba(255,255,255,0.06);box-shadow:0 2px 10px rgba(0,0,0,0.26);';
    const msgStyle = 'font-size:14px;line-height:1.55;word-break:break-word;white-space:pre-wrap;';
    // 미리보기(fillBubble)와 같은 규칙:
    // - 메타(이름·채널)가 있으면: 메타 줄(+시간 오른쪽 끝) 위, 메시지 아래
    // - 메타가 없고 시간만 있으면: 메시지·시간을 한 줄에 (말풍선이 세로로 얇아져요)
    // - 아무것도 없으면: 메시지만
    let content;
    if (header) {
      content = '<div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin-bottom:4px;">' + header + richTimeHtml(time) + '</div>' +
        '<div style="' + msgStyle + '">' + body + '</div>';
    } else if (time) {
      content = '<div style="display:flex;align-items:center;gap:8px;">' +
        '<div style="flex:1 1 auto;min-width:0;' + msgStyle + '">' + body + '</div>' +
        '<span style="flex:0 0 auto;font-size:10.5px;opacity:0.6;font-family:\'DM Mono\',monospace;white-space:nowrap;">' + escapeHtml(time) + '</span>' +
      '</div>';
    } else {
      content = '<div style="' + msgStyle + '">' + body + '</div>';
    }
    return '<div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:12px;">' +
      av +
      '<div style="flex:1;min-width:0;border-radius:12px;padding:10px 14px;background:' + bg + ';color:' + color + ';' + border + '">' +
        content +
      '</div></div>';
  }

  function buildRichLineHtml(entry) {
    const char = findCharacterByNickname(entry.nickname);
    const isEmote = entry.channelType === 'emote';
    const isWhisper = entry.channelType === 'whisper-out' || entry.channelType === 'whisper-in';
    const isSystem = !entry.nickname && !isWhisper && !isEmote;
    const time = (entry.time && shouldShowTime()) ? entry.time : '';
    const msgHtml = escapeHtml(entry.message).replace(/\n/g, '<br>');

    // 시스템 알림 — 좌우 장식 헤어라인(미리보기와 동일). 시간은 오른쪽 선 끝에
    if (isSystem) {
      const hairL = '<span style="flex:1 1 0;align-self:center;height:1px;background:linear-gradient(90deg,transparent,currentColor);opacity:0.25;"></span>';
      const hairR = '<span style="flex:1 1 0;height:1px;background:linear-gradient(90deg,currentColor,transparent);opacity:0.25;"></span>';
      const timeSpan = time
        ? '<span style="font-size:10.5px;opacity:0.7;font-family:\'DM Mono\',monospace;white-space:nowrap;">' + escapeHtml(time) + '</span>'
        : '';
      const right = '<span style="flex:1 1 0;align-self:center;display:flex;align-items:center;justify-content:flex-end;gap:7px;">' + hairR + timeSpan + '</span>';
      const tag = (entry.channel && entry.channelType === 'system')
        ? '<span style="font-size:10.5px;color:#a8843f;border:1px solid rgba(168,132,63,0.45);border-radius:999px;padding:0 7px;margin-right:6px;letter-spacing:0.3px;white-space:nowrap;">' + escapeHtml(entry.channel) + '</span>' : '';
      const sysHtml = escapeHtml(formatSystemText(entry.message)).replace(/\n/g, '<br>');
      return '<div style="display:flex;align-items:baseline;gap:7px;color:' + settings.sysColor + ';font-size:12px;line-height:1.55;margin-bottom:10px;">' +
        hairL +
        '<span style="text-align:center;min-width:0;word-break:break-word;">' + tag + sysHtml + '</span>' +
        right + '</div>';
    }

    // 감정표현 (나래이션이라 아바타 없이 본문만) — 세리프 이탤릭 알약 가운데,
    // 시간은 미리보기처럼 알약 밖 오른쪽 열에.
    if (isEmote) {
      const bg = char ? char.bg : '#242c39';
      const color = char ? char.color : '#e9e4d6';
      const t = time ? '<span style="font-size:10.5px;opacity:0.65;font-family:\'DM Mono\',monospace;white-space:nowrap;">' + escapeHtml(time) + '</span>' : '';
      const emoteHtml = escapeHtml(applyDisplayNames(entry.message)).replace(/\n/g, '<br>');
      return '<div style="display:flex;align-items:center;gap:7px;margin-bottom:12px;padding:0 12px;">' +
        '<span style="flex:1 1 0;"></span>' +
        '<span style="display:inline-block;min-width:0;max-width:100%;background:' + bg + ';color:' + color + ';border-radius:22px;padding:9px 17px;font-family:\'Gowun Batang\',serif;font-style:italic;font-size:14px;line-height:1.5;border:1px solid rgba(255,255,255,0.08);box-shadow:0 2px 12px rgba(0,0,0,0.25);word-break:break-word;white-space:pre-wrap;">' +
          emoteHtml +
        '</span>' +
        '<span style="flex:1 1 0;display:flex;align-items:center;justify-content:flex-end;">' + t + '</span>' +
      '</div>';
    }

    // 귓속말
    if (isWhisper) {
      const isOut = entry.channelType === 'whisper-out';
      const wChar = isOut ? getMyCharacter() : findCharacterByNickname(entry.nickname);
      const bg = wChar ? darkenHex(wChar.bg, 0.22) : '#1c232e';
      const color = wChar ? wChar.color : '#e9e4d6';
      const name = isOut ? myDisplayName() : nickToDisplay(entry.nickname);
      const metaParts = [];
      if (shouldShowName()) metaParts.push('→ ' + (isOut ? nickToDisplay(entry.recipient) : myDisplayName()));
      if (shouldShowChannel()) metaParts.push('귓속말'); // '귓속말' 라벨은 채널 표시 설정을 따름
      const meta = metaParts.join(' ');
      const av = richAvatarHtml(wChar, isOut ? '나' : ((entry.nickname || '?').charAt(0) || '?'), 36, 1);
      const header = (shouldShowName() ? '<b style="font-size:14px;">' + escapeHtml(name) + '</b> ' : '') +
        (meta ? '<span style="font-size:11px;opacity:0.7;">' + escapeHtml(meta) + '</span>' : '');
      return richRowHtml(av, bg, color, header.trim(), '<span style="font-style:italic;">' + msgHtml + '</span>', true, time);
    }

    // 일반 대화
    const bg = char ? char.bg : '#242c39';
    const color = char ? char.color : '#e9e4d6';
    const name = (char && char.displayName) ? char.displayName : (entry.nickname || '???');
    const ch = (entry.channel && shouldShowChannel()) ? ' <span style="font-size:11px;opacity:0.75;">[' + escapeHtml(entry.channel) + ']</span>' : '';
    const av = richAvatarHtml(char, (entry.nickname || '?').charAt(0) || '?', 36, 1);
    const nameHtml = shouldShowName() ? '<b style="font-size:14px;">' + escapeHtml(name) + '</b>' : '';
    const header = (nameHtml + ch).trim();
    return richRowHtml(av, bg, color, header, msgHtml, false, time);
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

    if (entry.channelType === 'whisper-out' || entry.channelType === 'whisper-in') {
      const isOut = entry.channelType === 'whisper-out';
      const wTag = shouldShowChannel() ? '(귓속말)' : ''; // '귓속말' 라벨은 채널 표시 설정을 따름
      if (!shouldShowName()) return timeLabel + (wTag ? wTag + ' ' : '') + entry.message;
      const dir = isOut
        ? myDisplayName() + ' → ' + nickToDisplay(entry.recipient)
        : nickToDisplay(entry.nickname) + ' → ' + myDisplayName();
      return timeLabel + dir + (wTag ? ' ' + wTag : '') + ': ' + entry.message;
    }

    // 감표는 본문에 행위자 포함, 시스템은 라벨 불필요
    if (isEmote) {
      return timeLabel + applyDisplayNames(entry.message);
    }
    if (isSystem) {
      return timeLabel + formatSystemText(entry.message);
    }

    const name = (char && char.displayName) ? char.displayName : (entry.nickname || '???');
    const channelLabel = (entry.channel && shouldShowChannel()) ? '[' + entry.channel + '] ' : '';
    if (!shouldShowName()) return timeLabel + channelLabel + entry.message;
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
      alert('복사할 로그가 없습니다. 먼저 로그를 붙여넣어 주세요.');
      return;
    }

    // 표 하나로 묶어 에디터가 빈 줄을 넣지 않게. colgroup으로 칸 폭 고정, 시간 칸은 옵션
    const colgroup = shouldShowTime()
      ? '<colgroup><col style="width:3px;"><col style="width:46px;"><col><col style="width:46px;"></colgroup>'
      : '<colgroup><col style="width:3px;"><col style="width:46px;"><col></colgroup>';
    const htmlContent = '<table border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:none;width:100%;table-layout:fixed;' + COPY_FONT + '">' +
      colgroup + '<tbody>' +
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
      // 실패 시 아래 구형 방식으로 폴백
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
      alert('복사할 로그가 없습니다. 먼저 로그를 붙여넣어 주세요.');
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
      // 실패 시 아래 구형 방식으로 폴백
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

  // HTML 코드 자체를 텍스트로 복사 (블로그 HTML 편집 모드용)
  async function copyHtmlCode() {
    const text = document.getElementById('logInput').value;
    const filtered = getFilteredEntries(text);
    if (filtered.length === 0) {
      alert('복사할 로그가 없습니다. 먼저 로그를 붙여넣어 주세요.');
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
      // 실패 시 아래 구형 방식으로 폴백
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

  document.getElementById('addCharBtn').addEventListener('click', () => addCharacter());
  document.getElementById('filterToggle').addEventListener('change', renderPreview);
  document.getElementById('showChannelToggle').addEventListener('change', renderPreview);
  document.getElementById('showTimeToggle').addEventListener('change', renderPreview);
  document.getElementById('showNameToggle').addEventListener('change', renderPreview);
  document.getElementById('copyBtn').addEventListener('click', copyFormatted);
  document.getElementById('htmlCopyBtn').addEventListener('click', copyHtmlCode);
  document.getElementById('textCopyBtn').addEventListener('click', copyPlainText);
  document.getElementById('exportFullBtn').addEventListener('click', () => capturePreview(false, 'exportFullBtn'));
  document.getElementById('exportViewBtn').addEventListener('click', () => capturePreview(true, 'exportViewBtn'));
  document.getElementById('resetPreviewSize').addEventListener('click', () => {
    const p = document.getElementById('preview');
    p.style.width = '';
    p.style.height = ''; // CSS 기본값(높이 480px, 가로 자동)으로 복귀
  });

  const logBgColorInput = document.getElementById('logBgColor');
  logBgColorInput.value = settings.bgColor;
  logBgColorInput.addEventListener('input', () => {
    settings.bgColor = logBgColorInput.value;
    saveSettings();
    applyLogBackground();
  });
  const logBgHex = linkHexInput(logBgColorInput);
  logBgColorInput.insertAdjacentElement('afterend', logBgHex);
  document.getElementById('logBgReset').addEventListener('click', () => {
    settings.bgColor = DEFAULT_BG;
    logBgColorInput.value = DEFAULT_BG;
    logBgHex.value = DEFAULT_BG;
    saveSettings();
    applyLogBackground();
  });

  const sysColorInput = document.getElementById('sysColor');
  sysColorInput.value = settings.sysColor;
  sysColorInput.addEventListener('input', () => {
    settings.sysColor = sysColorInput.value;
    saveSettings();
    renderPreview();
  });
  const sysColorHex = linkHexInput(sysColorInput);
  sysColorInput.insertAdjacentElement('afterend', sysColorHex);
  document.getElementById('sysColorReset').addEventListener('click', () => {
    settings.sysColor = DEFAULT_SYS_COLOR;
    sysColorInput.value = DEFAULT_SYS_COLOR;
    sysColorHex.value = DEFAULT_SYS_COLOR;
    saveSettings();
    renderPreview();
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

  // 이름(표시 이름 → 닉네임) 가나다순 정렬. 다시 누르면 역순.
  let charSortAsc = true;
  document.getElementById('sortChars').addEventListener('click', (e) => {
    const label = c => (c.displayName || c.nickname || '');
    characters.sort((a, b) => charSortAsc
      ? label(a).localeCompare(label(b), 'ko')
      : label(b).localeCompare(label(a), 'ko'));
    e.currentTarget.textContent = charSortAsc ? '가나다순 ▲' : '가나다순 ▼';
    charSortAsc = !charSortAsc;
    saveCharacters();
    renderCharList();
  });

  document.getElementById('clearBtn').addEventListener('click', () => {
    document.getElementById('logInput').value = '';
    renderPreview();
    renderCharList(); // 로그가 비면 편집 목록은 전체 표시로
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
      renderCharList(); // 등장 캐릭터 기준으로 목록 갱신
    }, 250);
  });

  renderCharList();
  renderPreview();
  applyLogBackground();
  ensureAvatarThumbs();