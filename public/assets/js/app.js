let lsDB=JSON.parse(localStorage.getItem('singularity_store_v10')||'{}');
function sLS(){localStorage.setItem('singularity_store_v10',JSON.stringify(lsDB));}
function msToTm(s){if(!s)return"0m";let h=Math.floor(s/3600);let m=Math.floor((s%3600)/60);return h>0?`${h}h ${m}m`:`${m}m`;}
function tsToDt(t){if(!t)return"Never";let d=Date.now()-t;if(d<86400000)return"Today";if(d<172800000)return"Yesterday";return new Date(t).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});}
function formatPlaytimeHover(secs){if(!secs)return"00d:00h:00m";let d=Math.floor(secs/86400);let h=Math.floor((secs%86400)/3600);let m=Math.floor((secs%3600)/60);return `${d.toString().padStart(2,'0')}d:${h.toString().padStart(2,'0')}h:${m.toString().padStart(2,'0')}m`;}

function showToast(msg){
  let t=document.createElement('div');t.innerText=msg;
  t.style.cssText="position:fixed;top:20px;left:50%;transform:translateX(-50%);background:rgba(255,255,255,0.1);backdrop-filter:blur(15px);border:1px solid rgba(255,255,255,0.2);padding:12px 24px;border-radius:100px;color:#fff;font-size:14px;font-weight:600;z-index:9999999999;opacity:0;transition:0.4s;";
  document.body.appendChild(t);
  setTimeout(()=>t.style.opacity='1',100);
  setTimeout(()=>{t.style.opacity='0';setTimeout(()=>t.remove(),400);},3000);
}

function clsA2hs(){localStorage.setItem('fig_a2hs','1');document.getElementById('m-a2hs').style.bottom='-200px';}

window.addEventListener('DOMContentLoaded',()=>{
  let isMobile=/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)||window.innerWidth<1024;
  let isStandAlone=window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone||document.referrer.includes('android-app://');
  if(isMobile){
    setTimeout(()=>{showToast("Welcome to Figure - Mobile");},2500);
    if(!localStorage.getItem('fig_a2hs')&&!isStandAlone){
      setTimeout(()=>{let el=document.getElementById('m-a2hs');if(el)el.style.bottom='0px';},5000);
    }
  }
  let b=document.getElementById('new-boot');
  let aw=document.getElementById('app-wrap');
  setTimeout(()=>{
    b.style.opacity='0';
    setTimeout(()=>{b.style.display='none';aw.style.opacity='1';},800);
  },3000);

  let t=localStorage.getItem('figure_theme')||'void';setTheme(t);
  let p=localStorage.getItem('fig_particles')||'none';setParticles(p);

  let uP=new URLSearchParams(window.location.search);
  let gParam=uP.get('game');let embParam=uP.get('embed');


  if(embParam){
    if(typeof G_DATA!=='undefined'){
      let f=G_DATA.find(x=>x.id===gParam);
      if(f){document.body.innerHTML='<iframe src="'+(f.url||f.path)+'" style="position:fixed;inset:0;width:100%;height:100%;border:none;z-index:99999999;"></iframe>';}
    }
    return;
  }

  if(!localStorage.getItem('singularity_legal_accepted'))showPopup('p-legal-block');

  let checkAttempts=0;
  let checkG=setInterval(()=>{
    if(typeof G_DATA!=='undefined'&&Array.isArray(G_DATA)){
      clearInterval(checkG);
      let ef=document.getElementById('error-fallback');if(ef)ef.style.display='none';
      dodeLayout();
      if(gParam){
        let g=G_DATA.find(x=>x.id===gParam);
        if(g){cxG=g;opMdl(g.id);setTimeout(try2launch,500);}
      }
    }else{
      checkAttempts++;
      if(checkAttempts>100){
        clearInterval(checkG);
        let ef=document.getElementById('error-fallback');
        if(ef)ef.style.display='block';
      }
    }
  },50);
  rSz();aP();
});

let bgM=new Audio('backgroundmusic.mp3');bgM.loop=true;let bgMuted=localStorage.getItem('bg_muted')==='true';let aInit=false;
function initAudio(){if(!aInit&&!bgMuted){bgM.play().catch(e=>console.log(e));aInit=true;}}
window.addEventListener('pointerdown',initAudio,{once:true});
window.addEventListener('keydown',initAudio,{once:true});

