// Voice messages for open-text questions (question.config.allowVoice).
// Participants can type, record a voice message, or both. Recordings are uploaded with the
// same media endpoint as the voice-recording question and stored under the answer key
// "<questionId>__voice" as [{token, name, content_type, size}].
// A required question counts as answered when it has text or a voice message; if only a
// voice message exists, the text answer is stored as "[voice message]" so required checks
// and the CSV export stay consistent.
(function () {
  'use strict';
  const VOICE_MARK = '[voice message]';
  const TEXT_TYPES = new Set(['long_text', 'short_text']);
  const TEXT = {
    en: {record: '🎤 Record a voice message', stop: '■ Stop recording', play: 'Listen', remove: 'Remove',
      hint: 'You can type your answer, record a voice message, or both.', recording: 'Recording… {s} s',
      uploading: 'Saving your voice message…', saved: 'Voice message saved.', failed: 'The voice message could not be saved. Please try again.',
      noMic: 'Your browser does not allow microphone access. Please type your answer instead.', preview: 'Voice messages are disabled in preview mode.',
      item: 'Voice message {n}', max: 'Maximum length reached.'},
    de: {record: '🎤 Sprachnachricht aufnehmen', stop: '■ Aufnahme beenden', play: 'Anhören', remove: 'Entfernen',
      hint: 'Sie können Ihre Antwort schreiben, eine Sprachnachricht aufnehmen oder beides.', recording: 'Aufnahme läuft… {s} s',
      uploading: 'Sprachnachricht wird gespeichert…', saved: 'Sprachnachricht gespeichert.', failed: 'Die Sprachnachricht konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.',
      noMic: 'Ihr Browser erlaubt keinen Mikrofonzugriff. Bitte schreiben Sie Ihre Antwort.', preview: 'Sprachnachrichten sind in der Vorschau deaktiviert.',
      item: 'Sprachnachricht {n}', max: 'Maximale Länge erreicht.'}
  };
  function tr(key, vars) {
    const lang = String(window.SurveyLanguage?.get?.() || document.documentElement.lang || 'en').slice(0, 2);
    let s = (TEXT[lang] || TEXT.en)[key] || TEXT.en[key] || key;
    Object.entries(vars || {}).forEach(([k, v]) => { s = s.replaceAll(`{${k}}`, v); });
    return s;
  }
  const voiceKey = id => `${id}__voice`;
  const localUrls = new Map(); // token -> blob URL of recordings made in this visit (for playback)

  // ctx: {ans, set(id, value), api, slug, preview}
  function enhance(q, element, ctx) {
    if (!TEXT_TYPES.has(q.type) || !q.config?.allowVoice) return element;
    const slot = element.querySelector('.answer-slot') || element;
    const field = slot.querySelector('textarea, input');
    if (field && field.value === VOICE_MARK) field.value = '';
    const box = document.createElement('div');
    box.className = 'voice-box';
    box.innerHTML = `<p class="voice-hint">${tr('hint')}</p>
      <div class="voice-row"><button type="button" class="btn voice-rec" data-voice-rec>${tr('record')}</button><span class="voice-status" data-voice-status aria-live="polite"></span></div>
      <div class="voice-list" data-voice-list></div>`;
    slot.appendChild(box);
    const status = box.querySelector('[data-voice-status]');
    const recBtn = box.querySelector('[data-voice-rec]');
    const maxSeconds = Math.max(10, Math.min(600, Number(q.config?.maxVoiceSeconds) || 180));

    const list = () => (Array.isArray(ctx.ans[voiceKey(q.id)]) ? ctx.ans[voiceKey(q.id)] : []);
    function syncText() {
      const text = String(ctx.ans[q.id] ?? '');
      if (list().length && !text.trim()) ctx.set(q.id, VOICE_MARK);
      if (!list().length && text === VOICE_MARK) ctx.set(q.id, '');
    }
    function draw() {
      const host = box.querySelector('[data-voice-list]');
      host.innerHTML = '';
      list().forEach((item, i) => {
        const row = document.createElement('div');
        row.className = 'voice-item';
        const url = localUrls.get(item.token);
        row.innerHTML = `<span class="voice-name">${tr('item', {n: i + 1})}</span>${url ? `<audio controls preload="none" src="${url}"></audio>` : ''}<button type="button" class="btn btn-sm" data-voice-remove="${i}">${tr('remove')}</button>`;
        host.appendChild(row);
      });
      host.querySelectorAll('[data-voice-remove]').forEach(b => b.addEventListener('click', () => {
        const next = list().filter((_, i) => i !== Number(b.dataset.voiceRemove));
        ctx.set(voiceKey(q.id), next.length ? next : null);
        syncText(); draw();
      }));
    }

    field?.addEventListener('input', () => setTimeout(syncText, 0));
    field?.addEventListener('blur', syncText);

    if (ctx.preview) { recBtn.disabled = true; status.textContent = tr('preview'); draw(); return element; }

    let recorder = null, stream = null, chunks = [], timer = null, started = 0;
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { status.textContent = tr('noMic'); return; }
      try { stream = await navigator.mediaDevices.getUserMedia({audio: true}); }
      catch (_) { status.textContent = tr('noMic'); return; }
      chunks = [];
      recorder = new MediaRecorder(stream);
      recorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      recorder.onstop = save;
      recorder.start();
      started = Date.now();
      recBtn.textContent = tr('stop');
      recBtn.classList.add('recording');
      timer = setInterval(() => {
        const s = Math.round((Date.now() - started) / 1000);
        status.textContent = tr('recording', {s});
        if (s >= maxSeconds) { status.textContent = tr('max'); stop(); }
      }, 500);
    }
    function stop() {
      clearInterval(timer);
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      stream?.getTracks().forEach(t => t.stop());
      recBtn.textContent = tr('record');
      recBtn.classList.remove('recording');
    }
    async function save() {
      const type = recorder?.mimeType || 'audio/webm';
      const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
      const blob = new Blob(chunks, {type});
      recorder = null;
      if (!blob.size) return;
      status.textContent = tr('uploading');
      recBtn.disabled = true;
      try {
        const form = new FormData();
        form.append('file', new File([blob], `voice-message.${ext}`, {type}), `voice-message.${ext}`);
        const r = await fetch(`${ctx.api}/api/surveys/${encodeURIComponent(ctx.slug)}/media?question_id=${encodeURIComponent(q.id)}`, {method: 'POST', body: form});
        if (!r.ok) throw new Error('upload');
        const info = await r.json();
        localUrls.set(info.token, URL.createObjectURL(blob));
        ctx.set(voiceKey(q.id), [...list(), info]);
        syncText();
        status.textContent = tr('saved');
        const err = element.querySelector('[data-error]'); if (err) err.textContent = '';
        draw();
      } catch (_) {
        status.textContent = tr('failed');
      } finally {
        recBtn.disabled = false;
      }
    }
    recBtn.addEventListener('click', () => (recorder ? stop() : start()));
    draw();
    return element;
  }

  window.PPGISVoice = {enhance, VOICE_MARK, voiceKey};
})();
