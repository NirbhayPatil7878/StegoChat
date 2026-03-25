// StegoChat - Core Application Logic
// DO NOT MODIFY UI DESIGN - Only functionality

let chats = [];
let currentChatId = null;
let useRandomImage = false;
let deadDropMode = false;

// Helper: extract hidden data from an image URL by fetching and POSTing to backend
async function extractImageUrl(url, password = '') {
  try {
    const resBlob = await fetch(url);
    const blob = await resBlob.blob();
    const fd = new FormData();
    fd.append('image', blob, url.split('/').pop());
    fd.append('password', password || '');
    // show temporary loading message
    addMessageToChat('incoming', 'Extracting hidden payload...', new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}));
    const res = await fetch('/api/extract', { method: 'POST', body: fd });
    const data = await res.json();
    if (data.status === 'ok') {
      // show result in modal
      showModal('Extraction result', data.message);
      addMessageToChat('incoming', 'Extracted payload (see details)', new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}), true);
    } else {
      addMessageToChat('incoming', 'No hidden payload found', new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}));
      showToast('Extract failed: ' + (data.error || 'No hidden message found'), 'error');
    }
  } catch (e) {
    console.error('extractImageUrl error', e);
    showToast('Network error during extraction', 'error');
  }
}

// Helper: inspect image metadata (size, type)
async function inspectImageMetadata(url) {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    // HEAD may not be allowed; fallback to GET size
    let size = res.headers.get('content-length');
    const type = res.headers.get('content-type');
    if (!size) {
      const r = await fetch(url);
      const b = await r.blob();
      size = b.size;
    }
    showModal('Metadata', 'Type: ' + (type || 'unknown') + '\nSize: ' + (size ? Math.round(size/1024) + ' KB' : 'unknown'));
  } catch (e) {
    console.error('inspectImageMetadata error', e);
    showToast('Failed to inspect metadata', 'error');
  }
}

// UI helpers: modal and toasts
function showModal(title, body) {
  const modal = document.getElementById('extract-modal');
  if (!modal) return;
  const titleEl = document.getElementById('modal-title');
  const bodyEl = document.getElementById('modal-body');
  if (titleEl) titleEl.textContent = title || '';
  if (bodyEl) bodyEl.innerHTML = (body || '').toString().replace(/\n/g, '<br/>');
  modal.classList.remove('hidden');
}
function closeModal() {
  const modal = document.getElementById('extract-modal');
  if (!modal) return;
  modal.classList.add('hidden');
}
function showToast(msg, type='info') {
  const container = document.getElementById('toasts');
  if (!container) return;
  const t = document.createElement('div');
  t.className = 'toast px-3 py-2 rounded shadow-lg ' + (type === 'error' ? 'bg-[#93000a] text-white' : 'bg-[#2d3449] text-white');
  t.innerHTML = msg;
  container.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 400); }, 4000);
}

// DOM Elements
const chatListEl = document.getElementById('chat-list');
const chatMessagesEl = document.getElementById('chat-messages');
const chatTitleEl = document.getElementById('chat-title');
const chatAvatarEl = document.getElementById('chat-avatar');
const statusTextEl = document.getElementById('status-text');
const statusDotEl = document.getElementById('status-dot');
const messageInputEl = document.getElementById('message-input');
const imageUploadEl = document.getElementById('image-upload');
const hideToggleEl = document.getElementById('hide-toggle');
const btnNewChat = document.getElementById('btn-new-chat');
const btnSend = document.getElementById('btn-send');
const btnAttach = document.getElementById('btn-attach');
const btnAnalyzeFile = document.getElementById('btn-analyze-file');
const searchInputEl = document.getElementById('search-input');
const currentUserLabel = document.getElementById('current-user-label');
const sharedFilesEl = document.getElementById('shared-files');

// Load chats from server
async function loadChatsFromServer() {
  try {
    const res = await fetch('/api/chats');
    const data = await res.json();
    if (data.status === 'ok' && Array.isArray(data.chats)) {
      chats = data.chats;
      renderChatList();
      if (chats.length && !currentChatId) {
        // Auto-select first chat on load
        selectChat(chats[0].id);
      }
    }
  } catch (e) {
    console.error('Failed to load chats', e);
  }
}

