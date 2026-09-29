'use strict';

// The local preview server publishes authenticated saves to content-overrides.json.
// Browser storage remains a recovery copy; static deployments can still export JSON.
(() => {
  const editing = new URLSearchParams(location.search).get('edit') === '1';
  const storageKey = `accrue-content-draft-v1:${location.pathname}`;
  const tokenKey = `accrue-editor-token:${location.pathname}`;
  const textNodes = new Map();
  // Retired copy remains valid in older drafts, but is no longer rendered.
  const knownTextKeys = new Set(['hero.thesis', 'overview.description', 'method.description', 'resources.title', 'results.video.title', 'results.AutoMate.caption', 'results.NIST.caption']);
  const linkNodes = new Map();
  const originalText = new Map();
  const originalLinks = new Map();
  let published = { version: 1, text: {}, links: {} };
  let draft = { version: 1, text: {}, links: {} };
  let dirty = false;
  let enabled = editing;
  let status;
  let repositoryInput;
  let tokenInput;
  let tokenField;
  let revision = '';
  let saving = false;
  let readyToSave = false;
  let legacyDraft = false;

  function collectNodes() {
    textNodes.clear();
    document.querySelectorAll('[data-edit-key]').forEach((node) => {
      const key = node.dataset.editKey;
      // Native plaintext paste may leave a BR caret placeholder, but never edit containers.
      if (!/^[a-zA-Z0-9_.-]{1,100}$/.test(key) || [...node.children].some((child) => child.tagName !== 'BR')) return;
      knownTextKeys.add(key);
      for (const alternate of (node.dataset.editKeys ?? '').split(/\s+/)) {
        if (/^[a-zA-Z0-9_.-]{1,100}$/.test(alternate)) knownTextKeys.add(alternate);
      }
      if (!originalText.has(key)) originalText.set(key, node.textContent);
      if (!textNodes.has(key)) textNodes.set(key, new Set());
      textNodes.get(key).add(node);
    });
    document.querySelectorAll('[data-edit-link]').forEach((node) => {
      const key = node.dataset.editLink;
      if (key !== 'repository' || node.tagName !== 'A') return;
      if (!linkNodes.has(key)) linkNodes.set(key, new Set());
      linkNodes.get(key).add(node);
      if (!originalLinks.has(node)) originalLinks.set(node, {
        href: node.getAttribute('href'),
        disabled: node.getAttribute('aria-disabled'),
        tabindex: node.getAttribute('tabindex'),
        title: node.getAttribute('title'),
      });
    });
  }

  function safeUrl(value) {
    if (typeof value !== 'string' || value.length > 2048 || /[\u0000-\u0020\u007f]/.test(value)) {
      throw new Error('Repository URL must be an http:// or https:// address without spaces.');
    }
    let url;
    try { url = new URL(value); } catch { throw new Error('Enter a complete repository URL.'); }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
      throw new Error('Repository URL must use http:// or https:// and must not contain credentials.');
    }
    return url.href;
  }

  function validate(value) {
    if (!value || value.version !== 1 || !value.text || !value.links ||
        typeof value.text !== 'object' || Array.isArray(value.text) ||
        typeof value.links !== 'object' || Array.isArray(value.links) ||
        Object.keys(value).some((key) => !['version', 'text', 'links'].includes(key))) {
      throw new Error('Expected a version 1 content file with text and links objects.');
    }
    const clean = { version: 1, text: {}, links: {} };
    for (const [key, text] of Object.entries(value.text)) {
      if (!knownTextKeys.has(key)) throw new Error(`Unknown editable text: ${key}`);
      if (typeof text !== 'string' || !text.trim() || text.length > 3000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) {
        throw new Error(`Text ${key} must contain 1–3,000 plain-text characters.`);
      }
      clean.text[key] = text;
    }
    for (const [key, url] of Object.entries(value.links)) {
      if (!linkNodes.has(key)) throw new Error(`Unknown editable link: ${key}`);
      clean.links[key] = safeUrl(url);
    }
    return clean;
  }

  function notify(message, error = false) {
    if (!status) return;
    status.textContent = message;
    status.dataset.error = String(error);
  }

  function apply(content, updateRepository = true) {
    for (const [key, nodes] of textNodes) {
      const value = content.text[key] ?? originalText.get(key);
      for (const node of nodes) if (node.textContent !== value || node.children.length) node.textContent = value;
    }
    for (const [key, nodes] of linkNodes) {
      for (const node of nodes) {
        if (content.links[key]) {
          node.href = content.links[key];
          node.removeAttribute('aria-disabled');
          node.removeAttribute('tabindex');
          node.title = 'Code repository';
        } else {
          const original = originalLinks.get(node);
          for (const [attr, value] of Object.entries({ href: original.href, 'aria-disabled': original.disabled, tabindex: original.tabindex, title: original.title })) {
            if (value === null) node.removeAttribute(attr);
            else node.setAttribute(attr, value);
          }
        }
      }
    }
    if (repositoryInput && updateRepository) repositoryInput.value = content.links.repository ?? '';
  }

  function capture() {
    const next = { version: 1, text: { ...draft.text }, links: { ...draft.links } };
    for (const [key, nodes] of textNodes) {
      const value = [...nodes][0].textContent;
      if (value === originalText.get(key)) delete next.text[key];
      else next.text[key] = value;
    }
    if (repositoryInput) {
      const url = repositoryInput.value.trim();
      if (url) next.links.repository = url;
      else delete next.links.repository;
    }
    return validate(next);
  }

  function setEditing() {
    for (const nodes of textNodes.values()) for (const node of nodes) {
      if (enabled && !saving) {
        node.setAttribute('contenteditable', 'plaintext-only');
        node.setAttribute('spellcheck', 'true');
        node.setAttribute('data-editor-active', 'true');
      } else {
        node.removeAttribute('contenteditable');
        node.removeAttribute('spellcheck');
        node.removeAttribute('data-editor-active');
      }
    }
    document.body.classList.toggle('content-editing', enabled);
  }

  async function readPublished() {
    const response = await fetch('content-overrides.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const content = validate(await response.json());
    published = content;
    revision = response.headers.get('ETag') ?? '';
  }

  function setSaving(value) {
    saving = value;
    document.querySelectorAll('.editor-actions button').forEach(button => { button.disabled = value; });
    document.querySelector('#editor-save').disabled = value || !readyToSave;
    repositoryInput.disabled = value;
    tokenInput.disabled = value;
    setEditing();
  }

  function rememberDraft() {
    try { localStorage.setItem(storageKey, JSON.stringify({ content: draft, revision })); }
    catch { /* A browser storage restriction must not block saving to the workstation. */ }
  }

  async function saveChanges() {
    if (saving || !readyToSave) return;
    try {
      draft = capture();
      if (legacyDraft) {
        if (!window.confirm('This older browser draft has no saved version information. Publish it over the currently loaded page? Cancel to keep reviewing, or Reset draft to load the server copy.')) return;
        legacyDraft = false;
      }
      rememberDraft();
      if (!revision) throw new Error('Direct saving requires serve.py. Your draft is kept; JSON export is still available.');
      const token = tokenInput.value.trim();
      if (!token) {
        tokenField.hidden = false;
        tokenInput.focus();
        throw new Error('Enter the editor key, or open this page through an SSH localhost tunnel.');
      }
      setSaving(true);
      notify('Saving to the workstation…');
      const response = await fetch('api/content-overrides', {
        method: 'POST',
        signal: AbortSignal.timeout(15000),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'If-Match': revision },
        body: JSON.stringify(draft),
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 401) {
          tokenField.hidden = false;
          try { sessionStorage.removeItem(tokenKey); } catch { /* Optional convenience only. */ }
        }
        if (response.status === 409) throw new Error('The page changed in another tab. Your edits are kept. Export a backup, then Reset draft to load the latest version.');
        throw new Error(result.message || result.error || `HTTP ${response.status}`);
      }
      published = validate(result.content);
      revision = result.revision;
      draft = { version: 1, text: { ...published.text }, links: { ...published.links } };
      apply(draft);
      dirty = false;
      try { localStorage.removeItem(storageKey); } catch { /* Server save has already succeeded. */ }
      try { sessionStorage.setItem(tokenKey, token); } catch { /* Re-enter the key next session if needed. */ }
      notify('Saved to content-overrides.json on the workstation. Reload any page to see the changes.');
    } catch (error) {
      dirty = true;
      notify(`Save not confirmed: ${error.message} Your edits are kept.`, true);
    } finally {
      if (saving) setSaving(false);
    }
  }

  function addButton(parent, label, id, action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = id;
    button.textContent = label;
    button.addEventListener('click', action);
    parent.append(button);
    return button;
  }

  function createToolbar() {
    const toolbar = document.createElement('aside');
    toolbar.id = 'content-editor';
    toolbar.className = 'content-editor';
    toolbar.setAttribute('aria-label', 'Page text editor');
    const heading = document.createElement('strong');
    heading.textContent = 'Content editor';
    const note = document.createElement('p');
    note.className = 'editor-note';
    note.textContent = 'Edit outlined text, then Save changes to update this workstation’s website. Measurements and videos are read-only.';
    const actions = document.createElement('div');
    actions.className = 'editor-actions';
    const toggle = addButton(actions, 'Preview', 'editor-toggle', () => {
      try {
        draft = capture();
        apply(draft);
        enabled = !enabled;
        setEditing();
        toggle.textContent = enabled ? 'Preview' : 'Edit text';
        toggle.setAttribute('aria-pressed', String(!enabled));
      } catch (error) { notify(error.message, true); }
    });
    toggle.setAttribute('aria-pressed', 'false');
    addButton(actions, 'Save changes', 'editor-save', saveChanges).disabled = true;
    addButton(actions, 'Export JSON', 'editor-export', () => {
      try {
        draft = capture();
        const url = URL.createObjectURL(new Blob([`${JSON.stringify(draft, null, 2)}\n`], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = 'content-overrides.json';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        notify('Exported a JSON backup. Use Save changes to publish directly to this workstation.');
      } catch (error) { notify(error.message, true); }
    });
    const file = document.createElement('input');
    file.type = 'file';
    file.accept = '.json,application/json';
    file.hidden = true;
    file.id = 'editor-import-file';
    addButton(actions, 'Import JSON', 'editor-import', () => file.click());
    file.addEventListener('change', async () => {
      const selected = file.files[0];
      if (!selected) return;
      try {
        if (selected.size > 500000) throw new Error('Content file is too large (maximum 500 KB).');
        const imported = validate(JSON.parse(await selected.text()));
        if (dirty && !window.confirm('Replace the unsaved edits with this imported draft? Export first if you need a backup.')) return;
        draft = imported;
        dirty = true;
        apply(draft);
        notify('Imported a local preview. Save or export to keep these changes.');
      } catch (error) { notify(`Import rejected: ${error.message}`, true); }
      finally { file.value = ''; }
    });
    addButton(actions, 'Reset draft', 'editor-reset', async () => {
      if (!window.confirm('Discard this browser draft and restore the published page? Export JSON first if you need a backup.')) return;
      setSaving(true);
      try {
        await readPublished();
        draft = { version: 1, text: { ...published.text }, links: { ...published.links } };
        apply(draft);
        dirty = false;
        legacyDraft = false;
        try { localStorage.removeItem(storageKey); } catch { /* The latest server copy is already loaded. */ }
        notify('Restored the latest saved page from the workstation.');
      } catch (error) { notify(`Could not reload: ${error.message} Your edits are kept.`, true); }
      finally { setSaving(false); }
    });
    const label = document.createElement('label');
    label.className = 'editor-link-field';
    label.htmlFor = 'editor-repository';
    label.textContent = 'Code repository URL';
    repositoryInput = document.createElement('input');
    repositoryInput.type = 'url';
    repositoryInput.id = 'editor-repository';
    repositoryInput.placeholder = 'https://github.com/organization/repository';
    repositoryInput.autocomplete = 'off';
    repositoryInput.maxLength = 2048;
    repositoryInput.addEventListener('input', () => { dirty = true; notify('Unsaved local edits.'); });
    label.append(repositoryInput);
    if (!linkNodes.has('repository')) label.hidden = true;
    tokenField = document.createElement('label');
    tokenField.className = 'editor-link-field';
    tokenField.htmlFor = 'editor-token';
    tokenField.textContent = 'Editor key (LAN access)';
    tokenField.hidden = true;
    tokenInput = document.createElement('input');
    tokenInput.type = 'password';
    tokenInput.id = 'editor-token';
    tokenInput.autocomplete = 'off';
    tokenInput.maxLength = 256;
    tokenInput.placeholder = 'From website/.editor-token on the workstation';
    tokenField.append(tokenInput);
    status = document.createElement('p');
    status.className = 'editor-status';
    status.id = 'editor-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    toolbar.append(heading, note, actions, label, tokenField, status, file);
    document.body.append(toolbar);
    document.body.classList.add('has-content-editor');
    document.addEventListener('input', (event) => {
      const node = event.target.closest('[data-editor-active]');
      if (!node) return;
      const key = node.dataset.editKey;
      for (const other of textNodes.get(key) ?? []) if (other !== node) other.textContent = node.textContent;
      if (node.textContent === originalText.get(key)) delete draft.text[key];
      else draft.text[key] = node.textContent;
      dirty = true;
      notify('Unsaved local edits.');
    });
    window.addEventListener('beforeunload', (event) => {
      if (dirty) { event.preventDefault(); event.returnValue = ''; }
    });
  }

  collectNodes();
  if (editing) createToolbar();
  const ready = (async () => {
    try {
      await readPublished();
    } catch (error) {
      notify(`Published content could not be loaded; using the page defaults. ${error.message}`, true);
      console.warn('ACCRUE content overrides:', error.message);
    }
    draft = { version: 1, text: { ...published.text }, links: { ...published.links } };
    if (editing) {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          const recovery = JSON.parse(saved);
          draft = validate(recovery.content ?? recovery);
          if (recovery.content && typeof recovery.revision === 'string' && /^"[a-f0-9]{64}"$/.test(recovery.revision)) revision = recovery.revision;
          else legacyDraft = true;
          dirty = true;
          notify('Restored a browser recovery draft. Save changes to publish it; conflicts with newer saves are protected.');
        }
        else notify('Edit text and Save changes to publish to this workstation.');
      } catch (error) { notify(`Saved draft unavailable: ${error.message} Export JSON to keep edits.`, true); }
      try {
        const response = await fetch('api/editor-session', { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const session = await response.json();
        tokenField.hidden = Boolean(session.token);
        let savedToken = '';
        try { savedToken = sessionStorage.getItem(tokenKey) ?? ''; } catch { /* Optional credential convenience. */ }
        tokenInput.value = session.token || savedToken;
        readyToSave = Boolean(revision);
      } catch {
        notify('This host does not support direct saving. You can preview edits and export a JSON backup.', true);
      }
      document.querySelector('#editor-save').disabled = !readyToSave;
    }
    apply(editing ? draft : published);
    if (editing) setEditing();
  })();
  // app.js can reapply approved copy after changing an explicitly editable node.
  document.addEventListener('accrue:content-updated', () => {
    collectNodes();
    apply(editing ? draft : published, false);
    if (editing) setEditing();
  });
  window.AccrueEditor = { ready, validate, get enabled() { return editing; } };
})();
