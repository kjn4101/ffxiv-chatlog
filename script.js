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
      // 저장 공간 초과 등으로 실패하면 한 번만 알려줘요.
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
    // 이모지 텍스트를 이미지와 별도로 기억해요. 그래야 사진이 있어도 이모지가 안 날아가요.
    if (c.emojiText === undefined) {
      c.emojiText = (c.avatarType === 'emoji') ? (c.avatarValue || '') : '';
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

  // 저장된 아바타(dataURL)를 작은 '원형' 썸네일(PNG)로 만들어요. 서식 복사 시 에디터가 둥근 모서리를
  // 못 살려도 이미 원형으로 그려져 있어 동그랗게 보이고, 크기 지정을 무시해도 이 크기로 또렷해요.
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
      img.onerror = () => resolve(dataUrl); // 실패하면 원본을 그대로
      img.src = dataUrl;
    });
  }

  // 색·이모지 아바타를 '원형 이미지'로 그려요(빈 동그라미도 이미지라 에디터에서 안 사라져요).
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

  // 서식 복사용 아바타 크기(px). 별도 사진 칸에 들어가므로 줄을 망가뜨리지 않고, 에디터가 width
  // 지정을 무시해도 이 원본 크기로 또렷하게 보여요.
  const AVATAR_THUMB_SIZE = 36;
  const AVATAR_THUMB_VERSION = 6; // 썸네일 규격이 바뀌면 숫자를 올려 기존 썸네일을 다시 만들게 해요.

  // 썸네일이 없거나 규격이 옛날이면 다시 만들어 둬요 (다음 서식 복사부터 작게 나옴).
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

  // 색 선택기(<input type=color>) 옆에 붙는 색상코드(#RRGGBB) 입력칸을 만들어 서로 동기화해요.
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

  // 색을 검정 쪽으로 ratio만큼 섞어 살짝 어둡게(그림자 씌운 느낌). 투명도와 달리 배경색에 영향받지 않아요.
  function darkenHex(hex, ratio) {
    const h = (hex || '').replace('#', '');
    if (h.length !== 6) return hex || '#1c232e';
    const f = 1 - ratio;
    const r = Math.round(parseInt(h.slice(0, 2), 16) * f);
    const g = Math.round(parseInt(h.slice(2, 4), 16) * f);
    const b = Math.round(parseInt(h.slice(4, 6), 16) * f);
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
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
      avatarValue: '',
      emojiText: ''
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

      // 아바타 미리보기를 현재 상태(이미지 우선 → 이모지 → 색상만)에 맞춰 다시 그려요.
      function refreshAvatarPreview() {
        if (c.avatarType === 'image' && c.avatarValue) {
          avatarPreview.innerHTML = '<img src="' + c.avatarValue + '" alt="">';
        } else {
          avatarPreview.innerHTML = '';
          avatarPreview.textContent = c.emojiText || '';
        }
      }

      const emojiInput = document.createElement('input');
      emojiInput.type = 'text';
      emojiInput.className = 'avatar-emoji-input';
      emojiInput.maxLength = 4;
      emojiInput.placeholder = '이모지';
      emojiInput.value = c.emojiText || '';
      emojiInput.addEventListener('input', () => {
        const val = emojiInput.value;
        // 이모지는 항상 기억해두되, 사진이 올려져 있으면 사진을 우선해서 아바타는 안 바뀌어요.
        const patch = { emojiText: val };
        if (c.avatarType !== 'image') {
          patch.avatarType = 'emoji';
          patch.avatarValue = val;
        }
        updateCharacter(c.id, patch);
        refreshAvatarPreview();
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
      avatarWrap.appendChild(uploadLabel);

      // 사진 비우기 — 사진을 지우고, 이모지란에 적어둔 게 있으면 그걸로 아바타가 돌아가요.
      const clearPhotoBtn = document.createElement('button');
      clearPhotoBtn.type = 'button';
      clearPhotoBtn.className = 'clear-photo-btn';
      clearPhotoBtn.textContent = '사진 비우기';
      clearPhotoBtn.addEventListener('click', () => {
        // 사진이 없으면 지울 것도 없어요.
        if (c.avatarType !== 'image' || !c.avatarValue) return;
        if (!confirm('이 캐릭터의 프로필 사진을 지울까요?')) return;
        updateCharacter(c.id, { avatarType: 'emoji', avatarValue: c.emojiText || '', avatarThumb: '' });
        refreshAvatarPreview();
        renderPreview();
      });
      avatarWrap.appendChild(clearPhotoBtn);

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
      dispInput.placeholder = '표시 이름 (공란 시 닉네임)';
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

      // 배경/글씨: 색 선택기 + 색상코드(#RRGGBB) 입력칸을 각 줄에
      const bgLine = document.createElement('div');
      bgLine.className = 'color-line';
      bgLine.appendChild(bgLabel);
      bgLine.appendChild(linkHexInput(bgInput));
      fields.appendChild(bgLine);

      const colorLine = document.createElement('div');
      colorLine.className = 'color-line';
      colorLine.appendChild(colorLabel);
      colorLine.appendChild(linkHexInput(colorInput));
      fields.appendChild(colorLine);

      // 내 캐릭터 / 출력에 표시
      const toggleLine = document.createElement('div');
      toggleLine.className = 'toggle-line';
      toggleLine.appendChild(meLabel);
      toggleLine.appendChild(outLabel);
      fields.appendChild(toggleLine);

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
      hint.textContent = '로그를 변환하면 채널 목록이 여기에 나타납니다.';
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

    // 감정표현은 나래이션이라 아바타(프로필 사진)를 붙이지 않아요.
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
    bubble.style.background = char ? darkenHex(char.bg, 0.22) : '#1c232e';
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
    inner.style.color = settings.sysColor;

    // 좌우 spacer를 같은 너비(flex:1)로 둬서 가운데 내용은 중앙에, 시간은 오른쪽 끝에 정렬돼요.
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
    msg.innerHTML = escapeHtml(entry.message).replace(/\n/g, '<br>');
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

  // cropToView=false: 박스 크기와 상관없이 로그 전체를 캡처
  // cropToView=true: 미리보기 박스에 '보이는 만큼만' 캡처
  function capturePreview(cropToView) {
    const node = document.getElementById('preview');
    if (!node.children.length || node.querySelector('.empty-notice')) {
      alert('내보낼 로그가 없습니다. 로그를 붙여넣어 주세요.');
      return;
    }
    if (typeof html2canvas === 'undefined') {
      alert('이미지 저장 기능을 불러오지 못했습니다. 인터넷 연결을 확인해주세요.');
      return;
    }

    const scale = 2;
    // 보이는 영역 정보(펼치기 전에 기록)
    const view = { top: node.scrollTop, left: node.scrollLeft, w: node.clientWidth, h: node.clientHeight };
    // 전체 내용이 다 캡처되도록 잠시 펼쳐요.
    const prev = { height: node.style.height, maxHeight: node.style.maxHeight, overflow: node.style.overflow };
    function restore() {
      node.style.height = prev.height;
      node.style.maxHeight = prev.maxHeight;
      node.style.overflow = prev.overflow;
    }
    node.style.height = 'auto';
    node.style.maxHeight = 'none';
    node.style.overflow = 'visible';

    html2canvas(node, { backgroundColor: settings.bgColor, scale }).then(full => {
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
    }).catch(err => {
      restore();
      alert('이미지 저장 중 문제가 발생했습니다: ' + err.message);
    });
  }

  /* ---------- 서식 복사 (클립보드) ---------- */
  /* 구글 문서·워드 등은 div의 배경/둥근모서리/패딩이나 표 폭을 제멋대로 바꿔서 큰 색 덩어리로
     둔탁해져요. 그래서 여기서는 '대화록' 스타일로 가볍게 포장합니다 — 이름만 캐릭터 색 칩으로
     강조하고, 메시지는 그 아래 일반 텍스트로. 어떤 에디터에 붙여도 깔끔하게 읽혀요. */
  const COPY_FONT = "font-family:'Malgun Gothic','Noto Sans KR',sans-serif;";

  // 사진 칸 아바타 = 항상 '원형 이미지'로. 사진은 원형 썸네일, 그 외엔 색 동그라미(+이모지/글씨)를
  // 즉석에서 이미지로 그려 넣어요. 이미지라서 빈 동그라미도 에디터에서 안 사라지고 둥글게 보여요.
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

  // [색 줄][아바타][이름·메시지] 3칸 행. 색 줄은 캐릭터 배경색이라, 사진을 넣어도 캐릭터 색이 남아요.
  function copyMsgRow(barColor, avatarHtml, headerHtml, bodyHtml, italic) {
    return '<tr>' +
      '<td width="3" style="width:3px;background:' + barColor + ';border:none;padding:0;font-size:1px;line-height:1px;">&nbsp;</td>' +
      '<td width="46" valign="top" style="width:46px;border:none;padding:3px 0 0 6px;text-align:center;">' + avatarHtml + '</td>' +
      '<td valign="top" style="border:none;padding:2px 0 12px 10px;' + COPY_FONT + '">' +
        '<div style="font-size:14px;line-height:1.5;">' + headerHtml + '</div>' +
        '<div style="font-size:14px;line-height:1.55;color:#222;' + (italic ? 'font-style:italic;' : '') + '">' + bodyHtml + '</div>' +
      '</td></tr>';
  }

  // 가운데 정렬 행 (시스템/감정표현) — 세 칸을 합쳐 가운데로
  function copyCenterRow(innerHtml, extraStyle) {
    return '<tr>' +
      '<td colspan="3" style="border:none;padding:4px 0;text-align:center;' + COPY_FONT + (extraStyle || '') + '">' + innerHtml + '</td>' +
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

    // 시스템 알림: 가운데 정렬, 시간은 뒤(오른쪽)에. 색은 설정값.
    if (isSystem) {
      const tag = (entry.channel && entry.channelType === 'system') ? escapeHtml(entry.channel) + ' · ' : '';
      const t = timeLabel ? '  <span style="opacity:0.7;font-size:11px;">' + escapeHtml(timeLabel) + '</span>' : '';
      return copyCenterRow(tag + messageHtml + t, 'color:' + settings.sysColor + ';font-size:12px;');
    }

    // 감정표현: 가운데 정렬 이탤릭 (나래이션이라 아바타·이름 없이 본문만)
    if (isEmote) {
      const t = timeLabel ? ' <span style="' + metaStyle + 'font-style:normal;">' + escapeHtml(timeLabel) + '</span>' : '';
      const emoteHtml = escapeHtml(applyDisplayNames(entry.message)).replace(/\n/g, '<br>');
      return copyCenterRow(emoteHtml + t, 'font-style:italic;font-size:14px;color:#333;');
    }

    // 귓속말: 아바타 + 이름(굵게) + "→ 상대 · 귓속말", 메시지는 이탤릭
    if (isWhisper) {
      const isOut = entry.channelType === 'whisper-out';
      const wChar = isOut ? getMyCharacter() : findCharacterByNickname(entry.nickname);
      const name = isOut ? myDisplayName() : nickToDisplay(entry.nickname);
      const meta = ['→ ' + (isOut ? nickToDisplay(entry.recipient) : myDisplayName()), '귓속말', timeLabel].filter(Boolean).join(' · ');
      const header = '<b style="font-size:14px;">' + escapeHtml(name) + '</b> <span style="' + metaStyle + '">' + escapeHtml(meta) + '</span>';
      const fallback = isOut ? '나' : ((entry.nickname || '?').charAt(0) || '?');
      return copyMsgRow(wChar ? wChar.bg : '#cccccc', copyAvatarCellHtml(wChar, fallback), header, messageHtml, true);
    }

    // 일반 대화: 색 줄 + 아바타 + 이름(굵게)
    const name = (char && char.displayName) ? char.displayName : (entry.nickname || '???');
    const metaBits = [(entry.channel && shouldShowChannel()) ? '[' + entry.channel + ']' : '', timeLabel].filter(Boolean).join(' ');
    const header = '<b style="font-size:14px;">' + escapeHtml(name) + '</b>' +
      (metaBits ? ' <span style="' + metaStyle + '">' + escapeHtml(metaBits) + '</span>' : '');
    return copyMsgRow(char ? char.bg : '#cccccc', copyAvatarCellHtml(char, (entry.nickname || '?').charAt(0) || '?'), header, messageHtml, false);
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
    const border = dashed ? 'border:1px solid rgba(255,255,255,0.14);' : '';
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

    // 시스템 알림 (시간은 뒤=오른쪽, 색은 설정값)
    if (isSystem) {
      const t = time ? ' <span style="font-size:11px;opacity:0.7;margin-left:6px;">' + escapeHtml(time) + '</span>' : '';
      const tag = (entry.channel && entry.channelType === 'system')
        ? '<span style="font-size:10.5px;color:#a8843f;border:1px solid #2c3648;border-radius:4px;padding:0 5px;margin-right:6px;">' + escapeHtml(entry.channel) + '</span>' : '';
      return '<div style="text-align:center;color:' + settings.sysColor + ';font-size:12px;margin-bottom:10px;">' + tag + msgHtml + t + '</div>';
    }

    // 감정표현 (나래이션이라 아바타 없이 본문만)
    if (isEmote) {
      const bg = char ? char.bg : '#242c39';
      const color = char ? char.color : '#e9e4d6';
      const t = time ? '<span style="font-style:normal;font-size:11px;opacity:0.65;margin-left:8px;">' + escapeHtml(time) + '</span>' : '';
      const emoteHtml = escapeHtml(applyDisplayNames(entry.message)).replace(/\n/g, '<br>');
      return '<div style="text-align:center;margin-bottom:12px;">' +
        '<span style="display:inline-block;background:' + bg + ';color:' + color + ';border-radius:999px;padding:9px 16px;font-style:italic;font-size:14px;">' +
          emoteHtml + t +
        '</span></div>';
    }

    // 귓속말
    if (isWhisper) {
      const isOut = entry.channelType === 'whisper-out';
      const wChar = isOut ? getMyCharacter() : findCharacterByNickname(entry.nickname);
      const bg = wChar ? darkenHex(wChar.bg, 0.22) : '#1c232e';
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
    // 가로 100%로 늘려 감정표현·시스템 행이 페이지 중앙에 오게 하고, colgroup으로 아바타 칸 폭을 고정해요.
    const htmlContent = '<table border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:none;width:100%;table-layout:fixed;' + COPY_FONT + '">' +
      '<colgroup><col style="width:3px;"><col style="width:46px;"><col></colgroup><tbody>' +
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
  document.getElementById('filterToggle').addEventListener('change', renderPreview);
  document.getElementById('showChannelToggle').addEventListener('change', renderPreview);
  document.getElementById('showTimeToggle').addEventListener('change', renderPreview);
  document.getElementById('copyBtn').addEventListener('click', copyFormatted);
  document.getElementById('htmlCopyBtn').addEventListener('click', copyHtmlCode);
  document.getElementById('textCopyBtn').addEventListener('click', copyPlainText);
  document.getElementById('exportFullBtn').addEventListener('click', () => capturePreview(false));
  document.getElementById('exportViewBtn').addEventListener('click', () => capturePreview(true));

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
  renderPreview();
  applyLogBackground();
  ensureAvatarThumbs();