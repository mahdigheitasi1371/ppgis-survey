// Mobile-only map controls: keep map clear and reveal secondary tools on demand.
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
    toggle.setAttribute('aria-label','Map tools');
    toggle.setAttribute('aria-expanded','false');
    toggle.textContent='⋯';
    panel.appendChild(toggle);

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
      setOpen(!panel.classList.contains('mobile-tools-open'));
    });

    panel.querySelectorAll('[data-city-results] button').forEach(b=>b.addEventListener('click',()=>setOpen(false)));

    const map=card.querySelector('.map-box');
    map?.addEventListener('pointerdown',()=>{
      if(panel.classList.contains('mobile-tools-open'))setOpen(false);
    },{passive:true});
  }

  function enhance(){
    if(!mobile())return;
    document.querySelectorAll('.map-page-card').forEach(enhanceCard);
  }

  const observer=new MutationObserver(enhance);
  observer.observe(document.documentElement,{subtree:true,childList:true});
  window.addEventListener('resize',enhance,{passive:true});
  window.addEventListener('orientationchange',()=>setTimeout(enhance,150),{passive:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',enhance);else enhance();
})();
