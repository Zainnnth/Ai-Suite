const state = {
  provider: 'openai',
  chats: {
    openai: [],
    anthropic: []
  },
  model: {
    openai: '',
    anthropic: ''
  },
  system: {
    openai: '',
    anthropic: ''
  },
  keys: {
    openai: '',
    anthropic: ''
  },
  pendingFiles: {
    openai: [],
    anthropic: []
  },
  pendingText: {
    openai: [],
    anthropic: []
  }
};

const els = {
  tabOpenAI: document.getElementById('tab-openai'),
  tabAnthropic: document.getElementById('tab-anthropic'),
  apiKey: document.getElementById('api-key'),
  btnClearKey: document.getElementById('btn-clear-key'),
  model: document.getElementById('model'),
  btnDefaultModel: document.getElementById('btn-default-model'),
  modelList: document.getElementById('model-list'),
  system: document.getElementById('system'),
  fileAttach: document.getElementById('file-attach'),
  fileList: document.getElementById('file-list'),
  chat: document.getElementById('chat'),
  input: document.getElementById('input'),
  btnSend: document.getElementById('btn-send'),
  btnClear: document.getElementById('btn-clear'),
  btnClearMemory: document.getElementById('btn-clear-memory'),
  btnExport: document.getElementById('btn-export'),
  fileImport: document.getElementById('file-import')
};

const STORAGE_KEY = 'local-ai-suite-v1';
const MODEL_SUGGESTIONS = {
  openai: [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4.1',
    'gpt-4.1-mini',
    'o4-mini'
  ],
  anthropic: [
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022',
    'claude-3-opus-20240229'
  ]
};

function saveState() {
  const { keys, ...rest } = state;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data && typeof data === 'object') {
      Object.assign(state, data);
    }
  } catch {
    // ignore corrupt state
  }
}

function setProvider(provider) {
  state.provider = provider;
  els.tabOpenAI.classList.toggle('active', provider === 'openai');
  els.tabAnthropic.classList.toggle('active', provider === 'anthropic');
  els.apiKey.value = '';
  els.model.value = state.model[provider] || '';
  els.system.value = state.system[provider] || '';
  renderModelList();
  renderChat();
  renderFileList();
  saveState();
}

function renderChat() {
  const msgs = state.chats[state.provider] || [];
  els.chat.innerHTML = '';
  const template = document.getElementById('msg-template');
  msgs.forEach(m => {
    const node = template.content.cloneNode(true);
    const msgEl = node.querySelector('.msg');
    if (m.role === 'system') msgEl.classList.add('msg-system');
    node.querySelector('.role').textContent = m.role;
    const fileNote = m.attachments && m.attachments.length
      ? `\n\n[Files: ${m.attachments.map(a => a.name).join(', ')}]`
      : '';
    node.querySelector('.content').textContent = `${m.content}${fileNote}`;
    els.chat.appendChild(node);
  });
  els.chat.scrollTop = els.chat.scrollHeight;
}

function renderFileList() {
  const files = state.pendingFiles[state.provider] || [];
  const texts = state.pendingText[state.provider] || [];
  els.fileList.innerHTML = '';
  files.forEach((f, idx) => {
    const pill = document.createElement('div');
    pill.className = 'file-pill';
    pill.textContent = f.name;
    const btn = document.createElement('button');
    btn.className = 'ghost';
    btn.textContent = 'x';
    btn.addEventListener('click', () => {
      state.pendingFiles[state.provider].splice(idx, 1);
      renderFileList();
    });
    pill.appendChild(btn);
    els.fileList.appendChild(pill);
  });
  texts.forEach((t, idx) => {
    const pill = document.createElement('div');
    pill.className = 'file-pill';
    pill.textContent = `${t.name} (text)`;
    const btn = document.createElement('button');
    btn.className = 'ghost';
    btn.textContent = 'x';
    btn.addEventListener('click', () => {
      state.pendingText[state.provider].splice(idx, 1);
      renderFileList();
    });
    pill.appendChild(btn);
    els.fileList.appendChild(pill);
  });
}

function pushMessage(role, content, attachments = []) {
  state.chats[state.provider].push({ role, content, attachments });
  renderChat();
  saveState();
}

