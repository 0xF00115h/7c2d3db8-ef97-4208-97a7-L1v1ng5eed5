(() => {
  'use strict';
  const AAD = new TextEncoder().encode('living-seeds:bundle:v2');
  const byId = id => document.getElementById(id);
  function start() {
    const els = Object.fromEntries(['gate','experience','status','key','page','tree-panel','placeholder-panel','navigation','unlock-form','unlock','lock'].map(id=>[id,byId(id)]));
    const required=['gate','experience','status','key','page','tree-panel','placeholder-panel','navigation','unlock-form','unlock','lock'];
    const absent=required.filter(id=>!els[id]);
    if (absent.length) {
      document.body.textContent='Living Seeds is unable to load: missing '+absent.join(', ');
      return;
    }
    const gate=els.gate, experience=els.experience, status=els.status, input=els.key;
    const frame=els.page, treePanel=els['tree-panel'], placeholderPanel=els['placeholder-panel'], navigation=els.navigation, form=els['unlock-form'];
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
    const wizard=byId('node-wizard');
    const wizardOrigin=byId('wizard-origin');
    const wizardTitle=byId('node-title');
    const wizardDescription=byId('node-description');
    const wizardError=byId('wizard-error');
    let growTarget=null;
    function openWizard(id){
      const node=pages.find(p=>p.id===id);
      if(!node)return;
      growTarget=id;
      wizardTitle.value='';
      wizardDescription.value='';
      wizardError.textContent='';
      wizard.querySelector('input[value="spawn"]').checked=true;
      wizardOrigin.textContent='Grow from '+node.title;
      wizard.showModal();
      wizardTitle.focus();
    }
    byId('wizard-close').addEventListener('click',()=>wizard.close());
    byId('wizard-submit').addEventListener('click',()=>{
      const operation=wizard.querySelector('input[name="growth"]:checked').value;
      const title=wizardTitle.value.trim(),description=wizardDescription.value.trim();
      if(!growTarget||title.length<1||description.length<1){
        wizardError.textContent='Name and first idea are required.';return;
      }
      if(title.length>80||description.length>500){
        wizardError.textContent='Please shorten the request.';return;
      }
      const payload={operation,target:growTarget,title,description};
      const body='<!-- living-seeds-node-request:v1 -->\n'+'\x60\x60\x60json\n'+JSON.stringify(payload)+'\n\x60\x60\x60';
      const params=new URLSearchParams({title:'New node: '+title,body});
      const url='https://github.com/0xF00115h/living-seeds-local/issues/new?'+params.toString();
      wizard.close();
      window.open(url,'_blank','noopener,noreferrer');
    });
    function renderTree(){
      erase(treePanel);
      const heading=document.createElement('h1');heading.textContent='The Tree';treePanel.appendChild(heading);
      const intro=document.createElement('p');intro.textContent='A growing network of linked site nodes. Select a name to visit.';treePanel.appendChild(intro);
      const ids=new Set(pages.map(p=>p.id)), children=new Map(), visited=new Set();
      for(const p of pages){
        const parent=typeof p.parent==='string' && ids.has(p.parent) && p.parent!==p.id ? p.parent : null;
        if(!children.has(parent))children.set(parent,[]);
        children.get(parent).push(p);
      }
      function populate(parent,depth,container){
        const list=document.createElement('ul');list.className='tree-branches';
        for(const p of children.get(parent)||[]){
          if(visited.has(p.id))continue;
          visited.add(p.id);
          const li=document.createElement('li'),nodeRow=document.createElement('div');
          nodeRow.className='tree-node';
          const btn=document.createElement('button');
          btn.type='button';btn.textContent=p.title;btn.addEventListener('click',()=>display(p.id));nodeRow.appendChild(btn);
          const add=document.createElement('button');
          add.type='button';add.className='tree-add';add.textContent='+';
          add.setAttribute('aria-label','Add node from '+p.title);
          add.title='Spawn or sibling from '+p.title;
          add.addEventListener('click',()=>openWizard(p.id));
          nodeRow.appendChild(add);li.appendChild(nodeRow);
          if(depth<pages.length)populate(p.id,depth+1,li);
          list.appendChild(li);
        }
        if(list.childElementCount)container.appendChild(list);
      }
      populate(null,0,treePanel);
      const missing=pages.filter(p=>!visited.has(p.id));
      if(missing.length){
        const section=document.createElement('div');section.className='tree-unplaced';
        const h=document.createElement('h2');h.textContent='Other nodes';section.appendChild(h);
        for(const p of missing){
          const btn=document.createElement('button');btn.type='button';btn.textContent=p.title;
          btn.addEventListener('click',()=>display(p.id));section.appendChild(btn);
          const add=document.createElement('button');add.type='button';add.className='tree-add';
          add.textContent='+';add.setAttribute('aria-label','Add node from '+p.title);
          add.addEventListener('click',()=>openWizard(p.id));section.appendChild(add);
        }
        treePanel.appendChild(section);
      }
    }
    function showPlaceholder(item){
      erase(placeholderPanel);
      const title=document.createElement('h1');
      title.textContent=item.title;
      placeholderPanel.appendChild(title);
      const status=document.createElement('p');
      status.className='node-status';
      status.textContent='New node · Approved in source · Awaiting an encrypted content release';
      placeholderPanel.appendChild(status);
      const intro=document.createElement('p');
      intro.textContent='This branch of Living Seeds is ready to be developed. The placeholder is published, but its full page has not yet been released.';
      placeholderPanel.appendChild(intro);
      const steps=document.createElement('ol');
      const items=[
        'Open this node in the private GitHub source repository (sign in as a collaborator).',
        'Edit pages/'+item.id+'/index.html and style.css in a GitHub branch.',
        'Open a pull request to discuss and merge the work.',
        'Ask the root publisher to rebuild and release the encrypted site bundle.'
      ];
      for(const label of items){const li=document.createElement('li');li.textContent=label;steps.appendChild(li)}
      placeholderPanel.appendChild(steps);
      const source=document.createElement('a');
      source.href='https://github.com/0xF00115h/living-seeds-local/tree/main/pages/'+encodeURIComponent(item.id);
      source.target='_blank';source.rel='noopener noreferrer';
      source.textContent='Open node files in GitHub';
      placeholderPanel.appendChild(source);
      if(Number.isSafeInteger(item.issue) && item.issue>0){
        const issue=document.createElement('a');
        issue.href='https://github.com/0xF00115h/living-seeds-local/issues/'+item.issue;
        issue.target='_blank';issue.rel='noopener noreferrer';
        issue.textContent='Original growth request #'+item.issue;
        placeholderPanel.appendChild(issue);
      }
    }
    async function includePlaceholders(){
      try{
        const response=await fetch('./nodes.pending.json',{cache:'no-store'});
        if(!response.ok)return;
        const data=await response.json();
        if(data.v!==1 || !Array.isArray(data.nodes) || data.nodes.length>1000)return;
        const ids=new Set(pages.map(p=>p.id));
        for(const n of data.nodes){
          if(!n||typeof n.id!=='string'||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(n.id)||
             typeof n.title!=='string'||n.title.length<1||n.title.length>100||
             typeof n.parent!=='string'||!ids.has(n.parent)||
             !Number.isSafeInteger(n.issue)||n.issue<1||ids.has(n.id))continue;
          pages.push({id:n.id,title:n.title,parent:n.parent,issue:n.issue,placeholder:true});
          ids.add(n.id);
        }
      }catch(error){console.warn('Placeholder index unavailable:',error)}
    }
    function display(id){
      const item=pages.find(p=>p.id===id)||pages[0];
      if(!item)throw Error('No pages in the encrypted bundle.');
      placeholderPanel.hidden=true;
      if(item.id==='tree'){
        frame.hidden=true;frame.removeAttribute('srcdoc');treePanel.hidden=false;renderTree();
      }else if(item.placeholder){
        treePanel.hidden=true;frame.hidden=true;frame.removeAttribute('srcdoc');
        placeholderPanel.hidden=false;showPlaceholder(item);
      }else{
        treePanel.hidden=true;frame.hidden=false;
      const csp='<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'; font-src data:; script-src \'none\'; connect-src \'none\'; form-action \'none\'; base-uri \'none\'">';
      const markup=/<head(?:\s[^>]*)?>/i.test(item.html)?item.html.replace(/<head(?:\s[^>]*)?>/i,match=>match+csp):'<!doctype html><html><head>'+csp+'</head><body>'+item.html+'</body></html>';
      frame.srcdoc=markup;
      }
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
        await includePlaceholders();
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
      wizard.close();growTarget=null;pages=[];frame.removeAttribute('srcdoc');frame.hidden=false;treePanel.hidden=true;placeholderPanel.hidden=true;erase(treePanel);erase(placeholderPanel);erase(navigation);experience.hidden=true;gate.hidden=false;input.value='';
      document.title='Living Seeds — Invitation';input.focus();
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
