(function () {
  'use strict';

  const TYPES = { text: '文字', image: '图片', project: '已落地项目', idea: '灵感提案', video: '视频链接', comic: '漫画' };
  const STATUS = { pending: '待审核', approved: '已发布', rejected: '已退回' };
  const ONLINE_URL = 'https://reliable-crisp-2e28c6.netlify.app';
  const MAX_IMAGE = 5 * 1024 * 1024;
  let dialog, availability, account, tabs, content, toast, previousFocus;
  let tab = 'submit', moderationFilter = 'pending', viewVersion = 0, authVersion = 0;
  let lastIdentity = '', accountSignature = '', authBusy = false, initStarted = false;
  let cooldownUntil = 0, cooldownTimer = null, authAction = 0;
  let authEmail = '', authCode = '', authMessage = '', authError = false, accountDom = {};
  let submission = emptySubmission(), currentForm = null, currentFeedback = null, submitButton = null;
  let submissionOwner = state().user?.id || 'guest', hasSeenAccount = !!state().user;
  const submissionDrafts = new Map(), pendingSubmissions = new Set(), profileEditors = new Map();
  const reviewNotes = new Map();

  function api() { return window.TNU_COMMUNITY || null; }
  function state() {
    try {
      return api() && api().getState ? api().getState() : { configured: false, ready: false, user: null, isModerator: false };
    } catch (_) {
      return { configured: false, ready: false, user: null, isModerator: false };
    }
  }
  function el(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = String(value);
    return node;
  }
  function button(label, className, action) {
    const node = el('button', className, label);
    node.type = 'button';
    if (action) node.addEventListener('click', action);
    return node;
  }
  function plain(value, limit) { return typeof value === 'string' ? value.slice(0, limit || 10000) : ''; }
  function errorText(error) { return plain(typeof error === 'string' ? error : error && error.message, 600) || '连接暂时未成功，请稍后重试。填写的内容仍保留在当前页面。'; }
  function safeUrl(value) {
    if (!value || typeof value !== 'string') return '';
    try {
      const url = new URL(value);
      return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
    } catch (_) { return ''; }
  }
  function link(label, url) {
    const node = el('a', 'tnuc-external', label);
    node.href = safeUrl(url);
    node.target = '_blank';
    node.rel = 'noopener noreferrer';
    return node;
  }
  function categories() {
    const source = window.TNU_CONTENT && window.TNU_CONTENT.categories;
    return Array.isArray(source) ? source.filter(item => item && typeof item.id === 'string') : [];
  }
  function allowedTypes(categoryId) {
    const category = categories().find(item => item.id === categoryId);
    const allowed = category && Array.isArray(category.accepts) ? category.accepts.filter(type => TYPES[type]) : ['text'];
    return allowed.length ? allowed : ['text'];
  }
  function categoryName(categoryId) {
    const category = categories().find(item => item.id === categoryId);
    return category ? category.title : '校园投稿';
  }
  function emptySubmission() {
    return { category: '', type: 'text', title: '', body: '', url: '', imageFile: null };
  }
  function isSubmitting() { return pendingSubmissions.has(submissionOwner); }
  function namedProfile() { const current = state(); return current.user && current.profile?.displayName && !current.profile.needsName && !current.profileLoading && !current.profileError; }
  function normalizeName(value) { return String(value || '').normalize('NFKC').replace(/\s+/gu, ' ').trim(); }
  function profileEditor(userId) {
    if (!profileEditors.has(userId)) profileEditors.set(userId, { input: '', seeded: false, dirty: false, expanded: false, busy: false, message: '', error: false });
    return profileEditors.get(userId);
  }
  function switchSubmission() {
    const owner = state().user?.id || 'guest';
    if (owner === submissionOwner) return false;
    submissionDrafts.set(submissionOwner, submission);
    const transferGuest = !hasSeenAccount && submissionOwner === 'guest' && owner !== 'guest';
    submission = submissionDrafts.get(owner) || (transferGuest ? submission : emptySubmission());
    submissionOwner = owner;
    if (owner !== 'guest') hasSeenAccount = true;
    if (owner === 'guest') { submission = emptySubmission(); submissionDrafts.set('guest', submission); }
    return true;
  }
  function offline() { return location.protocol === 'file:'; }
  function usable() { const current = state(); return !offline() && !!api() && !!current.configured && !!current.ready; }
  function reason() {
    const current = state();
    if (offline()) return '当前是本机预览。登录、云端投稿和审核请在 HTTPS 线上校园中使用；本机草稿仍可保存和导出。';
    if (!api() || !current.configured) return '社区尚未完成连接，本机草稿仍可用。网站维护者完成连接后，再来提交你的作品吧。';
    if (current.loading && !current.ready) return '正在连接校园社区，请稍候。';
    if (!current.ready) return '社区暂时无法连接。' + (current.error ? errorText(current.error) : '网站维护者还需要完成投稿数据库和访问规则的设置。') + ' 本机草稿仍可用。';
    return '';
  }
  function setMessage(node, message, isError) {
    if (!node) return;
    node.textContent = message || '';
    node.classList.toggle('tnuc-error', !!isError);
    node.setAttribute('role', isError ? 'alert' : 'status');
  }
  function announce(message, isError) { setMessage(toast, message, isError); }
  function feedback(message, isError) { setMessage(currentFeedback, message, isError); }
  function getIdentity() {
    const current = state();
    return (current.user && current.user.id || '') + '|' + !!current.isModerator;
  }
  function updateState() {
    const ownerChanged = switchSubmission();
    const identity = getIdentity();
    const changed = identity !== lastIdentity;
    if (changed) {
      lastIdentity = identity;
      authVersion += 1;
      viewVersion += 1;
      authCode = '';
      authEmail = state().user?.email || '';
      authMessage = '';
      authError = false;
      reviewNotes.clear();
    }
    if (!dialog) return;
    renderAvailability();
    renderAccount();
    updateTabs();
    syncSubmitButton();
    if (changed && dialog.open && (tab !== 'submit' || ownerChanged)) renderTab();
  }

  function ensureDialog() {
    if (dialog) return;
    dialog = el('dialog', 'tnuc-dialog');
    dialog.setAttribute('aria-labelledby', 'tnuc-dialog-title');
    dialog.setAttribute('aria-describedby', 'tnuc-intro');
    const close = button('×', 'tnuc-close', () => dialog.close());
    close.setAttribute('aria-label', '关闭校园社区窗口');
    const eyebrow = el('p', 'tnuc-eyebrow', 'THUNDER NAIDAN UNIVERSITY · 校园共创');
    const title = el('h2', '', '把你的脑洞，留在校园里。');
    title.id = 'tnuc-dialog-title';
    const intro = el('p', 'tnuc-intro', '分享创意与快乐，也许下一份让人会心一笑的作品，就来自你。');
    intro.id = 'tnuc-intro';
    availability = el('div', 'tnuc-availability');
    availability.setAttribute('aria-live', 'polite');
    account = el('section', 'tnuc-account');
    account.setAttribute('aria-label', '我的社区账号');
    tabs = el('nav', 'tnuc-tabs');
    tabs.setAttribute('aria-label', '社区功能');
    content = el('div', 'tnuc-content');
    toast = el('p', 'tnuc-message');
    toast.setAttribute('aria-live', 'polite');
    dialog.append(close, eyebrow, title, intro, availability, account, tabs, toast, content);
    const footer = el('p', 'tnuc-footnote', '投稿先审核，再公开。请分享有权发布的作品，不要填写联系方式等私人信息。邮箱只用于登录和查看自己的投稿，不作为公开署名。');
    dialog.append(footer);
    dialog.addEventListener('close', () => {
      viewVersion += 1;
      if (previousFocus && document.contains(previousFocus)) previousFocus.focus();
    });
    document.body.append(dialog);
    lastIdentity = getIdentity();
    renderAvailability();
    renderAccount();
    updateTabs();
  }

  function renderAvailability() {
    const message = reason();
    availability.replaceChildren();
    availability.hidden = !message;
    if (message) availability.append(el('p', '', message));
    if (offline()) availability.append(link('到线上校园使用社区 →', ONLINE_URL));
    const indicator = document.getElementById('community-status');
    if (indicator) indicator.textContent = usable() ? '投稿先审核，再公开' : '本机草稿可用';
  }

  function makeField(labelText, name, tag, options) {
    const wrapper = el('div', 'tnuc-field');
    const control = el(tag || 'input');
    control.id = 'tnuc-' + name;
    control.name = name;
    Object.entries(options || {}).forEach(([key, value]) => { control[key] = value; });
    const label = el('label', '', labelText);
    label.htmlFor = control.id;
    wrapper.append(label, control);
    return { wrapper, control, label };
  }

  function renderAccount() {
    const current = state();
    const signature = (current.user && current.user.id || '') + '|' + (current.user && current.user.email || '') + '|' + !!current.configured + '|' + !!current.ready + '|' + offline() + '|' + JSON.stringify(current.profile || null) + '|' + !!current.profileLoading + '|' + String(current.profileError || '');
    if (accountSignature === signature) { syncAuthButtons(); return; }
    accountSignature = signature;
    account.replaceChildren();
    accountDom = {};
    if (current.user) {
      const row = el('div', 'tnuc-account-row');
      const label = el('div');
      label.append(el('strong', '', '已登录校园社区'), el('small', 'tnuc-private-email', current.user.email || '我的账号'));
      const logout = button('退出登录', 'tnuc-button tnuc-secondary', signOut);
      accountDom.logout = logout;
      row.append(label, logout);
      account.append(row, el('p', 'tnuc-small', '邮箱只用于登录。通知书、投稿与评论统一使用你的校园账号名。'));
      renderProfile(current);
      accountDom.message = el('p', 'tnuc-message');
      accountDom.message.setAttribute('aria-live', 'polite');
      account.append(accountDom.message);
      setMessage(accountDom.message, authMessage, authError);
      syncAuthButtons();
      return;
    }
    const heading = el('h3', '', '先和校园打个招呼');
    const explanation = el('p', 'tnuc-small', '使用邮箱验证码登录，无需设置密码。登录后可以提交投稿、查看审核进度。');
    const sendForm = el('form', 'tnuc-auth-form');
    const email = makeField('登录邮箱', 'email', 'input', { type: 'email', required: true, maxLength: 254, autoComplete: 'email', placeholder: 'you@example.com' });
    email.control.value = authEmail;
    email.control.addEventListener('input', () => { authEmail = email.control.value; });
    const send = el('button', 'tnuc-button tnuc-primary', '发送验证码');
    send.type = 'submit';
    sendForm.append(email.wrapper, send);
    sendForm.addEventListener('submit', event => { event.preventDefault(); sendCode(sendForm); });
    const verifyForm = el('form', 'tnuc-auth-form');
    const code = makeField('邮件中的验证码', 'code', 'input', { type: 'text', required: true, minLength: 6, maxLength: 10, inputMode: 'numeric', autoComplete: 'one-time-code', placeholder: '收到邮件后填写' });
    code.control.pattern = '[0-9]{6,10}';
    code.control.value = authCode;
    code.control.addEventListener('input', () => { authCode = code.control.value; });
    const verify = el('button', 'tnuc-button tnuc-secondary', '验证并登录');
    verify.type = 'submit';
    verifyForm.append(code.wrapper, verify);
    verifyForm.addEventListener('submit', event => { event.preventDefault(); verifyCode(verifyForm, email.control); });
    const message = el('p', 'tnuc-message');
    message.setAttribute('aria-live', 'polite');
    accountDom = { email: email.control, code: code.control, send, verify, message };
    account.append(heading, explanation, sendForm, verifyForm, message);
    setMessage(message, authMessage, authError);
    syncAuthButtons();
  }

  function focusProfile() {
    account?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    document.getElementById('tnuc-profile-name')?.focus();
  }
  function profileDate(value) {
    if (!value) return '下个月';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '下个月' : date.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long', day: 'numeric' });
  }
  function renderProfile(current) {
    const section = el('div', 'tnuc-profile');
    const owner = current.user.id, editor = profileEditor(owner), profile = current.profile;
    if (current.profileLoading) {
      section.append(el('p', 'tnuc-small', '正在读取校园账号名…'));
      if (profile?.displayName) section.append(el('strong', 'tnuc-profile-current', profile.displayName));
      account.append(section); return;
    }
    if (current.profileError || !profile) {
      const message = el('p', 'tnuc-message'); setMessage(message, current.profileError || '账号名暂时没有加载出来，请重试。', true);
      const retry = button('重新加载账号名', 'tnuc-button tnuc-secondary', () => reloadProfile(owner, retry));
      section.append(message, retry); account.append(section); return;
    }
    const needsName = profile.needsName || !profile.displayName;
    if (!editor.seeded) {
      editor.input = needsName ? plain(api()?.getAdmissionName?.(), 64) : profile.displayName;
      editor.seeded = true;
    }
    if (needsName && !editor.dirty) editor.input = plain(api()?.getAdmissionName?.(), 64);
    if (!needsName) {
      section.append(el('span', 'tnuc-small', '你的校园账号名'), el('strong', 'tnuc-profile-current', profile.displayName));
      section.append(el('p', 'tnuc-small', profile.canRename ? '每个自然月可改名一次，按北京时间计算。' : '本月已改过名字。下次可改名：' + profileDate(profile.nextRenameAt) + '（北京时间）。'));
      const edit = button(editor.expanded ? '收起修改' : '修改账号名', 'tnuc-button tnuc-secondary', () => {
        editor.expanded = !editor.expanded;
        if (editor.expanded && !editor.error) editor.input = profile.displayName;
        accountSignature = ''; renderAccount();
        if (editor.expanded) focusProfile();
      });
      edit.disabled = !profile.canRename || editor.busy;
      section.append(edit);
    } else {
      section.append(el('h3', '', '先确认你的校园账号名'), el('p', 'tnuc-small', '名字确认后才用于投稿和评论。首次设置不占改名次数，此后每个自然月可改一次。'));
      if (editor.input) section.append(el('p', 'tnuc-small', '已带入本页通知书中的预览名字，请检查后确认。此时还没有占用这个名字。'));
    }
    if (needsName || editor.expanded && profile.canRename) {
      const form = el('form', 'tnuc-profile-form');
      const name = makeField('校园账号名 · 1–16 字，不能与别人重复', 'profile-name', 'input', { required: true, maxLength: 32, autoComplete: 'nickname', placeholder: '奶蛋该怎么称呼你？' });
      name.control.value = editor.input;
      name.control.addEventListener('input', () => { editor.input = name.control.value; editor.dirty = true; editor.error = false; name.control.setCustomValidity(''); });
      const save = el('button', 'tnuc-button tnuc-primary', editor.busy ? '正在保存…' : needsName ? '确认账号名' : '保存新名字'); save.type = 'submit';
      save.disabled = editor.busy || !usable(); name.control.disabled = editor.busy;
      const status = el('p', 'tnuc-message'); status.setAttribute('aria-live', 'polite'); setMessage(status, editor.message, editor.error);
      form.append(name.wrapper, save, status);
      form.addEventListener('submit', event => { event.preventDefault(); saveProfile(owner, form, name.control); });
      section.append(form);
    }
    account.append(section);
  }
  async function reloadProfile(owner, control) {
    if (state().user?.id !== owner || typeof api()?.reloadProfile !== 'function') return;
    if (control) control.disabled = true;
    try { await api().reloadProfile(); if (state().user?.id === owner) { const editor = profileEditor(owner); editor.message = ''; editor.error = false; } }
    catch (error) { if (state().user?.id === owner) announce(errorText(error), true); }
    finally { if (state().user?.id === owner) { accountSignature = ''; renderAccount(); syncSubmitButton(); } }
  }
  async function saveProfile(owner, form, control) {
    const editor = profileEditor(owner);
    if (editor.busy || state().user?.id !== owner || !form.reportValidity()) return;
    const name = normalizeName(control.value);
    if (!name || Array.from(name).length > 16 || /[\p{Cf}\p{Cc}\p{Cs}]/u.test(name)) {
      control.setCustomValidity('名字需为 1–16 字，请移除隐藏字符或异常符号。'); control.reportValidity(); return;
    }
    if (typeof api()?.setProfileName !== 'function') { announce('账号名设置暂时无法使用，请稍后重试。', true); return; }
    const version = authVersion;
    editor.busy = true; editor.input = control.value; editor.message = '正在确认账号名…'; editor.error = false;
    accountSignature = ''; renderAccount();
    try {
      await api().setProfileName(name);
      if (version !== authVersion || state().user?.id !== owner) return;
      editor.input = state().profile?.displayName || name; editor.dirty = false; editor.expanded = false; editor.message = ''; editor.error = false;
      announce('校园账号名已确认。接下来的通知书、投稿与评论都会使用这个名字。');
    } catch (error) {
      editor.message = errorText(error); editor.error = true;
    } finally {
      editor.busy = false;
      if (state().user?.id === owner) { accountSignature = ''; renderAccount(); syncSubmitButton(); }
    }
  }

  function syncAuthButtons() {
    const available = usable();
    const seconds = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
    if (accountDom.send) {
      accountDom.send.disabled = !available || authBusy || seconds > 0;
      accountDom.send.textContent = seconds ? seconds + ' 秒后重发' : authBusy ? '请稍候…' : '发送验证码';
    }
    if (accountDom.verify) accountDom.verify.disabled = !available || authBusy;
    if (accountDom.logout) accountDom.logout.disabled = authBusy;
    if (accountDom.email) accountDom.email.disabled = authBusy;
    if (accountDom.code) accountDom.code.disabled = authBusy;
  }
  function authFeedback(message, isError) {
    authMessage = message;
    authError = !!isError;
    setMessage(accountDom.message, message, isError);
  }
  function startCooldown() {
    cooldownUntil = Date.now() + 60000;
    if (cooldownTimer) clearInterval(cooldownTimer);
    cooldownTimer = setInterval(() => {
      syncAuthButtons();
      if (Date.now() >= cooldownUntil) { clearInterval(cooldownTimer); cooldownTimer = null; }
    }, 1000);
  }
  async function sendCode(form) {
    if (authBusy || cooldownUntil > Date.now() || !form.reportValidity()) return;
    if (!usable()) { authFeedback(reason(), true); return; }
    const email = authEmail.trim();
    if (!email) return;
    const version = authVersion, action = ++authAction;
    authBusy = true;
    syncAuthButtons();
    authFeedback('正在发送验证码…');
    try {
      await api().sendOtp(email);
      if (version !== authVersion || action !== authAction) return;
      startCooldown();
      authFeedback('验证码已发送，请检查收件箱或垃圾邮件，填写后点击“验证并登录”。');
      if (dialog.open && accountDom.code) accountDom.code.focus();
    } catch (error) {
      if (version === authVersion && action === authAction) authFeedback(errorText(error), true);
    } finally {
      if (action === authAction) { authBusy = false; syncAuthButtons(); }
    }
  }
  async function verifyCode(form, emailControl) {
    if (authBusy || !form.reportValidity() || !emailControl.reportValidity()) return;
    if (!usable()) { authFeedback(reason(), true); return; }
    const email = authEmail.trim(), code = authCode.trim(), action = ++authAction, auth = authVersion;
    authBusy = true;
    syncAuthButtons();
    authFeedback('正在验证…');
    try {
      await api().verifyOtp(email, code);
      if (action !== authAction) return;
      authCode = '';
      updateState();
      if (state().user) announce(namedProfile() ? '已登录。检查投稿内容后，点击“提交审核”即可。' : '已登录。请先在上方确认你的校园账号名。');
    } catch (error) {
      if (action === authAction && auth === authVersion) authFeedback(errorText(error), true);
    } finally {
      if (action === authAction) { authBusy = false; syncAuthButtons(); syncSubmitButton(); }
    }
  }
  async function signOut() {
    if (authBusy || !api()) return;
    const action = ++authAction;
    authBusy = true;
    syncAuthButtons();
    try {
      await api().signOut();
      if (action !== authAction) return;
      updateState();
      announce('已退出登录。当前填写的内容仍在，本机草稿不会被删除。');
    } catch (error) {
      if (action === authAction) authFeedback(errorText(error), true);
    } finally {
      if (action === authAction) { authBusy = false; syncAuthButtons(); syncSubmitButton(); }
    }
  }

  function updateTabs() {
    tabs.replaceChildren();
    const current = state();
    if (tab === 'moderation' && !current.isModerator) tab = 'own';
    const options = [['submit', '投稿'], ['own', '我的投稿']];
    if (current.isModerator) options.push(['moderation', '审核']);
    options.forEach(([id, label]) => {
      const item = button(label, 'tnuc-tab', () => {
        if (tab === id) return;
        tab = id;
        announce('');
        updateTabs();
        renderTab();
      });
      item.setAttribute('aria-pressed', String(id === tab));
      item.classList.toggle('is-current', id === tab);
      tabs.append(item);
    });
  }

  function renderTab() {
    viewVersion += 1;
    currentForm = null;
    currentFeedback = null;
    submitButton = null;
    content.replaceChildren();
    if (tab === 'submit') renderSubmission();
    else renderCollection(tab === 'moderation');
  }

  function syncSubmitButton() {
    if (!submitButton) return;
    if (currentForm) Array.from(currentForm.elements).forEach(control => { control.disabled = isSubmitting(); });
    submitButton.disabled = isSubmitting() || !usable() || !namedProfile();
    submitButton.textContent = isSubmitting() ? '正在提交，请稍候…' : !state().user ? '登录后提交审核' : !namedProfile() ? '确认账号名后提交' : '提交审核';
    if (currentForm) {
      currentForm.setAttribute('aria-busy', String(isSubmitting()));
      const name = currentForm.querySelector('.tnuc-fixed-name');
      if (name) name.textContent = namedProfile() ? '公开署名：' + state().profile.displayName : state().profileLoading ? '正在读取校园账号名…' : '先在账号设置中确认名字，投稿会统一使用这个署名。';
    }
  }

  function renderSubmission() {
    const available = categories();
    if (!available.length) { content.append(el('p', 'tnuc-empty', '投稿分类正在准备中。请先使用本机草稿保存你的想法。')); return; }
    if (!available.some(item => item.id === submission.category)) submission.category = available[0].id;
    if (!allowedTypes(submission.category).includes(submission.type)) submission.type = allowedTypes(submission.category)[0];
    const form = el('form', 'tnuc-form');
    currentForm = form;
    const formOwner = submissionOwner, workingSubmission = submission;
    const activeForm = () => form.isConnected && currentForm === form && submissionOwner === formOwner && submission === workingSubmission;
    const controls = {};
    const row = el('div', 'tnuc-row');
    const category = makeField('投稿分区', 'category', 'select', { required: true });
    available.forEach(item => category.control.append(new Option(item.title, item.id)));
    category.control.value = submission.category;
    const type = makeField('内容形式', 'type', 'select', { required: true });
    controls.category = category.control;
    controls.type = type.control;
    row.append(category.wrapper, type.wrapper);
    form.append(row);
    const title = makeField('标题 · 最多 60 字', 'title', 'input', { required: true, maxLength: 60, placeholder: '给这份创意起个名字' });
    const body = makeField('正文或作品说明 · 最多 6,000 字', 'body', 'textarea', { required: true, maxLength: 6000, rows: 7, placeholder: '说说你的创意、项目进展，或这份快乐背后的故事。' });
    const url = makeField('作品或参考链接 · 选填', 'url', 'input', { type: 'url', maxLength: 2000, inputMode: 'url', placeholder: 'https://…' });
    Object.entries({ title, body, url }).forEach(([name, item]) => {
      controls[name] = item.control;
      item.control.value = submission[name];
      item.control.addEventListener('input', () => {
        if (!activeForm()) return;
        submission[name] = item.control.value;
        item.control.setCustomValidity('');
      });
      form.append(item.wrapper);
    });
    const author = el('div', 'tnuc-fixed-author');
    author.append(el('span', 'tnuc-fixed-name'), button('账号设置', 'tnuc-text-button', focusProfile)); form.append(author);
    const media = el('div', 'tnuc-media-input');
    const image = makeField('上传图片 · 必填，JPG、PNG 或 WebP，最大 5 MB', 'image', 'input', { type: 'file', accept: 'image/jpeg,image/png,image/webp' });
    controls.image = image.control;
    const selected = el('p', 'tnuc-small');
    const remove = button('移除图片', 'tnuc-text-button', () => {
      if (!activeForm() || isSubmitting()) return;
      submission.imageFile = null;
      image.control.value = '';
      syncImageLabel();
    });
    function syncImageLabel() {
      selected.textContent = submission.imageFile ? '已选择：' + submission.imageFile.name : '请上传你的图片或漫画。作品链接可以补充出处，不能代替图片文件。';
      remove.hidden = !submission.imageFile;
      remove.disabled = isSubmitting();
    }
    image.control.addEventListener('change', () => {
      if (!activeForm() || isSubmitting()) return;
      const file = image.control.files && image.control.files[0];
      if (!file) return;
      const error = imageError(file);
      if (error) { image.control.value = ''; feedback(error, true); return; }
      submission.imageFile = file;
      syncImageLabel();
      feedback('图片已选择。只有点击“提交审核”时才会上传。');
    });
    media.append(image.wrapper, selected, remove, el('p', 'tnuc-small', '图片随稿件提交审核，通过后才对其他访客可见。视频暂以链接分享，不上传视频文件。'));
    form.append(media);
    const typeHint = el('p', 'tnuc-type-hint');
    form.append(typeHint);
    function syncTypeFields() {
      const currentType = submission.type;
      media.hidden = !['image', 'comic'].includes(currentType);
      controls.url.required = ['video', 'project'].includes(currentType);
      url.label.textContent = currentType === 'video' ? '视频链接 · 必填' : currentType === 'project' ? '已落地项目链接 · 必填' : '作品或参考链接 · 选填';
      typeHint.textContent = currentType === 'video' ? '请填写可公开访问的视频页面链接。社区不会自动嵌入或播放未知来源的视频。' : currentType === 'project' ? '这里收集已经落地的项目，请附上可以访问的作品、源码或演示链接。' : '提交后先进入审核队列，通过后出现在对应学院。你的本机草稿不会被自动删除。';
      syncImageLabel();
    }
    function syncTypes() {
      type.control.replaceChildren();
      const allowed = allowedTypes(submission.category);
      allowed.forEach(item => type.control.append(new Option(TYPES[item], item)));
      if (!allowed.includes(submission.type)) submission.type = allowed[0];
      type.control.value = submission.type;
      syncTypeFields();
    }
    category.control.addEventListener('change', () => {
      if (!activeForm()) return;
      submission.category = category.control.value;
      syncTypes();
    });
    type.control.addEventListener('change', () => {
      if (!activeForm()) return;
      submission.type = type.control.value;
      syncTypeFields();
    });
    syncTypes();
    const actions = el('div', 'tnuc-actions');
    submitButton = el('button', 'tnuc-button tnuc-primary', '提交审核');
    submitButton.type = 'submit';
    const backup = button('导出内容备份', 'tnuc-button tnuc-secondary', exportSubmission);
    actions.append(submitButton, backup);
    form.append(actions);
    currentFeedback = el('p', 'tnuc-message');
    currentFeedback.setAttribute('aria-live', 'polite');
    content.append(form, currentFeedback, el('p', 'tnuc-small', '提交后可在“我的投稿”查看审核状态。此版本暂不支持修改或删除已提交稿件，提交前请仔细核对。导出内容备份不包含图片原文件。'));
    form.addEventListener('submit', event => { event.preventDefault(); submitPost(form, controls); });
    syncSubmitButton();
    if (isSubmitting()) Array.from(form.elements).forEach(control => { control.disabled = true; });
  }

  function imageError(file) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return '图片仅支持 JPG、PNG 或 WebP 格式，请重新选择。';
    if (file.size > MAX_IMAGE) return '图片超过 5 MB，请压缩后重新选择。';
    if (!file.size) return '图片文件为空，请重新选择。';
    return '';
  }
  function exportSubmission() {
    const body = plain(submission.body, 6000);
    const draft = {
      id: 'draft-' + Date.now(), category: submission.category, type: submission.type,
      title: plain(submission.title, 60), author: namedProfile() ? state().profile.displayName : '',
      body, summary: body.replace(/\s+/g, ' ').slice(0, 160), url: safeUrl(submission.url),
      status: 'draft', date: new Date().toISOString(), cover: '', media: '', tags: [], example: false
    };
    const payload = { format: 'tnu-contribution-draft-v1', exportedAt: new Date().toISOString(), post: draft };
    const objectUrl = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' }));
    const download = el('a');
    download.href = objectUrl;
    download.download = '奶蛋投稿草稿-' + (draft.title || '未命名').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').slice(0, 45) + '.json';
    document.body.append(download);
    download.click();
    download.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    feedback('已生成内容备份，不会发送到服务器。图片原文件请另外保存。');
  }
  async function submitPost(form, controls) {
    if (!form.isConnected || form !== currentForm || isSubmitting() || !form.reportValidity()) return;
    if (!usable() || !state().user) { feedback(!usable() ? reason() : '请先使用上方的邮箱验证码登录，再提交审核。', true); return; }
    if (!namedProfile()) { feedback('请先在上方确认校园账号名，或重新加载账号资料。填写内容仍保留。', true); focusProfile(); return; }
    const payload = {
      category: submission.category, type: submission.type,
      title: submission.title.trim(), body: submission.body.trim(),
      url: submission.url.trim(), imageFile: ['image', 'comic'].includes(submission.type) ? submission.imageFile : null
    };
    if (!payload.title || !payload.body) {
      feedback('标题与正文不能只有空格，请补充后再提交。', true);
      (!payload.title ? controls.title : controls.body).focus();
      return;
    }
    if (payload.url && !safeUrl(payload.url)) {
      controls.url.setCustomValidity('请输入以 https:// 或 http:// 开头的完整链接。');
      controls.url.reportValidity();
      return;
    }
    if (payload.imageFile && imageError(payload.imageFile)) { feedback(imageError(payload.imageFile), true); return; }
    if (['image', 'comic'].includes(payload.type) && !payload.imageFile) {
      feedback('图片和漫画投稿需要上传一张图片，作品链接不能代替图片文件。', true);
      controls.image.focus();
      return;
    }
    const identity = getIdentity(), auth = authVersion, owner = submissionOwner;
    pendingSubmissions.add(owner);
    Array.from(form.elements).forEach(control => { control.disabled = true; });
    syncSubmitButton();
    feedback('正在提交审核，请保持页面打开。');
    try {
      await api().submit(payload);
      if (auth !== authVersion || identity !== getIdentity()) return;
      submission = emptySubmission();
      if (dialog.open && tab === 'submit') {
        tab = 'own';
        updateTabs();
        announce('投稿已提交，正在等待审核。审核通过前，不会出现在公开内容中。');
        renderTab();
      }
    } catch (error) {
      if (auth === authVersion && dialog.open) {
        const message = errorText(error) + ' 当前填写内容仍在，可重试或导出备份。';
        if (tab === 'submit') feedback(message, true);
        else announce(message, true);
      }
    } finally {
      pendingSubmissions.delete(owner);
      syncSubmitButton();
    }
  }

  async function renderCollection(moderation) {
    const current = state();
    if (!usable()) { content.append(el('p', 'tnuc-empty', reason())); return; }
    if (!current.user) { content.append(el('p', 'tnuc-empty', '登录后，你可以在这里查看自己的投稿和审核进度。')); return; }
    if (moderation && !current.isModerator) { content.append(el('p', 'tnuc-empty', '这里仅向社区审核员开放。')); return; }
    const version = viewVersion, auth = authVersion, userId = current.user.id;
    const toolbar = el('div', 'tnuc-list-toolbar');
    const label = el('strong', '', moderation ? '校园审核台' : '我的投稿');
    toolbar.append(label);
    if (moderation) {
      const filter = makeField('审核状态', 'review-filter', 'select');
      [['pending', '待审核'], ['approved', '已发布'], ['rejected', '已退回'], ['all', '全部']].forEach(([value, name]) => filter.control.append(new Option(name, value)));
      filter.control.value = moderationFilter;
      filter.control.addEventListener('change', () => { moderationFilter = filter.control.value; renderTab(); });
      toolbar.append(filter.wrapper);
    }
    toolbar.append(button('刷新列表', 'tnuc-button tnuc-secondary', () => renderTab()));
    const loading = el('p', 'tnuc-empty', '正在读取投稿…');
    loading.setAttribute('role', 'status');
    content.append(toolbar, loading);
    function valid() {
      return dialog.open && version === viewVersion && auth === authVersion && state().user && state().user.id === userId && (!moderation || state().isModerator);
    }
    try {
      const result = await (moderation ? api().listModeration(moderationFilter) : api().listOwn());
      if (!valid()) return;
      const items = Array.isArray(result) ? result : [];
      loading.remove();
      const counts = el('p', 'tnuc-counts', '共 ' + items.length + ' 份 · 待审核 ' + items.filter(item => item.status === 'pending').length + ' · 已发布 ' + items.filter(item => item.status === 'approved').length + ' · 已退回 ' + items.filter(item => item.status === 'rejected').length);
      content.append(counts);
      if (!items.length) {
        content.append(el('p', 'tnuc-empty', moderation ? '这个状态下暂时没有稿件。' : '还没有云端投稿。你的本机草稿不会自动上传，检查内容后可以主动提交。'));
        return;
      }
      const list = el('div', 'tnuc-posts');
      items.forEach(item => list.append(postCard(item, moderation, valid)));
      content.append(list);
    } catch (error) {
      if (valid()) setMessage(loading, errorText(error), true);
    }
  }

  function postCard(post, moderation, valid) {
    const card = el('article', 'tnuc-post');
    const header = el('div', 'tnuc-post-heading');
    header.append(el('span', 'tnuc-category', categoryName(post.category) + ' · ' + (TYPES[post.type] || '作品')));
    const badge = el('span', 'tnuc-badge', STATUS[post.status] || '待确认');
    if (['pending', 'approved', 'rejected'].includes(post.status)) badge.classList.add('tnuc-badge-' + post.status);
    header.append(badge);
    card.append(header, el('h3', '', plain(post.title, 60) || '未命名稿件'));
    const date = new Date(post.date);
    const dateLabel = Number.isNaN(date.getTime()) ? '' : date.toLocaleString('zh-CN');
    card.append(el('small', 'tnuc-post-meta', (plain(post.author, 30) || '校园同学') + (dateLabel ? ' · ' + dateLabel : '')));
    const body = el('p', 'tnuc-post-body', plain(post.body, 6000));
    if (moderation) card.append(body);
    else {
      const details = el('details', 'tnuc-post-details');
      details.append(el('summary', '', '查看完整投稿'), body);
      card.append(details);
    }
    const imageUrl = safeUrl(post.media || post.cover);
    if ((post.imagePath || imageUrl) && ['image', 'comic'].includes(post.type)) {
      const image = el('img', 'tnuc-post-image');
      if (post.imagePath) image.dataset.tnuImage = post.imagePath;
      else image.src = imageUrl;
      image.alt = '投稿图片：' + plain(post.title, 60);
      image.loading = 'lazy';
      image.referrerPolicy = 'no-referrer';
      image.addEventListener('error', () => {
        image.hidden = true;
        if (card.isConnected) image.after(el('p', 'tnuc-small', '图片暂时无法加载，刷新列表可重新获取图片。'));
      }, { once: true });
      card.append(image);
    }
    if (safeUrl(post.url)) card.append(link(post.type === 'video' ? '打开视频页面 ↗' : '打开作品链接 ↗', post.url));
    if (post.reviewNote) card.append(el('p', 'tnuc-review-note', '审核说明：' + plain(post.reviewNote, 1000)));
    if (moderation) addReviewActions(card, post, valid);
    return card;
  }

  function addReviewActions(card, post, valid) {
    const review = el('div', 'tnuc-review-actions');
    const note = makeField('审核说明 · 退回或下架时必填，最多 500 字', 'note-' + plain(post.serverId, 60).replace(/[^a-z0-9-]/gi, ''), 'textarea', { rows: 2, maxLength: 500, placeholder: '给作者说明需要调整的地方' });
    note.control.value = reviewNotes.get(post.serverId) || '';
    note.control.addEventListener('input', () => { reviewNotes.set(post.serverId, note.control.value); note.control.setCustomValidity(''); });
    const actions = el('div', 'tnuc-actions');
    const message = el('p', 'tnuc-message');
    message.setAttribute('aria-live', 'polite');
    let busy = false;
    async function run(action) {
      if (busy || !valid()) return;
      const reasonText = note.control.value.trim();
      if (action === 'rejected' && !reasonText) {
        note.control.setCustomValidity('请填写退回或下架原因，帮助作者了解需要修改的地方。');
        note.control.reportValidity();
        return;
      }
      busy = true;
      Array.from(actions.querySelectorAll('button')).forEach(control => { control.disabled = true; });
      note.control.disabled = true;
      setMessage(message, action === 'approved' ? '正在发布稿件…' : '正在退回稿件…');
      try {
        await api().review(post.serverId, action, reasonText);
        if (!valid()) return;
        reviewNotes.delete(post.serverId);
        announce(action === 'approved' ? '稿件已通过审核，已加入公开内容。' : '稿件已退回；如果此前已发布，现在已从公开列表下架。');
        renderTab();
      } catch (error) {
        if (valid()) setMessage(message, errorText(error), true);
      } finally {
        busy = false;
        if (review.isConnected) {
          Array.from(actions.querySelectorAll('button')).forEach(control => { control.disabled = false; });
          note.control.disabled = false;
        }
      }
    }
    if (post.status !== 'approved') actions.append(button('通过并发布', 'tnuc-button tnuc-primary', () => run('approved')));
    if (post.status !== 'rejected') actions.append(button(post.status === 'approved' ? '下架并退回' : '退回修改', 'tnuc-button tnuc-reject', () => run('rejected')));
    review.append(note.wrapper, actions, message);
    card.append(review);
  }

  function open(options) {
    const settings = options && typeof options === 'object' ? options : {};
    switchSubmission(); ensureDialog();
    const draft = settings.draft;
    if (draft && typeof draft === 'object' && !isSubmitting()) {
      submission = {
        category: plain(draft.category, 100), type: TYPES[draft.type] ? draft.type : 'text',
        title: plain(draft.title, 60), body: plain(draft.body, 6000),
        url: plain(draft.url, 2000), imageFile: null
      };
    } else if (typeof settings.category === 'string' && !isSubmitting()) {
      submission.category = settings.category;
      if (!allowedTypes(submission.category).includes(submission.type)) submission.type = allowedTypes(submission.category)[0];
    }
    tab = ['submit', 'own', 'moderation'].includes(settings.tab) ? settings.tab : 'submit';
    if (draft) tab = 'submit';
    if (tab === 'moderation' && !state().isModerator) tab = 'own';
    if (!dialog.open) {
      previousFocus = document.activeElement;
      dialog.showModal();
    }
    announce(draft ? '草稿已带入，尚未上传。可补充图片，登录并检查内容后，再点击“提交审核”。' : '');
    renderAvailability();
    if (settings.focusProfile) accountSignature = '';
    renderAccount();
    updateTabs();
    renderTab();
    const active = tabs.querySelector('.is-current');
    if (active) active.focus();
    if (settings.focusProfile) focusProfile();
    if (!initStarted && api() && typeof api().initialize === 'function' && !offline()) {
      initStarted = true;
      Promise.resolve(api().initialize()).then(() => {
        updateState();
        if (dialog.open && tab !== 'submit') renderTab();
      }).catch(error => { updateState(); if (dialog.open) announce(errorText(error), true); });
    }
  }

  window.TNU_COMMUNITY_UI = Object.freeze({ open });
  window.addEventListener('tnu:community-state', updateState);
  window.addEventListener('tnu:submit', event => open({ tab: 'submit', category: event.detail && event.detail.category, draft: event.detail && event.detail.draft }));
  document.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;
    const control = event.target.closest('#community-open, [data-community]');
    if (!control) return;
    event.preventDefault();
    const action = control.dataset.community;
    open({ tab: action === 'account' ? 'own' : action === 'moderation' ? 'moderation' : 'submit', category: control.dataset.category });
  });
})();
