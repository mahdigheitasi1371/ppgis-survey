'use strict';

const API = location.protocol === 'file:' ? 'http://localhost:8000' : location.origin;
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const uid = () => `q_${(crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)).replaceAll('-', '').slice(0, 10)}`;

const GROUPS = {
  'Write & enter information': [
    ['short_text','Short text'],['long_text','Open text'],['number','Number'],['email','Email'],['phone','Phone']
  ],
  'Choose & rate': [
    ['yes_no','Yes / No'],['single_choice','Single choice'],['multiple_choice','Multiple choice'],['photo_choice','Photo choice'],['dropdown','Dropdown'],['rating','Rating scale'],['slider','Slider'],['matrix','Matrix / Likert']
  ],
  'Date & time': [['date','Date'],['time','Time'],['datetime','Date & time']],
  'Map & location': [['map_multi','Point map'],['map_line','Line map'],['map_polygon','Polygon map']],
  'Photos, media & files': [['photo','Photo'],['photos','Multiple photos'],['audio','Voice recording'],['video','Video recording'],['file','File upload'],['signature','Signature']],
  'Priorities & trade-offs': [['ranking','Rank order'],['allocation','Resource allocation']],
  'Content & consent': [['info','Information text'],['section','Section heading'],['consent','Consent checkbox']]
};
const LABEL = Object.fromEntries(Object.values(GROUPS).flat());
const OPTS = new Set(['single_choice','multiple_choice','photo_choice','dropdown','ranking','allocation']);
const PHOTO_CHOICE_TYPES = new Set(['photo_choice']);
const LANGUAGE_CATALOG = [
  ['en','English'],['de','Deutsch'],['fr','Français'],['es','Español'],['it','Italiano'],['nl','Nederlands'],['pl','Polski'],['pt','Português'],['tr','Türkçe'],['ar','العربية'],['uk','Українська'],['ru','Русский'],['fa','فارسی'],['zh','中文'],['ja','日本語']
];

let state = {
  id:null, slug:null, status:'draft', title:'Untitled survey', description:'', questions:[],
  settings:{logo:'',logos:[],customDomain:'',primaryColor:'#2f6f5e',backgroundColor:'#f5f7f4',backgroundImage:'',backgroundOverlay:0.18,defaultLanguage:'en',languages:[{code:'en',name:'English'}],thankYou:'Thank you for your response.',showProgress:true,allowDrafts:true},
  translations:{}
};
let selectedId = null;

// Safe wrapper around localStorage: some deployment/preview environments run
// this page in a sandboxed context where localStorage throws instead of
// working (SecurityError on an opaque origin). Without this guard, the very
// first line below would crash before anything else on the page could run,
// leaving the builder blank with no error message.
const safeStorage = (() => {
  const mem = new Map();
  let ok = false;
  try { localStorage.setItem('__probe__', '1'); localStorage.removeItem('__probe__'); ok = true; } catch (_) {}
  return {
    getItem(k) { try { return ok ? localStorage.getItem(k) : (mem.has(k) ? mem.get(k) : null); } catch (_) { return mem.has(k) ? mem.get(k) : null; } },
    setItem(k, v) { try { if (ok) { localStorage.setItem(k, v); return; } } catch (_) {} mem.set(k, v); },
    removeItem(k) { try { if (ok) { localStorage.removeItem(k); return; } } catch (_) {} mem.delete(k); }
  };
})();

let adminKey = safeStorage.getItem('survey-admin-key') || '';
let saveStatusTimer = null;

function esc(value='') { const div=document.createElement('div'); div.textContent=String(value); return div.innerHTML; }
function escAttr(value='') { return esc(value).replaceAll('`','&#96;'); }
function languageName(code){ return LANGUAGE_CATALOG.find(([c])=>c===code)?.[1] || code.toUpperCase(); }
function normalizeState(){
  state.settings ||= {};
  state.settings.defaultLanguage ||= 'en';
  if(!Array.isArray(state.settings.logos)) state.settings.logos=state.settings.logo?[state.settings.logo]:[];
  state.settings.backgroundColor ||= '#f5f7f4';
  state.settings.backgroundImage ||= '';
  if(typeof state.settings.backgroundOverlay!=='number') state.settings.backgroundOverlay=0.18;
  if(!Array.isArray(state.settings.languages) || !state.settings.languages.length){
    state.settings.languages=[{code:state.settings.defaultLanguage,name:languageName(state.settings.defaultLanguage)}];
  }
  state.settings.languages=state.settings.languages.map(item=>typeof item==='string'?{code:item,name:languageName(item)}:item).filter(x=>x?.code);
  if(!state.settings.languages.some(x=>x.code===state.settings.defaultLanguage)) state.settings.languages.unshift({code:state.settings.defaultLanguage,name:languageName(state.settings.defaultLanguage)});
  state.translations ||= {};
}
function ensureTranslation(code){
  state.translations[code] ||= {survey:{},questions:{}};
  state.translations[code].survey ||= {};
  state.translations[code].questions ||= {};
  return state.translations[code];
}
function ensureQuestionTranslation(code,qid){
  const root=ensureTranslation(code);
  root.questions[qid] ||= {};
  return root.questions[qid];
}
function requireAdminKeyAsync(){
  if(adminKey) return Promise.resolve(adminKey);
  lockSite('Your admin session expired. Enter the admin key again to continue.');
  return Promise.resolve('');
}
async function headersAsync(json=true){ const key=await requireAdminKeyAsync(); const h={'X-Admin-Key':key}; if(json) h['Content-Type']='application/json'; return h; }