// Render chat list in sidebar
function renderChatList() {
  if (!chatListEl) return;
  
  if (!chats || !chats.length) {
    chatListEl.innerHTML = `
      <div class="p-4 text-xs text-outline text-center">
        <p class="mb-2 font-bold">No active channel selected</p>
        <p class="mb-3">You don't have any active channels. Start a secure conversation to begin sending covert messages.</p>
        <button id="start-secure-convo" class="px-4 py-2 bg-primary rounded-md text-on-primary-container font-semibold">Start secure conversation</button>
      </div>
    `;
    return;
  }
  
  chatListEl.innerHTML = '';
  chats.forEach(chat => {
    const div = document.createElement('div');
    div.className = 'p-3 hover:bg-surface-container rounded-2xl flex items-center gap-4 cursor-pointer transition-colors group' + (chat.id === currentChatId ? ' bg-primary/10 border border-primary/20' : '');
    div.dataset.chatId = chat.id;
    
    const created = chat.createdAt ? new Date(chat.createdAt) : new Date();
    const timeStr = created.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const firstLetter = (chat.name || chat.peerEmail || 'C')[0].toUpperCase();
    const title = chat.name || chat.peerEmail || 'Chat #' + (chat.id || '').slice(0, 6);
    const preview = chat.lastPreview || 'Awaiting handshake...';
    const isActive = chat.id === currentChatId;
    // Highlight search matches if query present
    let displayTitle = title;
    let displayPreview = preview;
    try {
      const q = (window.lastSearchQuery || '').trim();
      if (q) {
        const re = new RegExp(q.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'), 'ig');
        displayTitle = title.replace(re, (m) => `<mark style="background:rgba(74,225,118,0.15);color:#dfe7ff;padding:0 2px;border-radius:2px">${m}</mark>`);
        displayPreview = preview.replace(re, (m) => `<mark style="background:rgba(74,225,118,0.12);color:#dfe7ff;padding:0 2px;border-radius:2px">${m}</mark>`);
      }
    } catch (e) { /* ignore */ }
    
    div.innerHTML = `
      <div class="relative">
        ${chat.peerEmail ? '<img alt="' + title + '" class="w-11 h-11 rounded-xl object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDuyA2BgON_yTMkfdkVNYzfF57D5Ka_a7kt_1d5HRhx-2VYnuGUsKWn_k-qSs5w4hR9QfrrUv-jryD2hR7pxz6xM1AtZDvT7Psud7mR9NBylQ_DnCk3Fv8VdegaGZabbuNm4jmJHX_xS9FZt04EMiV6QUp2qhN7UdJji3QfTSlFQRzkuf1mxpnfFS6Cx1GpCkRc4A7romPVLigPa_vohYfT7cPitxipMh7RYJFfU0_Drr2efPxxh13LvNXVqdpH3Z17782Y_SAouA"/>' : '<div class="w-11 h-11 bg-surface-bright rounded-xl flex items-center justify-center text-primary font-bold text-sm">' + firstLetter + '</div>'}
        ${isActive ? '<div class="absolute -bottom-1 -right-1 w-3 h-3 bg-secondary rounded-full border-2 border-[#0b1326] pulse-ring"></div>' : ''}
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex justify-between items-center mb-0.5">
          <h3 class="font-bold ${isActive ? 'text-primary' : 'text-on-surface'} group-hover:text-primary truncate text-sm">${displayTitle}</h3>
          <span class="text-[10px] text-outline font-medium">${timeStr}</span>
        </div>
        <p class="text-xs text-on-surface-variant truncate">${displayPreview}</p>
      </div>
    `;
    
    div.addEventListener('click', () => selectChat(chat.id));
    chatListEl.appendChild(div);
  });
}

// Select a chat and load messages
function selectChat(chatId) {
  currentChatId = chatId;
  const chat = chats.find(c => c.id === chatId);
  if (!chat) return;
  
  // Update header
  const title = chat.name || chat.peerEmail || 'Secure Channel';
  chatTitleEl.textContent = title;
  statusTextEl.textContent = 'Secure Connection Active';
  statusDotEl.classList.add('pulse-ring');
  
  // Set avatar
  if (chat.peerEmail) {
    chatAvatarEl.src = 'https://lh3.googleusercontent.com/aida-public/AB6AXuAO8sbuIuptJybnNG9Wi-6ZwMbEvXZPbvCMf6ijdy2yZZpXVH';
  } else {
    chatAvatarEl.src = '';
  }
  
  // Load messages
  loadMessagesForChat(chat);
  renderChatList();
}

// Load messages for selected chat
function loadMessagesForChat(chat) {
  if (!chatMessagesEl) return;
  
  chatMessagesEl.innerHTML = `
    <div class="flex justify-center">
      <span class="px-4 py-1 rounded-full bg-surface-container-low text-[10px] uppercase tracking-[0.2em] font-bold text-outline">Today - 128-bit AES</span>
    </div>
  `;

  // When chat has no messages, show onboarding / empty state
  if (!chat.messages || !chat.messages.length) {
    chatMessagesEl.innerHTML += `
      <div class="flex flex-col items-center justify-center mt-12 text-center text-on-surface-variant">
        <h3 class="text-xl font-bold mb-2">No active channel selected</h3>
        <p class="mb-4">Start secure conversation — attach an image or enable Stealth Mode to hide messages in media.</p>
        <button id="start-secure-convo-cta" class="px-5 py-2 bg-primary rounded-lg text-on-primary-container font-bold">Start secure conversation</button>
        <div class="mt-6 text-sm text-outline max-w-[520px]">
          <p class="font-semibold mb-1">Tips</p>
          <ul class="list-disc list-inside text-left mt-2">
            <li>Attach an image to hide data</li>
            <li>Enable Stealth Mode for covert messaging</li>
            <li>Inspect media to reveal hidden payloads</li>
          </ul>
        </div>
      </div>
    `;
    setTimeout(() => {
      const cta = document.getElementById('start-secure-convo-cta');
      if (cta) cta.addEventListener('click', () => createNewChat());
    }, 50);
    return;
  }
  
  // Add sample messages for demo
  const messages = chat.messages || [
    { type: 'incoming', text: 'System initialized. Ready for secure transmission.', time: '14:02', decrypted: true },
    { type: 'outgoing', text: 'Initializing steganography engine...', time: '14:15', secure: true }
  ];
  
  messages.forEach(msg => {
    const msgDiv = document.createElement('div');
    if (msg.type === 'incoming') {
      msgDiv.className = 'flex flex-col gap-2 max-w-[70%]';
      msgDiv.innerHTML = `
        <div class="glass-bubble p-4 rounded-xl rounded-tl-none border border-outline-variant/10">
          <p class="text-on-surface text-sm leading-relaxed">${msg.text}</p>
        </div>
        <span class="font-label text-[10px] text-outline px-1">${msg.time}${msg.decrypted ? ' · DECRYPTED' : ''}</span>
      `;
    } else {
      msgDiv.className = 'flex flex-col items-end gap-2 ml-auto max-w-[80%]';
      msgDiv.innerHTML = `
        <div class="bg-primary-container px-4 py-3 rounded-xl rounded-tr-none max-w-sm">
          <p class="text-on-primary-container text-sm font-medium">${msg.text}</p>
        </div>
        <span class="font-label text-[10px] text-outline px-1 uppercase tracking-tighter">${msg.time}${msg.secure ? ' · SECURE TRANSMISSION' : ''}</span>
      `;
    }
    chatMessagesEl.appendChild(msgDiv);
  });
  
  // Scroll to bottom
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

// Create new chat
async function createNewChat() {
  const email = prompt('Enter recipient email for secure channel:');
  if (!email) return;
  
  try {
    btnNewChat.disabled = true;
    btnNewChat.innerHTML = '<div class="loading-spinner w-5 h-5"></div>';
    
    const { res, data } = await postJson('/api/chats', {
      type: 'private',
      name: '',
      peerEmail: email,
      members: [email],
      owner: currentUserLabel?.textContent || 'user'
    });
    
    if (data.status === 'ok' && data.chat) {
      chats.push(data.chat);
      selectChat(data.chat.id);
      renderChatList();
    } else {
      showToast('Failed to create chat: ' + (data.error || 'Unknown error'), 'error');
    }
  } catch (e) {
    console.error('Create chat error:', e);
    showToast('Network error while creating chat', 'error');
  } finally {
    btnNewChat.disabled = false;
    btnNewChat.innerHTML = '<span class="material-symbols-outlined text-sm">add_moderator</span> Secure Transmission';
  }
}

// Send message (with optional hidden image)
async function sendMessage() {
  const text = (messageInputEl ? (messageInputEl.value||'').trim() : (document.getElementById('stego-message')?.value || '').trim());
  const hideMode = hideToggleEl.checked;
  
  if (!text && !hideMode) return;
  
  try {
    btnSend.disabled = true;
    btnSend.innerHTML = '<div class="loading-spinner w-5 h-5"></div>';
    
    if (hideMode) {
      // Require cover image when stealth mode is ON
      const coverUploadEl = document.getElementById('cover-upload');
      const hasCover = (typeof coverImage !== 'undefined' && coverImage) || (imageUploadEl && imageUploadEl._fetchedFile) || (imageUploadEl && imageUploadEl.files && imageUploadEl.files[0]) || (coverUploadEl && coverUploadEl._fetchedBlob);
      if (!hasCover) {
        showToast('Please select a cover image for stealth mode', 'error');
        btnSend.disabled = false;
        btnSend.innerHTML = '<span class="material-symbols-outlined" data-weight="fill">arrow_upward</span>';
        return;
      }
      // Send hidden message via steganography
      await sendHiddenMessage(text);
    } else {
      // Regular text message
      addMessageToChat('outgoing', text, new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}), true);
      messageInputEl.value = '';
    }
    
    // Update chat preview
    const chat = chats.find(c => c.id === currentChatId);
    if (chat) {
      if (hideMode) {
        chat.lastPreview = '🔐 Hidden message';
      } else {
        chat.lastPreview = text || 'Hidden message sent';
      }
      renderChatList();
    }
  } catch (e) {
    console.error('Send error:', e);
    showToast('Failed to send message', 'error');
  } finally {
    btnSend.disabled = false;
    btnSend.innerHTML = '<span class="material-symbols-outlined" data-weight="fill">arrow_upward</span>';
  }
}