function trySetKeyFromInput(text) {
  // Detect patterns: "key: sk-...", "/key sk-...", "apikey: ..."
  const match = text.match(/^(?:\/key|key\s*:|apikey\s*:)\s*(\S+)$/i);
  if (match) {
    const newKey = match[1].trim();
    state.keys[state.provider] = newKey;
    els.apiKey.value = newKey;
    els.input.value = '';
    pushMessage('system', `✅ API key set for ${state.provider === 'openai' ? 'OpenAI' : 'Anthropic'}.`);
    return true;
  }
  return false;
}

async function sendMessage() {
  const text = els.input.value.trim();
  if (!text) return;

  // Allow setting the API key inline from the chat box
  if (trySetKeyFromInput(text)) return;

  const key = state.keys[state.provider];
  const model = (state.model[state.provider] || '').trim();
  if (!key) {
    pushMessage('error', 'Missing API key.');
    return;
  }
  if (!model) {
    pushMessage('error', 'Missing model name.');
    return;
  }

  const attachments = state.pendingFiles[state.provider].slice();
  const textAttachments = state.pendingText[state.provider].slice();
  state.pendingFiles[state.provider] = [];
  state.pendingText[state.provider] = [];
  renderFileList();

  const allAttachments = attachments.concat(
    textAttachments.map(t => ({ name: t.name, text: t.text }))
  );
  pushMessage('user', text, allAttachments);
  els.input.value = '';
  els.btnSend.disabled = true;

  try {
    const reply = state.provider === 'openai'
      ? await callOpenAI(key, model)
      : await callAnthropic(key, model);
    pushMessage('assistant', reply);
  } catch (err) {
    pushMessage('error', err.message || 'Request failed');
  } finally {
    els.btnSend.disabled = false;
  }
}

function buildInputForOpenAI() {
  const input = [];
  const sys = (state.system.openai || '').trim();
  if (sys) {
    input.push({
      role: 'system',
      content: [{ type: 'input_text', text: sys }]
    });
  }

  for (const m of state.chats.openai) {
    if (m.role === 'error') continue;
    const content = [];
    if (m.attachments && m.attachments.length) {
      m.attachments.forEach(a => {
        if (a.id) {
          content.push({
            type: 'input_file',
            file_id: a.id
          });
        } else if (a.text) {
          content.push({
            type: 'input_text',
            text: `File: ${a.name}\n\n${a.text}`
          });
        }
      });
    }
    content.push({ type: 'input_text', text: m.content });
    input.push({ role: m.role, content });
  }
  return input;
}

async function callOpenAI(key, model) {
  const body = {
    model,
    input: buildInputForOpenAI()
  };

  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI error: ${res.status} ${text}`);
  }

  const data = await res.json();
  const msg = data?.output_text || data?.output?.[0]?.content?.[0]?.text;
  if (!msg) throw new Error('OpenAI returned no message.');
  return msg;
}

function buildMessagesForAnthropic() {
  const msgs = [];
  for (const m of state.chats.anthropic) {
    if (m.role === 'error') continue;
    if (m.role === 'system') continue;
    const content = [];
    if (m.attachments && m.attachments.length) {
      m.attachments.forEach(a => {
        if (a.id) {
          content.push({
            type: 'document',
            source: { type: 'file', file_id: a.id }
          });
        } else if (a.text) {
          content.push({
            type: 'text',
            text: `File: ${a.name}\n\n${a.text}`
          });
        }
      });
    }
    content.push({ type: 'text', text: m.content });
    msgs.push({ role: m.role, content });
  }
  return msgs;
}

async function callAnthropic(key, model) {
  const body = {
    model,
    max_tokens: 1024,
    messages: buildMessagesForAnthropic()
  };

  const sys = (state.system.anthropic || '').trim();
  if (sys) body.system = sys;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'files-api-2025-04-14',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic error: ${res.status} ${text}`);
  }

  const data = await res.json();
  const msg = data?.content?.[0]?.text;
  if (!msg) throw new Error('Anthropic returned no message.');
  return msg;
}

function setDefaultModel() {
  if (state.provider === 'openai') {
    els.model.value = 'gpt-4o-mini';
  } else {
    els.model.value = 'claude-3-5-sonnet-20241022';
  }
  state.model[state.provider] = els.model.value;
  saveState();
}

function renderModelList() {
  const list = MODEL_SUGGESTIONS[state.provider] || [];
  els.modelList.innerHTML = '';
  list.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    els.modelList.appendChild(opt);
  });
}

function exportState() {
  const { keys, ...rest } = state;
  const data = JSON.stringify(rest, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'local-ai-suite.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function importState(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || typeof data !== 'object') return;
      Object.assign(state, data);
      setProvider(state.provider || 'openai');
      saveState();
    } catch {
      pushMessage('error', 'Import failed: invalid JSON');
    }
  };
  reader.readAsText(file);
}