// --- Site-wide admin key gate: the whole builder is unusable until a valid
// admin key is provided, so no survey can be created or edited without it.
function lockSite(msg='', clearKey=true){
  if(clearKey){ adminKey=''; safeStorage.removeItem('survey-admin-key'); }
  document.body.classList.add('locked');
  const errorEl=$('#siteGateError'), input=$('#siteGateInput');
  if(errorEl){ if(msg){ errorEl.textContent=msg; errorEl.style.display='block'; } else errorEl.style.display='none'; }
  if(input){ input.value=''; setTimeout(()=>input.focus(),0); }
}
function unlockSite(){ document.body.classList.remove('locked'); }
async function attemptSiteUnlock(){
  const input=$('#siteGateInput'), btn=$('#siteGateContinue'), errorEl=$('#siteGateError');
  const value=(input.value||'').trim();
  if(!value){ errorEl.textContent='Enter the admin key to continue.'; errorEl.style.display='block'; return; }
  btn.disabled=true; btn.textContent='Checking…';
  try{
    const response=await fetch(`${API}/api/builder/auth-check`,{headers:{'X-Admin-Key':value}});
    if(response.status===403){ errorEl.textContent='Admin key not accepted.'; errorEl.style.display='block'; return; }
    if(!response.ok){ errorEl.textContent='Could not connect to the survey server.'; errorEl.style.display='block'; return; }
    adminKey=value; safeStorage.setItem('survey-admin-key',adminKey);
    unlockSite();
    renderPalette(); render(); load();
  }catch(_){
    errorEl.textContent='Could not connect to the survey server.'; errorEl.style.display='block';
  }finally{
    btn.disabled=false; btn.textContent='Continue';
  }
}
$('#siteGateContinue').addEventListener('click',attemptSiteUnlock);
$('#siteGateInput').addEventListener('keydown',event=>{ if(event.key==='Enter') attemptSiteUnlock(); });
function setSaveState(text){
  const el=$('#saveState'); if(el) el.textContent=text;
  clearTimeout(saveStatusTimer); if(text) saveStatusTimer=setTimeout(()=>{if(el)el.textContent='';},3000);
}

function newQuestion(type){
  const q={id:uid(),type,title:LABEL[type]||'Question',description:'',required:false,config:{},logic:null};
  if(OPTS.has(type)) q.config.options=['Option 1','Option 2','Option 3'];
  if(type==='photo_choice'){ q.config.optionImages=['','','']; q.config.multiple=false; }
  if(type==='rating') Object.assign(q.config,{min:1,max:5,minLabel:'Low',maxLabel:'High'});
  if(type==='slider') Object.assign(q.config,{min:0,max:100,step:1});
  if(type==='matrix') Object.assign(q.config,{rows:['Statement 1','Statement 2'],columns:['Strongly disagree','Disagree','Neutral','Agree','Strongly agree']});
  if(type==='map_multi') Object.assign(q.config,{lat:51.5136,lng:7.4653,zoom:12,maxPoints:1,allowGeo:true,allowCitySearch:true,mapPage:true,popup:{enabled:false,type:'single_choice',question:'Tell us more about this place',options:['Positive','Neutral','Negative']}});
  if(type==='map_line') Object.assign(q.config,{lat:51.5136,lng:7.4653,zoom:12,maxFeatures:10,maxVertices:30,allowGeo:true,allowCitySearch:true,mapPage:true,popup:{enabled:false,type:'single_choice',question:'Tell us more about this vertex',options:['Positive','Neutral','Negative']}});
  if(type==='map_polygon') Object.assign(q.config,{lat:51.5136,lng:7.4653,zoom:12,maxFeatures:10,maxVertices:30,allowGeo:true,allowCitySearch:true,mapPage:true,popup:{enabled:false,type:'single_choice',question:'Tell us more about this vertex',options:['Positive','Neutral','Negative']}});
  if(type==='photo') q.config.maxFiles=1;
  if(type==='photos') q.config.maxFiles=8;
  if(type==='file') q.config.maxFiles=3;
  if(type==='audio'||type==='video') Object.assign(q.config,{allowRecord:true,allowUpload:true,maxDuration:type==='audio'?300:180});
  if(type==='allocation') Object.assign(q.config,{total:100,unit:'points'});
  if(type==='consent') q.config.checkboxLabel='I agree';
  return q;
}

function renderPalette(){
  const palette=$('#palette');
  palette.innerHTML=Object.entries(GROUPS).map(([group,items])=>`<section class="group-block"><div class="group-title">${esc(group)}</div><div class="question-type-grid">${items.map(([type,label])=>`<button type="button" class="qtype-btn" data-add-type="${type}"><span class="qtype-icon">＋</span><span>${esc(label)}</span></button>`).join('')}</div></section>`).join('');
}

function questionPreview(q){
  const c=q.config||{};
  if(q.type==='photo_choice') return `${(c.options||[]).length} photo option(s)`;
  if(OPTS.has(q.type)) return (c.options||[]).join(' · ');
  if(q.type==='matrix') return `${(c.rows||[]).length} rows × ${(c.columns||[]).length} choices`;
  if(q.type==='map_multi') return `Point map · max ${c.maxPoints||1}`;
  if(q.type==='map_line') return `Line map · ${c.maxFeatures||10} lines · ${c.maxVertices||30} vertices each`;
  if(q.type==='map_polygon') return `Polygon map · ${c.maxFeatures||10} polygons · ${c.maxVertices||30} vertices each`;
  if(['photo','photos','audio','video','file','signature'].includes(q.type)) return 'Media response';
  if(q.type==='rating') return `${c.min||1}–${c.max||5} scale`;
  if(q.type==='allocation') return `Allocate ${c.total||100} ${c.unit||'points'}`;
  return q.description||'Answer field';
}