// Send hidden message via steganography
async function sendHiddenMessage(message) {
  // Prepare form data: prefer panel's cover upload (fetchedBlob or selected file), then explicit coverImage (composer), then imageUpload fallback, then random server sample
  const fd = new FormData();
  const panelCoverEl = document.getElementById('cover-upload');
  if (panelCoverEl && panelCoverEl._fetchedBlob) {
    fd.append('image', panelCoverEl._fetchedBlob, 'cover.jpg');
  } else if (panelCoverEl && panelCoverEl.files && panelCoverEl.files[0]) {
    fd.append('image', panelCoverEl.files[0]);
  } else if (typeof coverImage !== 'undefined' && coverImage) {
    fd.append('image', coverImage);
    useRandomImage = false;
  } else if (imageUploadEl && imageUploadEl._fetchedFile) {
    fd.append('image', imageUploadEl._fetchedFile, imageUploadEl._fetchedFile.name || 'random.jpg');
  } else if (imageUploadEl.files && imageUploadEl.files[0]) {
    fd.append('image', imageUploadEl.files[0]);
  } else if (useRandomImage) {
    const samples = await fetch('/sample-list').then(r => r.json());
    if (samples && samples.length) {
      const randomSample = samples[Math.floor(Math.random() * samples.length)];
      const response = await fetch('/sample/' + randomSample);
      const blob = await response.blob();
      fd.append('image', blob, randomSample);
    } else {
      showToast('No sample images available', 'error');
      btnSend.disabled = false;
      btnSend.innerHTML = '<span class="material-symbols-outlined" data-weight="fill">arrow_upward</span>';
      return;
    }
  } else {
    showToast('Please select a cover image for stealth mode', 'error');
    btnSend.disabled = false;
    btnSend.innerHTML = '<span class="material-symbols-outlined" data-weight="fill">arrow_upward</span>';
    return;
  }

  fd.append('message', message || ' ');
  fd.append('password', 'stego123'); // Default password

  try {
    const res = await fetch('/api/embed', { method: 'POST', body: fd });
    const data = await res.json();

    if (data.status === 'ok') {
      // Add stego image to chat (do NOT display plaintext)
      addStegoImageToChat(data.stego_url, null, { embedded: true });
      // update chat preview to avoid plaintext leakage
      const chat = chats.find(c => c.id === currentChatId);
      if (chat) { chat.lastPreview = '🔐 Hidden message'; renderChatList(); }
      // clear composer input if present, otherwise clear panel message
      if (messageInputEl) messageInputEl.value = '';
      else document.getElementById('stego-message').value = '';
      imageUploadEl.value = '';
    } else {
      showToast('Embed failed: ' + (data.error || 'Unknown error'), 'error');
    }
  } catch (e) {
    console.error('Embed error:', e);
    showToast('Network error while embedding', 'error');
  }
}