let gpLoop,lastGpState={},focusedEl=null,lastGpMove=0,curTabIdx=0;
const TABS=['singularity','lib','tut','set'];
function gpInit(){if(gpLoop)return;gpLoop=requestAnimationFrame(gpUpdate);}
function gpUpdate(){
  let gps=navigator.getGamepads();
  if(gps[0]){
    let bA=gps[0].buttons[0].pressed;
    let bB=gps[0].buttons[1].pressed;
    let LB=gps[0].buttons[4].pressed;
    let RB=gps[0].buttons[5].pressed;
    let dU=gps[0].buttons[12].pressed||gps[0].axes[1]<-0.5;
    let dD=gps[0].buttons[13].pressed||gps[0].axes[1]>0.5;
    let dL=gps[0].buttons[14].pressed||gps[0].axes[0]<-0.5;
    let dR=gps[0].buttons[15].pressed||gps[0].axes[0]>0.5;
    if(bB&&!lastGpState.B){if(document.getElementById('modal-ui').style.display==='block')clsMdl();}
    if(bA&&!lastGpState.A&&focusedEl)focusedEl.click();
    if(LB&&!lastGpState.LB){curTabIdx=(curTabIdx-1+TABS.length)%TABS.length;chgTab(TABS[curTabIdx]);}
    if(RB&&!lastGpState.RB){curTabIdx=(curTabIdx+1)%TABS.length;chgTab(TABS[curTabIdx]);}
    let now=Date.now();
    if(dU||dD||dL||dR){
      if(now-lastGpMove>150){moveFocus(dU,dD,dL,dR);lastGpMove=now;}
    }else{lastGpMove=0;}
    lastGpState={A:bA,B:bB,LB:LB,RB:RB,U:dU,D:dD,L:dL,R:dR};
    document.getElementById('b-btn-hint').style.display='flex';
  }
  requestAnimationFrame(gpUpdate);
}

function moveFocus(u,d,l,r){
  let els=Array.from(document.querySelectorAll('.c-h, .c-v, .d-btn, .m-play, .m-close-btn, .show-login-btn, .hero-cont, .swatch-btn, .p-card')).filter(e=>e.offsetParent!==null);
  if(els.length===0)return;
  if(!focusedEl||els.indexOf(focusedEl)===-1){focusedEl=els[0];updateFocusUI();return;}
  let curRect=focusedEl.getBoundingClientRect();
  let best=null;let bestDist=Infinity;
  els.forEach(el=>{
    if(el===focusedEl)return;
    let rect=el.getBoundingClientRect();
    let dx=rect.left-curRect.left;
    let dy=rect.top-curRect.top;
    let dist=Math.sqrt(dx*dx+dy*dy);
    let valid=false;
    if(u&&dy<-10&&Math.abs(dx)<Math.abs(dy)*2)valid=true;
    if(d&&dy>10&&Math.abs(dx)<Math.abs(dy)*2)valid=true;
    if(l&&dx<-10&&Math.abs(dy)<Math.abs(dx)*2)valid=true;
    if(r&&dx>10&&Math.abs(dy)<Math.abs(dx)*2)valid=true;
    if(valid&&dist<bestDist){bestDist=dist;best=el;}
  });
  if(best){focusedEl=best;updateFocusUI();best.scrollIntoView({behavior:"smooth",block:"center",inline:"center"});}
}
function updateFocusUI(){
  document.querySelectorAll('.gp-focus').forEach(e=>e.classList.remove('gp-focus'));
  if(focusedEl)focusedEl.classList.add('gp-focus');
}
window.addEventListener("gamepadconnected",(e)=>{showToast("🎮 Most games should have controller support");gpInit();});