function field(label,html,help=''){ return `<label class="field"><span>${esc(label)}</span>${html}${help?`<small class="small-help">${esc(help)}</small>`:''}</label>`; }
function textInput(id,value=''){ return `<input id="${id}" type="text" value="${escAttr(value)}">`; }
function choiceEditor(q){ return `<div id="choiceEditor">${(q.config.options||[]).map((opt,i)=>`<div class="choice-row"><input data-choice-index="${i}" value="${escAttr(opt)}"><button class="btn small" type="button" data-remove-choice="${i}">×</button></div>`).join('')}</div><button class="btn small" type="button" id="addChoice">+ Add option</button>`; }
function photoChoiceEditor(q){
  const c=q.config||{}; const opts=c.options||[]; const imgs=c.optionImages||[];
  return `<div id="photoChoiceEditor">${opts.map((opt,i)=>{
    const img=imgs[i]||'';
    return `<div class="photo-choice-row" data-photo-index="${i}">
      <div class="photo-choice-thumb ${img?'':'photo-choice-thumb-empty'}" ${img?`style="background-image:url('${img.replace(/'/g,'%27')}')"`:''}>${img?'':'No photo'}</div>
      <div class="photo-choice-fields">
        <input data-photo-choice-index="${i}" value="${escAttr(opt)}" placeholder="Label (optional)">
        <input type="file" accept="image/*" data-photo-choice-file="${i}">
      </div>
      <button class="btn small" type="button" data-remove-photo-choice="${i}">×</button>
    </div>`;
  }).join('')}</div><button class="btn small" type="button" id="addPhotoChoice">+ Add photo option</button><label class="check"><input id="photoChoiceMultiple_${q.id}" type="checkbox" ${c.multiple?'checked':''}><span>Allow selecting multiple photos</span></label>`;
}
function mapSettings(q){
  const c=q.config||{}; const isPoint=q.type==='map_multi'; const isPolygon=q.type==='map_polygon';
  return `<div class="field-section"><h4>Map configuration</h4>${isPoint?field('Maximum points',`<input id="maxPoints" type="number" min="1" max="50" value="${Number(c.maxPoints)||1}">`):`${field(`Maximum ${isPolygon?'polygons':'lines'}`,`<input id="maxFeatures" type="number" min="1" max="50" value="${Number(c.maxFeatures)||10}">`)}${field('Maximum vertices per feature',`<input id="maxVertices" type="number" min="${isPolygon?3:2}" max="100" value="${Number(c.maxVertices)||30}">`)}`}<div class="field-row">${field('Latitude',`<input id="lat" type="number" step=".0001" value="${Number(c.lat)||51.5136}">`)}${field('Longitude',`<input id="lng" type="number" step=".0001" value="${Number(c.lng)||7.4653}">`)}</div>${field('Zoom',`<input id="zoom" type="number" min="3" max="19" value="${Number(c.zoom)||12}">`)}<label class="check"><input id="allowGeo" type="checkbox" ${c.allowGeo!==false?'checked':''}><span>Offer "Use my location"</span></label><label class="check"><input id="allowCitySearch" type="checkbox" ${c.allowCitySearch!==false?'checked':''}><span>Offer city/place search</span></label></div>${popupSettings(q)}`;
}
function popupSettings(q){
  const c=q.config||{}; const p=c.popup||{}; const enabled=!!p.enabled; const ptype=p.type||'single_choice';
  const unitLabel=q.type==='map_multi'?'point':'vertex';
  return `<div class="field-section"><h4>Pop-up question</h4><label class="check"><input id="popupEnabled" type="checkbox" ${enabled?'checked':''}><span>Ask a follow-up question per ${unitLabel}</span></label>${enabled?`${field('Follow-up type',`<select id="popupType"><option value="single_choice" ${ptype==='single_choice'?'selected':''}>Single choice</option><option value="rating" ${ptype==='rating'?'selected':''}>Rating (1–5)</option><option value="open_text" ${ptype==='open_text'?'selected':''}>Open text</option></select>`)}${field('Follow-up question text',textInput('popupQuestion',p.question||'Tell us more about this place'))}${ptype==='single_choice'?field('Choices',`<textarea id="popupOptions" rows="3">${esc((p.options||[]).join('\n'))}</textarea>`,'One choice per line.'):''}`:''}</div>`;
}
function translationFields(q){
  normalizeState(); const extras=state.settings.languages.filter(x=>x.code!==state.settings.defaultLanguage); if(!extras.length) return '';
  return `<div class="field-section"><h4>Translations</h4>${extras.map(lang=>{const t=ensureQuestionTranslation(lang.code,q.id);let extra='';
    if(q.type==='matrix'){extra+=field('Rows (translated)',`<textarea data-tr-lang="${lang.code}" data-tr-key="rows">${esc((t.rows||[]).join('\n'))}</textarea>`,'One translated row per line, matching the original order.');extra+=field('Columns (translated)',`<textarea data-tr-lang="${lang.code}" data-tr-key="columns">${esc((t.columns||[]).join('\n'))}</textarea>`,'One translated column per line, matching the original order.');}
    if(q.type==='consent'){extra+=field('Checkbox label',`<input data-tr-lang="${lang.code}" data-tr-key="checkboxLabel" value="${escAttr(t.checkboxLabel||'')}">`);}
    return `<details class="translation-block"><summary>${esc(lang.name||languageName(lang.code))}</summary>${field('Question text',`<input data-tr-lang="${lang.code}" data-tr-key="title" value="${escAttr(t.title||'')}">`)}${field('Description',`<textarea data-tr-lang="${lang.code}" data-tr-key="description">${esc(t.description||'')}</textarea>`)}${OPTS.has(q.type)?field('Choices',`<textarea data-tr-lang="${lang.code}" data-tr-key="options">${esc((t.options||[]).join('\n'))}</textarea>`,'One translated choice per line, matching the original order.'):''}${extra}</details>`}).join('')}</div>`;
}