// Add stego image message to chat
function addStegoImageToChat(stegoUrl, message, opts = {}) {
  if (!chatMessagesEl) return;
  
  const showText = !!message && !opts.embedded ? true : false;
  const msgDiv = document.createElement('div');
  msgDiv.className = 'flex flex-col items-end gap-2 ml-auto max-w-[80%] transition-transform animate-message-in';
  msgDiv.innerHTML = `
    <div class="relative group">
      <div class="bg-primary-container p-1 rounded-2xl overflow-hidden shadow-2xl">
        <img alt="Stego Image" class="w-full h-64 object-cover rounded-xl" src="${stegoUrl}" data-stego-url="${stegoUrl}"/>
        <div class="absolute top-4 left-4 badge-overlay badge" aria-hidden="true">
          <span class="material-symbols-outlined text-secondary text-base" data-weight="fill">visibility_off</span>
          <span class="text-[10px] font-bold text-secondary uppercase tracking-tighter">Hidden Payload Embedded</span>
        </div>
        <div class="actions">
          <button class="px-2 py-1 text-xs rounded inspect-btn" data-url="${stegoUrl}" title="Inspect (ℹ)">ℹ</button>
          <button class="px-2 py-1 text-xs rounded extract-btn" data-url="${stegoUrl}" title="Extract (🔓)">🔓</button>
          <a class="px-2 py-1 text-xs rounded download-btn" href="${stegoUrl}" download title="Download (⬇)">⬇</a>
        </div>
      </div>
    </div>
    ${showText ? `<div class="bg-primary-container px-4 py-3 rounded-xl rounded-tr-none max-w-sm"><p class="text-on-primary-container text-sm font-medium">${message}</p></div>` : ''}
    <div class="flex items-center gap-2 text-[10px] text-outline font-label">
      <span>${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span>
      <span class="px-2 py-0.5 bg-surface-container-highest rounded-full">Encrypted (AES-256)</span>
      <span class="px-2 py-0.5 bg-surface-container-highest rounded-full">LSB</span>
    </div>
  `;
  
  chatMessagesEl.appendChild(msgDiv);
  // attach handlers for overlay buttons
  setTimeout(() => {
    msgDiv.querySelectorAll('.extract-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        // prompt for password
        const pw = prompt('Enter password (leave empty if none):','');
        extractImageUrl(btn.dataset.url, pw);
      });
    });
    msgDiv.querySelectorAll('.inspect-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        inspectImageMetadata(btn.dataset.url);
      });
    });
  }, 50);

  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