let heroArr=[];let hIdx=0;let heroInterval;
function dodeLayout(){
  try{
    heroArr=[];
    let pg=Object.keys(lsDB).filter(k=>lsDB[k]&&lsDB[k].t>0).sort((a,b)=>((lsDB[b]?lsDB[b].l:0)-(lsDB[a]?lsDB[a].l:0)));
    if(pg.length>0){let lp=G_DATA.find(x=>x.id===pg[0]);if(lp)heroArr.push({...lp,tag:'RESUME',sub:msToTm(lsDB[lp.id].t)+' Played'});}
    let rnd=[...G_DATA].sort(()=>0.5-Math.random()).slice(0,3);
    rnd.forEach(r=>{if(!heroArr.find(x=>x.id===r.id))heroArr.push({...r,tag:'FEATURED',sub:(r.tags||[]).join(" • ")});});
    rendertheBanner();
    if(heroInterval)clearInterval(heroInterval);
    heroInterval=setInterval(()=>{hIdx=(hIdx+1)%heroArr.length;rendertheBanner();},6000);

    let dayHtml='',trndHtml='',libHtml='';
    let popFilter=G_DATA.filter(g=>g.n.toLowerCase().includes('poppy'));
    let raceFilter=G_DATA.filter(g=>(g.tags||[]).includes('Racing')||(g.tags||[]).includes('Driving'));
    let recFilter=[...G_DATA].sort(()=>0.5-Math.random()).slice(0,10);

    G_DATA.forEach((g,i)=>{
      libHtml+=makethecard(g,'v');
      if(i<4)dayHtml+=makethecard(g,'h');
      else if(i>=4&&i<8)trndHtml+=makethecard(g,'h');
    });

    document.getElementById('g-recom-track').innerHTML=recFilter.map(g=>makethecard(g,'h')).join('').repeat(2);
    document.getElementById('g-poppy').innerHTML=popFilter.map(g=>makethecard(g,'h')).join('');
    document.getElementById('g-race').innerHTML=raceFilter.slice(0,4).map(g=>makethecard(g,'h')).join('');
    document.getElementById('g-day').innerHTML=dayHtml;
    document.getElementById('g-trnd').innerHTML=trndHtml;
    document.getElementById('g-lib').innerHTML=libHtml;
    rfrTrk();
  }catch(e){console.log(e);}
}

function rendertheBanner(){
  if(!heroArr.length)return;let g=heroArr[hIdx];
  document.getElementById('hc-tag').innerText=g.tag;document.getElementById('hc-title').innerText=g.n;
  document.getElementById('hc-time').innerText=g.sub;document.getElementById('hc-dev').innerText=g.dev;
  let imgEl=document.getElementById('hc-img');imgEl.style.opacity=0;
  setTimeout(()=>{imgEl.src=g.bg;imgEl.style.opacity=0.8;},300);
  document.getElementById('hc-box').onclick=()=>opMdl(g.id);
}

function makethecard(g,type){
  let tStr=formatPlaytimeHover(lsDB[g.id]?lsDB[g.id].t:0);
  let th=`<div class="c-time-hover"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>Time Played: ${tStr}</div>`;
  let src=(g.n+' '+(g.tags||[]).join(' ')+' '+g.dev).toLowerCase();
  return `<div class="c-${type}" onclick="opMdl('${g.id}')" data-search="${src}"><img src="${type==='h'?g.bg:g.img}"><div class="c-inf"><h3>${g.n}</h3><span>${g.dev}</span>${th}</div></div>`;
}

function filterLib(){
  let q=document.getElementById('lib-search').value.toLowerCase();
  document.querySelectorAll('#g-lib .c-v').forEach(c=>{c.style.display=c.getAttribute('data-search').includes(q)?'block':'none';});
}

function chgTab(v){
  document.querySelectorAll('.d-btn').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.tab-view').forEach(s=>s.classList.remove('active'));
  let btn=document.getElementById('b-'+v),view=document.getElementById('v-'+v);
  if(btn)btn.classList.add('active');if(view)view.classList.add('active');
  if(v==='tut'){fdM(0,800);}else{fdM(0.5,800);}
}

let isAuth=false,devMode=false;
const RAC_LOGIN="https://www.raccoongame.com/login?redirect_uri=https%3A%2F%2Fwww.raccoongame.com%2Fwap%2Fdist%2F%23%2Fplatform%2Fset&lang=en";
function openAuthTray(){
  document.getElementById('login-trigger').style.display='none';
  let isMobile=/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)||window.innerWidth<1024;
  if(isMobile){
    window.open(RAC_LOGIN,"_blank");
    let rf=document.getElementById('rac-frame');if(rf)rf.style.display='none';
    let mw=document.getElementById('mail-wrapper');if(mw)mw.style.display='none';
  }else{
    document.getElementById('rac-frame').src=RAC_LOGIN;
  }
  document.getElementById('frame-area').classList.add('show');
}
function markAsLoggedIn(){if(isAuth)return;isAuth=true;document.getElementById('frame-area').classList.remove('show');setTimeout(()=>{document.getElementById('frame-area').style.display='none';},800);document.getElementById('auth-success').style.display='block';document.getElementById('login-trigger').style.display='none';}
function forceLoginReopen(){
  document.getElementById('auth-success').style.display='none';
  let isMobile=/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)||window.innerWidth<1024;
  if(isMobile)window.open(RAC_LOGIN,"_blank");
  else document.getElementById('rac-frame').src=RAC_LOGIN;
  document.getElementById('frame-area').style.display='flex';
  setTimeout(()=>{document.getElementById('frame-area').classList.add('show');},50);
}
let frC=0;document.getElementById('rac-frame').addEventListener('load',()=>{frC++;if(frC>=2&&!devMode)markAsLoggedIn();});
window.addEventListener('keydown',(e)=>{if(e.altKey&&e.key.toLowerCase()==='s'){devMode=true;frC=0;forceLoginReopen();}});