function questionEditorHtml(q){
  const c=q.config||{};
  let html=`<div class="field-section">${field('Question',textInput(`qTitle_${q.id}`,q.title))}${field('Description / help text',`<textarea id="qDescription_${q.id}" rows="2">${esc(q.description||'')}</textarea>`)}${!['info','section'].includes(q.type)?`<label class="check"><input id="qRequired_${q.id}" type="checkbox" ${q.required?'checked':''}><span>Required question</span></label>`:''}</div>`;
  if(q.type==='photo_choice') html+=`<div class="field-section"><h4>Photo choices</h4>${photoChoiceEditor(q)}</div>`;
  else if(OPTS.has(q.type)) html+=`<div class="field-section"><h4>Choices</h4>${choiceEditor(q)}</div>`;
  if(q.type==='matrix') html+=`<div class="field-section"><h4>Matrix</h4>${field('Rows',`<textarea id="matrixRows_${q.id}">${esc((c.rows||[]).join('\n'))}</textarea>`)}${field('Columns',`<textarea id="matrixCols_${q.id}">${esc((c.columns||[]).join('\n'))}</textarea>`)}</div>`;
  if(['rating','slider','number'].includes(q.type)) html+=`<div class="field-section"><h4>Range</h4><div class="field-row">${field('Minimum',`<input id="qMin_${q.id}" type="number" value="${c.min??''}">`)}${field('Maximum',`<input id="qMax_${q.id}" type="number" value="${c.max??''}">`)}</div>${field('Step',`<input id="qStep_${q.id}" type="number" value="${c.step??1}">`)}</div>`;
  if(q.type.startsWith('map_')) html+=mapSettings(q);
  if(['photo','photos','file'].includes(q.type)) html+=`<div class="field-section"><h4>Files</h4>${field('Maximum files',`<input id="maxFiles_${q.id}" type="number" min="1" max="20" value="${c.maxFiles||1}">`)}</div>`;
  if(['audio','video'].includes(q.type)) html+=`<div class="field-section"><h4>Recording</h4>${field('Maximum duration (seconds)',`<input id="maxDuration_${q.id}" type="number" min="1" value="${c.maxDuration||180}">`)}<label class="check"><input id="allowRecord_${q.id}" type="checkbox" ${c.allowRecord!==false?'checked':''}><span>Live recording</span></label><label class="check"><input id="allowUpload_${q.id}" type="checkbox" ${c.allowUpload!==false?'checked':''}><span>File upload</span></label></div>`;
  if(q.type==='allocation') html+=`<div class="field-section"><h4>Allocation</h4>${field('Total',`<input id="allocationTotal_${q.id}" type="number" value="${c.total||100}">`)}${field('Unit',textInput(`allocationUnit_${q.id}`,c.unit||'points'))}</div>`;
  if(q.type==='consent') html+=`<div class="field-section"><h4>Consent</h4>${field('Checkbox label',textInput(`consentLabel_${q.id}`,c.checkboxLabel||'I agree'))}</div>`;
  html+=translationFields(q);
  return html;
}

function renderCanvas(){
  $('#surveyTitle').value=state.title||'';
  $('#surveyDescription').value=state.description||'';
  const canvas=$('#questionCanvas');
  if(!state.questions.length){ canvas.innerHTML='<div class="empty-state"><strong>Your survey is empty.</strong><br>Choose a question type from the left.</div>'; return; }
  canvas.innerHTML=state.questions.map((q,index)=>{
    const open=q.id===selectedId;
    return `<article class="question-card ${open?'selected':''}" data-qid="${q.id}"><div class="question-card-head" data-toggle-qid="${q.id}" tabindex="0" role="button"><div class="question-meta"><span class="question-type">${index+1}. ${esc(LABEL[q.type]||q.type)}${q.required?' · required':''}</span><div class="question-actions"><button class="icon-btn" type="button" data-action="up" data-qid="${q.id}" title="Move up">↑</button><button class="icon-btn" type="button" data-action="down" data-qid="${q.id}" title="Move down">↓</button><button class="icon-btn" type="button" data-action="copy" data-qid="${q.id}" title="Duplicate">⧉</button><button class="icon-btn danger" type="button" data-action="delete" data-qid="${q.id}" title="Delete">×</button></div></div><div class="question-title">${esc(q.title)}</div><div class="question-preview">${esc(questionPreview(q))}</div></div>${open?`<div class="question-card-body">${questionEditorHtml(q)}</div>`:''}</article>`;
  }).join('');
}