// Add regular message to chat
function addMessageToChat(type, text, time, secure = false) {
  if (!chatMessagesEl) return;
  
  const msgDiv = document.createElement('div');
  if (type === 'incoming') {
    msgDiv.className = 'flex flex-col gap-2 max-w-[70%]';
    msgDiv.innerHTML = `
      <div class="glass-bubble p-4 rounded-xl rounded-tl-none border border-outline-variant/10">
        <p class="text-on-surface text-sm leading-relaxed">${text}</p>
      </div>
      <span class="font-label text-[10px] text-outline px-1">${time} · DECRYPTED</span>
    `;
  } else {
    msgDiv.className = 'flex flex-col items-end gap-2 ml-auto max-w-[80%]';
    msgDiv.innerHTML = `
      <div class="bg-primary-container px-4 py-3 rounded-xl rounded-tr-none max-w-sm">
        <p class="text-on-primary-container text-sm font-medium">${text}</p>
      </div>
      <span class="font-label text-[10px] text-outline px-1 uppercase tracking-tighter">${time}${secure ? ' · SECURE TRANSMISSION' : ''}</span>
    `;
  }
  
  chatMessagesEl.appendChild(msgDiv);
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

// Extract/analyze hidden message from image
async function analyzeFile() {
  if (!imageUploadEl.files || !imageUploadEl.files[0]) {
    showToast('Please select an image to analyze', 'error');
    return;
  }
  
  const file = imageUploadEl.files[0];
  const fd = new FormData();
  fd.append('image', file);
  fd.append('password', 'stego123');
  
  try {
    btnAnalyzeFile.disabled = true;
    btnAnalyzeFile.innerHTML = '<div class="loading-spinner w-5 h-5"></div>';
    
    const res = await fetch('/api/extract', { method: 'POST', body: fd });
    const data = await res.json();
    
    if (data.status === 'ok') {
      addMessageToChat('incoming', 'Extracted: ' + data.message, new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}), true);
    } else {
      showToast('Extract failed: ' + (data.error || 'No hidden message found'), 'error');
    }
  } catch (e) {
    console.error('Extract error:', e);
    showToast('Network error while extracting', 'error');
  } finally {
    btnAnalyzeFile.disabled = false;
    btnAnalyzeFile.innerHTML = '<span class="material-symbols-outlined">visibility_off</span>';
  }
}

// Toggle image mode (upload vs random)
function toggleImageMode() {
  useRandomImage = !useRandomImage;
  if (useRandomImage) {
    btnAttach.title = 'Using random vault image';
    btnAttach.style.opacity = '0.7';
  } else {
    btnAttach.title = 'Attach your image';
    btnAttach.style.opacity = '1';
  }
}

// Wipe transmission history
async function wipeHistory() {
  if (!confirm('Wipe all transmission history for this channel?')) return;
  
  try {
    const chat = chats.find(c => c.id === currentChatId);
    if (chat) {
      chat.messages = [];
      chat.lastPreview = 'History wiped';
      loadMessagesForChat(chat);
      renderChatList();
    }
  } catch (e) {
    console.error('Wipe error:', e);
  }
}

// Search chats
function searchChats(query) {
  window.lastSearchQuery = query || '';
  if (!query) { renderChatList(); return; }
  const q = query.toLowerCase();
  const filtered = chats.filter(c => {
    if ((c.name || '').toLowerCase().includes(q)) return true;
    if ((c.peerEmail || '').toLowerCase().includes(q)) return true;
    if ((c.lastPreview || '').toLowerCase().includes(q)) return true;
    if (Array.isArray(c.messages) && c.messages.some(m => (m.text || '').toLowerCase().includes(q))) return true;
    return false;
  });
  const original = chats;
  chats = filtered;
  renderChatList();
  chats = original;
}

