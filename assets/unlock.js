(() => {
  'use strict';

  const AAD = new TextEncoder().encode('living-seeds:bundle:v2');
  const $ = (id) => document.getElementById(id);
  const ready = () => {
    const gate = $('gate');
    const experience = $('experience');
    const status = $('status');
    const keyInput = $('key');
    const pageFrame = $('page');
    const nav = $('navigation');
    const form = $('unlock-form');
    const unlock = $('unlock');
    const lock = $('lock');
    const missing = Object.entries({gate,experience,status,keyInput,pageFrame,nav,form,unlock,lock})
      .filter(([,element]) => !element).map(([name]) => name);
    if (missing.length) {
      const message = `Living Seeds loader: missing page elements (${missing.join(', ')}).`;
      console.error(message);
      const p = document.createElement('p');
      p.textContent = 'The site could not initialize. Please reload the page.';
      document.body.appendChild(p);
      return;
    }

    // No reliance on replaceChildren (browser integrations may patch it).
    function clear(element) {
      while (element.firstChild) element.removeChild(element.firstChild);
    }
    function decode(s) {
      if (typeof s !== 'string' || !/^[A-Za-z0-9_-]+$/.test(s))
        throw new Error('Invalid key or bundle encoding.');
      const base64 = s.replace(/-/g, '+').replace(/_/g, '/');
      return Uint8Array.from(atob(base64 + '='.repeat((4 - base64.length % 4) % 4)), (c) => c.charCodeAt(0));
    }

    let pages = null;
    let cachedBundle = null;
    // Preload encrypted data so the invitation screen can unlock promptly.
    const bundlePromise = fetch('./site.bundle.enc.json', { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error('Encrypted bundle unavailable (' + response.status + ').');
        return response.json();
      })
      .then((bundle) => { cachedBundle = bundle; return bundle; });
    bundlePromise.catch(() => {});

    function displayPage(id) {
      if (!pages) return;
      const item = pages.find((p) => p.id === id) || pages[0];
      const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; script-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'">`;
      // Inject CSP even if the contributor's HTML omitted a head element.
      const html = /<head(?:\s[^>]*)?>/i.test(item.html)
        ? item.html.replace(/<head(?:\s[^>]*)?>/i, (match) => match + csp)
        : '<!doctype html><html><head>' + csp + '</head><body>' + item.html + '</body></html>';
      pageFrame.srcdoc = html;
      for (const button of nav.querySelectorAll('button[data-id]'))
        button.setAttribute('aria-current', button.dataset.id === item.id ? 'page' : 'false');
      document.title = item.title + ' — Living Seeds';
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      unlock.disabled = true;
      status.textContent = 'Unlocking…';
      try {
        const raw = decode(keyInput.value.trim());
        if (raw.length !== 32) throw new Error('Invitation key must contain 32 bytes.');
        const bundle = cachedBundle || await bundlePromise;
        if (bundle.v !== 2 || bundle.alg !== 'A256GCM')
          throw new Error('Unsupported encrypted bundle format.');
        const iv = decode(bundle.iv);
        if (iv.length !== 12) throw new Error('Invalid encrypted bundle.');
        const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
        const plaintext = await crypto.subtle.decrypt({
          name: 'AES-GCM', iv, additionalData: AAD, tagLength: 128
        }, key, decode(bundle.ciphertext));
        const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext));
        if (data.v !== 2 || data.type !== 'living-seeds-pages' ||
            !Array.isArray(data.pages) || data.pages.length === 0 ||
            !data.pages.every((p) => typeof p.id === 'string' && /^[a-z0-9-]+$/.test(p.id) &&
                                  typeof p.title === 'string' && typeof p.html === 'string'))
          throw new Error('Invalid site bundle.');
        pages = data.pages;
        clear(nav);
        for (const item of pages) {
          const button = document.createElement('button');
          button.type = 'button';
          button.dataset.id = item.id;
          button.textContent = item.title;
          button.addEventListener('click', () => displayPage(item.id));
          nav.appendChild(button);
        }
        keyInput.value = '';
        gate.hidden = true;
        experience.hidden = false;
        status.textContent = '';
        displayPage(data.home);
      } catch (error) {
        status.textContent = error.name === 'OperationError'
          ? 'Incorrect invitation key or damaged bundle.'
          : (error.message || 'Unable to unlock.');
        console.error('Living Seeds unlock:', error);
      } finally {
        unlock.disabled = false;
      }
    });

    lock.addEventListener('click', () => {
      pages = null;
      pageFrame.removeAttribute('srcdoc');
      clear(nav);
      experience.hidden = true;
      gate.hidden = false;
      document.title = 'Living Seeds — Invitation';
      keyInput.focus();
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true });
  else ready();
})();