function showPopup(id){let el=document.getElementById(id);el.style.display='flex';setTimeout(()=>el.classList.add('show'),10);}
function hidePopup(id){let el=document.getElementById(id);el.classList.remove('show');setTimeout(()=>el.style.display='none',300);}
function closePopupClick(e){if(e.target.classList.contains('popup-wrap')&&e.target.id!=='p-legal-block')hidePopup(e.target.id);}
function goToTutorial(){hidePopup('p-tut-block');clsMdl();chgTab('tut');}
function checkLegalScroll(el){if(Math.ceil(el.scrollHeight-el.scrollTop)<=el.clientHeight+10)document.getElementById('btn-legal-accept').disabled=false;}
function acceptLegal(){localStorage.setItem('singularity_legal_accepted','true');hidePopup('p-legal-block');}

let cxG=null;
function opMdl(id){
  cxG=G_DATA.find(x=>x.id===id);let d=lsDB[id]||{t:0,l:null};
  document.getElementById('mdl-bg').src=cxG.bg;document.getElementById('mdl-post').src=cxG.img;
  document.getElementById('mdl-t').innerText=cxG.n;document.getElementById('mdl-d').innerText=cxG.dev;document.getElementById('mdl-dc').innerText=cxG.desc;
  document.getElementById('mdl-tm').innerText=msToTm(d.t);document.getElementById('mdl-lp').innerText=tsToDt(d.l);document.getElementById('mdl-ac').innerText=cxG.ach;
  document.getElementById('mdl-tg').innerHTML=cxG.tags.map(t=>`<div class="m-tg">${t}</div>`).join('');
  document.getElementById('qm-os').innerText=cxG.rm.os;document.getElementById('qm-cpu').innerText=cxG.rm.cpu;document.getElementById('qm-ram').innerText=cxG.rm.ram;document.getElementById('qm-gpu').innerText=cxG.rm.gpu;
  document.getElementById('qr-os').innerText=cxG.rr.os;document.getElementById('qr-cpu').innerText=cxG.rr.cpu;document.getElementById('qr-ram').innerText=cxG.rr.ram;document.getElementById('qr-gpu').innerText=cxG.rr.gpu;
  let b=document.getElementById('btn-bookmark');if(b)b.href="javascript:(function(){window.location.href='"+window.location.origin+window.location.pathname+"?game="+cxG.id+"';})()";
  let m=document.getElementById('modal-ui');m.style.display='block';setTimeout(()=>m.style.opacity='1',10);
  evalBgMusic();
}
function clsMdl(){let m=document.getElementById('modal-ui');m.style.opacity='0';setTimeout(()=>m.style.display='none',500);evalBgMusic();}

let wAt=false;let dEn=0;let tTr;
function try2launch(){
  let isMobile=/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)||window.innerWidth<1024;
  if(gmWin&&!gmWin.closed&&!isMobile){showPopup('p-sess-block');return;}
  if(isMobile)rnLd();
  else{showPopup('p-tut-block');wAt=true;}
}

function launchGame(mode){
  hidePopup('p-launch-mode');
  let tU=cxG.url||cxG.path;
  if(mode==='tab'){
    let nw=window.open(tU,'_blank');
    gmWin={closed:false,close:function(){if(nw)nw.close();clsGm();}};
    trStart(cxG.id);
  }else{rnLd();}
}

window.addEventListener('keydown',(e)=>{
  if(e.key==='Enter'&&wAt){
    e.preventDefault();dEn++;clearTimeout(tTr);tTr=setTimeout(()=>dEn=0,500);
    if(dEn===2){hidePopup('p-tut-block');wAt=false;dEn=0;showPopup('p-launch-mode');}
  }
});

let gmWin=null;let gmId=null;let gInt=null;let gSs=0;
function tglV(v){
  if(v==='h'){
    document.getElementById('app-wrap').style.display='block';document.querySelector('.dock-wrap').style.display='flex';
    document.getElementById('game-layer').style.display='none';
    fdM(0.5,800);
  }else{
    document.getElementById('app-wrap').style.display='none';document.querySelector('.dock-wrap').style.display='none';
    document.getElementById('game-layer').style.display='block';
    fdM(0,800);
  }
}

