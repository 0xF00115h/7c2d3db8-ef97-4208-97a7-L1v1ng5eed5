(() => {
  'use strict';
  const AAD = new TextEncoder().encode('living-seeds:bundle:v2');
  const byId = id => document.getElementById(id);
  function start() {
    const els = Object.fromEntries(['gate','experience','status','key','page','tree-panel','placeholder-panel','navigation','local-navigation','unlock-form','unlock','lock'].map(id=>[id,byId(id)]));
    const required=['gate','experience','status','key','page','tree-panel','placeholder-panel','navigation','unlock-form','unlock','lock'];
    const absent=required.filter(id=>!els[id]);
    if (absent.length) {
      document.body.textContent='Living Seeds is unable to load: missing '+absent.join(', ');
      return;
    }
    const gate=els.gate, experience=els.experience, status=els.status, input=els.key;
    const frame=els.page, treePanel=els['tree-panel'], placeholderPanel=els['placeholder-panel'], navigation=els.navigation, localNavigation=els['local-navigation'], form=els['unlock-form'];
    const unlock=els.unlock, lock=els.lock;
    let pages=[], pageIndex=new Map(), childIndex=new Map(), lastViewedNode='garden';
    const treeExpanded=new Set(), treeShowAll=new Set();
    let treeSelectedId='garden';
    let treeInitialized=false, treeObserver=null, treeDrawFrame=0;
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
    const API_CONFIG='./assets/node-api.json';
    const SESSION_KEY='ls_node_session_v1';
    const PENDING_KEY='ls_pending_node_v1';
    const authHash=location.hash.match(/^#ls_auth=([A-Za-z0-9_.%-]+)$/);
    if(authHash){
      try {sessionStorage.setItem(SESSION_KEY,decodeURIComponent(authHash[1]));}
      catch(e){console.warn('Cannot save node session',e);}
      history.replaceState(null,'',location.pathname+location.search);
    }
    const bridgePromise=fetch(API_CONFIG,{cache:'no-store'}).then(async response=>{
      if(!response.ok)return null;
      const data=await response.json();
      if(typeof data.baseUrl!=='string'||!/^https:\/\/[-a-zA-Z0-9.]+$/.test(data.baseUrl))return null;
      return data.baseUrl;
    }).catch(()=>null);
    const issueUrl=payload=>{
      const body='<!-- living-seeds-node-request:v1 -->\n'+'\x60\x60\x60json\n'+JSON.stringify(payload)+'\n\x60\x60\x60'+
        '\n\n**Node finalisation is in progress.**\n\nRefresh this issue shortly to see the first automated comment with next steps.';
      return 'https://github.com/0xF00115h/living-seeds-local/issues/new?'+
        new URLSearchParams({title:'New node: '+payload.title,body}).toString();
    };
    async function createNode(payload){
      const submit=byId('wizard-submit');
      submit.disabled=true;wizardError.textContent='Creating node request…';
      try{
        const api=await bridgePromise;
        if(!api){
          wizardError.textContent='Direct GitHub submission is not configured. Opening the GitHub issue form.';
          location.assign(issueUrl(payload));
          return;
        }
        const ticket=sessionStorage.getItem(SESSION_KEY);
        if(!ticket){
          sessionStorage.setItem(PENDING_KEY,JSON.stringify(payload));
          location.assign(api+'/auth/start');
          return;
        }
        const response=await fetch(api+'/api/nodes',{method:'POST',
          headers:{'Content-Type':'application/json','Authorization':'Bearer '+ticket},
          body:JSON.stringify(payload)});
        const result=await response.json();
        if(response.status===401){
          sessionStorage.removeItem(SESSION_KEY);
          sessionStorage.setItem(PENDING_KEY,JSON.stringify(payload));
          location.assign(api+'/auth/start');
          return;
        }
        if(!response.ok)throw Error(result.error||'GitHub issue creation failed');
        sessionStorage.removeItem(PENDING_KEY);
        wizardError.textContent='Created GitHub request #'+result.number+'. '+(payload.mode==='project'?'Your attachment point will appear in The Tree; follow the issue for instructions to seed your repository.':'The node stub will publish automatically.');
        submit.textContent='Created';
        window.setTimeout(()=>{wizard.close();submit.textContent='Create node';},1800);
      }catch(e){
        wizardError.textContent=String(e.message||e);
      }finally{submit.disabled=false;}
    }

    function simpleDestination(){
      const target=pages.find(p=>p.id===growTarget);
      if(!target)return {label:'Living Seeds',blocked:false};
      const operation=wizard.querySelector('input[name="growth"]:checked').value;
      const parent=operation==='spawn'?target:pages.find(p=>p.id===target.parent);
      if(!parent)return {label:'Living Seeds',blocked:false};
      const ancestors=new Set();
      let current=parent;
      while(current && !ancestors.has(current.id)){
        ancestors.add(current.id);
        if(current.projectRoot && current.projectRepository)
          return {label:current.projectRepository,blocked:false};
        if((current.mode==='project' || current.mode==='bud') && !current.projectRepository)
          return {label:'project awaiting publication',blocked:true};
        current=pages.find(p=>p.id===current.parent);
      }
      return {label:'Living Seeds',blocked:false};
    }
    function updateSimpleDestination(){
      const destination=simpleDestination();
      const control=wizard.querySelector('input[name="node-mode"][value="simple"]');
      const label=control.closest('label');
      label.lastChild.textContent=' Simple node — page in '+destination.label;
      control.disabled=destination.blocked;
      if(destination.blocked && control.checked)
        wizard.querySelector('input[name="node-mode"][value="project"]').checked=true;
      const help=wizard.querySelector('.wizard-help');
      help.textContent=destination.blocked
        ? 'This project has no approved repository yet. Attach it before adding pages inside it, or seed an independent project.'
        : 'Simple nodes add a page in '+destination.label+'. Seed GitHub project creates an independent repository, subject to attachment approval.';
    }
    wizard.querySelectorAll('input[name="growth"]').forEach(control=>control.addEventListener('change',updateSimpleDestination));

    function openWizard(id){
      const node=pages.find(p=>p.id===id);
      if(!node)return;
      growTarget=id;
      wizardTitle.value='';
      wizardDescription.value='';
      wizardError.textContent='';
      wizard.querySelector('input[name="growth"][value="spawn"]').checked=true;
      wizard.querySelector('input[name="node-mode"][value="simple"]').checked=true;
      wizardOrigin.textContent='Grow from '+node.title;
      updateSimpleDestination();
      wizard.showModal();
      wizardTitle.focus();
    }
    byId('wizard-close').addEventListener('click',()=>wizard.close());
    byId('wizard-submit').addEventListener('click',()=>{
      const operation=wizard.querySelector('input[name="growth"]:checked').value;
      const mode=wizard.querySelector('input[name="node-mode"]:checked').value;
      const title=wizardTitle.value.trim(),description=wizardDescription.value.trim();
      if(!growTarget||title.length<1||description.length<1){
        wizardError.textContent='Name and first idea are required.';return;
      }
      if(title.length>80||description.length>500){
        wizardError.textContent='Please shorten the request.';return;
      }
      createNode({operation,target:growTarget,title,description,mode});
    });

    function indexHierarchy(){
      pageIndex=new Map(pages.map(p=>[p.id,p]));
      childIndex=new Map();
      for(const item of pages){
        const parent=typeof item.parent==='string' && item.parent!==item.id && pageIndex.has(item.parent) ? item.parent : null;
        if(!childIndex.has(parent))childIndex.set(parent,[]);
        childIndex.get(parent).push(item);
      }
    }
    function lineage(id){
      const result=[], seen=new Set();
      let item=pageIndex.get(id);
      while(item && !seen.has(item.id) && result.length<pages.length){
        seen.add(item.id);result.unshift(item);
        item=pageIndex.get(item.parent);
      }
      return result;
    }
    function makeNavLink(item,container,kind,activeId){
      const button=document.createElement('button');
      button.type='button';button.dataset.page=item.id;button.className=kind;
      button.textContent=item.title;
      button.title=item.title;
      if(item.id===activeId)button.setAttribute('aria-current','page');
      button.addEventListener('click',()=>display(item.id));
      container.appendChild(button);
    }
    function renderNavigation(active){
      erase(navigation);erase(localNavigation);
      const coreIds=new Set(['garden','tree','log']);
      for(const id of ['garden','tree','log']){
        const item=pageIndex.get(id);
        if(item)makeNavLink(item,navigation,'nav-core-link',active.id);
      }
      const context=active.id==='tree' ? pageIndex.get(lastViewedNode) || pageIndex.get('garden') : active;
      if(!context)return;
      const label=document.createElement('span');label.className='nav-context-label';label.textContent='LOCAL';
      localNavigation.appendChild(label);
      const path=lineage(context.id).filter(p=>!coreIds.has(p.id));
      if(path.length){
        const crumbs=path.length>4 ? [path[0],null,...path.slice(-2)] : path;
        crumbs.forEach((item,i)=>{
          if(i){
            const slash=document.createElement('span');slash.className='nav-crumb-sep';slash.textContent='/';
            slash.setAttribute('aria-hidden','true');localNavigation.appendChild(slash);
          }
          if(item)makeNavLink(item,localNavigation,'nav-crumb',active.id);
          else {
            const more=document.createElement('button');more.type='button';more.className='nav-more';
            more.textContent='…';more.title='Explore the entire branch in The Tree';
            more.setAttribute('aria-label','Explore hidden ancestors in The Tree');
            more.addEventListener('click',()=>display('tree'));localNavigation.appendChild(more);
          }
        });
      }else{
        const near=(childIndex.get('garden')||[]).filter(p=>!coreIds.has(p.id));
        near.slice(0,4).forEach(p=>makeNavLink(p,localNavigation,'nav-nearby',active.id));
      }
      if(active.id==='tree')return;
      const next=(childIndex.get(active.id)||[]);
      if(next.length){
        const divider=document.createElement('span');divider.className='nav-local-divider';divider.setAttribute('aria-hidden','true');
        localNavigation.appendChild(divider);
        next.slice(0,3).forEach(p=>makeNavLink(p,localNavigation,'nav-nearby',active.id));
        if(next.length>3){
          const more=document.createElement('button');more.type='button';more.className='nav-more';
          more.textContent='+'+(next.length-3);more.title='See all descendants in The Tree';
          more.addEventListener('click',()=>display('tree'));localNavigation.appendChild(more);
        }
      }
    }

    function renderTree(){
      if(treeObserver){treeObserver.disconnect();treeObserver=null;}
      if(treeDrawFrame){cancelAnimationFrame(treeDrawFrame);treeDrawFrame=0;}
      erase(treePanel);
      const roots=childIndex.get(null)||[];
      if(!treeInitialized){
        treeInitialized=true;
        for(const root of roots){
          treeExpanded.add(root.id);
          for(const child of childIndex.get(root.id)||[]){
            if((childIndex.get(child.id)||[]).length)treeExpanded.add(child.id);
          }
        }
      }
      const reachable=new Set();
      function markReachable(node){
        if(reachable.has(node.id))return;
        reachable.add(node.id);
        for(const child of childIndex.get(node.id)||[])markReachable(child);
      }
      for(const root of roots)markReachable(root);

      const top=document.createElement('div');top.className='tree-top';
      const identity=document.createElement('div');identity.className='tree-identity';
      const eyebrow=document.createElement('p');eyebrow.className='tree-eyebrow';eyebrow.textContent='Living knowledge / Structure';
      const heading=document.createElement('h1');heading.textContent='The Tree';
      const intro=document.createElement('p');intro.className='tree-intro';
      intro.textContent='A map of ideas and their relationships. Open a node to read it, or grow its branch.';
      identity.append(eyebrow,heading,intro);
      const count=document.createElement('p');count.className='tree-count';
      const pending=pages.filter(p=>p.placeholder).length;
      count.textContent=pages.length+' nodes'+(pending?' · '+pending+' awaiting release':'');
      top.append(identity,count);treePanel.appendChild(top);

      const tools=document.createElement('div');tools.className='tree-toolbar';
      const searchGroup=document.createElement('div');searchGroup.className='tree-search-group';
      const search=document.createElement('input');search.type='search';search.className='tree-search';
      search.placeholder='Find a node';search.setAttribute('aria-label','Find a node in The Tree');
      search.autocomplete='off';
      const suggestions=document.createElement('div');suggestions.className='tree-search-results';
      suggestions.hidden=true;
      searchGroup.append(search,suggestions);
      const hint=document.createElement('span');hint.className='tree-hint';hint.textContent='Select a title to open · Use arrows to expand branches';
      const reset=document.createElement('button');reset.type='button';reset.className='tree-reset';reset.textContent='Reset view';
      tools.append(searchGroup,hint,reset);treePanel.appendChild(tools);

      const board=document.createElement('div');board.className='tree-board';
      board.setAttribute('role','region');board.setAttribute('aria-label','Top-down node hierarchy');board.tabIndex=0;
      const stage=document.createElement('div');stage.className='tree-stage';
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('tree-links');
      svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
      stage.appendChild(svg);
      const forest=document.createElement('ul');forest.className='tree-level tree-roots';
      forest.setAttribute('aria-label','Root nodes');
      stage.appendChild(forest);board.appendChild(stage);treePanel.appendChild(board);

      const shown=new Set();
      const childLimit=7;
      function renderBranch(node,depth){
        if(shown.has(node.id))return null;
        shown.add(node.id);
        const branch=document.createElement('li');branch.className='tree-branch';branch.dataset.node=node.id;
        const card=document.createElement('div');card.className='tree-card';
        if(node.id===treeSelectedId)card.classList.add('is-selected');
        const open=document.createElement('button');open.type='button';open.className='tree-open';
        open.title='Open '+node.title;open.setAttribute('aria-label','Open '+node.title);
        const title=document.createElement('span');title.className='tree-node-title';title.textContent=node.title;
        const meta=document.createElement('span');meta.className='tree-node-meta';
        const children=childIndex.get(node.id)||[];
        meta.textContent=node.placeholder?'Awaiting release':children.length?(children.length+' '+(children.length===1?'child':'children')):'Published node';
        open.append(title,meta);open.addEventListener('click',()=>display(node.id));
        card.appendChild(open);
        const controls=document.createElement('div');controls.className='tree-node-controls';
        if(children.length){
          const toggle=document.createElement('button');toggle.type='button';toggle.className='tree-toggle';
          const expanded=treeExpanded.has(node.id);
          toggle.textContent=expanded?'−':'›';
          toggle.title=(expanded?'Collapse ':'Expand ')+node.title;
          toggle.setAttribute('aria-label',(expanded?'Collapse ':'Expand ')+node.title+' descendants');
          toggle.setAttribute('aria-expanded',String(expanded));
          toggle.addEventListener('click',()=>{
            if(treeExpanded.has(node.id))treeExpanded.delete(node.id);else treeExpanded.add(node.id);
            renderTree();
            const target=Array.from(treePanel.querySelectorAll('.tree-branch')).find(el=>el.dataset.node===node.id);
            const focus=target&&target.querySelector(':scope > .tree-card .tree-toggle');
            if(focus)focus.focus({preventScroll:true});
          });
          controls.appendChild(toggle);
        }
        const add=document.createElement('button');add.type='button';add.className='tree-add';add.textContent='+';
        add.setAttribute('aria-label','Add node from '+node.title);add.title='Spawn or sibling from '+node.title;
        add.addEventListener('click',()=>openWizard(node.id));controls.appendChild(add);
        card.appendChild(controls);branch.appendChild(card);

        if(children.length && treeExpanded.has(node.id) && depth<100){
          const group=document.createElement('ul');group.className='tree-level';
          const visible=treeShowAll.has(node.id)?children:children.slice(0,childLimit);
          for(const child of visible){const childBranch=renderBranch(child,depth+1);if(childBranch)group.appendChild(childBranch);}
          if(children.length>visible.length){
            const extra=document.createElement('li');extra.className='tree-branch tree-extra';
            const more=document.createElement('button');more.type='button';more.className='tree-more';
            more.textContent='+'+(children.length-visible.length)+' more';
            more.setAttribute('aria-label','Show all '+children.length+' children of '+node.title);
            more.addEventListener('click',()=>{treeShowAll.add(node.id);renderTree();});
            extra.appendChild(more);group.appendChild(extra);
          }
          if(group.childElementCount)branch.appendChild(group);
        }
        return branch;
      }
      for(const root of roots){const branch=renderBranch(root,0);if(branch)forest.appendChild(branch);}

      const unplaced=pages.filter(p=>!reachable.has(p.id));
      if(unplaced.length){
        const section=document.createElement('section');section.className='tree-unplaced';
        const label=document.createElement('h2');label.textContent='Nodes needing placement';section.appendChild(label);
        const desc=document.createElement('p');desc.textContent='These nodes have an incomplete or cyclic parent relationship.';
        section.appendChild(desc);
        for(const item of unplaced){
          const open=document.createElement('button');open.type='button';open.textContent=item.title;
          open.addEventListener('click',()=>display(item.id));section.appendChild(open);
        }
        treePanel.appendChild(section);
      }

      function drawLinks(){
        if(treePanel.hidden || !stage.isConnected)return;
        const frame=stage.getBoundingClientRect();
        const parts=[];
        function centerX(rect){return rect.left-frame.left+rect.width/2;}
        const branches=stage.querySelectorAll('.tree-branch[data-node]');
        for(const branch of branches){
          const parentCard=branch.querySelector(':scope > .tree-card');
          const group=branch.querySelector(':scope > .tree-level');
          if(!parentCard||!group)continue;
          const childCards=Array.from(group.children).map(li=>li.querySelector(':scope > .tree-card')||li.querySelector(':scope > .tree-more')).filter(Boolean);
          if(!childCards.length)continue;
          const parentRect=parentCard.getBoundingClientRect();
          const childRects=childCards.map(el=>el.getBoundingClientRect());
          const x=centerX(parentRect), y=parentRect.bottom-frame.top;
          const targetY=Math.min(...childRects.map(r=>r.top-frame.top));
          const railY=y+(targetY-y)*.52;
          parts.push('M'+x+' '+y+' V'+railY);
          const xs=childRects.map(centerX);
          if(xs.length>1)parts.push('M'+Math.min(...xs)+' '+railY+' H'+Math.max(...xs));
          for(const rect of childRects){
            const cx=centerX(rect),cy=rect.top-frame.top;
            parts.push('M'+(xs.length===1?x:cx)+' '+railY+(xs.length===1?' H'+cx:'')+' V'+cy);
          }
        }
        svg.setAttribute('viewBox','0 0 '+stage.clientWidth+' '+stage.clientHeight);
        svg.setAttribute('preserveAspectRatio','none');
        svg.replaceChildren();
        if(parts.length){
          const links=document.createElementNS('http://www.w3.org/2000/svg','path');
          links.setAttribute('d',parts.join(' '));links.setAttribute('fill','none');
          links.setAttribute('stroke','currentColor');links.setAttribute('stroke-width','1.25');
          links.setAttribute('vector-effect','non-scaling-stroke');svg.appendChild(links);
        }
      }
      treeDrawFrame=requestAnimationFrame(()=>{treeDrawFrame=0;drawLinks();});
      if(typeof ResizeObserver!=='undefined'){
        treeObserver=new ResizeObserver(()=>{if(treeDrawFrame)cancelAnimationFrame(treeDrawFrame);treeDrawFrame=requestAnimationFrame(()=>{treeDrawFrame=0;drawLinks();});});
        treeObserver.observe(stage);
      }

      function revealNode(id){
        const path=lineage(id);
        for(const ancestor of path.slice(0,-1)){
          treeExpanded.add(ancestor.id);
          treeShowAll.add(ancestor.id);
        }
        treeSelectedId=id;
        renderTree();
        requestAnimationFrame(()=>{
          const target=Array.from(treePanel.querySelectorAll('.tree-branch[data-node]')).find(el=>el.dataset.node===id);
          if(target)target.querySelector('.tree-card').scrollIntoView({block:'center',inline:'center',behavior:'auto'});
        });
      }
      function resultsFor(query){
        const term=query.trim().toLocaleLowerCase();
        return term?pages.filter(p=>(p.title+' '+p.id).toLocaleLowerCase().includes(term)).slice(0,8):[];
      }
      function updateSearch(){
        erase(suggestions);
        const hits=resultsFor(search.value);
        suggestions.hidden=!search.value.trim();
        if(!search.value.trim())return;
        if(!hits.length){
          const empty=document.createElement('p');empty.textContent='No matching nodes';suggestions.appendChild(empty);return;
        }
        for(const item of hits){
          const button=document.createElement('button');button.type='button';button.className='tree-result';
          button.textContent=item.title;
          button.title=lineage(item.id).map(p=>p.title).join(' / ');
          button.addEventListener('click',()=>revealNode(item.id));suggestions.appendChild(button);
        }
      }
      search.addEventListener('input',updateSearch);
      search.addEventListener('keydown',event=>{
        if(event.key==='Escape'){search.value='';updateSearch();}
        if(event.key==='Enter'){
          const hit=resultsFor(search.value)[0];if(hit){event.preventDefault();revealNode(hit.id);}
        }
      });
      reset.addEventListener('click',()=>{
        treeExpanded.clear();treeShowAll.clear();treeInitialized=false;treeSelectedId='garden';renderTree();
      });
    }
    function showPlaceholder(item){
      erase(placeholderPanel);
      const title=document.createElement('h1');
      title.textContent=item.title;
      placeholderPanel.appendChild(title);
      const status=document.createElement('p');
      status.className='node-status';
      status.textContent=item.mode==='project'?'Project seed · Attachment point registered · Repository approval pending':(item.mode==='bud'?'Project bud · Awaiting project-owner contribution and publication':'New node · Approved in source · Awaiting an encrypted content release');
      placeholderPanel.appendChild(status);
      const intro=document.createElement('p');
      intro.textContent=item.mode==='project'?'This Tree attachment point is reserved. Create a private GitHub project using the standard Living Seeds seed, then request approval of the repository and commit.':(item.mode==='bud'?'This page belongs to the existing independent project repository. Follow the original GitHub request to propose its content; no new repository is needed.':'This branch of Living Seeds is ready to be developed. The placeholder is published, but its full page has not yet been released.');
      placeholderPanel.appendChild(intro);
      const steps=document.createElement('ol');
      const items=item.mode==='project' ? [
        'Open the original GitHub request below for instructions.',
        'Use GitHub CLI under your own account to create a private repository from the Living Seeds project-seed template.',
        'Develop independently using the project repository’s issues and pull requests.',
        'Reply to the original request with the project URL and approved commit SHA for root-owner attachment approval.'
      ] : item.mode==='bud' ? [
        'Open the original GitHub request below for the prepared project-bud command.',
        'Contribute the new page to the existing project repository, using its own issues and pull requests.',
        'The project owner merges the contribution, and the root owner approves the pinned revision.',
        'Living Seeds publishes the approved project bud inside the encrypted Tree.'
      ] : [
        'Open this node in the private GitHub source repository (sign in as a collaborator).',
        'Edit pages/'+item.id+'/index.html and style.css in a GitHub branch.',
        'Open a pull request to discuss and merge the work.',
        'Ask the root publisher to rebuild and release the encrypted site bundle.'
      ];
      for(const label of items){const li=document.createElement('li');li.textContent=label;steps.appendChild(li)}
      placeholderPanel.appendChild(steps);
      if(item.mode!=='project' && item.mode!=='bud'){
        const source=document.createElement('a');
        source.href='https://github.com/0xF00115h/living-seeds-local/tree/main/pages/'+encodeURIComponent(item.id);
        source.target='_blank';source.rel='noopener noreferrer';
        source.textContent='Open node files in GitHub';
        placeholderPanel.appendChild(source);
      }
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
          pages.push({id:n.id,title:n.title,parent:n.parent,issue:n.issue,mode:n.mode==='project'?'project':(n.mode==='bud'?'bud':'simple'),placeholder:true});
          ids.add(n.id);
        }
      }catch(error){console.warn('Placeholder index unavailable:',error)}
    }
    function display(id){
      const item=pages.find(p=>p.id===id)||pages[0];
      if(!item)throw Error('No pages in the encrypted bundle.');
      placeholderPanel.hidden=true;
      if(item.id==='tree'){
        if(treePanel.hidden){
          for(const node of lineage(lastViewedNode).slice(0,-1)){
            treeExpanded.add(node.id);
            treeShowAll.add(node.id);
          }
          treeSelectedId=lastViewedNode;
        }
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
      if(item.id!=='tree')lastViewedNode=item.id;
      renderNavigation(item);
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
        indexHierarchy();
        display(data.home);
        try{
          const pending=sessionStorage.getItem(PENDING_KEY);
          if(pending){
            const payload=JSON.parse(pending);
            sessionStorage.removeItem(PENDING_KEY);
            const node=pages.find(p=>p.id===payload.target);
            if(node){
              openWizard(node.id);
              wizard.querySelector('input[value="'+payload.operation+'"]').checked=true;
              wizardTitle.value=payload.title;
              wizardDescription.value=payload.description;
              createNode(payload);
            }
          }
        }catch(e){console.warn('Pending node request could not resume',e);}

        input.value='';gate.hidden=true;experience.hidden=false;status.textContent='';
      }catch(error){
        status.textContent=error.name==='OperationError'?'Incorrect key or damaged bundle.':String(error.message||'Unable to unlock.');
        console.error('Living Seeds loader v3:',error);
      }finally{unlock.disabled=false;}
    });
    lock.addEventListener('click',()=>{
      wizard.close();growTarget=null;pages=[];if(treeObserver){treeObserver.disconnect();treeObserver=null;}if(treeDrawFrame){cancelAnimationFrame(treeDrawFrame);treeDrawFrame=0;}frame.removeAttribute('srcdoc');frame.hidden=false;treePanel.hidden=true;placeholderPanel.hidden=true;erase(treePanel);erase(placeholderPanel);erase(navigation);erase(localNavigation);pageIndex.clear();childIndex.clear();treeExpanded.clear();treeShowAll.clear();treeInitialized=false;experience.hidden=true;gate.hidden=false;input.value='';
      document.title='Living Seeds — Invitation';input.focus();
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
