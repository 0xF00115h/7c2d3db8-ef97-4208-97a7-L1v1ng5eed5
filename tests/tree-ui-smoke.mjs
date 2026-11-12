import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../assets/loader-v3.js', import.meta.url), 'utf8');
const navigationSource = readFileSync(new URL('../assets/node-navigation.js', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../assets/site.css', import.meta.url), 'utf8');

class Element {
  constructor(tag = 'div') {
    this.tagName = tag;
    this.children = [];
    this.listeners = {};
    this.dataset = {};
    this.attrs = {};
    this.textContent = '';
    this.className = '';
    this.hidden = false;
    this.isConnected = true;
    this.value = '';
    this.classList = {
      add: name => { this.className += ' ' + name; },
      contains: name => this.className.split(/\s+/).includes(name)
    };
  }
  appendChild(child) { this.children.push(child); return child; }
  append(...nodes) { nodes.forEach(node => this.appendChild(node)); }
  removeChild(child) { this.children.splice(this.children.indexOf(child), 1); return child; }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  get lastChild() { return this.children.at(-1); }
  get childElementCount() { return this.children.length; }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  getAttribute(name) { return this.attrs[name] ?? null; }
  removeAttribute(name) { delete this.attrs[name]; }
  addEventListener(name, fn) { this.listeners[name] = fn; }
  querySelectorAll(selector) {
    const matches = [];
    function walk(node) {
      for (const child of node.children) {
        if (selector === '.tree-branch' && child.className.includes('tree-branch')) matches.push(child);
        if (selector === '.tree-branch[data-node]' && child.dataset.node) matches.push(child);
        walk(child);
      }
    }
    walk(this);
    return matches;
  }
  querySelector(selector) {
    if (selector.startsWith('input[value=') || selector.startsWith('input[name="growth"]') || selector.startsWith('input[name="node-mode"]')) return new Element('input');
    if (selector.startsWith(':scope > .tree-card')) return this.children.find(node => node.className.includes('tree-card')) ?? null;
    if (selector === ':scope > .tree-level') return this.children.find(node => node.className.includes('tree-level')) ?? null;
    if (selector === ':scope > .tree-more') return this.children.find(node => node.className.includes('tree-more')) ?? null;
    return null;
  }
  getBoundingClientRect() { return {left:0,top:0,right:184,bottom:66,width:184,height:66}; }
  get clientWidth() { return 1500; }
  get clientHeight() { return 900; }
  focus() {}
  showModal() { this.open = true; }
  close() { this.open = false; }
  scrollIntoView() {}
}

function descendant(root, condition) {
  if (condition(root)) return root;
  for (const child of root.children) {
    const match = descendant(child, condition);
    if (match) return match;
  }
  return null;
}

function fixture() {
  const nodes = [
    {id:'garden',title:'The Garden',parent:null},
    {id:'workshop',title:'The Workshop',parent:'garden'},
    {id:'first-seed',title:'The First Seed',parent:'garden'},
    {id:'tree',title:'The Tree',parent:'garden'},
    {id:'log',title:'The Log',parent:'garden'}
  ];
  for (let i=0; i<9; i++) nodes.push({id:'sibling-'+i,title:'Sibling '+i,parent:'workshop'});
  const chain = ['test1-i13','test2-i14','test-3-i16','test-4-i17','test-5-i18'];
  chain.forEach((id,index) => nodes.push({
    id, title:'test '+(index+1), parent:index ? chain[index-1] : 'workshop', placeholder:true
  }));
  return nodes.map(node=>({...node,html:'<html><head></head><body>Node</body></html>'}));
}

async function unlock() {
  const ids = ['gate','experience','status','key','page','tree-panel','placeholder-panel',
    'navigation','local-navigation','unlock-form','unlock','lock','node-wizard',
    'wizard-origin','node-title','node-description','wizard-error','wizard-submit','wizard-close'];
  const elements = Object.fromEntries(ids.map(id=>[id,new Element(id)]));
  elements['tree-panel'].hidden = true;
  const document = {
    readyState:'complete',
    getElementById:id=>elements[id],
    createElement:type=>new Element(type),
    createElementNS:(ns,type)=>new Element(type),
    body:new Element('body')
  };
  const payload = {v:2,type:'living-seeds-pages',home:'garden',pages:fixture()};
  const bytes = Uint8Array.from(JSON.stringify(payload).split('').map(char=>char.charCodeAt(0)));
  const utf8Encoder = class { encode(value) { return Uint8Array.from([...value].map(char=>char.charCodeAt(0))); } };
  const utf8Decoder = class { decode(value) { return String.fromCharCode(...value); } };
  const requestAnimationFrame = ()=>1;
  const fetch = async path=>({
    ok:true,
    json:async()=>path.includes('site.bundle') ?
      {v:2,alg:'A256GCM',iv:'A'.repeat(16),ciphertext:'AAAA'} :
      path.includes('node-api') ? {baseUrl:''} : {v:1,nodes:[]}
  });
  const context={
    document,fetch,requestAnimationFrame,cancelAnimationFrame(){},
    location:{hash:'',pathname:'/',search:''},
    history:{replaceState(){}},
    sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},
    crypto:{subtle:{importKey:async()=>({}),decrypt:async()=>bytes}},
    TextEncoder:utf8Encoder,TextDecoder:utf8Decoder,
    atob:value=>'A'.repeat(Math.floor(value.replace(/=/g,'').length*3/4)),
    window:{setTimeout(){}},
    URLSearchParams
  };
  vm.runInNewContext(navigationSource,context,{timeout:5000});
  vm.runInNewContext(source,context,{timeout:5000});
  elements.key.value='A'.repeat(43);
  await elements['unlock-form'].listeners.submit({preventDefault(){}});
  assert.equal(elements.status.textContent,'','Invitation unlock should succeed');
  return elements;
}

test('site shell and loader compile with separate contextual navigation',()=>{
  assert.doesNotThrow(()=>new vm.Script(source));
  assert.doesNotThrow(()=>new vm.Script(navigationSource));
  assert.match(shell,/assets\/node-navigation\.js/);
  assert.match(shell,/id="navigation" class="nav-global"/);
  assert.match(shell,/id="local-navigation" class="nav-context"/);
  assert.match(css,/\.tree-links/);
  assert.match(source,/crypto\.subtle\.decrypt/);
  assert.match(source,/location\.assign\(issueUrl\(payload\)\)/);
});

test('encrypted unlock produces stable core links and a top-down Tree',async()=>{
  const elements = await unlock();
  assert.deepEqual(elements.navigation.children.map(node=>node.textContent),
    ['The Garden','The Tree','The Log']);
  assert.ok(elements['local-navigation'].children.length);
  elements.navigation.children.find(node=>node.textContent==='The Tree').listeners.click();
  const branches = elements['tree-panel'].querySelectorAll('.tree-branch[data-node]').map(node=>node.dataset.node);
  assert.ok(branches.includes('garden'));
  assert.ok(branches.includes('workshop'));
  assert.ok(branches.includes('first-seed'));
  assert.ok(descendant(elements['tree-panel'],node=>node.className==='tree-board'));
});

test('search reveals deep branches; existing grow control still works',async()=>{
  const elements = await unlock();
  elements.navigation.children.find(node=>node.textContent==='The Tree').listeners.click();
  const panel = elements['tree-panel'];
  assert.ok(!panel.querySelectorAll('.tree-branch[data-node]').some(node=>node.dataset.node==='test-5-i18'));
  const search = descendant(panel,node=>node.className==='tree-search');
  assert.ok(search);
  search.value='test 5';
  search.listeners.input();
  const result = descendant(panel,node=>node.className==='tree-result'&&node.textContent==='test 5');
  assert.ok(result);
  result.listeners.click();
  const leaf = panel.querySelectorAll('.tree-branch[data-node]').find(node=>node.dataset.node==='test-5-i18');
  assert.ok(leaf,'Search must reveal a deep node even when its sibling group was capped');
  const grow = descendant(leaf,node=>node.className==='tree-add');
  assert.ok(grow);
  grow.listeners.click();
  assert.equal(elements['node-wizard'].open,true);
  const open = descendant(leaf,node=>node.className==='tree-open');
  open.listeners.click();
  assert.equal(elements['placeholder-panel'].hidden,false);
  const breadcrumb = elements['local-navigation'].children.map(node=>node.textContent).join(' ');
  assert.match(breadcrumb,/The Workshop/);
  assert.match(breadcrumb,/test 5/);
});


test('shared navigation recognizes project buds at any depth',()=>{
  const scope={window:{}};
  vm.runInNewContext(navigationSource,scope);
  const nodes=[
    {id:'project',title:'Project',parent:null},
    {id:'bud-a',title:'Bud A',parent:'project'},
    {id:'bud-b',title:'Bud B',parent:'bud-a'}
  ];
  const data=scope.window.LivingSeedsNodeNavigation.model(nodes,'bud-b',{coreIds:['project'],homeId:'project'});
  assert.deepEqual(Array.from(data.path,node=>node.id),['bud-a','bud-b']);
  assert.deepEqual(Array.from(data.core,node=>node.id),['project']);
});
