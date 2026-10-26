(function () {
  'use strict';

  const STORAGE_KEY = 'tnu:contribution-drafts:v1';
  const MAX_DRAFTS = 20;
  const TYPE_NAMES = { text: '文字', image: '图片', project: '已落地项目', idea: '灵感提案', video: '视频', comic: '漫画' };
  const workingDrafts = new Map();
  let dialog, main, notice, previousFocus, currentId, form, fields, authorHint, currentSaved = false;

  function fixedDraftName() {
    try { const state = window.TNU_COMMUNITY?.getState(); return state?.user && state.profile?.displayName && !state.profile.needsName && !state.profileLoading && !state.profileError ? state.profile.displayName : ''; }
    catch (_) { return ''; }
  }
  function updateAuthorHint() {
    if (authorHint?.isConnected) authorHint.textContent = fixedDraftName() ? '发布时自动使用已确认的校园账号名：' + fixedDraftName() : '发布时自动使用已确认的校园账号名。离线时可以先编辑正文，旧草稿中的署名不会作为账号名导入。';
  }

  function el(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  }

  function button(text, className, action) {
    const node = el('button', className, text);
    node.type = 'button';
    node.addEventListener('click', action);
    return node;
  }

  function categories() {
    const items = window.TNU_CONTENT && window.TNU_CONTENT.categories;
    return Array.isArray(items) ? items.filter(item => item && typeof item.id === 'string') : [];
  }

  function allowedTypes(category) {
    const accepts = category && category.accepts;
    const list = Array.isArray(accepts) ? accepts : ['text'];
    const supported = list.filter(type => Object.prototype.hasOwnProperty.call(TYPE_NAMES, type));
    return supported.length ? supported : ['text'];
  }

  function safeString(value, limit) {
    return typeof value === 'string' ? value.slice(0, limit) : '';
  }

  function safeUrl(value) {
    if (!value) return '';
    try {
      const parsed = new URL(value);
      return ['https:', 'http:'].includes(parsed.protocol) ? parsed.href : '';
    } catch (_) {
      return '';
    }
  }

  function normalizeDraft(value) {
    if (!value || typeof value !== 'object' || typeof value.id !== 'string' || typeof value.category !== 'string') return null;
    return {
      id: safeString(value.id, 100), category: safeString(value.category, 100),
      title: safeString(value.title, 60), summary: safeString(value.summary, 160), body: safeString(value.body, 6000),
      type: Object.prototype.hasOwnProperty.call(TYPE_NAMES, value.type) ? value.type : 'text',
      cover: '', media: '', url: safeUrl(safeString(value.url, 2000)), status: 'draft', tags: [],
      author: safeString(value.author, 30) || '校园同学', date: safeString(value.date, 40), example: false
    };
  }

  function readDrafts() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { drafts: [], error: '' };
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return { drafts: [], error: '草稿数据无法读取。你仍然可以写新草稿并导出 JSON 保存。' };
      return { drafts: parsed.map(normalizeDraft).filter(Boolean).slice(0, MAX_DRAFTS), error: '' };
    } catch (_) {
      return { drafts: [], error: '浏览器暂时不允许读取本地草稿。你仍然可以填写内容并导出 JSON 保存。' };
    }
  }

  function announce(message, error) {
    notice.textContent = message;
    notice.classList.toggle('tnud-status-error', Boolean(error));
  }

  function preserveWorkingDraft() {
    if (!fields || !form || !form.isConnected || currentSaved) return;
    const category = fields.category.value;
    if (![fields.title, fields.body, fields.url].some(control => control.value.trim())) {
      workingDrafts.delete(category);
      return;
    }
    workingDrafts.set(category, {
      id: currentId, category, type: fields.type.value, title: fields.title.value,
      author: fixedDraftName(), body: fields.body.value, url: fields.url.value, _unsaved: true
    });
  }

  function ensureDialog() {
    if (dialog) return;
    dialog = el('dialog', 'tnud-dialog');
    dialog.setAttribute('aria-labelledby', 'tnud-dialog-title');
    dialog.setAttribute('aria-describedby', 'tnud-privacy');
    const close = button('×', 'tnud-close', () => dialog.close());
    close.setAttribute('aria-label', '关闭投稿草稿窗口');
    dialog.append(close);
    main = el('div', 'tnud-main');
    dialog.append(main);
    dialog.addEventListener('close', () => {
      preserveWorkingDraft();
      if (previousFocus && document.contains(previousFocus)) previousFocus.focus();
    });
    document.body.append(dialog);
  }

  function present() {
    if (!dialog.open) {
      previousFocus = document.activeElement;
      dialog.showModal();
    }
  }

  function heading(title) {
    preserveWorkingDraft();
    main.replaceChildren();
    main.append(el('div', 'tnud-eyebrow', 'THUNDER NAIDAN UNIVERSITY · 校园共创'));
    const h2 = el('h2', '', title);
    h2.id = 'tnud-dialog-title';
    main.append(h2);
    const privacy = el('p', 'tnud-privacy', '“保存到本机”只保存在当前浏览器；点击“提交到社区”后，登录并确认提交，才会发送至云端审核。');
    privacy.id = 'tnud-privacy';
    main.append(privacy);
    notice = el('p', 'tnud-status');
    notice.setAttribute('role', 'status');
    notice.setAttribute('aria-live', 'polite');
  }

  function field(labelText, name, tag, options) {
    const wrapper = el('div', 'tnud-field');
    const label = el('label', '', labelText);
    const control = el(tag || 'input', '');
    control.id = 'tnud-' + name;
    control.name = name;
    label.htmlFor = control.id;
    Object.entries(options || {}).forEach(([key, value]) => { control[key] = value; });
    wrapper.append(label, control);
    fields[name] = control;
    return wrapper;
  }

  function updateTypes(preferred) {
    const category = categories().find(item => item.id === fields.category.value);
    fields.type.replaceChildren();
    allowedTypes(category).forEach(type => fields.type.append(new Option(TYPE_NAMES[type], type)));
    if (allowedTypes(category).includes(preferred)) fields.type.value = preferred;
  }

  function currentDraft() {
    if (!form.reportValidity()) return null;
    const url = fields.url.value.trim();
    if (url && !safeUrl(url)) {
      fields.url.setCustomValidity('请输入以 https:// 或 http:// 开头的完整网址。');
      fields.url.reportValidity();
      return null;
    }
    fields.url.setCustomValidity('');
    const title = fields.title.value.trim();
    const body = fields.body.value.trim();
    if (!title || !body) {
      announce('标题和内容不能只包含空格，请补充后再保存。', true);
      (!title ? fields.title : fields.body).focus();
      return null;
    }
    currentId = currentId || 'draft-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    return {
      id: currentId, category: fields.category.value, title,
      summary: body.replace(/\s+/g, ' ').slice(0, 160), body, type: fields.type.value,
      cover: '', media: '', url: safeUrl(url), status: 'draft', tags: [],
      author: fixedDraftName(), date: new Date().toISOString(), example: false
    };
  }

  function exportDraft(draft) {
    const payload = { format: 'tnu-contribution-draft-v1', exportedAt: new Date().toISOString(), post: draft };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const link = document.createElement('a');
    const objectUrl = URL.createObjectURL(blob);
    link.href = objectUrl;
    link.download = '奶蛋投稿草稿-' + draft.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').slice(0, 45) + '.json';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    announce('已生成 JSON 下载文件。下载后可以交给网站维护者整理收录；不会自动公开发布。');
  }

  function saveDraft(event) {
    event.preventDefault();
    const draft = currentDraft();
    if (!draft) return;
    const existing = readDrafts();
    if (existing.error) {
      announce(existing.error + ' 为避免覆盖已有内容，本次未写入本地存储，请使用“导出 JSON”。', true);
      return;
    }
    const items = [draft, ...existing.drafts.filter(item => item.id !== draft.id)].slice(0, MAX_DRAFTS);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      workingDrafts.delete(draft.category);
      currentSaved = true;
      announce('草稿已保存在当前浏览器。不会公开发布；最近 20 份草稿会保留在“我的草稿”中。');
    } catch (_) {
      announce('本地保存失败，可能是浏览器限制或存储空间不足。当前填写内容仍在，可以点击“导出 JSON”自行保存。', true);
    }
  }

  function renderEditor(categoryId, selectedDraft) {
    heading('写一份投稿草稿');
    fields = null;
    const available = categories();
    if (!available.length) {
      main.append(el('p', 'tnud-empty', '投稿分类正在加载，请关闭窗口后重试。'));
      main.append(notice);
      return;
    }
    const storage = readDrafts();
    const category = available.find(item => item.id === categoryId) || available[0];
    const draft = selectedDraft === false ? undefined : selectedDraft || workingDrafts.get(category.id) || storage.drafts.find(item => item.category === category.id);
    currentId = draft ? draft.id || null : null;
    currentSaved = Boolean(draft && !draft._unsaved);
    fields = {};
    form = el('form', 'tnud-form');
    const row = el('div', 'tnud-row');
    row.append(field('投稿分类', 'category', 'select', { required: true }), field('内容形式', 'type', 'select', { required: true }));
    available.forEach(item => fields.category.append(new Option(item.title || item.id, item.id)));
    fields.category.value = category.id;
    updateTypes(draft && draft.type);
    form.append(row);
    form.append(field('标题（必填，最多 60 字）', 'title', 'input', { required: true, maxLength: 60, placeholder: '给你的脑洞起个名字' }));
    authorHint = el('p', 'tnud-privacy'); form.append(authorHint);
    form.append(field('内容（必填，最多 6,000 字）', 'body', 'textarea', { required: true, maxLength: 6000, rows: 7, placeholder: '写下想表达的内容、项目进展或未来灵感。图片、漫画或视频可填写作品说明，并在下方附上链接。' }));
    form.append(field('作品或参考链接（选填，仅支持 http / https）', 'url', 'input', { type: 'url', maxLength: 2000, placeholder: 'https://…', inputMode: 'url' }));
    fields.url.addEventListener('input', () => fields.url.setCustomValidity(''));
    fields.category.addEventListener('change', () => {
      currentId = null;
      updateTypes(fields.type.value);
      currentSaved = false;
      announce('分类已切换。保存时会新建一份草稿。');
    });
    form.addEventListener('input', () => {
      if (currentSaved) {
        currentSaved = false;
        announce('内容已修改，记得保存草稿或导出 JSON。');
      }
    });
    if (draft) {
      fields.title.value = draft.title;
      fields.body.value = draft.body;
      fields.url.value = draft.url;
    }
    const actions = el('div', 'tnud-actions');
    const save = el('button', 'tnud-primary', '保存到本机');
    save.type = 'submit';
    actions.append(button('提交到社区', 'tnud-primary', () => {
      const draft = currentDraft();
      if (!draft) return;
      if (!window.TNU_COMMUNITY_UI) {
        announce('社区窗口暂时无法加载。当前内容仍在，请先保存到本机或导出 JSON。', true);
        return;
      }
      preserveWorkingDraft();
      dialog.close();
      window.dispatchEvent(new CustomEvent('tnu:submit', { detail: { draft } }));
    }), save, button('导出 JSON', 'tnud-secondary', () => {
      const post = currentDraft();
      if (post) exportDraft(post);
    }), button('我的草稿', 'tnud-link', openLibrary));
    form.append(actions);
    form.addEventListener('submit', saveDraft);
    main.append(form, notice);
    updateAuthorHint();
    main.append(el('p', 'tnud-footnote', '保存到本机与导出 JSON 不会发送内容。社区连接完成后，可在“提交到社区”窗口添加图片并主动提交审核；未经审核的稿件不会公开。本机草稿不会自动上传，清除浏览器数据会清除草稿，重要内容请导出备份。'));
    if (storage.error) announce(storage.error, true);
    else if (draft) announce(draft._unsaved ? '已恢复本次页面中尚未保存的编辑内容。请保存到本机或导出 JSON，刷新页面会丢失未保存的修改。' : '已载入这个分类最近保存的草稿，可以继续编辑。');
  }

  function open(categoryId) {
    ensureDialog();
    renderEditor(categoryId);
    present();
    fields && fields.title && fields.title.focus();
  }

  function openLibrary() {
    ensureDialog();
    heading('我的草稿');
    const result = readDrafts();
    const toolbar = el('div', 'tnud-library-toolbar');
    toolbar.append(el('span', '', '本浏览器最近 ' + result.drafts.length + ' 份草稿 / 最多保留 20 份'), button('写新草稿', 'tnud-secondary', () => {
      renderEditor(categories()[0] && categories()[0].id, false);
      if (fields) {
        announce('新草稿已准备好。');
        fields.title.focus();
      }
    }));
    main.append(toolbar);
    workingDrafts.forEach(draft => {
      const category = categories().find(item => item.id === draft.category);
      const recovery = el('div', 'tnud-library-toolbar');
      recovery.append(el('span', '', (category && category.title || draft.category) + ' · 有本次页面尚未保存的编辑内容'), button('继续未保存的编辑', 'tnud-secondary', () => {
        renderEditor(draft.category, draft);
        if (fields) fields.title.focus();
      }));
      main.append(recovery);
    });
    if (!result.drafts.length) main.append(el('p', 'tnud-empty', '这里还没有保存的草稿。先把你的第一个脑洞记下来吧。'));
    const list = el('div', 'tnud-draft-list');
    result.drafts.forEach(draft => {
      const card = el('article', 'tnud-draft-card');
      const category = categories().find(item => item.id === draft.category);
      card.append(el('span', 'tnud-draft-category', (category && category.title || draft.category) + ' · ' + TYPE_NAMES[draft.type]));
      card.append(el('h3', '', draft.title || '未命名草稿'), el('p', '', draft.summary));
      const validDate = new Date(draft.date);
      const dateText = Number.isNaN(validDate.getTime()) ? '保存时间未知' : validDate.toLocaleString('zh-CN');
      card.append(el('small', '', dateText));
      const actions = el('div', 'tnud-actions');
      actions.append(button('继续编辑', 'tnud-secondary', () => {
        renderEditor(draft.category, draft);
        fields.title.focus();
      }), button('导出 JSON', 'tnud-link', () => exportDraft(draft)));
      card.append(actions);
      list.append(card);
    });
    main.append(list, notice);
    main.append(el('p', 'tnud-footnote', '草稿仅保存在当前浏览器，不会公开发布。换浏览器、换设备或清除站点数据后，这份列表不会同步。'));
    if (result.error) announce(result.error, true);
    present();
  }

  window.TNU_DRAFTS = Object.freeze({ open, openLibrary });
  window.addEventListener('tnu:community-state', updateAuthorHint);
  window.addEventListener('tnu:draft', event => {
    const category = event.detail && event.detail.category;
    open(typeof category === 'string' ? category : undefined);
  });
})();
