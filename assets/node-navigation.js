/* Shared, dependency-free node navigation for the encrypted Tree and localhost previews.
 * Content pages never own navigation and never execute scripts inside their iframe. */
(function (root) {
  'use strict';
  function model(nodes, activeId, options) {
    const opts = options || {};
    const byId = new Map();
    const children = new Map();
    for (const node of nodes) {
      if (!node || typeof node.id !== 'string' || byId.has(node.id)) continue;
      byId.set(node.id, node);
    }
    for (const node of byId.values()) {
      const parent = node.parent !== node.id && byId.has(node.parent) ? node.parent : null;
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent).push(node);
    }
    const active = byId.get(activeId) || byId.values().next().value;
    if (!active) return {core: [], path: [], children: [], active: null, near: []};
    const coreIds = opts.coreIds || [];
    const core = coreIds.map(id => byId.get(id)).filter(Boolean);
    const coreSet = new Set(coreIds);
    const context = active.id === opts.treeId && byId.has(opts.focusId)
      ? byId.get(opts.focusId) : active;
    const path = [];
    const seen = new Set();
    let current = context;
    while (current && !seen.has(current.id) && path.length < byId.size) {
      seen.add(current.id);
      path.unshift(current);
      current = byId.get(current.parent);
    }
    const localPath = path.filter(node => !coreSet.has(node.id));
    const near = children.get(active.id) || [];
    const fallback = children.get(opts.homeId) || [];
    return {active, context, core, path: localPath,
      children: near, near: fallback.filter(node => !coreSet.has(node.id))};
  }

  function mount(options) {
    const doc = options.document || document;
    const global = options.global;
    const local = options.local;
    const selected = options.activeId;
    const data = model(options.nodes, selected, options);
    if (!global || !local) throw Error('Navigation containers missing');
    global.replaceChildren();
    local.replaceChildren();
    if (!data.active) return data;
    const select = options.onSelect || (() => {});
    const explore = options.onExplore || (() => {});
    function link(node, target, cls) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = cls;
      button.dataset.page = node.id;
      button.textContent = node.title;
      button.title = node.title;
      if (node.id === selected) button.setAttribute('aria-current', 'page');
      button.addEventListener('click', () => select(node.id));
      target.appendChild(button);
    }
    for (const node of data.core) link(node, global, 'nav-core-link');
    const label = doc.createElement('span');
    label.className = 'nav-context-label';
    label.textContent = 'LOCAL';
    local.appendChild(label);
    const path = data.path.length > 4
      ? [data.path[0], null, ...data.path.slice(-2)] : data.path;
    if (path.length) {
      path.forEach((node, index) => {
        if (index) {
          const slash = doc.createElement('span');
          slash.className = 'nav-crumb-sep';
          slash.textContent = '/';
          slash.setAttribute('aria-hidden', 'true');
          local.appendChild(slash);
        }
        if (node) link(node, local, 'nav-crumb');
        else {
          const more = doc.createElement('button');
          more.type = 'button';
          more.className = 'nav-more';
          more.textContent = '…';
          more.title = 'Explore hidden ancestors';
          more.setAttribute('aria-label', 'Explore hidden ancestors');
          more.addEventListener('click', explore);
          local.appendChild(more);
        }
      });
    } else {
      data.near.slice(0, 4).forEach(node => link(node, local, 'nav-nearby'));
    }
    if (selected !== options.treeId && data.children.length) {
      const divider = doc.createElement('span');
      divider.className = 'nav-local-divider';
      divider.setAttribute('aria-hidden', 'true');
      local.appendChild(divider);
      data.children.slice(0, 3).forEach(node => link(node, local, 'nav-nearby'));
      if (data.children.length > 3) {
        const more = doc.createElement('button');
        more.type = 'button';
        more.className = 'nav-more';
        more.textContent = '+' + (data.children.length - 3);
        more.title = 'Show all descendants';
        more.addEventListener('click', explore);
        local.appendChild(more);
      }
    }
    return data;
  }
  root.LivingSeedsNodeNavigation = Object.freeze({model, mount});
})(typeof window === 'undefined' ? globalThis : window);