function clsGm(e){
  if(e)e.stopPropagation();document.getElementById('n-game').style.display='none';document.getElementById('gF').src="";
  if(gmWin)gmWin.closed=true;if(document.exitFullscreen)document.exitFullscreen().catch(()=>{});
  if(document.exitPointerLock)document.exitPointerLock();if(navigator.keyboard)navigator.keyboard.unlock();
  tglV('h');
}

function mnLk(){
  let f=document.getElementById('gF');let gl=document.getElementById('game-layer');
  if(!document.fullscreenElement){if(gl.requestFullscreen)gl.requestFullscreen().then(()=>{if(navigator.keyboard)navigator.keyboard.lock(['Escape']);}).catch(()=>{});else if(gl.webkitRequestFullscreen)gl.webkitRequestFullscreen();else if(document.documentElement.requestFullscreen)document.documentElement.requestFullscreen();}
  if(f.requestPointerLock)f.requestPointerLock();else if(f.webkitRequestPointerLock)f.webkitRequestPointerLock();else document.body.requestPointerLock();f.focus();
}

let aZc=3,aZi=null,aZd=false;let aCc=3,aCi=null,aCd=false;
window.addEventListener('keydown',(e)=>{
  if(e.altKey&&e.key.toLowerCase()==='z'){if(!aZd&&document.getElementById('game-layer').style.display==='block'){let d=document.getElementById('tD');aZd=true;aZc=3;d.innerText=aZc;d.style.top='20px';aZi=setInterval(()=>{aZc--;if(aZc>0)d.innerText=aZc;else{clearInterval(aZi);d.style.top='-100px';mnLk();}},1000);}}
  if(e.altKey&&e.key.toLowerCase()==='c'){if(!aCd&&document.getElementById('game-layer').style.display==='block'){let d=document.getElementById('eD');aCd=true;aCc=3;d.innerText=aCc;d.style.top='20px';aCi=setInterval(()=>{aCc--;if(aCc>0)d.innerText=aCc;else{clearInterval(aCi);d.style.top='-100px';if(document.exitFullscreen)document.exitFullscreen().catch(()=>{});if(document.exitPointerLock)document.exitPointerLock();if(navigator.keyboard)navigator.keyboard.unlock();}},1000);}}
});
window.addEventListener('keyup',(e)=>{if(e.key.toLowerCase()==='z'||e.key==='Alt'){aZd=false;clearInterval(aZi);let td=document.getElementById('tD');if(td)td.style.top='-100px';}if(e.key.toLowerCase()==='c'||e.key==='Alt'){aCd=false;clearInterval(aCi);let ed=document.getElementById('eD');if(ed)ed.style.top='-100px';}});

let sessionPopUp=false,sTo=null,sTg=false;
setInterval(()=>{if(document.getElementById('game-layer').style.display==='block'){try{let f=document.getElementById('gF');if(f.contentWindow.location.href.includes('https://www.raccoongame.com/login')){if(sessionPopUp&&!sTg){sTg=true;sTo=setTimeout(()=>{document.getElementById('lO').style.display='flex';if(document.exitPointerLock)document.exitPointerLock();},10000);}}else{sTg=false;clearTimeout(sTo);}}catch(e){}}else{sTg=false;clearTimeout(sTo);}},1500);

function rnLd(){
  clsMdl();let tU=cxG.url||cxG.path;
  let isM=/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)||window.innerWidth<1024;
  if(isM){
    showToast("Please note: You will need to click play manually.");
    let nw=window.open(tU,'_blank');
    gmWin={closed:false,close:function(){if(nw)nw.close();clsGm();}};
    trStart(cxG.id);
    return;
  }
  document.getElementById('n-game-title').innerText=cxG.n;document.getElementById('n-game').style.display='flex';
  let f=document.getElementById('gF'),s=document.getElementById('bS'),bt=document.getElementById('bS-t'),lo=document.getElementById('lO');
  if(bt)bt.innerText='Loading '+cxG.n+'...';s.style.display='flex';s.style.opacity='1';lo.style.display='none';tglV('g');
  gmWin={closed:false,close:function(){clsGm();}};setTimeout(()=>{f.src=tU;setTimeout(()=>{if(s){s.style.opacity='0';setTimeout(()=>s.style.display='none',1000);}},1500);},2500);trStart(cxG.id);
}