// Utility: POST JSON
async function postJson(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  return { res, data };
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
  loadChatsFromServer();
  
  // Event listeners
  btnNewChat?.addEventListener('click', createNewChat);
  btnSend?.addEventListener('click', sendMessage);
  
  // Attach popup: show options to use my image or fetch random
  const attachPopup = document.getElementById('attach-popup');
  const attachUseMy = document.getElementById('attach-use-my');
  const attachRandom = document.getElementById('attach-random');
  let coverImage = null; // File | null
  
  function showCoverThumbnail(file) {
    coverImage = file;
    const thumbEl = document.getElementById('cover-thumbnail');
    if (!thumbEl) return;
    const url = URL.createObjectURL(file);
    thumbEl.classList.remove('hidden');
    thumbEl.innerHTML = `
      <div class="flex items-center gap-3">
        <img src="${url}" alt="cover" class="w-16 h-16 rounded-md object-cover" />
        <div class="flex flex-col">
          <div class="text-sm font-semibold">Cover image ready for embedding</div>
          <div class="text-xs text-on-surface-variant">${Math.round((file.size||0)/1024)} KB</div>
          <div class="mt-2 flex gap-2">
            <button id="change-cover" class="px-2 py-1 bg-surface-container-high rounded-md text-xs">Change</button>
            <button id="remove-cover" class="px-2 py-1 bg-error rounded-md text-xs">Remove</button>
          </div>
        </div>
      </div>
    `;
    // wire actions
    setTimeout(() => {
      const btnChange = document.getElementById('change-cover');
      const btnRemove = document.getElementById('remove-cover');
      const panelCover = document.getElementById('cover-upload');
      if (btnChange) btnChange.addEventListener('click', () => (panelCover ? panelCover.click() : imageUploadEl.click()));
      if (btnRemove) btnRemove.addEventListener('click', () => {
        coverImage = null;
        imageUploadEl.value = '';
        if (imageUploadEl._fetchedFile) imageUploadEl._fetchedFile = null;
        // also clear panel cover if present
        if (panelCover) { panelCover.value = ''; panelCover._fetchedBlob = null; }
        thumbEl.classList.add('hidden');
        thumbEl.innerHTML = '';
      });
    }, 50);
  }
  
  // attach button opens small popup
  btnAttach?.addEventListener('click', (e) => {
    if (!attachPopup) return;
    attachPopup.classList.toggle('hidden');
    // prevent the main panel from toggling when using the popup
    e.stopPropagation();
  });
  
  // hide popup when clicking outside
  document.addEventListener('click', (e) => {
    if (!attachPopup) return;
    if (!attachPopup.classList.contains('hidden')) {
      const path = e.composedPath ? e.composedPath() : (e.path || []);
      if (!path.includes(attachPopup) && e.target !== btnAttach) {
        attachPopup.classList.add('hidden');
      }
    }
  });
  
  // "Use My Image" triggers file picker and opens Stealth Embed Panel
  attachUseMy?.addEventListener('click', (e) => {
    e.stopPropagation();
    attachPopup.classList.add('hidden');
    const panel = document.getElementById('stealth-panel');
    const coverUploadEl = document.getElementById('cover-upload');
    if (panel) panel.classList.remove('hidden');
    // open the cover file picker in the panel
    if (coverUploadEl) {
      coverUploadEl.click();
    } else {
      // fallback to composer image upload
      imageUploadEl.click();
    }
  });

  // "Random Image" fetches from picsum, sets as cover and opens panel
  attachRandom?.addEventListener('click', async (e) => {
    e.stopPropagation();
    attachPopup.classList.add('hidden');
    try {
      const res = await fetch('https://picsum.photos/512');
      const blob = await res.blob();
      const file = new File([blob], 'random.jpg', { type: blob.type || 'image/jpeg' });
      // prefer panel's cover input
      const coverUploadEl = document.getElementById('cover-upload');
      const coverPreviewEl = document.getElementById('cover-preview');
      const panel = document.getElementById('stealth-panel');
      if (coverUploadEl) {
        // store the fetched blob for panel submission
        coverUploadEl._fetchedBlob = blob;
      }
      // show preview inside the panel
      if (coverPreviewEl) {
        coverPreviewEl.innerHTML = '';
        const img = document.createElement('img'); img.src = URL.createObjectURL(blob); img.className='w-32 h-20 object-cover rounded-md'; coverPreviewEl.appendChild(img);
      }
      // also show composer thumbnail
      showCoverThumbnail(file);
      // open embed panel
      if (panel) panel.classList.remove('hidden');
    } catch (err) {
      console.error('Failed to fetch random image', err);
      showToast('Random image fetch failed', 'error');
    }
  });
  
  // when user picks a file from device
  imageUploadEl?.addEventListener('change', (ev) => {
    const f = imageUploadEl.files && imageUploadEl.files[0];
    if (f) {
      imageUploadEl._fetchedFile = null;
      showCoverThumbnail(f);
    }
  });
  
  btnAnalyzeFile?.addEventListener('click', analyzeFile);
  hideToggleEl?.addEventListener('change', () => {});
  searchInputEl?.addEventListener('input', (e) => searchChats(e.target.value));

  // Stealth panel controls
  const coverUploadEl = document.getElementById('cover-upload');
  const btnCoverSelect = document.getElementById('btn-cover-select');
  const btnRandomFetch = document.getElementById('btn-random-fetch');
  const coverPreviewEl = document.getElementById('cover-preview');
  const payloadUploadEl = document.getElementById('payload-upload');
  const payloadPreviewEl = document.getElementById('payload-preview');
  const decoyToggleEl = document.getElementById('decoy-toggle');
  const decoyAreaEl = document.getElementById('decoy-area');
  const btnCancelStego = document.getElementById('btn-cancel-stego');
  const btnSendStego = document.getElementById('btn-send-stego');
  const tabMyImage = document.getElementById('tab-my-image');
  const tabRandomImage = document.getElementById('tab-random-image');

  if (btnCoverSelect && coverUploadEl) {
    btnCoverSelect.addEventListener('click', (e) => { e.preventDefault(); coverUploadEl.click(); });
  }
  if (coverUploadEl) {
    coverUploadEl.addEventListener('change', (e) => {
      const f = coverUploadEl.files && coverUploadEl.files[0];
      if (!f) return;
      // ensure the fetchedBlob is cleared if user picked their own file
      coverUploadEl._fetchedBlob = null;
      coverPreviewEl.innerHTML = '';
      if (f.type && f.type.startsWith('image/')) {
        const img = document.createElement('img'); img.src = URL.createObjectURL(f); img.className='w-32 h-20 object-cover rounded-md'; coverPreviewEl.appendChild(img);
      } else {
        coverPreviewEl.textContent = f.name + ' (' + Math.round(f.size/1024) + ' KB)';
      }
      // also show composer thumbnail for quick feedback
      showCoverThumbnail(f);
    });
  }
  if (payloadUploadEl) {
    payloadUploadEl.addEventListener('change', (e) => {
      const f = payloadUploadEl.files && payloadUploadEl.files[0];
      if (!f) { payloadPreviewEl.textContent = ''; return; }
      payloadPreviewEl.textContent = f.name + ' (' + Math.round(f.size/1024) + ' KB)';
    });
  }
  if (decoyToggleEl && decoyAreaEl) {
    decoyToggleEl.addEventListener('change', () => { decoyAreaEl.classList.toggle('hidden', !decoyToggleEl.checked); });
  }
  if (btnCancelStego) btnCancelStego.addEventListener('click', (e) => { e.preventDefault(); document.getElementById('stealth-panel').classList.add('hidden'); });

  if (btnRandomFetch) {
    btnRandomFetch.addEventListener('click', async (e) => {
      e.preventDefault();
      btnRandomFetch.disabled = true; btnRandomFetch.textContent = 'Fetching...';
      try {
        const r = await fetch('https://picsum.photos/512');
        const blob = await r.blob();
        // show preview
        coverPreviewEl.innerHTML = '';
        const img = document.createElement('img'); img.src = URL.createObjectURL(blob); img.className='w-32 h-20 object-cover rounded-md'; coverPreviewEl.appendChild(img);
        // store blob temporarily on element
        coverUploadEl._fetchedBlob = blob;
      } catch (err) { showToast('Failed to fetch random image', 'error'); }
      btnRandomFetch.disabled = false; btnRandomFetch.textContent = 'Fetch Random';
    });
  }

  if (btnSendStego) {
    btnSendStego.addEventListener('click', async (e) => {
      e.preventDefault();
      // perform validation
      const panel = document.getElementById('stealth-panel');
      const coverFile = coverUploadEl && (coverUploadEl.files && coverUploadEl.files[0]);
      const fetched = coverUploadEl && coverUploadEl._fetchedBlob;
      const payloadFile = payloadUploadEl && (payloadUploadEl.files && payloadUploadEl.files[0]);
      const msg = (document.getElementById('stego-message')?.value || '').trim();
      const password = document.getElementById('stego-password')?.value || '';
      const decoyOn = decoyToggleEl && decoyToggleEl.checked;
      const decoyPassword = document.getElementById('decoy-password')?.value || '';
      const decoyMessage = document.getElementById('decoy-message')?.value || '';
      const selfDestruct = document.getElementById('self-destruct')?.checked;

      if (!coverFile && !fetched) { showToast('Stealth mode requires a cover file', 'error'); return; }
      if (!msg && !payloadFile) { showToast('Stealth mode requires a cover file and message or payload', 'error'); return; }

      // show loading
      const statusEl = document.getElementById('stego-status'); statusEl.textContent = 'Embedding data...'; btnSendStego.disabled = true;

      const fd = new FormData();
      if (fetched) fd.append('image', fetched, 'random.jpg');
      else if (coverFile) fd.append('image', coverFile);
      if (payloadFile) fd.append('payload', payloadFile);
      fd.append('message', msg || ' ');
      if (password) fd.append('password', password);
      if (decoyOn) { if (decoyPassword) fd.append('decoy_password', decoyPassword); if (decoyMessage) fd.append('decoy_message', decoyMessage); }
      if (selfDestruct) fd.append('self_destruct','1');

      try {
        const res = await fetch('/api/embed', { method: 'POST', body: fd });
        const data = await res.json();
        if (data.status === 'ok') {
          // add stego message (image only)
          addStegoImageToChat(data.stego_url, null, { embedded: true });
          // update chat preview to avoid plaintext leakage
          const chat = chats.find(c => c.id === currentChatId);
          if (chat) { chat.lastPreview = '🔐 Hidden message'; renderChatList(); }
          // clear inputs
          document.getElementById('stego-message').value = '';
          if (coverUploadEl) coverUploadEl.value = '';
          if (payloadUploadEl) payloadUploadEl.value = '';
          coverUploadEl._fetchedBlob = null;
          document.getElementById('stealth-panel').classList.add('hidden');
          statusEl.textContent = 'Embedded and sent ✓';
          setTimeout(()=> statusEl.textContent = '', 2000);
        } else {
          showToast('Embed failed: ' + (data.error || 'Unknown error'), 'error');
        }
      } catch (err) {
        console.error('embed panel error', err); showToast('Network error while embedding', 'error');
      } finally {
        btnSendStego.disabled = false; statusEl.textContent = '';
      }
    });
  }

  if (tabMyImage && tabRandomImage) {
    tabMyImage.addEventListener('click', () => { tabMyImage.classList.add('bg-primary/10'); tabRandomImage.classList.remove('bg-primary/10'); });
    tabRandomImage.addEventListener('click', () => { tabRandomImage.classList.add('bg-primary/10'); tabMyImage.classList.remove('bg-primary/10'); });
  }
  
  // Enter to send: hook stego-message when composer input is not present
  const stegoMsgEl = document.getElementById('stego-message');
  if (messageInputEl) {
    messageInputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
  } else if (stegoMsgEl) {
    stegoMsgEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); document.getElementById('btn-send-stego')?.click(); }
    });
  }
  
  // Navigation
  document.getElementById('nav-chat')?.addEventListener('click', (e) => { e.preventDefault(); });
  document.getElementById('nav-embed')?.addEventListener('click', () => { window.location.href = '/embed'; });
  document.getElementById('nav-extract')?.addEventListener('click', () => { window.location.href = '/extract'; });
  document.getElementById('nav-settings')?.addEventListener('click', () => { window.location.href = '/settings'; });
  
  // Mobile nav
  document.getElementById('mobile-nav-chat')?.addEventListener('click', (e) => { e.preventDefault(); });
  document.getElementById('mobile-nav-embed')?.addEventListener('click', () => { window.location.href = '/embed'; });
  document.getElementById('mobile-nav-extract')?.addEventListener('click', () => { window.location.href = '/extract'; });
  document.getElementById('mobile-nav-settings')?.addEventListener('click', () => { window.location.href = '/settings'; });
  
  // Wipe history
  document.getElementById('btn-wipe-history')?.addEventListener('click', wipeHistory);
  
  // Load shared files demo
  if (sharedFilesEl) {
    sharedFilesEl.innerHTML = `
      <div class="aspect-square bg-surface-container rounded-lg overflow-hidden cursor-pointer hover:opacity-80 transition-opacity border border-outline-variant/10">
        <img alt="Shared 1" class="w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBH66N1wt_NKLX5-CvCy8_9zHv3X1Iu8kIn5AlhNE90GhT5yO4VZVrnp0lMgtXZwDj2l6Y_GKGq6wtZAYRw6PUp8cdfE9CrUEM6qmAa2JxczISRtsci07yWmQ1PFX69BI0_V1CiFIUuRXw4CHlMVSuqTg6kANnGAyaN5RFIxKdykveML7bV797cqu0Z3msuHSEIFUbjqSvMdapZhFF96N3i4INqdMiiZ1CszyuZDsRf4PcmmOAw_Q28IH1EVoIrysfd1HxDgYL4_g"/>
      </div>
      <div class="aspect-square bg-surface-container rounded-lg overflow-hidden cursor-pointer hover:opacity-80 transition-opacity border border-outline-variant/10">
        <img alt="Shared 2" class="w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDOjvjcCAc22S1kUxJc5M5nIH7lX89S5zdQId4Y51VZBLx4VX3YaKR7uXOaEM6Zm8sMIAb4DgOCrSqpaKI_6lWnAX2Dos8Jq_V4dTkSOmg_pWbCRkBWxBw6pbMJ3HYFq5qh6FpNtmg0gzBR7nrocses9jHLHGdYuFeukKkVfQ-gEg2A7vadASdOe1h94wGX6G3UjKUgtFt4hBJOhTPSQMOl3qMx6ORIGJiDIuPHF4P50xk1ysolc0FCPNVx_2gugNc7MBH"/>
      </div>
      <div class="aspect-square bg-surface-container rounded-lg flex items-center justify-center text-outline text-[10px] font-bold border border-outline-variant/10">+12</div>
    `;
  }

  // wire modal close button
  document.getElementById('modal-close')?.addEventListener('click', () => closeModal());
  document.getElementById('extract-modal')?.addEventListener('click', (e) => { if (e.target && e.target.id === 'extract-modal') closeModal(); });
});