function logoSettingsHtml(){
  const logos=state.settings.logos||[];
  const thumbs=logos.map((src,i)=>`<div class="logo-thumb"><img src="${src}" alt="Logo ${i+1}"><button class="btn small" type="button" data-remove-logo="${i}">×</button></div>`).join('');
  const canAdd=logos.length<5;
  return `<div class="field-section"><h4>Logos (up to 5)</h4><div class="logo-thumb-row">${thumbs||'<span class="small-help">No logos added yet.</span>'}</div>${canAdd?`<label class="btn small logo-add-btn">Add logo<input id="logoAdd" type="file" accept="image/*" hidden></label>`:'<div class="small-help">Maximum of 5 logos reached.</div>'}<div class="small-help">The first logo shows large at the bottom of the welcome page. All logos then show small and semi-transparent at the top of every other page.</div></div>`;
}
function backgroundSettingsHtml(){
  const s=state.settings; const imagePreview=s.backgroundImage?`<div class="background-preview" style="background-image:url('${s.backgroundImage.replace(/'/g,'%27')}')"></div>`:'<div class="background-preview background-preview-empty">No background image</div>';
  return `<div class="field-section"><h4>Background</h4>${field('Background color',`<input id="backgroundColor" type="color" value="${escAttr(s.backgroundColor||'#f5f7f4')}">`,'Used behind the survey when no image is set.')}${imagePreview}${field('Background image',`<input id="backgroundImage" type="file" accept="image/*">`,'Optional. Keep it under 1.5 MB.')}${field('Image overlay',`<input id="backgroundOverlay" type="range" min="0" max="0.7" step="0.05" value="${Number(s.backgroundOverlay??0.18)}">`,'Softens the image so questions stay readable.')}<button class="btn small" id="removeBackground" type="button" ${s.backgroundImage?'':'disabled'}>Remove background image</button></div>`;
}
function settingsHtml(){
  normalizeState(); const s=state.settings; const enabled=new Set(s.languages.map(x=>x.code));
  const extraTranslations=s.languages.filter(x=>x.code!==s.defaultLanguage);
  return `<div class="field-section"><h4>Publishing</h4>${field('Public slug',textInput('surveySlug',state.slug||''),'Used in the public URL.')}${field('Primary color',`<input id="primaryColor" type="color" value="${escAttr(s.primaryColor||'#2f6f5e')}">`)}<label class="check"><input id="showProgress" type="checkbox" ${s.showProgress!==false?'checked':''}><span>Show progress</span></label><label class="check"><input id="allowDrafts" type="checkbox" ${s.allowDrafts!==false?'checked':''}><span>Save respondent draft locally</span></label><span id="saveState" class="save-state"></span></div><div class="field-section"><h4>Branding</h4>${field('Custom domain',textInput('customDomain',s.customDomain||''))}${field('Thank-you message',`<textarea id="thankYou" rows="3">${esc(s.thankYou||'')}</textarea>`)}</div>${logoSettingsHtml()}${backgroundSettingsHtml()}<div class="field-section"><h4>Survey languages</h4>${field('Main language',`<select id="defaultLanguage">${LANGUAGE_CATALOG.map(([code,name])=>`<option value="${code}" ${code===s.defaultLanguage?'selected':''}>${esc(name)}</option>`).join('')}</select>`)}<div class="small-help">Choose additional participant languages. New languages are auto-translated immediately — you can fine-tune the text afterward.</div>${LANGUAGE_CATALOG.map(([code,name])=>`<label class="check"><input type="checkbox" data-language="${code}" ${enabled.has(code)?'checked':''} ${code===s.defaultLanguage?'disabled':''}><span>${esc(name)}</span></label>`).join('')}</div>${extraTranslations.length?`<div class="field-section"><h4>Survey translations</h4>${extraTranslations.map(lang=>{const tr=ensureTranslation(lang.code).survey;return `<details class="translation-block"><summary>${esc(lang.name||languageName(lang.code))}</summary>${field('Survey title',`<input data-survey-tr-lang="${lang.code}" data-survey-tr-key="title" value="${escAttr(tr.title||'')}">`)}${field('Introduction',`<textarea data-survey-tr-lang="${lang.code}" data-survey-tr-key="description">${esc(tr.description||'')}</textarea>`)}${field('Thank-you message',`<textarea data-survey-tr-lang="${lang.code}" data-survey-tr-key="thankYou">${esc(tr.thankYou||'')}</textarea>`)}</details>`}).join('')}</div>`:''}`;
}
function renderSettings(){ $('#settingsBody').innerHTML=settingsHtml(); }

function renderPreviewLanguageSelect(){
  normalizeState();
  const sel=$('#previewLanguage'); if(!sel) return;
  const prior=sel.value;
  sel.innerHTML=state.settings.languages.map(l=>`<option value="${l.code}">${esc(l.name||languageName(l.code))}</option>`).join('');
  if(state.settings.languages.some(l=>l.code===prior)) sel.value=prior;
}

function render(){
  normalizeState();
  const pill=$('#statusPill'); pill.textContent=state.status==='published'?'Published':'Draft'; pill.classList.toggle('published',state.status==='published');
  renderCanvas();
  if(!$('#settingsOverlay').classList.contains('open')) { /* settings body refreshed lazily on open */ }
  else renderSettings();
  renderPreviewLanguageSelect();
  refreshPreview();
}

function addQuestion(type){
  if(!LABEL[type]) return;
  const q=newQuestion(type); const index=state.questions.findIndex(x=>x.id===selectedId);
  if(index<0) state.questions.push(q); else state.questions.splice(index+1,0,q);
  selectedId=q.id; render();
  requestAnimationFrame(()=>document.querySelector(`[data-qid="${q.id}"]`)?.scrollIntoView({block:'center'}));
}
function moveQuestion(id,delta){ const i=state.questions.findIndex(q=>q.id===id),j=i+delta; if(i<0||j<0||j>=state.questions.length)return; [state.questions[i],state.questions[j]]=[state.questions[j],state.questions[i]]; renderCanvas(); refreshPreview(); }
function copyQuestion(id){ const i=state.questions.findIndex(q=>q.id===id); if(i<0)return; const copy=structuredClone(state.questions[i]); copy.id=uid(); copy.title+= ' (copy)'; state.questions.splice(i+1,0,copy); selectedId=copy.id; render(); }
function deleteQuestion(id){ const i=state.questions.findIndex(q=>q.id===id); if(i<0)return; if(!confirm(`Delete "${state.questions[i].title}"?`))return; state.questions.splice(i,1); if(selectedId===id)selectedId=null; render(); }

