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

  // 예전 버전에서 저장된 기본 이모지(🙂)가 남아있다면 새 기본값(＃)으로 정리
  let migrated = false;
  characters.forEach(c => {
    if (c.avatarType === 'emoji' && c.avatarValue === '🙂') {
      c.avatarValue = '＃';
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

  /* ---------- 캐릭터 CRUD ---------- */

  function addCharacter() {
    characters.push({
      id: uid(),
      nickname: '',
      displayName: '',
      bg: '#26303f',
      color: '#e9e4d6',
      avatarType: 'emoji',
      avatarValue: '＃'
    });
    saveCharacters();
    renderCharList();
  }

  function removeCharacter(id) {
    characters = characters.filter(c => c.id !== id);
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

    characters.forEach(c => {
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
        avatarPreview.textContent = c.avatarValue || '＃';
      }
      avatarWrap.appendChild(avatarPreview);

      const emojiInput = document.createElement('input');
      emojiInput.type = 'text';
      emojiInput.className = 'avatar-emoji-input';
      emojiInput.maxLength = 4;
      emojiInput.placeholder = '이모지';
      emojiInput.value = c.avatarType === 'emoji' ? (c.avatarValue || '＃') : '';
      emojiInput.addEventListener('input', () => {
        updateCharacter(c.id, { avatarType: 'emoji', avatarValue: emojiInput.value });
        avatarPreview.innerHTML = '';
        avatarPreview.textContent = emojiInput.value || '＃';
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

      const colorRow = document.createElement('div');
      colorRow.className = 'color-row';

      const bgLabel = document.createElement('label');
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
      colorRow.appendChild(bgLabel);

      const colorLabel = document.createElement('label');
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
      colorRow.appendChild(colorLabel);

      fields.appendChild(colorRow);
      row.appendChild(fields);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'remove-btn';
      removeBtn.title = '삭제';
      removeBtn.textContent = '✕';
      removeBtn.addEventListener('click', () => removeCharacter(c.id));
      row.appendChild(removeBtn);

      container.appendChild(row);
    });
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
    if (m) return { channelType: 'whisper-out', channel: '귓속말(보냄)', nickname: stripDecoration(m[1]), message: m[2] };

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
      const char = findCharacterByNickname(entry.nickname);
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

    const avatar = document.createElement('span');
    avatar.className = 'log-emote-avatar';
    if (char && char.avatarType === 'image' && char.avatarValue) {
      avatar.innerHTML = '<img src="' + char.avatarValue + '" alt="">';
    } else if (char) {
      avatar.textContent = char.avatarValue || '＃';
    }
    inner.appendChild(avatar);

    const msg = document.createElement('span');
    msg.className = 'log-emote-msg';
    msg.innerHTML = escapeHtml(entry.message).replace(/\n/g, '<br>');
    inner.appendChild(msg);

    if (entry.time) {
      const t = document.createElement('span');
      t.className = 'log-emote-time';
      t.textContent = entry.time;
      inner.appendChild(t);
    }

    line.appendChild(inner);
    return line;
  }

  // 시스템 알림(공지·토벌 종료 등)은 조용한 한 줄로. 'unknown'은 라벨 없이 본문만, [이벤트]처럼
  // 의미있는 대괄호 채널만 작은 태그로 붙여요.
  function buildSystemLineNode(entry) {
    const line = document.createElement('div');
    line.className = 'log-line is-system';

    const inner = document.createElement('div');
    inner.className = 'log-system';

    if (entry.time) {
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
          avatar.textContent = char.avatarValue || '＃';
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
      if (entry.time) meta.appendChild(timeSpan);

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
    html2canvas(node, { backgroundColor: '#161d28', scale: 2 }).then(canvas => {
      const link = document.createElement('a');
      link.download = 'ffxiv_log_' + Date.now() + '.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    }).catch(err => {
      alert('이미지 저장 중 문제가 발생했습니다: ' + err.message);
    });
  }

  /* ---------- 서식 복사 (클립보드) ---------- */
  /* 미리보기는 CSS 클래스를 쓰지만, 클립보드에 복사할 때는 외부 프로그램에서도
     색/배치가 살아있도록 모든 스타일을 인라인으로 다시 만들어요.
     표(table)나 float는 카페/블로그 에디터에 붙여넣을 때 깨지기 쉬워서,
     아바타를 이름 앞에 붙는 작은 인라인 아이콘으로 두는 단순한 구조를 써요. */

  function buildLineHtml(entry) {
    const char = findCharacterByNickname(entry.nickname);
    const isEmote = entry.channelType === 'emote';
    const isSystem = !entry.nickname;
    const messageHtml = escapeHtml(entry.message).replace(/\n/g, '<br>');
    const timeLabel = entry.time ? entry.time : '';

    // 시스템 알림: 이름 라벨 없이 가운데 정렬된 조용한 한 줄
    if (isSystem) {
      const t = timeLabel ? escapeHtml(timeLabel) + ' ' : '';
      const tag = (entry.channel && entry.channelType === 'system') ? escapeHtml(entry.channel) + ' · ' : '';
      return '<div style="text-align:center;color:#8a93a6;font-size:12px;margin:5px 0;font-family:\'Malgun Gothic\',\'Noto Sans KR\',sans-serif;">' + t + tag + messageHtml + '</div>';
    }

    // 감정표현: 캐릭터 색을 살린 가운데 정렬 알약 (본문에 행위자가 들어있어 이름 라벨 생략)
    if (isEmote) {
      const bg = char ? char.bg : '#242c39';
      const color = char ? char.color : '#e9e4d6';
      let avatarHtml = '';
      if (char && char.avatarType === 'image' && char.avatarValue) {
        avatarHtml = '<img src="' + char.avatarValue + '" width="20" height="20" style="width:20px;height:20px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:6px;">';
      } else if (char) {
        avatarHtml = '<span style="margin-right:6px;">' + escapeHtml(char.avatarValue || '＃') + '</span>';
      }
      const t = timeLabel ? ' <span style="font-style:normal;font-size:11px;opacity:0.65;">' + escapeHtml(timeLabel) + '</span>' : '';
      return (
        '<div style="text-align:center;margin:8px 0;font-family:\'Malgun Gothic\',\'Noto Sans KR\',sans-serif;">' +
          '<span style="display:inline-block;background:' + bg + ';color:' + color + ';border-radius:999px;padding:7px 16px;font-style:italic;font-size:14px;">' +
            avatarHtml + messageHtml + t +
          '</span>' +
        '</div>'
      );
    }

    // 일반 대화
    const bg = char ? char.bg : '#242c39';
    const color = char ? char.color : '#e9e4d6';
    const displayName = (char && char.displayName) ? char.displayName : (entry.nickname || '???');
    const channelLabel = (entry.channel && shouldShowChannel()) ? '[' + entry.channel + ']' : '';

    let avatarHtml;
    if (char && char.avatarType === 'image' && char.avatarValue) {
      avatarHtml = '<img src="' + char.avatarValue + '" width="22" height="22" style="width:22px;height:22px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:6px;">';
    } else {
      const emoji = char ? (char.avatarValue || '＃') : ((entry.nickname || '?').charAt(0) || '?');
      const avatarBg = char ? char.bg : '#242c39';
      const avatarColor = char ? char.color : '#8b93a3';
      avatarHtml = '<span style="display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;border-radius:50%;background:' + avatarBg + ';color:' + avatarColor + ';font-size:12px;vertical-align:middle;margin-right:6px;">' + escapeHtml(emoji) + '</span>';
    }

    const metaBits = [channelLabel, timeLabel].filter(Boolean).join(' ');

    return (
      '<div style="background:' + bg + ';color:' + color + ';border-radius:8px;padding:8px 12px;margin-bottom:8px;font-family:\'Malgun Gothic\',\'Noto Sans KR\',sans-serif;">' +
        avatarHtml +
        '<b style="font-size:14px;">' + escapeHtml(displayName) + '</b>' +
        (metaBits ? ' <span style="font-size:12px;opacity:0.7;">' + escapeHtml(metaBits) + '</span>' : '') +
        '<br>' +
        '<span style="font-size:14px;line-height:1.5;">' + messageHtml + '</span>' +
      '</div>'
    );
  }

  function buildPlainText(entry) {
    const char = findCharacterByNickname(entry.nickname);
    const isEmote = entry.channelType === 'emote';
    const isSystem = !entry.nickname;
    const timeLabel = entry.time ? '[' + entry.time + '] ' : '';

    // 감정표현은 본문에 행위자가 들어있고, 시스템은 이름·채널 라벨이 불필요해요.
    if (isSystem || isEmote) {
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

    const htmlContent = '<div style="font-family:\'Malgun Gothic\',sans-serif;">' + filtered.map(buildLineHtml).join('') + '</div>';
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

  /* ---------- 이벤트 연결 ---------- */

  document.getElementById('addCharBtn').addEventListener('click', addCharacter);
  document.getElementById('renderBtn').addEventListener('click', renderPreview);
  document.getElementById('filterToggle').addEventListener('change', renderPreview);
  document.getElementById('showChannelToggle').addEventListener('change', renderPreview);
  document.getElementById('copyBtn').addEventListener('click', copyFormatted);
  document.getElementById('textCopyBtn').addEventListener('click', copyPlainText);
  document.getElementById('exportBtn').addEventListener('click', exportImage);

  document.getElementById('clearBtn').addEventListener('click', () => {
    document.getElementById('logInput').value = '';
    renderPreview();
  });

  document.getElementById('resetBtn').addEventListener('click', () => {
    if (confirm('등록된 모든 캐릭터 설정을 삭제할까요? 되돌릴 수 없습니다.')) {
      characters = [];
      saveCharacters();
      renderCharList();
      renderPreview();
    }
  });

  let debounceTimer;
  document.getElementById('logInput').addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(renderPreview, 250);
  });

  renderCharList();