function trStart(id){
  if(gInt)clearInterval(gInt);gmId=id;if(!lsDB[id])lsDB[id]={t:0,l:Date.now()};lsDB[id].l=Date.now();sLS();gSs=lsDB[id].t;rfrTrk();
  gInt=setInterval(()=>{if(gmWin&&!gmWin.closed){gSs++;if(gSs%5===0){lsDB[id].t=gSs;lsDB[id].l=Date.now();sLS();}}else{clearInterval(gInt);lsDB[id].t=gSs;lsDB[id].l=Date.now();sLS();gmWin=null;gmId=null;gInt=null;rfrTrk();dodeLayout();}},1000);
}

function rfrTrk(){
  let widg=document.getElementById('tk');
  if(gmWin&&gmId){let g=G_DATA.find(x=>x.id===gmId);if(g){document.getElementById('tk-img').src=g.img;document.getElementById('tk-lbl').innerText="Playing Now";document.getElementById('tk-lbl').style.color="#fff";document.getElementById('tk-nm').innerText=g.n;let btn=document.getElementById('tk-btn');btn.className="tw-btn quit";btn.innerText="Quit Game";widg.style.display="flex";}}
  else{let pg=Object.keys(lsDB).filter(k=>lsDB[k].t>0);if(pg.length>0){let bId=pg.sort((a,b)=>lsDB[b].l-lsDB[a].l)[0];let g=G_DATA.find(x=>x.id===bId);if(g){document.getElementById('tk-img').src=g.img;document.getElementById('tk-lbl').innerText="Last Played";document.getElementById('tk-lbl').style.color="#a1a1a6";document.getElementById('tk-nm').innerText=g.n;let btn=document.getElementById('tk-btn');btn.className="tw-btn";btn.innerText="Launch";widg.style.display="flex";}}else widg.style.display="none";}
}

function tkAction(){if(gmWin&&!gmWin.closed)gmWin.close();else{let pg=Object.keys(lsDB).filter(k=>lsDB[k].t>0);if(pg.length>0){let bId=pg.sort((a,b)=>lsDB[b].l-lsDB[a].l)[0];cxG=G_DATA.find(x=>x.id===bId);try2launch();}}}

function fdM(tg,d){
  if(bgMuted)return;
  if(tg>0&&bgM.paused){bgM.volume=0;bgM.play().catch(()=>{});}
  let s=bgM.volume,st=Date.now();if(window.fdIv)clearInterval(window.fdIv);
  window.fdIv=setInterval(()=>{
    let pct=(Date.now()-st)/d;if(pct>=1){clearInterval(window.fdIv);bgM.volume=tg;if(tg===0)bgM.pause();}else bgM.volume=s+(tg-s)*pct;
  },16);
}
function evalBgMusic(){
  if(bgMuted||document.getElementById('game-layer').style.display==='block'){if(window.fdIv)clearInterval(window.fdIv);bgM.pause();return;}
  let vol=0.5;if(document.getElementById('v-tut').classList.contains('active'))vol=0.08;
  fdM(vol,800);
}
function toggleBGM(){
  bgMuted=!bgMuted;localStorage.setItem('bg_muted',bgMuted);
  document.getElementById('music-toggle-btn').innerText=bgMuted?"Unmute Music":"Mute Music";
  if(bgMuted){if(window.fdIv)clearInterval(window.fdIv);bgM.pause();}else{evalBgMusic();}
}

document.addEventListener('visibilitychange',()=>{
  if(document.hidden){if(!bgMuted&&!bgM.paused)fdM(0,500);}
  else{evalBgMusic();}
});
window.addEventListener('blur',()=>{if(!bgMuted&&!bgM.paused)fdM(0,500);});
window.addEventListener('focus',()=>{evalBgMusic();});