async function uploadOpenAIFile(key, file) {
  const form = new FormData();
  form.append('file', file);
  form.append('purpose', 'user_data');

  const res = await fetch('https://api.openai.com/v1/files', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`
    },
    body: form
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI file upload failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  if (!data?.id) throw new Error('OpenAI file upload returned no id.');
  return { id: data.id, name: file.name };
}

async function uploadAnthropicFile(key, file) {
  const form = new FormData();
  form.append('file', file);

  const res = await fetch('https://api.anthropic.com/v1/files', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'files-api-2025-04-14',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: form
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic file upload failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  if (!data?.id) throw new Error('Anthropic file upload returned no id.');
  return { id: data.id, name: file.name };
}

async function extractDocxText(file) {
  const arrayBuffer = await file.arrayBuffer();
  if (!window.mammoth) {
    throw new Error('DOCX parser not available.');
  }
  const result = await window.mammoth.extractRawText({ arrayBuffer });
  return result.value || '';
}

async function extractXlsxText(file) {
  const arrayBuffer = await file.arrayBuffer();
  if (!window.XLSX) {
    throw new Error('XLSX parser not available.');
  }
  const workbook = window.XLSX.read(arrayBuffer, { type: 'array' });
  const parts = [];
  workbook.SheetNames.forEach(name => {
    const sheet = workbook.Sheets[name];
    const csv = window.XLSX.utils.sheet_to_csv(sheet);
    parts.push(`Sheet: ${name}\n${csv}`);
  });
  return parts.join('\n\n');
}

function isDocx(file) {
  return file.name.toLowerCase().endsWith('.docx');
}

function isXlsx(file) {
  return file.name.toLowerCase().endsWith('.xlsx');
}

els.tabOpenAI.addEventListener('click', () => setProvider('openai'));
els.tabAnthropic.addEventListener('click', () => setProvider('anthropic'));

els.btnClearKey.addEventListener('click', () => {
  state.keys[state.provider] = '';
  els.apiKey.value = '';
});

els.model.addEventListener('input', () => {
  state.model[state.provider] = els.model.value;
  saveState();
});

els.system.addEventListener('input', () => {
  state.system[state.provider] = els.system.value;
  saveState();
});

els.apiKey.addEventListener('input', () => {
  state.keys[state.provider] = els.apiKey.value.trim();
});

els.fileAttach.addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || []);
  e.target.value = '';
  if (!files.length) return;

  const key = state.keys[state.provider];
  if (!key) {
    pushMessage('error', 'Add an API key before uploading files.');
    return;
  }

  try {
    for (const file of files) {
      if (isDocx(file)) {
        const text = await extractDocxText(file);
        state.pendingText[state.provider].push({ name: file.name, text });
        continue;
      }
      if (isXlsx(file)) {
        const text = await extractXlsxText(file);
        state.pendingText[state.provider].push({ name: file.name, text });
        continue;
      }
      const uploaded = state.provider === 'openai'
        ? await uploadOpenAIFile(key, file)
        : await uploadAnthropicFile(key, file);
      state.pendingFiles[state.provider].push(uploaded);
    }
    renderFileList();
  } catch (err) {
    pushMessage('error', err.message || 'File upload failed');
  }
});

els.btnDefaultModel.addEventListener('click', setDefaultModel);

els.btnSend.addEventListener('click', sendMessage);

els.input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

els.btnClear.addEventListener('click', () => {
  state.chats[state.provider] = [];
  renderChat();
  saveState();
});

els.btnClearMemory.addEventListener('click', () => {
  state.keys.openai = '';
  state.keys.anthropic = '';
  state.chats.openai = [];
  state.chats.anthropic = [];
  state.model.openai = '';
  state.model.anthropic = '';
  state.system.openai = '';
  state.system.anthropic = '';
  state.pendingFiles.openai = [];
  state.pendingFiles.anthropic = [];
  state.pendingText.openai = [];
  state.pendingText.anthropic = [];
  els.apiKey.value = '';
  els.model.value = '';
  els.system.value = '';
  renderChat();
  renderFileList();
  saveState();
});

els.btnExport.addEventListener('click', exportState);

els.fileImport.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (file) importState(file);
  e.target.value = '';
});

loadState();
setProvider(state.provider || 'openai');
