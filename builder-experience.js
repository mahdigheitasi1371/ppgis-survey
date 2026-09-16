// Builder UX enhancements: ordered question library, appearance controls, and explicit settings actions.
(function () {
  if (typeof GROUPS === 'undefined' || typeof state === 'undefined') return;

  const orderedGroups = {
    'Write & enter information': [
      ['short_text', 'Short text'],
      ['long_text', 'Long text'],
      ['number', 'Number'],
      ['email', 'Email'],
      ['phone', 'Phone']
    ],
    'Choose & rate': [
      ['yes_no', 'Yes / No'],
      ['single_choice', 'Single choice'],
      ['multiple_choice', 'Multiple choice'],
      ['dropdown', 'Dropdown'],
      ['rating', 'Rating scale'],
      ['slider', 'Slider'],
      ['matrix', 'Matrix / Likert']
    ],
    'Date & time': [
      ['date', 'Date'],
      ['time', 'Time'],
      ['datetime', 'Date & time']
    ],
    'Map & location': [
      ['map_multi', 'Point map'],
      ['map_line', 'Line map'],
      ['map_polygon', 'Polygon map']
    ],
    'Photos, media & files': [
      ['photo', 'Photo'],
      ['photos', 'Multiple photos'],
      ['audio', 'Voice recording'],
      ['video', 'Video recording'],
      ['file', 'File upload'],
      ['signature', 'Signature']
    ],
    'Priorities & trade-offs': [
      ['ranking', 'Rank order'],
      ['allocation', 'Resource allocation']
    ],
    'Content & consent': [
      ['info', 'Information text'],
      ['section', 'Section heading'],
      ['consent', 'Consent checkbox']
    ]
  };

  Object.keys(GROUPS).forEach(key => delete GROUPS[key]);
  Object.assign(GROUPS, orderedGroups);
  LABEL.map_multi = 'Point map';
  LABEL.map_line = 'Line map';
  LABEL.map_polygon = 'Polygon map';

  state.settings = state.settings || {};
  if (!state.settings.backgroundColor) state.settings.backgroundColor = '#f5f7f4';
  if (state.settings.backgroundImage === undefined) state.settings.backgroundImage = '';
  if (state.settings.backgroundOverlay === undefined) state.settings.backgroundOverlay = 0.18;

  function refreshLivePreview() {
    try {
      const title = document.getElementById('surveyTitle');
      const description = document.getElementById('surveyDescription');
      if (title) state.title = title.value;
      if (description) state.description = description.value;
      localStorage.setItem('survey-builder-preview', JSON.stringify(state));
      const frame = document.getElementById('livePreviewFrame');
      if (frame) frame.src = `survey.html?preview=local&embed=1&t=${Date.now()}`;
    } catch (_) {}
  }

  function closeInspector() {
    const inspector = document.getElementById('inspector');
    inspector?.classList.remove('open');
  }

  const baseRenderSettings = renderSettings;
  renderSettings = function () {
    const s = state.settings || (state.settings = {});
    const base = baseRenderSettings();
    const imagePreview = s.backgroundImage
      ? `<div class="background-preview" style="background-image:url('${s.backgroundImage.replace(/'/g, '%27')}')"></div>`
      : '<div class="background-preview background-preview-empty">No background image</div>';
    return `${base}
      <div class="inspector-section appearance-settings">
        <div class="panel-title">Survey appearance</div>
        ${f('Background color', `<input id="backgroundColor" type="color" value="${s.backgroundColor || '#f5f7f4'}">`, 'Used behind the respondent experience when no image is set.')}
        ${imagePreview}
        ${f('Background image', '<input id="backgroundImage" type="file" accept="image/*">', 'Optional. Recommended under 1.5 MB for the preview version.')}
        ${f('Image overlay', `<input id="backgroundOverlay" type="range" min="0" max="0.7" step="0.05" value="${Number(s.backgroundOverlay ?? 0.18)}">`, 'Controls how strongly the image is softened so questions remain readable.')}
        <button class="btn btn-sm" id="removeBackground" type="button" ${s.backgroundImage ? '' : 'disabled'}>Remove background image</button>
      </div>
      <div class="settings-actions">
        <button class="btn" id="closeSettings" type="button">Close</button>
        <button class="btn btn-primary" id="saveCloseSettings" type="button">Save & close</button>
      </div>`;
  };

  const baseWireSettings = wireSettings;
  wireSettings = function () {
    baseWireSettings();
    const s = state.settings || (state.settings = {});
    const color = document.getElementById('backgroundColor');
    const image = document.getElementById('backgroundImage');
    const overlay = document.getElementById('backgroundOverlay');
    const remove = document.getElementById('removeBackground');

    color?.addEventListener('input', e => {
      s.backgroundColor = e.target.value;
      refreshLivePreview();
    });
    overlay?.addEventListener('input', e => {
      s.backgroundOverlay = Math.min(0.7, Math.max(0, Number(e.target.value) || 0));
      refreshLivePreview();
    });
    image?.addEventListener('change', e => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 1500000) {
        alert('Please choose a background image under 1.5 MB for this preview version.');
        e.target.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        s.backgroundImage = reader.result;
        renderInspector();
        document.getElementById('inspector')?.classList.add('open');
        refreshLivePreview();
      };
      reader.readAsDataURL(file);
    });
    remove?.addEventListener('click', () => {
      s.backgroundImage = '';
      renderInspector();
      document.getElementById('inspector')?.classList.add('open');
      refreshLivePreview();
    });

    document.getElementById('closeSettings')?.addEventListener('click', closeInspector);
    document.getElementById('saveCloseSettings')?.addEventListener('click', async () => {
      const button = document.getElementById('saveCloseSettings');
      if (button) {
        button.disabled = true;
        button.textContent = 'Saving…';
      }
      const ok = await save(true);
      if (ok) closeInspector();
      else if (button) {
        button.disabled = false;
        button.textContent = 'Save & close';
      }
    });
  };

  renderPalette();
  renderInspector();
  refreshLivePreview();
})();