const THEMES={
  void:['#160926','#b266ff','rgba(168, 85, 247, 0.35)'],
  dark:['#050505','#ffffff','rgba(255, 255, 255, 0.08)'],
  figure:['#0c0202','#ff3333','rgba(255, 50, 50, 0.15)'],
  neon:['#020b14','#00d2ff','rgba(0, 210, 255, 0.15)'],
  forest:['#010f08','#05c46b','rgba(5, 196, 107, 0.15)'],
  sunset:['#120410','#f53b57','rgba(245, 59, 87, 0.15)'],
  amethyst:['#0a0310','#a55eea','rgba(165, 94, 234, 0.15)'],
  gold:['#0f0e05','#f1c40f','rgba(241, 196, 15, 0.15)'],
  hacker:['#020802','#0f0','rgba(0, 255, 0, 0.15)'],
  ocean:['#020914','#0abde3','rgba(10, 189, 227, 0.15)'],
  lava:['#140402','#ee5253','rgba(238, 82, 83, 0.15)'],
  cyberp:['#110214','#D980FA','rgba(217, 128, 250, 0.15)'],
  ice:['#050a0f','#c8d6e5','rgba(200, 214, 229, 0.15)'],
  rose:['#14020a','#f368e0','rgba(243, 104, 224, 0.15)'],
  mint:['#02140d','#1dd1a1','rgba(29, 209, 161, 0.15)'],
  crimson:['#140101','#c23616','rgba(194, 54, 22, 0.15)']
};
function setTheme(t){
  let r=document.documentElement;
  let c=THEMES[t];
  if(c){r.style.setProperty('--bg',c[0]);r.style.setProperty('--accent',c[1]);r.style.setProperty('--border',c[2]);}
  localStorage.setItem('figure_theme',t);document.querySelectorAll('.swatch-btn').forEach(s=>s.classList.remove('active'));let act=document.querySelector(`.btn-${t}`);if(act)act.classList.add('active');
}

function getEmbedCode(g){
  let u=g.url||g.path;
  let raw=`(function(){var e=document.createElement('div');e.style='position:fixed;top:0;left:0;width:100%;height:100%;background:#050505;z-index:9999999;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;font-family:sans-serif;font-size:24px;font-weight:bold;';e.innerHTML='<img src="https://freepngimg.com/convert-png/89656-icons-circle-computer-black-white-steam" style="width:80px;margin-bottom:20px;animation:pulse 1.5s infinite;"><div style="letter-spacing:2px;">Powered By Figure Cloud</div><style>@keyframes pulse{0%{transform:scale(1);}50%{transform:scale(1.1);}100%{transform:scale(1);}}</style>';document.body.appendChild(e);setTimeout(function(){e.style.opacity='0';e.style.transition='opacity 0.5s';setTimeout(function(){e.remove();var i=document.createElement('iframe');i.src='${u}';i.style='position:fixed;top:0;left:0;width:100%;height:100%;border:none;z-index:9999998;';document.body.appendChild(i);},500);},3000);})();`;
  let obf=btoa(unescape(encodeURIComponent(raw)));
  return '<script>eval(decodeURIComponent(escape(atob("'+obf+'"))));<\/script>';
}

function showEmbedPopup(){if(!cxG)return;document.getElementById('embed-code-area').value=getEmbedCode(cxG);showPopup('p-embed-block');}
function copyEmbedCode(){let a=document.getElementById('embed-code-area');a.select();a.setSelectionRange(0,99999);navigator.clipboard.writeText(a.value);showToast("Embed code copied!");}

document.addEventListener('pointerlockchange',()=>{let o=document.getElementById('pointer-lock-overlay');if(document.getElementById('game-layer').style.display==='block'){if(!document.pointerLockElement)o.style.display='flex';else o.style.display='none';}});
document.getElementById('pointer-lock-overlay').addEventListener('click',()=>{let f=document.getElementById('gF');f.focus();if(f.requestPointerLock)f.requestPointerLock();else if(document.body.requestPointerLock)document.body.requestPointerLock();if(!document.fullscreenElement){let gl=document.getElementById('game-layer');if(gl.requestFullscreen)gl.requestFullscreen();else if(gl.webkitRequestFullscreen)gl.webkitRequestFullscreen();}});

let mX=0,mY=0;
window.addEventListener('mousemove',e=>{mX=e.clientX;mY=e.clientY;});

