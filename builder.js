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
    ['yes_no','Yes / No'],['single_choice','Single choice'],['multiple_choice','Multiple choice'],['dropdown','Dropdown'],['rating','Rating scale'],['slider','Slider'],['matrix','Matrix / Likert']
  ],
  'Date & time': [['date','Date'],['time','Time'],['datetime','Date & time']],
  'Map & location': [['map_multi','Point map'],['map_line','Line map'],['map_polygon','Polygon map']],
  'Photos, media & files': [['photo','Photo'],['photos','Multiple photos'],['audio','Voice recording'],['video','Video recording'],['file','File upload'],['signature','Signature']],
  'Priorities & trade-offs': [['ranking','Rank order'],['allocation','Resource allocation']],
  'Content & consent': [['info','Information text'],['section','Section heading'],['consent','Consent checkbox']]
};
const LABEL = Object.fromEntries(Object.values(GROUPS).flat());
const OPTS = new Set(['single_choice','multiple_choice','dropdown','ranking','allocation']);
const LANGUAGE_CATALOG = [
  ['en','English'],['de','Deutsch'],['fr','Français'],['es','Español'],['it','Italiano'],['nl','Nederlands'],['pl','Polski'],['pt','Português'],['tr','Türkçe'],['ar','العربية'],['uk','Українська'],['ru','Русский'],['fa','فارسی'],['zh','中文'],['ja','日本語']
];

