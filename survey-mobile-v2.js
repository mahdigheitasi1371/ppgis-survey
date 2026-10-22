// Mobile-only map controls: the map card shows only the question; the ⋯ button reveals
// the instructions, search and other options.
(function(){
  const mobile=()=>window.matchMedia('(max-width: 760px)').matches;

  function enhanceCard(card){
    if(!mobile()||!card||card.dataset.mobileMapV2==='1')return;
    if(!card.classList.contains('map-page-card'))return;
    const panel=card.querySelector('.map-floating-panel');
    if(!panel)return;
    card.dataset.mobileMapV2='1';

    const toggle=document.createElement('button');
    toggle.type='button';
    toggle.className='map-mobile-tools-toggle';
    const lang=String(window.SurveyLanguage?.get?.()||document.documentElement.lang||'en').slice(0,2);
    const label=lang==='de'?'Anleitung und Optionen anzeigen':'Show instructions and options';
    toggle.setAttribute('aria-label',label);
    toggle.title=label;
    toggle.setAttribute('aria-expanded','false');
    toggle.textContent='⋯';
    toggle.classList.add('map-tools-hint');
    const heading=panel.querySelector('h3');
    if(heading)heading.after(toggle);else panel.prepend(toggle);

    const setOpen=open=>{
      panel.classList.toggle('mobile-tools-open',open);
      toggle.setAttribute('aria-expanded',open?'true':'false');
      toggle.textContent=open?'×':'⋯';
      requestAnimationFrame(()=>{
        try{
          const qid=card.dataset.qid;
          const entry=window.maps?.get?.(qid);
          entry?.m?.invalidateSize?.();
        }catch(_){}
      });
    };

    toggle.addEventListener('click',e=>{
      e.preventDefault();
      e.stopPropagation();
      toggle.classList.remove('map-tools-hint');
      setOpen(!panel.classList.contains('mobile-tools-open'));
    });

    panel.querySelectorAll('[data-city-results] button').forEach(b=>b.addEventListener('click',()=>setOpen(false)));

    const map=card.querySelector('.map-box');
    map?.addEventListener('pointerdown',()=>{
      if(panel.classList.contains('mobile-tools-open'))setOpen(false);
    },{passive:true});

    // Keep the map's own controls (zoom, compass, 3D buttons) just below the instruction card,
    // whatever its height (long titles wrap to two lines).
    const place=()=>{
      if(panel.classList.contains('mobile-tools-open')||!map)return;
      const top=Math.round(panel.getBoundingClientRect().bottom-map.getBoundingClientRect().top);
      if(top>0&&top<window.innerHeight)card.style.setProperty('--map-panel-bottom',top+'px');
    };
    place();
    requestAnimationFrame(place);
    setTimeout(place,300);
    if(window.ResizeObserver)new ResizeObserver(place).observe(panel);
  }

  // Matrix questions: give each answer cell a visible label so the table can be shown
  // as stacked cards on phones (one statement per card, answers listed below it).
  function enhanceMatrix(table){
    if(table.dataset.mobileMatrix==='1')return;
    const heads=[...table.querySelectorAll('thead th')].map(th=>th.textContent.trim());
    table.dataset.mobileMatrix='1';
    table.querySelectorAll('tbody tr').forEach(tr=>{
      [...tr.children].forEach((td,i)=>{
        if(i===0){td.classList.add('matrix-statement');return;}
        const input=td.querySelector('input');
        if(!input||input.closest('label'))return;
        const label=document.createElement('label');
        label.className='matrix-choice';
        const text=document.createElement('span');
        text.className='matrix-choice-text';
        text.textContent=heads[i]||'';
        input.replaceWith(label);
        label.append(input,text);
      });
    });
    const wrap=table.parentElement;
    if(wrap&&!wrap.classList.contains('matrix-scroll')){
      const box=document.createElement('div');
      box.className='matrix-scroll';
      table.replaceWith(box);
      box.appendChild(table);
    }
  }

  function enhance(){
    document.querySelectorAll('table.matrix').forEach(enhanceMatrix);
    if(!mobile())return;
    document.querySelectorAll('.map-page-card').forEach(enhanceCard);
  }

  const observer=new MutationObserver(enhance);
  observer.observe(document.documentElement,{subtree:true,childList:true});
  window.addEventListener('resize',enhance,{passive:true});
  window.addEventListener('orientationchange',()=>setTimeout(enhance,150),{passive:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',enhance);else enhance();
})();