// Global CTA click handler (handles dynamically-inserted CTAs)
document.addEventListener('click', (e) => {
  try {
    const el = e.target;
    if (!el) return;
    if (el.id === 'start-secure-convo' || el.id === 'start-secure-convo-cta' || (el.closest && (el.closest('#start-secure-convo') || el.closest('#start-secure-convo-cta')))) {
      createNewChat();
    }
  } catch (err) {
    console.error('CTA click handler error', err);
  }
});

// Drag & drop support for composer (file attach)
(() => {
  const composerArea = document.querySelector('footer') || document.querySelector('main');
  if (!composerArea) return;
  composerArea.addEventListener('dragover', (e) => { e.preventDefault(); composerArea.classList?.add('drag-over'); });
  composerArea.addEventListener('dragleave', (e) => { composerArea.classList?.remove('drag-over'); });
  composerArea.addEventListener('drop', async (e) => {
    e.preventDefault();
    composerArea.classList?.remove('drag-over');
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    if (file.size > 500 * 1024 * 1024) { showToast('File too large (max 500MB)', 'error'); return; }
    // set file into the hidden input
    try {
      const dt = new DataTransfer();
      dt.items.add(file);
      imageUploadEl.files = dt.files;
      showFilePreview(file);
    } catch (err) {
      console.warn('Could not set file input programmatically', err);
      // fallback: store preview only
      showFilePreview(file);
    }
  });

  // Helper to show file preview in composer
  window.showFilePreview = function(file) {
    let preview = document.getElementById('file-preview');
    if (!preview) {
      const composerRow = document.querySelector('.max-w-4xl') || document.querySelector('.composer') || document.querySelector('footer');
      preview = document.createElement('div');
      preview.id = 'file-preview';
      preview.className = 'mr-3 flex items-center gap-2';
      composerRow?.insertBefore(preview, composerRow.firstChild);
    }
    preview.innerHTML = '';
    if (file.type && file.type.startsWith('image/')) {
      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      img.className = 'w-20 h-20 object-cover rounded-md border border-outline-variant/10';
      preview.appendChild(img);
    } else {
      const f = document.createElement('div');
      f.className = 'w-20 h-20 flex items-center justify-center bg-surface-container-high rounded-md text-xs p-2 border border-outline-variant/10';
      f.textContent = file.name;
      preview.appendChild(f);
    }
  };
})();