function syncQuestionField(q,target){
  const suffix=`_${q.id}`;
  const id=target.id&&target.id.endsWith(suffix)?target.id.slice(0,-suffix.length):target.id;
  if(id==='qTitle'){q.title=target.value;renderCanvasTitleOnly(q);return}
  if(id==='qDescription'){q.description=target.value;return}
  if(id==='qRequired'){q.required=target.checked;renderCanvasTitleOnly(q);return}
  if(target.matches('[data-choice-index]')){q.config.options[Number(target.dataset.choiceIndex)]=target.value;renderCanvasTitleOnly(q);return}
  if(target.matches('[data-photo-choice-index]')){q.config.options[Number(target.dataset.photoChoiceIndex)]=target.value;renderCanvasTitleOnly(q);return}
  if(id==='photoChoiceMultiple'){q.config.multiple=target.checked;return}
  if(id==='popupEnabled'){q.config.popup=q.config.popup||{};q.config.popup.enabled=target.checked;const body=document.querySelector(`[data-qid="${q.id}"] .question-card-body`);if(body)body.innerHTML=questionEditorHtml(q);return}
  if(id==='popupType'){q.config.popup=q.config.popup||{};q.config.popup.type=target.value;const body=document.querySelector(`[data-qid="${q.id}"] .question-card-body`);if(body)body.innerHTML=questionEditorHtml(q);return}
  if(id==='popupQuestion'){q.config.popup=q.config.popup||{};q.config.popup.question=target.value;return}
  if(id==='popupOptions'){q.config.popup=q.config.popup||{};q.config.popup.options=target.value.split('\n').map(x=>x.trim()).filter(Boolean);return}
  if(id==='matrixRows'){q.config.rows=target.value.split('\n').map(x=>x.trim()).filter(Boolean);return}
  if(id==='matrixCols'){q.config.columns=target.value.split('\n').map(x=>x.trim()).filter(Boolean);return}
  const numberMap={qMin:'min',qMax:'max',qStep:'step',maxPoints:'maxPoints',maxFeatures:'maxFeatures',maxVertices:'maxVertices',lat:'lat',lng:'lng',zoom:'zoom',maxFiles:'maxFiles',maxDuration:'maxDuration',allocationTotal:'total'};
  if(numberMap[id]){q.config[numberMap[id]]=target.value===''?'':Number(target.value);return}
  const checkMap={allowGeo:'allowGeo',allowCitySearch:'allowCitySearch',allowRecord:'allowRecord',allowUpload:'allowUpload'};
  if(checkMap[id]){q.config[checkMap[id]]=target.checked;return}
  if(id==='allocationUnit'){q.config.unit=target.value;return}
  if(id==='consentLabel'){q.config.checkboxLabel=target.value;return}
  if(target.matches('[data-tr-lang]')){const tr=ensureQuestionTranslation(target.dataset.trLang,q.id); const key=target.dataset.trKey; tr[key]=(key==='options'||key==='rows'||key==='columns')?target.value.split('\n').map(x=>x.trim()).filter(Boolean):target.value;}
}
function renderCanvasTitleOnly(q){
  const card=document.querySelector(`[data-qid="${q.id}"]`); if(!card) return;
  const titleEl=card.querySelector('.question-title'); if(titleEl) titleEl.textContent=q.title;
  const previewEl=card.querySelector('.question-preview'); if(previewEl) previewEl.textContent=questionPreview(q);
  const typeEl=card.querySelector('.question-type'); if(typeEl){ const index=state.questions.findIndex(x=>x.id===q.id); typeEl.textContent=`${index+1}. ${LABEL[q.type]||q.type}${q.required?' · required':''}`; }
}

function syncSettings(target){
  const s=state.settings;
  if(target.id==='surveySlug') state.slug=target.value;
  else if(target.id==='primaryColor') s.primaryColor=target.value;
  else if(target.id==='showProgress') s.showProgress=target.checked;
  else if(target.id==='allowDrafts') s.allowDrafts=target.checked;
  else if(target.id==='customDomain') s.customDomain=target.value;
  else if(target.id==='thankYou') s.thankYou=target.value;
  else if(target.id==='defaultLanguage'){
    s.defaultLanguage=target.value;
    if(!s.languages.some(x=>x.code===target.value))s.languages.unshift({code:target.value,name:languageName(target.value)});
    renderSettings(); renderPreviewLanguageSelect();
  } else if(target.matches('[data-language]')){
    const code=target.dataset.language;
    if(target.checked && !s.languages.some(x=>x.code===code)){
      s.languages.push({code,name:languageName(code)});
      autoTranslateLanguage(code);
    }
    if(!target.checked)s.languages=s.languages.filter(x=>x.code!==code);
    renderSettings(); renderPreviewLanguageSelect();
  } else if(target.matches('[data-survey-tr-lang]')){
    ensureTranslation(target.dataset.surveyTrLang).survey[target.dataset.surveyTrKey]=target.value;
  } else if(target.id==='backgroundColor'){ s.backgroundColor=target.value; }
  else if(target.id==='backgroundOverlay'){ s.backgroundOverlay=Math.min(0.7,Math.max(0,Number(target.value)||0)); }
  else if(target.id==='backgroundImage'){
    const file=target.files?.[0]; if(!file) return;
    if(file.size>1500000){ alert('Please choose a background image under 1.5 MB.'); target.value=''; return; }
    const reader=new FileReader();
    reader.onload=()=>{ s.backgroundImage=reader.result; renderSettings(); refreshPreview(); };
    reader.readAsDataURL(file);
    return;
  } else if(target.id==='removeBackground'){ s.backgroundImage=''; renderSettings(); }
  else if(target.id==='logoAdd'){
    const file=target.files?.[0]; if(!file) return;
    if((s.logos||[]).length>=5){ alert('Maximum of 5 logos reached.'); target.value=''; return; }
    if(file.size>1500000){ alert('Please choose a logo image under 1.5 MB.'); target.value=''; return; }
    const reader=new FileReader();
    reader.onload=()=>{ s.logos=s.logos||[]; s.logos.push(reader.result); renderSettings(); refreshPreview(); };
    reader.readAsDataURL(file);
    return;
  } else if(target.matches('[data-remove-logo]')){ const idx=Number(target.dataset.removeLogo); (s.logos||[]).splice(idx,1); renderSettings(); }
  refreshPreview();
}