let pC,pCtx,pArr=[],pType='none';
function rSz(){pC=document.getElementById('bg-particles');if(!pC)return;pCtx=pC.getContext('2d');let dpr=window.devicePixelRatio||1;pC.width=window.innerWidth*dpr;pC.height=window.innerHeight*dpr;pC.style.width=window.innerWidth+'px';pC.style.height=window.innerHeight+'px';pCtx.scale(dpr,dpr);iP();}
window.addEventListener('resize',rSz);
function iP(){
  pArr=[];if(pType==='none')return;let cnt=(pType==='snow'||pType==='rain'||pType==='matrix')?80:(pType==='fireflies'||pType==='nexus')?60:30;
  for(let i=0;i<cnt;i++){
    pArr.push({
      x:Math.random()*window.innerWidth,y:Math.random()*window.innerHeight,
      r:pType==='snow'?Math.random()*2+1:pType==='stars'?Math.random()*1.5+0.5:pType==='bubbles'?Math.random()*4+2:pType==='fireflies'?Math.random()*2+1.5:2,
      vy:pType==='snow'?Math.random()*1+0.5:pType==='rain'?Math.random()*15+10:pType==='matrix'?Math.random()*5+2:pType==='bubbles'?-(Math.random()*2+1):pType==='fireflies'?(Math.random()*2-1):pType==='nexus'?(Math.random()*1-0.5):0,
      vx:pType==='snow'?Math.random()*0.8-0.4:pType==='cyber'?Math.random()*5+3:pType==='bubbles'?Math.random()*1-0.5:pType==='fireflies'?(Math.random()*2-1):pType==='nexus'?(Math.random()*1-0.5):0,
      l:pType==='rain'?Math.random()*20+10:pType==='cyber'?Math.random()*50+20:0,
      c:pType==='cyber'?'rgba(0,210,255,0.4)':pType==='stars'?'#fff':pType==='matrix'?'#0f0':pType==='bubbles'?'rgba(255,255,255,0.2)':pType==='fireflies'?'rgba(255,255,100,0.8)':pType==='nexus'?'rgba(255,255,255,0.4)':'rgba(255,255,255,0.5)',
      o:Math.random(),do:Math.random()*0.02+0.01,
      char:String.fromCharCode(0x30A0+Math.random()*96)
    });
  }
}
function aP(){
  if(!pCtx){requestAnimationFrame(aP);return;}pCtx.clearRect(0,0,window.innerWidth,window.innerHeight);
  if(pType!=='none'){
    pArr.forEach(p=>{
      pCtx.beginPath();
      if(pType==='rain'||pType==='cyber'){pCtx.rect(p.x,p.y,pType==='rain'?1:p.l,pType==='rain'?p.l:1);pCtx.fillStyle=p.c;}
      else if(pType==='matrix'){pCtx.font="14px monospace";pCtx.fillStyle=p.c;pCtx.fillText(p.char,p.x,p.y);if(Math.random()<0.05)p.char=String.fromCharCode(0x30A0+Math.random()*96);}
      else{pCtx.arc(p.x,p.y,p.r,0,Math.PI*2);pCtx.fillStyle=p.c;if(pType==='bubbles'){pCtx.strokeStyle='rgba(255,255,255,0.4)';pCtx.stroke();pCtx.fillStyle='transparent';}}
      if(pType==='stars'||pType==='fireflies'){p.o+=p.do;if(p.o>1||p.o<0.1)p.do*=-1;pCtx.globalAlpha=p.o;}
      pCtx.fill();pCtx.globalAlpha=1;
      if(pType==='fireflies'){
        let dx=mX-p.x;let dy=mY-p.y;let dist=Math.sqrt(dx*dx+dy*dy);
        if(dist<100){p.vx-=dx*0.005;p.vy-=dy*0.005;}
        p.vx*=(Math.random()*0.1+0.9);p.vy*=(Math.random()*0.1+0.9);
      }
      if(pType==='nexus'){
        let dx=mX-p.x;let dy=mY-p.y;let dist=Math.sqrt(dx*dx+dy*dy);
        if(dist<150){p.x-=dx*0.02;p.y-=dy*0.02;}
        pArr.forEach(p2=>{
          let d2=Math.sqrt(Math.pow(p2.x-p.x,2)+Math.pow(p2.y-p.y,2));
          if(d2<80){pCtx.beginPath();pCtx.moveTo(p.x,p.y);pCtx.lineTo(p2.x,p2.y);pCtx.strokeStyle=`rgba(255,255,255,${1-(d2/80)})`;pCtx.stroke();}
        });
      }
      p.x+=p.vx;p.y+=p.vy;
      if(pType==='snow'||pType==='rain'||pType==='matrix'){if(p.y>window.innerHeight){p.y=-20;p.x=Math.random()*window.innerWidth;}}
      else if(pType==='cyber'){if(p.x>window.innerWidth){p.x=-100;p.y=Math.random()*window.innerHeight;}}
      else if(pType==='bubbles'){if(p.y<0){p.y=window.innerHeight+20;p.x=Math.random()*window.innerWidth;}}
      else if(pType==='fireflies'||pType==='nexus'){
        if(p.x<0||p.x>window.innerWidth)p.vx*=-1;
        if(p.y<0||p.y>window.innerHeight)p.vy*=-1;
      }
    });
  }
  requestAnimationFrame(aP);
}
function setParticles(t){pType=t;localStorage.setItem('fig_particles',t);iP();document.querySelectorAll('.p-card').forEach(c=>c.classList.remove('p-card-active'));let act=document.querySelector(`.card-${t}`);if(act)act.classList.add('p-card-active');}
