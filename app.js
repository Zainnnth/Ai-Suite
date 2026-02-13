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
  }
};

const els = {
  tabOpenAI: document.getElementById('tab-openai'),
  tabAnthropic: document.getElementById('tab-anthropic'),
  apiKey: document.getElementById('api-key'),
  btnSaveKey: document.getElementById('btn-save-key'),
  btnClearKey: document.getElementById('btn-clear-key'),
  model: document.getElementById('model'),
  btnDefaultModel: document.getElementById('btn-default-model'),
  system: document.getElementById('system'),
  chat: document.getElementById('chat'),
  input: document.getElementById('input'),
  btnSend: document.getElementById('btn-send'),
  btnClear: document.getElementById('btn-clear'),
  btnExport: document.getElementById('btn-export'),
  fileImport: document.getElementById('file-import')
};

const STORAGE_KEY = 'local-ai-suite-v1';

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
  els.apiKey.value = state.keys[provider] || '';
  els.model.value = state.model[provider] || '';
  els.system.value = state.system[provider] || '';
  renderChat();
  saveState();
}

function renderChat() {
  const msgs = state.chats[state.provider] || [];
  els.chat.innerHTML = '';
  const template = document.getElementById('msg-template');
  msgs.forEach(m => {
    const node = template.content.cloneNode(true);
    node.querySelector('.role').textContent = m.role;
    node.querySelector('.content').textContent = m.content;
    els.chat.appendChild(node);
  });
  els.chat.scrollTop = els.chat.scrollHeight;
}

function pushMessage(role, content) {
  state.chats[state.provider].push({ role, content });
  renderChat();
  saveState();
}

async function sendMessage() {
  const text = els.input.value.trim();
  if (!text) return;
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

  pushMessage('user', text);
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

function buildMessagesForOpenAI() {
  const msgs = [];
  const sys = (state.system.openai || '').trim();
  if (sys) msgs.push({ role: 'system', content: sys });
  for (const m of state.chats.openai) {
    if (m.role === 'error') continue;
    msgs.push({ role: m.role, content: m.content });
  }
  return msgs;
}

async function callOpenAI(key, model) {
  const body = {
    model,
    messages: buildMessagesForOpenAI()
  };

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
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
  const msg = data?.choices?.[0]?.message?.content;
  if (!msg) throw new Error('OpenAI returned no message.');
  return msg;
}

function buildMessagesForAnthropic() {
  const msgs = [];
  for (const m of state.chats.anthropic) {
    if (m.role === 'error') continue;
    if (m.role === 'system') continue;
    msgs.push({ role: m.role, content: m.content });
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
      'anthropic-version': '2023-06-01'
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

function exportState() {
  const data = JSON.stringify(state, null, 2);
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

els.tabOpenAI.addEventListener('click', () => setProvider('openai'));
els.tabAnthropic.addEventListener('click', () => setProvider('anthropic'));

els.btnSaveKey.addEventListener('click', () => {
  state.keys[state.provider] = els.apiKey.value.trim();
  saveState();
});

els.btnClearKey.addEventListener('click', () => {
  state.keys[state.provider] = '';
  els.apiKey.value = '';
  saveState();
});

els.model.addEventListener('input', () => {
  state.model[state.provider] = els.model.value;
  saveState();
});

els.system.addEventListener('input', () => {
  state.system[state.provider] = els.system.value;
  saveState();
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

els.btnExport.addEventListener('click', exportState);

els.fileImport.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (file) importState(file);
  e.target.value = '';
});

loadState();
setProvider(state.provider || 'openai');