// --- Auto-translation ---------------------------------------------------
async function autoTranslateLanguage(code){
  setSaveState('Translating…');
  try{
    const body={
      targetLanguage:code,
      sourceLanguage:state.settings.defaultLanguage,
      survey:{
        title:state.title,
        description:state.description,
        thankYou:state.settings.thankYou||'',
        questions:state.questions.map(q=>({
          id:q.id,
          title:q.title,
          description:q.description||'',
          options:OPTS.has(q.type)?(q.config.options||[]):null,
          rows:q.type==='matrix'?(q.config.rows||[]):null,
          columns:q.type==='matrix'?(q.config.columns||[]):null,
          checkboxLabel:q.type==='consent'?(q.config.checkboxLabel||''):null,
          popupQuestion:q.config?.popup?.question||null,
          popupOptions:q.config?.popup?.options||null
        }))
      }
    };
    const response=await fetch(`${API}/api/builder/translate`,{method:'POST',headers:await headersAsync(),body:JSON.stringify(body)});
    if(!response.ok) throw new Error(await response.text());
    const data=await response.json();
    const tr=ensureTranslation(code);
    tr.survey.title=data.title||'';
    tr.survey.description=data.description||'';
    tr.survey.thankYou=data.thankYou||'';
    Object.entries(data.questions||{}).forEach(([qid,qt])=>{
      const target=ensureQuestionTranslation(code,qid);
      if(qt.title) target.title=qt.title;
      if(qt.description) target.description=qt.description;
      if(Array.isArray(qt.options)) target.options=qt.options;
      if(Array.isArray(qt.rows)) target.rows=qt.rows;
      if(Array.isArray(qt.columns)) target.columns=qt.columns;
      if(qt.checkboxLabel) target.checkboxLabel=qt.checkboxLabel;
      if(qt.popupQuestion) target.popupQuestion=qt.popupQuestion;
      if(Array.isArray(qt.popupOptions)) target.popupOptions=qt.popupOptions;
    });
    setSaveState('Translated');
    if($('#settingsOverlay').classList.contains('open')) renderSettings();
    renderCanvas();
    refreshPreview();
  }catch(error){
    console.error(error);
    setSaveState('');
    alert(`Automatic translation into ${languageName(code)} failed. You can still fill it in manually below.`);
  }
}

// --- Live preview (postMessage to the survey.html iframe) ---------------
let previewReady=false;
let previewTimer=null;
function payload(){
  state.title=$('#surveyTitle').value.trim()||'Untitled survey'; state.description=$('#surveyDescription').value;
  return {title:state.title,description:state.description,slug:state.slug||null,questions:state.questions,settings:{...state.settings},translations:state.translations};
}
function refreshPreview(){
  clearTimeout(previewTimer);
  previewTimer=setTimeout(()=>{
    const frame=$('#livePreviewFrame');
    if(!frame || !frame.contentWindow || !previewReady) return;
    const lang=$('#previewLanguage')?.value || state.settings.defaultLanguage;
    frame.contentWindow.postMessage({type:'ppgis-preview-update', survey:payload(), lang}, '*');
  }, 180);
}
window.addEventListener('message', event=>{
  if(event.data?.type==='ppgis-preview-ready'){ previewReady=true; refreshPreview(); }
});
$('#previewLanguage').addEventListener('change', refreshPreview);

async function save(quiet=false){
  const key=await requireAdminKeyAsync(); if(!key) return false;
  setSaveState('Saving…');
  try{
    const url=state.id?`${API}/api/builder/surveys/${state.id}`:`${API}/api/builder/surveys`;
    const response=await fetch(url,{method:state.id?'PUT':'POST',headers:await headersAsync(),body:JSON.stringify(payload())});
    if(!response.ok) throw new Error(await response.text());
    const data=await response.json();
    state={...state,...data,settings:{...state.settings,...(data.settings||{})},translations:data.translations||data.settings?.translations||state.translations};
    history.replaceState(null,'',`/builder?id=${state.id}`);
    render(); setSaveState('Saved'); if(!quiet) alert('Draft saved.'); return true;
  }catch(error){console.error(error);setSaveState('Save failed');alert('Could not save survey.');return false;}
}
async function load(){
  const id=new URLSearchParams(location.search).get('id'); if(!id)return;
  const key=await requireAdminKeyAsync(); if(!key)return;
  try{const response=await fetch(`${API}/api/builder/surveys/${id}`,{headers:await headersAsync(false)});if(!response.ok)throw new Error(await response.text());const data=await response.json();state={...state,...data,settings:{...state.settings,...(data.settings||{})},translations:data.translations||data.settings?.translations||{}};selectedId=null;render();}catch(error){console.error(error);alert('Could not load survey.');}
}
async function publish(){if(!state.questions.length){alert('Add at least one question first.');return}if(!await save(true))return;const response=await fetch(`${API}/api/builder/surveys/${state.id}/publish`,{method:'POST',headers:await headersAsync(false)});if(!response.ok){alert('Could not publish survey.');return}const data=await response.json();state.status='published';state.slug=data.slug;render();alert('Survey published.');}

function openSettings(){ renderSettings(); $('#settingsOverlay').classList.add('open'); }
function closeSettings(){ $('#settingsOverlay').classList.remove('open'); }