let state = {
  id:null, slug:null, status:'draft', title:'Untitled survey', description:'', questions:[],
  settings:{logo:'',customDomain:'',primaryColor:'#2f6f5e',defaultLanguage:'en',languages:[{code:'en',name:'English'}],thankYou:'Thank you for your response.',showProgress:true,allowDrafts:true},
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
function requireAdminKey(){
  if(adminKey) return adminKey;
  adminKey=(prompt('Enter ADMIN_KEY:')||'').trim();
  if(adminKey) safeStorage.setItem('survey-admin-key',adminKey);
  return adminKey;
}
function headers(json=true){ const key=requireAdminKey(); const h={'X-Admin-Key':key}; if(json) h['Content-Type']='application/json'; return h; }
function setSaveState(text){
  const el=$('#saveState'); if(el) el.textContent=text;
  clearTimeout(saveStatusTimer); if(text) saveStatusTimer=setTimeout(()=>{if(el)el.textContent='';},3000);
}

function newQuestion(type){
  const q={id:uid(),type,title:LABEL[type]||'Question',description:'',required:false,config:{},logic:null};
  if(OPTS.has(type)) q.config.options=['Option 1','Option 2','Option 3'];
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

function renderCanvas(){
  $('#surveyTitle').value=state.title||'';
  $('#surveyDescription').value=state.description||'';
  const canvas=$('#questionCanvas');
  if(!state.questions.length){ canvas.innerHTML='<div class="empty-state"><strong>Your survey is empty.</strong><br>Choose a question type from the left.</div>'; return; }
  canvas.innerHTML=state.questions.map((q,index)=>`<article class="question-card ${q.id===selectedId?'selected':''}" data-qid="${q.id}" tabindex="0"><div class="question-meta"><span class="question-type">${index+1}. ${esc(LABEL[q.type]||q.type)}${q.required?' · required':''}</span><div class="question-actions"><button class="icon-btn" type="button" data-action="up" data-qid="${q.id}" title="Move up">↑</button><button class="icon-btn" type="button" data-action="down" data-qid="${q.id}" title="Move down">↓</button><button class="icon-btn" type="button" data-action="copy" data-qid="${q.id}" title="Duplicate">⧉</button><button class="icon-btn danger" type="button" data-action="delete" data-qid="${q.id}" title="Delete">×</button></div></div><div class="question-title">${esc(q.title)}</div><div class="question-preview">${esc(questionPreview(q))}</div></article>`).join('');
}

function field(label,html,help=''){ return `<label class="field"><span>${esc(label)}</span>${html}${help?`<small class="small-help">${esc(help)}</small>`:''}</label>`; }
function textInput(id,value=''){ return `<input id="${id}" type="text" value="${escAttr(value)}">`; }
function choiceEditor(q){ return `<div id="choiceEditor">${(q.config.options||[]).map((opt,i)=>`<div class="choice-row"><input data-choice-index="${i}" value="${escAttr(opt)}"><button class="btn" type="button" data-remove-choice="${i}">×</button></div>`).join('')}</div><button class="btn" type="button" id="addChoice">+ Add option</button>`; }
function mapSettings(q){
  const c=q.config||{}; const isPoint=q.type==='map_multi'; const isPolygon=q.type==='map_polygon';
  return `<section class="section"><h3>Map configuration</h3>${isPoint?field('Maximum points',`<input id="maxPoints" type="number" min="1" max="50" value="${Number(c.maxPoints)||1}">`):`${field(`Maximum ${isPolygon?'polygons':'lines'}`,`<input id="maxFeatures" type="number" min="1" max="50" value="${Number(c.maxFeatures)||10}">`)}${field('Maximum vertices per feature',`<input id="maxVertices" type="number" min="${isPolygon?3:2}" max="100" value="${Number(c.maxVertices)||30}">`)}`}<div class="row">${field('Latitude',`<input id="lat" type="number" step=".0001" value="${Number(c.lat)||51.5136}">`)}${field('Longitude',`<input id="lng" type="number" step=".0001" value="${Number(c.lng)||7.4653}">`)}</div>${field('Zoom',`<input id="zoom" type="number" min="3" max="19" value="${Number(c.zoom)||12}">`)}<label class="check"><input id="allowGeo" type="checkbox" ${c.allowGeo!==false?'checked':''}><span>Offer “Use my location”</span></label><label class="check"><input id="allowCitySearch" type="checkbox" ${c.allowCitySearch!==false?'checked':''}><span>Offer city/place search</span></label></section>`;
}
function translationFields(q){
  normalizeState(); const extras=state.settings.languages.filter(x=>x.code!==state.settings.defaultLanguage); if(!extras.length) return '';
  return `<section class="section"><h3>Translations</h3>${extras.map(lang=>{const t=ensureQuestionTranslation(lang.code,q.id);return `<details class="translation-block"><summary>${esc(lang.name||languageName(lang.code))}</summary>${field('Question text',`<input data-tr-lang="${lang.code}" data-tr-key="title" value="${escAttr(t.title||'')}">`)}${field('Description',`<textarea data-tr-lang="${lang.code}" data-tr-key="description">${esc(t.description||'')}</textarea>`)}${OPTS.has(q.type)?field('Choices',`<textarea data-tr-lang="${lang.code}" data-tr-key="options">${esc((t.options||[]).join('\n'))}</textarea>`,'One translated choice per line.'):''}</details>`}).join('')}</section>`;
}

function renderInspector(){
  normalizeState();
  const panel=$('#inspector'); const q=state.questions.find(x=>x.id===selectedId);
  if(!q){ renderSettings(); return; }
  const c=q.config||{};
  let html=`<div class="inspector-title"><h2>Question settings</h2><button class="btn" id="closeInspector" type="button">Close</button></div><section class="section">${field('Question',textInput('qTitle',q.title))}${field('Description / help text',`<textarea id="qDescription" rows="4">${esc(q.description||'')}</textarea>`)}${!['info','section'].includes(q.type)?`<label class="check"><input id="qRequired" type="checkbox" ${q.required?'checked':''}><span>Required question</span></label>`:''}</section>`;
  if(OPTS.has(q.type)) html+=`<section class="section"><h3>Choices</h3>${choiceEditor(q)}</section>`;
  if(q.type==='matrix') html+=`<section class="section"><h3>Matrix</h3>${field('Rows',`<textarea id="matrixRows">${esc((c.rows||[]).join('\n'))}</textarea>`)}${field('Columns',`<textarea id="matrixCols">${esc((c.columns||[]).join('\n'))}</textarea>`)}</section>`;
  if(['rating','slider','number'].includes(q.type)) html+=`<section class="section"><h3>Range</h3><div class="row">${field('Minimum',`<input id="qMin" type="number" value="${c.min??''}">`)}${field('Maximum',`<input id="qMax" type="number" value="${c.max??''}">`)}</div>${field('Step',`<input id="qStep" type="number" value="${c.step??1}">`)}</section>`;
  if(q.type.startsWith('map_')) html+=mapSettings(q);
  if(['photo','photos','file'].includes(q.type)) html+=`<section class="section"><h3>Files</h3>${field('Maximum files',`<input id="maxFiles" type="number" min="1" max="20" value="${c.maxFiles||1}">`)}</section>`;
  if(['audio','video'].includes(q.type)) html+=`<section class="section"><h3>Recording</h3>${field('Maximum duration (seconds)',`<input id="maxDuration" type="number" min="1" value="${c.maxDuration||180}">`)}<label class="check"><input id="allowRecord" type="checkbox" ${c.allowRecord!==false?'checked':''}><span>Live recording</span></label><label class="check"><input id="allowUpload" type="checkbox" ${c.allowUpload!==false?'checked':''}><span>File upload</span></label></section>`;
  if(q.type==='allocation') html+=`<section class="section"><h3>Allocation</h3>${field('Total',`<input id="allocationTotal" type="number" value="${c.total||100}">`)}${field('Unit',textInput('allocationUnit',c.unit||'points'))}</section>`;
  if(q.type==='consent') html+=`<section class="section"><h3>Consent</h3>${field('Checkbox label',textInput('consentLabel',c.checkboxLabel||'I agree'))}</section>`;
  html+=translationFields(q);
  panel.innerHTML=html; panel.classList.add('open');
}

function renderSettings(){
  normalizeState(); const s=state.settings; const enabled=new Set(s.languages.map(x=>x.code));
  const extraTranslations=s.languages.filter(x=>x.code!==s.defaultLanguage);
  $('#inspector').innerHTML=`<div class="inspector-title"><h2>Survey settings</h2><span id="saveState" class="save-state"></span></div><section class="section"><h3>Publishing</h3>${field('Public slug',textInput('surveySlug',state.slug||''),'Used in the public URL.')}${field('Primary color',`<input id="primaryColor" type="color" value="${escAttr(s.primaryColor||'#2f6f5e')}">`)}<label class="check"><input id="showProgress" type="checkbox" ${s.showProgress!==false?'checked':''}><span>Show progress</span></label><label class="check"><input id="allowDrafts" type="checkbox" ${s.allowDrafts!==false?'checked':''}><span>Save respondent draft locally</span></label></section><section class="section"><h3>Branding</h3>${field('Custom domain',textInput('customDomain',s.customDomain||''))}${field('Thank-you message',`<textarea id="thankYou" rows="4">${esc(s.thankYou||'')}</textarea>`)}</section><section class="section"><h3>Survey languages</h3>${field('Main language',`<select id="defaultLanguage">${LANGUAGE_CATALOG.map(([code,name])=>`<option value="${code}" ${code===s.defaultLanguage?'selected':''}>${esc(name)}</option>`).join('')}</select>`)}<div class="small-help">Choose additional participant languages:</div>${LANGUAGE_CATALOG.map(([code,name])=>`<label class="check"><input type="checkbox" data-language="${code}" ${enabled.has(code)?'checked':''} ${code===s.defaultLanguage?'disabled':''}><span>${esc(name)}</span></label>`).join('')}</section>${extraTranslations.length?`<section class="section"><h3>Survey translations</h3>${extraTranslations.map(lang=>{const tr=ensureTranslation(lang.code).survey;return `<details class="translation-block"><summary>${esc(lang.name||languageName(lang.code))}</summary>${field('Survey title',`<input data-survey-tr-lang="${lang.code}" data-survey-tr-key="title" value="${escAttr(tr.title||'')}">`)}${field('Introduction',`<textarea data-survey-tr-lang="${lang.code}" data-survey-tr-key="description">${esc(tr.description||'')}</textarea>`)}${field('Thank-you message',`<textarea data-survey-tr-lang="${lang.code}" data-survey-tr-key="thankYou">${esc(tr.thankYou||'')}</textarea>`)}</details>`}).join('')}</section>`:''}`;
}

function render(){
  normalizeState();
  const pill=$('#statusPill'); pill.textContent=state.status==='published'?'Published':'Draft'; pill.classList.toggle('published',state.status==='published');
  renderCanvas(); renderInspector();
}

function addQuestion(type){
  if(!LABEL[type]) return;
  const q=newQuestion(type); const index=state.questions.findIndex(x=>x.id===selectedId);
  if(index<0) state.questions.push(q); else state.questions.splice(index+1,0,q);
  selectedId=q.id; render();
  requestAnimationFrame(()=>document.querySelector(`[data-qid="${q.id}"]`)?.scrollIntoView({block:'center'}));
}
function moveQuestion(id,delta){ const i=state.questions.findIndex(q=>q.id===id),j=i+delta; if(i<0||j<0||j>=state.questions.length)return; [state.questions[i],state.questions[j]]=[state.questions[j],state.questions[i]]; renderCanvas(); }
function copyQuestion(id){ const i=state.questions.findIndex(q=>q.id===id); if(i<0)return; const copy=structuredClone(state.questions[i]); copy.id=uid(); copy.title+= ' (copy)'; state.questions.splice(i+1,0,copy); selectedId=copy.id; render(); }
function deleteQuestion(id){ const i=state.questions.findIndex(q=>q.id===id); if(i<0)return; if(!confirm(`Delete “${state.questions[i].title}”?`))return; state.questions.splice(i,1); if(selectedId===id)selectedId=null; render(); }

function syncSimpleInspector(target){
  const q=state.questions.find(x=>x.id===selectedId); if(!q)return;
  const id=target.id;
  if(id==='qTitle'){q.title=target.value;renderCanvas();return}
  if(id==='qDescription'){q.description=target.value;renderCanvas();return}
  if(id==='qRequired'){q.required=target.checked;renderCanvas();return}
  if(target.matches('[data-choice-index]')){q.config.options[Number(target.dataset.choiceIndex)]=target.value;renderCanvas();return}
  if(id==='matrixRows'){q.config.rows=target.value.split('\n').map(x=>x.trim()).filter(Boolean);return}
  if(id==='matrixCols'){q.config.columns=target.value.split('\n').map(x=>x.trim()).filter(Boolean);return}
  const numberMap={qMin:'min',qMax:'max',qStep:'step',maxPoints:'maxPoints',maxFeatures:'maxFeatures',maxVertices:'maxVertices',lat:'lat',lng:'lng',zoom:'zoom',maxFiles:'maxFiles',maxDuration:'maxDuration',allocationTotal:'total'};
  if(numberMap[id]){q.config[numberMap[id]]=target.value===''?'':Number(target.value);renderCanvas();return}
  const checkMap={allowGeo:'allowGeo',allowCitySearch:'allowCitySearch',allowRecord:'allowRecord',allowUpload:'allowUpload'};
  if(checkMap[id]){q.config[checkMap[id]]=target.checked;return}
  if(id==='allocationUnit'){q.config.unit=target.value;renderCanvas();return}
  if(id==='consentLabel'){q.config.checkboxLabel=target.value;return}
  if(target.matches('[data-tr-lang]')){const tr=ensureQuestionTranslation(target.dataset.trLang,q.id); const key=target.dataset.trKey; tr[key]=key==='options'?target.value.split('\n').map(x=>x.trim()).filter(Boolean):target.value;}
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
    renderSettings();
  } else if(target.matches('[data-language]')){
    const code=target.dataset.language;
    if(target.checked && !s.languages.some(x=>x.code===code))s.languages.push({code,name:languageName(code)});
    if(!target.checked)s.languages=s.languages.filter(x=>x.code!==code);
    renderSettings();
  } else if(target.matches('[data-survey-tr-lang]')){
    ensureTranslation(target.dataset.surveyTrLang).survey[target.dataset.surveyTrKey]=target.value;
  }
}

function payload(){
  state.title=$('#surveyTitle').value.trim()||'Untitled survey'; state.description=$('#surveyDescription').value;
  return {title:state.title,description:state.description,slug:state.slug||null,questions:state.questions,settings:{...state.settings,translations:state.translations}};
}
async function save(quiet=false){
  if(!requireAdminKey()) return false;
  setSaveState('Saving…');
  try{
    const url=state.id?`${API}/api/builder/surveys/${state.id}`:`${API}/api/builder/surveys`;
    const response=await fetch(url,{method:state.id?'PUT':'POST',headers:headers(),body:JSON.stringify(payload())});
    if(!response.ok) throw new Error(await response.text());
    const data=await response.json();
    state={...state,...data,settings:{...state.settings,...(data.settings||{})},translations:data.translations||data.settings?.translations||state.translations};
    history.replaceState(null,'',`/builder?id=${state.id}`);
    render(); setSaveState('Saved'); if(!quiet) alert('Draft saved.'); return true;
  }catch(error){console.error(error);setSaveState('Save failed');alert('Could not save survey.');return false;}
}
async function load(){
  const id=new URLSearchParams(location.search).get('id'); if(!id)return;
  if(!requireAdminKey())return;
  try{const response=await fetch(`${API}/api/builder/surveys/${id}`,{headers:headers(false)});if(!response.ok)throw new Error(await response.text());const data=await response.json();state={...state,...data,settings:{...state.settings,...(data.settings||{})},translations:data.translations||data.settings?.translations||{}};selectedId=null;render();}catch(error){console.error(error);alert('Could not load survey.');}
}
function previewSurvey(){state.title=$('#surveyTitle').value;state.description=$('#surveyDescription').value;safeStorage.setItem('survey-builder-preview',JSON.stringify(state));window.open('/survey?preview=local','_blank');}
async function publish(){if(!state.questions.length){alert('Add at least one question first.');return}if(!await save(true))return;const response=await fetch(`${API}/api/builder/surveys/${state.id}/publish`,{method:'POST',headers:headers(false)});if(!response.ok){alert('Could not publish survey.');return}const data=await response.json();state.status='published';state.slug=data.slug;render();alert('Survey published.');}

$('#palette').addEventListener('click',event=>{const button=event.target.closest('[data-add-type]');if(button)addQuestion(button.dataset.addType);});
$('#questionCanvas').addEventListener('click',event=>{
  const action=event.target.closest('[data-action]'); if(action){event.stopPropagation(); const id=action.dataset.qid; if(action.dataset.action==='up')moveQuestion(id,-1); if(action.dataset.action==='down')moveQuestion(id,1); if(action.dataset.action==='copy')copyQuestion(id); if(action.dataset.action==='delete')deleteQuestion(id); return;}
  const card=event.target.closest('[data-qid]'); if(card){selectedId=card.dataset.qid;render();}
});
$('#questionCanvas').addEventListener('keydown',event=>{if((event.key==='Enter'||event.key===' ')&&event.target.matches('[data-qid]')){event.preventDefault();selectedId=event.target.dataset.qid;render();}});
$('#inspector').addEventListener('input',event=>{if(selectedId)syncSimpleInspector(event.target);else syncSettings(event.target);});
$('#inspector').addEventListener('change',event=>{if(selectedId)syncSimpleInspector(event.target);else syncSettings(event.target);});
$('#inspector').addEventListener('click',event=>{
  if(event.target.id==='closeInspector'){selectedId=null;render();return}
  const q=state.questions.find(x=>x.id===selectedId); if(!q)return;
  if(event.target.id==='addChoice'){q.config.options.push(`Option ${q.config.options.length+1}`);renderInspector();return}
  const remove=event.target.closest('[data-remove-choice]'); if(remove && q.config.options.length>1){q.config.options.splice(Number(remove.dataset.removeChoice),1);renderInspector();renderCanvas();}
});
$('#surveyTitle').addEventListener('input',event=>{state.title=event.target.value;});
$('#surveyDescription').addEventListener('input',event=>{state.description=event.target.value;});
$('#settingsBtn').addEventListener('click',()=>{selectedId=null;renderInspector();$('#inspector').classList.add('open');});
$('#previewBtn').addEventListener('click',previewSurvey);
$('#adminBtn').addEventListener('click',()=>{location.href=state.id?`/admin?survey=${state.id}`:'/admin';});
$('#saveBtn').addEventListener('click',()=>save(false));
$('#publishBtn').addEventListener('click',publish);

renderPalette();
render();
load();
