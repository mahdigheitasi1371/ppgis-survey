// Mobile builder usability and robust question-palette fallback.
(function(){
  if(typeof state==='undefined'||typeof qNew==='undefined'||typeof render==='undefined')return;

  const mobile=()=>window.matchMedia('(max-width: 760px)').matches;
  const body=document.body;
  const palette=document.getElementById('palette');
  if(!palette)return;

  const toggle=document.createElement('button');
  toggle.type='button';
  toggle.className='builder-mobile-question-toggle';
  toggle.id='builderMobileQuestionToggle';
  toggle.innerHTML='<span aria-hidden="true">＋</span><span>Add question</span>';
  body.appendChild(toggle);

  const close=document.createElement('button');
  close.type='button';
  close.className='builder-mobile-palette-close';
  close.id='builderMobilePaletteClose';
  close.setAttribute('aria-label','Close question library');
  close.textContent='×';
  body.appendChild(close);

  function openPalette(){if(!mobile())return;body.classList.add('mobile-palette-open');toggle.setAttribute('aria-expanded','true');}
  function closePalette(){body.classList.remove('mobile-palette-open');toggle.setAttribute('aria-expanded','false');}
  toggle.setAttribute('aria-controls','palette');
  toggle.setAttribute('aria-expanded','false');
  toggle.addEventListener('click',()=>body.classList.contains('mobile-palette-open')?closePalette():openPalette());
  close.addEventListener('click',closePalette);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closePalette();});

  let before=null;
  palette.addEventListener('pointerdown',e=>{
    const button=e.target.closest('[data-type]');
    if(!button)return;
    before={count:state.questions.length,selected:state.selected,type:button.dataset.type};
  },true);

  palette.addEventListener('click',e=>{
    const button=e.target.closest('[data-type]');
    if(!button)return;
    const snapshot=before||{count:state.questions.length,selected:state.selected,type:button.dataset.type};
    setTimeout(()=>{
      // If another builder override prevented the original handler, recover here.
      if(state.questions.length===snapshot.count&&state.selected===snapshot.selected){
        try{
          const q=qNew(button.dataset.type);
          const i=state.questions.findIndex(x=>x.id===state.selected);
          if(i<0)state.questions.push(q);else state.questions.splice(i+1,0,q);
          state.selected=q.id;
          render();
        }catch(err){console.error('Question add fallback failed',err);}
      }
      closePalette();
      requestAnimationFrame(()=>{
        const article=state.selected?document.querySelector(`[data-qid="${state.selected}"]`):null;
        article?.scrollIntoView({behavior:'smooth',block:'start'});
        article?.querySelector('.inline-question-title')?.focus({preventScroll:true});
      });
      before=null;
    },0);
  });

  // Make top-level actions visibly respond on mobile and ensure the inspector is brought onscreen.
  document.getElementById('settingsBtn')?.addEventListener('click',()=>{
    closePalette();
    requestAnimationFrame(()=>document.getElementById('inspector')?.classList.add('open'));
  });
  document.addEventListener('click',e=>{
    if(e.target.closest('[data-advanced]')){
      closePalette();
      requestAnimationFrame(()=>document.getElementById('inspector')?.classList.add('open'));
    }
  });

  window.addEventListener('resize',()=>{if(!mobile())closePalette();},{passive:true});
})();