$('#palette').addEventListener('click',event=>{const button=event.target.closest('[data-add-type]');if(button)addQuestion(button.dataset.addType);});
$('#questionCanvas').addEventListener('click',event=>{
  const action=event.target.closest('[data-action]'); if(action){event.stopPropagation(); const id=action.dataset.qid; if(action.dataset.action==='up')moveQuestion(id,-1); if(action.dataset.action==='down')moveQuestion(id,1); if(action.dataset.action==='copy')copyQuestion(id); if(action.dataset.action==='delete')deleteQuestion(id); return;}
  const toggle=event.target.closest('[data-toggle-qid]'); if(toggle){const id=toggle.dataset.toggleQid; selectedId=(selectedId===id)?null:id; renderCanvas(); refreshPreview();}
});
$('#questionCanvas').addEventListener('keydown',event=>{if((event.key==='Enter'||event.key===' ')&&event.target.matches('[data-toggle-qid]')){event.preventDefault();const id=event.target.dataset.toggleQid;selectedId=(selectedId===id)?null:id;renderCanvas();refreshPreview();}});
$('#questionCanvas').addEventListener('input',event=>{const card=event.target.closest('[data-qid]'); if(!card) return; const q=state.questions.find(x=>x.id===card.dataset.qid); if(!q) return; syncQuestionField(q,event.target); refreshPreview();});
$('#questionCanvas').addEventListener('change',event=>{const card=event.target.closest('[data-qid]'); if(!card) return; const q=state.questions.find(x=>x.id===card.dataset.qid); if(!q) return; syncQuestionField(q,event.target); refreshPreview();});
$('#questionCanvas').addEventListener('click',event=>{
  const card=event.target.closest('[data-qid]'); if(!card) return; const q=state.questions.find(x=>x.id===card.dataset.qid); if(!q) return;
  if(event.target.id===`addChoice`){ if(event.target.closest('.question-card-body')){ q.config.options.push(`Option ${q.config.options.length+1}`); const body=card.querySelector('.question-card-body'); if(body) body.innerHTML=questionEditorHtml(q); renderCanvasTitleOnly(q); refreshPreview(); } return; }
  const remove=event.target.closest('[data-remove-choice]'); if(remove && q.config.options && q.config.options.length>1){ q.config.options.splice(Number(remove.dataset.removeChoice),1); const body=card.querySelector('.question-card-body'); if(body) body.innerHTML=questionEditorHtml(q); renderCanvasTitleOnly(q); refreshPreview(); }
  if(event.target.id==='addPhotoChoice'){ q.config.options=q.config.options||[]; q.config.optionImages=q.config.optionImages||[]; q.config.options.push(`Option ${q.config.options.length+1}`); q.config.optionImages.push(''); const body=card.querySelector('.question-card-body'); if(body) body.innerHTML=questionEditorHtml(q); renderCanvasTitleOnly(q); refreshPreview(); return; }
  const removePhoto=event.target.closest('[data-remove-photo-choice]'); if(removePhoto && q.config.options && q.config.options.length>1){ const idx=Number(removePhoto.dataset.removePhotoChoice); q.config.options.splice(idx,1); (q.config.optionImages||[]).splice(idx,1); const body=card.querySelector('.question-card-body'); if(body) body.innerHTML=questionEditorHtml(q); renderCanvasTitleOnly(q); refreshPreview(); }
});
$('#questionCanvas').addEventListener('change',event=>{
  const fileInput=event.target.closest('[data-photo-choice-file]'); if(!fileInput) return;
  const card=event.target.closest('[data-qid]'); if(!card) return; const q=state.questions.find(x=>x.id===card.dataset.qid); if(!q) return;
  const file=fileInput.files?.[0]; if(!file) return;
  if(file.size>1500000){ alert('Please choose a photo under 1.5 MB.'); fileInput.value=''; return; }
  const index=Number(fileInput.dataset.photoChoiceFile);
  const reader=new FileReader();
  reader.onload=()=>{ q.config.optionImages=q.config.optionImages||[]; q.config.optionImages[index]=reader.result; const body=card.querySelector('.question-card-body'); if(body) body.innerHTML=questionEditorHtml(q); refreshPreview(); };
  reader.readAsDataURL(file);
});
$('#surveyTitle').addEventListener('input',event=>{state.title=event.target.value;refreshPreview();});
$('#surveyDescription').addEventListener('input',event=>{state.description=event.target.value;refreshPreview();});
$('#settingsBtn').addEventListener('click',openSettings);
$('#closeSettingsBtn').addEventListener('click',closeSettings);
$('#settingsOverlay').addEventListener('click',event=>{ if(event.target.id==='settingsOverlay') closeSettings(); });
$('#settingsBody').addEventListener('input',event=>syncSettings(event.target));
$('#settingsBody').addEventListener('change',event=>syncSettings(event.target));
$('#settingsBody').addEventListener('click',event=>{ const rm=event.target.closest('[data-remove-logo]'); if(rm) syncSettings(rm); });
const previewFabBtn=$('#previewFabBtn');
if(previewFabBtn){ previewFabBtn.addEventListener('click',()=>$('#previewPanel').classList.toggle('open')); }
const previewDeviceButtons=$$('#previewPanel [data-device]');
if(previewDeviceButtons.length){
  previewDeviceButtons.forEach(btn=>btn.addEventListener('click',()=>{
    previewDeviceButtons.forEach(b=>b.classList.toggle('active',b===btn));
    $('#previewPanel').classList.toggle('device-mobile',btn.dataset.device==='mobile');
  }));
}
$('#adminBtn').addEventListener('click',()=>{location.href=state.id?`/admin?survey=${state.id}`:'/admin';});
$('#saveBtn').addEventListener('click',()=>save(false));
$('#publishBtn').addEventListener('click',publish);

async function boot(){
  if(!adminKey){ lockSite('',false); return; }
  try{
    const response=await fetch(`${API}/api/builder/auth-check`,{headers:{'X-Admin-Key':adminKey}});
    if(response.status===403){ lockSite('Admin key not accepted. Enter it again.'); return; }
    if(!response.ok){ lockSite('Could not connect to the survey server.',false); return; }
  }catch(_){ lockSite('Could not connect to the survey server.',false); return; }
  unlockSite();
  renderPalette(); render(); load();
}
boot();
