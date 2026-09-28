(function(){
  'use strict';
  const view=document.getElementById('resultsView');
  if(!view)return;
  let listeners;

  function mount(){
    const table=view.querySelector('.dashboard-table-wrap');
    if(!table){listeners?.abort();listeners=null;return}
    if(table.dataset.resultsScrollReady)return;
    listeners?.abort();
    listeners=new AbortController();
    table.dataset.resultsScrollReady='true';

    function makeBar(className,label){
      const bar=document.createElement('div');
      bar.className=className;
      bar.setAttribute('role','region');
      bar.setAttribute('aria-label',label);
      bar.tabIndex=0;
      bar.hidden=true;
      const track=document.createElement('div');
      track.className='results-scroll-track';
      bar.append(track);
      return bar;
    }
    const top=makeBar('results-top-scroll','Défilement horizontal du tableau des résultats');
    const follow=makeBar('results-follow-scroll','Défilement horizontal des résultats, accessible pendant la lecture');
    table.before(top);
    table.after(follow);

    function sync(source){
      [top,table,follow].forEach(other=>{
        if(other!==source&&Math.abs(other.scrollLeft-source.scrollLeft)>1)other.scrollLeft=source.scrollLeft;
      });
    }
    top.addEventListener('scroll',()=>sync(top),{signal:listeners.signal});
    table.addEventListener('scroll',()=>sync(table),{signal:listeners.signal});
    follow.addEventListener('scroll',()=>sync(follow),{signal:listeners.signal});

    function update(){
      const bounds=table.getBoundingClientRect();
      const overflowing=table.scrollWidth>table.clientWidth+1;
      const trackWidth=`${table.scrollWidth}px`;
      top.firstElementChild.style.width=trackWidth;
      follow.firstElementChild.style.width=trackWidth;
      top.style.width=`${bounds.width}px`;
      top.hidden=!overflowing;
      follow.hidden=!overflowing||top.getBoundingClientRect().bottom>=0||bounds.bottom<=window.innerHeight;
      if(!follow.hidden){
        follow.style.left=`${bounds.left}px`;
        follow.style.width=`${bounds.width}px`;
      }
    }
    window.addEventListener('scroll',update,{passive:true,signal:listeners.signal});
    window.addEventListener('resize',update,{passive:true,signal:listeners.signal});
    if('ResizeObserver' in window){
      const resize=new ResizeObserver(update);
      resize.observe(table);
      const innerTable=table.querySelector('table');
      if(innerTable)resize.observe(innerTable);
      listeners.signal.addEventListener('abort',()=>resize.disconnect(),{once:true});
    }
    update();
  }
  new MutationObserver(mount).observe(view,{childList:true});
  mount();
})();
