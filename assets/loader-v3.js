(() => {
  'use strict';
  const AAD = new TextEncoder().encode('living-seeds:bundle:v2');
  const byId = id => document.getElementById(id);
  function start() {
    const els = Object.fromEntries(['gate','experience','status','key','page','navigation','unlock-form','unlock','lock'].map(id=>[id,byId(id)]));
    const required=['gate','experience','status','key','page','navigation','unlock-form','unlock','lock'];
    const absent=required.filter(id=>!els[id]);
    if (absent.length) {
      document.body.textContent='Living Seeds is unable to load: missing '+absent.join(', ');
      return;
    }
    const gate=els.gate, experience=els.experience, status=els.status, input=els.key;
    const frame=els.page, navigation=els.navigation, form=els['unlock-form'];
    const unlock=els.unlock, lock=els.lock;
    let pages=[];
    let bundlePromise=fetch('./site.bundle.enc.json',{cache:'no-store'}).then(async r=>{
      if(!r.ok) throw Error('Encrypted site unavailable (HTTP '+r.status+').');
      return r.json();
    });
    bundlePromise.catch(()=>{});
    function decode(value){
      if(typeof value !== 'string'|| !/^[A-Za-z0-9_-]+$/.test(value)) throw Error('Invalid invitation key or encrypted bundle.');
      const base64=value.replace(/-/g,'+').replace(/_/g,'/');
      return Uint8Array.from(atob(base64+'='.repeat((4-base64.length%4)%4)),char=>char.charCodeAt(0));
    }
    function erase(node){while(node.lastChild)node.removeChild(node.lastChild);}
    function display(id){
      const item=pages.find(p=>p.id===id)||pages[0];
      if(!item)throw Error('No pages in the encrypted bundle.');
      const csp='<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'; font-src data:; script-src \'none\'; connect-src \'none\'; form-action \'none\'; base-uri \'none\'">';
      const markup=/<head(?:\s[^>]*)?>/i.test(item.html)?item.html.replace(/<head(?:\s[^>]*)?>/i,match=>match+csp):'<!doctype html><html><head>'+csp+'</head><body>'+item.html+'</body></html>';
      frame.srcdoc=markup;
      for(const button of navigation.querySelectorAll('button[data-page]'))button.setAttribute('aria-current',button.dataset.page===item.id?'page':'false');
      document.title=item.title+' — Living Seeds';
    }
    form.addEventListener('submit',async event=>{
      event.preventDefault();unlock.disabled=true;status.textContent='Unlocking…';
      try{
        const raw=decode(input.value.trim());
        if(raw.length!==32)throw Error('Invitation key must contain 32 bytes.');
        const bundle=await bundlePromise;
        if(bundle.v!==2||bundle.alg!=='A256GCM')throw Error('Unsupported encrypted bundle.');
        const iv=decode(bundle.iv);
        if(iv.length!==12)throw Error('Damaged encrypted bundle.');
        const key=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['decrypt']);
        const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:AAD,tagLength:128},key,decode(bundle.ciphertext));
        const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
        if(data.v!==2||data.type!=='living-seeds-pages'||!Array.isArray(data.pages)||!data.pages.length||
           !data.pages.every(p=>p&&typeof p.id==='string'&&/^[a-z0-9-]+$/.test(p.id)&&typeof p.title==='string'&&typeof p.html==='string'))throw Error('Invalid encrypted website format.');
        pages=data.pages;
        erase(navigation);
        for(const item of pages){
          const button=document.createElement('button');button.type='button';button.dataset.page=item.id;
          button.textContent=item.title;button.addEventListener('click',()=>display(item.id));navigation.appendChild(button);
        }
        display(data.home);
        input.value='';gate.hidden=true;experience.hidden=false;status.textContent='';
      }catch(error){
        status.textContent=error.name==='OperationError'?'Incorrect key or damaged bundle.':String(error.message||'Unable to unlock.');
        console.error('Living Seeds loader v3:',error);
      }finally{unlock.disabled=false;}
    });
    lock.addEventListener('click',()=>{
      pages=[];frame.removeAttribute('srcdoc');erase(navigation);experience.hidden=true;gate.hidden=false;input.value='';
      document.title='Living Seeds — Invitation';input.focus();
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
