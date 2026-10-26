/* Public comments belong only to approved community posts. Drafts stay in memory,
 * keyed by account + post; every rendered string is text, never user HTML. */
(() => {
  'use strict';
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const controllers = new Map(), drafts = new Map(), deleting = new Set();
  let sequence = 0, scanQueued = false, authEpoch = 0, identity = userId();

  function api() { return window.TNU_COMMUNITY || null; }
  function state() { try { return api()?.getState() || {}; } catch (_) { return {}; } }
  function userId() { return state().user?.id || ''; }
  function namedProfile() { const current = state(); return current.user && current.profile?.displayName && !current.profile.needsName && !current.profileLoading && !current.profileError; }
  function profileSignature() { const current = state(); return JSON.stringify([current.user?.id || '', current.profile || null, !!current.profileLoading, current.profileError || '']); }
  function connected() {
    return window.location.protocol !== 'file:' && state().configured && state().ready && typeof api()?.listComments === 'function';
  }
  function availableMessage() {
    if (window.location.protocol === 'file:') return '本机预览不连接评论区，请到线上校园阅读和参与讨论。';
    if (!state().configured) return '评论区尚未完成连接，请稍后再来。';
    if (state().loading) return '正在连接校园评论区…';
    return state().error || '评论区暂时无法连接，请稍后重试。';
  }
  function el(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = String(value);
    return node;
  }
  function button(label, className, action) {
    const node = el('button', className, label); node.type = 'button';
    if (action) node.addEventListener('click', action);
    return node;
  }
  function message(node, value, error = false) {
    node.textContent = value || '';
    node.classList.toggle('tnumc-error', !!error);
    node.setAttribute('role', error ? 'alert' : 'status');
  }
  function errorText(error) {
    return typeof error?.message === 'string' ? error.message.slice(0, 600) : '请求暂时没有完成，请稍后重试。';
  }
  function valid(ctx) { return !ctx.disposed && ctx.mount.isConnected && ctx.mount.dataset.commentsPost === ctx.postId; }
  function draftKey(account, postId) { return account + ':' + postId; }
  function draftFor(account, postId) {
    const key = draftKey(account, postId);
    if (!drafts.has(key)) drafts.set(key, { body: '', clientId: '', sending: false, feedback: '', error: false, uncertain: false });
    return drafts.get(key);
  }
  function currentDraft(ctx) { return ctx.scope ? drafts.get(ctx.scope) : null; }
  function freshId() {
    if (typeof window.crypto?.randomUUID !== 'function') throw new Error('浏览器暂时不支持安全提交，请更新浏览器后重试。已填写内容仍保留。');
    return window.crypto.randomUUID();
  }

  function mount(element) {
    const postId = element.dataset.commentsPost;
    if (!UUID.test(postId || '')) return;
    const ctx = { mount: element, postId, disposed: false, number: ++sequence, listVersion: 0, loading: false, loaded: false, items: [], before: null, hasMore: false, retryAppend: false, parentUnavailable: false, scope: '', formNodes: null, wasReady: connected() };
    controllers.set(element, ctx);
    element.classList.add('tnumc-comments');
    element.setAttribute('aria-labelledby', 'tnumc-heading-' + ctx.number);
    const head = el('div', 'tnumc-heading');
    const titles = el('div');
    titles.append(el('p', 'tnumc-kicker', 'CAMPUS ECHOES · 校园回响'));
    const title = el('h2', '', '让想法，碰个面。'); title.id = 'tnumc-heading-' + ctx.number;
    titles.append(title, el('p', 'tnumc-intro', '看见有意思的作品，就留下一点你的回响。'));
    const star = el('span', 'tnumc-star', '✳'); star.setAttribute('aria-hidden', 'true');
    head.append(titles, star);
    ctx.compose = el('div', 'tnumc-compose');
    const listHead = el('div', 'tnumc-list-heading');
    ctx.count = el('p', '', '评论 · 最新在前');
    ctx.refresh = button('刷新评论', 'tnumc-text-button', () => load(ctx, false, true));
    listHead.append(ctx.count, ctx.refresh);
    ctx.list = el('div', 'tnumc-list');
    ctx.status = el('p', 'tnumc-message'); ctx.status.setAttribute('aria-live', 'polite');
    ctx.retry = button('重新加载', 'tnumc-button tnumc-secondary', () => load(ctx, ctx.retryAppend, true)); ctx.retry.hidden = true;
    ctx.more = button('加载更多评论', 'tnumc-button tnumc-secondary tnumc-more', () => load(ctx, true)); ctx.more.hidden = true;
    const footnote = el('p', 'tnumc-footnote', '评论发布后即时公开，请文明交流，不要留下私人联系方式。每次发布需间隔 30 秒，24 小时最多 30 条。');
    element.replaceChildren(head, ctx.compose, listHead, ctx.list, ctx.status, ctx.retry, ctx.more, footnote);
    renderCompose(ctx); renderList(ctx);
    if (connected()) load(ctx);
    else message(ctx.status, availableMessage());
  }

  function renderCompose(ctx) {
    if (!valid(ctx)) return;
    const account = userId();
    ctx.profileSignature = profileSignature();
    ctx.compose.replaceChildren(); ctx.scope = ''; ctx.formNodes = null;
    if (!account) {
      const invite = el('div', 'tnumc-login');
      invite.append(el('p', '', '登录后，分享你的想法。你的邮箱不会作为公开署名。'));
      const login = button('登录后参与', 'tnumc-button tnumc-primary'); login.dataset.community = 'account';
      invite.append(login); ctx.compose.append(invite); return;
    }
    ctx.scope = draftKey(account, ctx.postId);
    const draft = draftFor(account, ctx.postId);
    const form = el('form', 'tnumc-form');
    const accountName = el('div', 'tnumc-account-name');
    const fixedName = el('p', '', namedProfile() ? '以「' + state().profile.displayName + '」的名字参与讨论' : state().profileLoading ? '正在读取校园账号名…' : '先确认校园账号名，再留下你的回响。');
    const settings = button('账号设置', 'tnumc-text-button'); settings.dataset.community = 'account';
    accountName.append(fixedName, settings);
    if (state().profileError) {
      const warning = el('p', 'tnumc-message'); message(warning, state().profileError, true); accountName.append(warning);
      const retry = button('重新加载账号名', 'tnumc-button tnumc-secondary', async () => {
        if (userId() !== account || typeof api()?.reloadProfile !== 'function') return;
        retry.disabled = true;
        try { await api().reloadProfile(); }
        catch (error) { if (valid(ctx) && userId() === account) message(warning, errorText(error), true); }
        finally { if (valid(ctx) && userId() === account) retry.disabled = false; }
      });
      accountName.append(retry);
    }
    const bodyWrap = el('div', 'tnumc-field');
    const bodyLabel = el('label', '', '写下你的回响 · 最多 1,000 字');
    const body = el('textarea'); body.required = true; body.maxLength = 1000; body.rows = 4; body.placeholder = '分享一个想法、一点鼓励，或一个新的脑洞。'; body.id = 'tnumc-body-' + ctx.number; bodyLabel.htmlFor = body.id; body.value = draft.body;
    bodyWrap.append(bodyLabel, body);
    const actions = el('div', 'tnumc-form-actions');
    const submit = el('button', 'tnumc-button tnumc-primary', '发布评论'); submit.type = 'submit';
    const counter = el('span', 'tnumc-counter', draft.body.length + ' / 1,000');
    actions.append(submit, counter);
    const feedback = el('p', 'tnumc-message'); feedback.setAttribute('aria-live', 'polite');
    form.append(accountName, bodyWrap, actions, feedback);
    const originalScope = ctx.scope;
    function change(name, control) {
      if (ctx.scope !== originalScope || originalScope !== draftKey(userId(), ctx.postId) || draft.sending || ctx.formNodes?.[name] !== control) return;
      if (draft[name] !== control.value) { draft[name] = control.value; draft.clientId = ''; draft.uncertain = false; }
      control.setCustomValidity(''); counter.textContent = draft.body.length + ' / 1,000';
    }
    body.addEventListener('input', () => change('body', body));
    form.addEventListener('submit', event => { event.preventDefault(); submitComment(ctx, originalScope); });
    ctx.formNodes = { form, body, submit, feedback, counter };
    ctx.compose.append(form);
    syncDraft(ctx);
  }

  function syncDraft(ctx) {
    if (!valid(ctx) || !ctx.formNodes || ctx.scope !== draftKey(userId(), ctx.postId)) return;
    const draft = currentDraft(ctx), nodes = ctx.formNodes;
    if (!draft) return;
    if (nodes.body.value !== draft.body) nodes.body.value = draft.body;
    nodes.body.disabled = draft.sending;
    nodes.submit.disabled = draft.sending || !connected() || ctx.parentUnavailable || !namedProfile();
    nodes.submit.textContent = draft.sending ? '正在发布…' : !namedProfile() ? '确认账号名后参与' : draft.uncertain ? '重试发布' : '发布评论';
    nodes.form.setAttribute('aria-busy', String(draft.sending));
    nodes.counter.textContent = draft.body.length + ' / 1,000';
    message(nodes.feedback, draft.feedback, draft.error);
  }
  function broadcastDraft(scope) { for (const ctx of controllers.values()) if (ctx.scope === scope) syncDraft(ctx); }

  async function submitComment(ctx, scope) {
    if (!valid(ctx) || scope !== ctx.scope || scope !== draftKey(userId(), ctx.postId)) return;
    const draft = currentDraft(ctx), nodes = ctx.formNodes;
    if (!draft || draft.sending || !nodes || !nodes.form.reportValidity()) return;
    const body = draft.body.trim();
    if (!body || body.length > 1000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(body)) {
      draft.feedback = '请填写 1–1,000 字的正文，并移除异常控制字符。'; draft.error = true;
      syncDraft(ctx); nodes.body.focus(); return;
    }
    if (!namedProfile()) { draft.feedback = '请先在账号设置中确认校园账号名，或重新加载账号资料。评论草稿仍保留。'; draft.error = true; syncDraft(ctx); return; }
    if (!connected() || ctx.parentUnavailable || typeof api()?.addComment !== 'function') {
      draft.feedback = ctx.parentUnavailable ? '作品当前不可参与讨论，可能已下架。填写内容仍保留。' : availableMessage(); draft.error = true; syncDraft(ctx); return;
    }
    try { if (!draft.clientId) draft.clientId = freshId(); }
    catch (error) { draft.feedback = errorText(error); draft.error = true; syncDraft(ctx); return; }
    const clientId = draft.clientId, account = userId(), startedAuth = authEpoch;
    draft.sending = true; draft.feedback = '正在发布，请稍候…'; draft.error = false;
    broadcastDraft(scope);
    try {
      await api().addComment(ctx.postId, { body, clientId });
      if (startedAuth !== authEpoch || account !== userId()) {
        draft.feedback = '账号已改变。请回到原账号刷新评论，确认上一次提交结果后再重试。'; draft.error = true; draft.uncertain = true; return;
      }
      if (draft.clientId === clientId) {
        draft.body = ''; draft.clientId = ''; draft.uncertain = false;
        draft.feedback = '评论已发布，谢谢你的回响。'; draft.error = false;
      }
      for (const active of controllers.values()) if (valid(active) && active.postId === ctx.postId) load(active, false, true);
    } catch (error) {
      draft.error = true; draft.uncertain = !!error?.uncertain || error?.code === 'NETWORK' || error?.code === 'STALE';
      draft.feedback = errorText(error) + (draft.uncertain ? ' 内容已保留。请先刷新评论确认结果；相同内容重试不会重复发布。' : ' 填写内容仍保留，可调整后再试。');
    } finally {
      draft.sending = false; broadcastDraft(scope);
    }
  }

  function renderList(ctx) {
    if (!valid(ctx)) return;
    ctx.list.replaceChildren();
    ctx.count.textContent = ctx.items.length ? '已展示 ' + ctx.items.length + ' 条评论 · 最新在前' : '评论 · 最新在前';
    if (ctx.loaded && !ctx.items.length) ctx.list.append(el('p', 'tnumc-empty', '第一声回响还在路上。留下一点想法，和作品打个招呼吧。'));
    const current = state();
    for (const item of ctx.items) {
      const card = el('article', 'tnumc-comment'); card.dataset.commentId = item.id;
      const header = el('div', 'tnumc-comment-header');
      const byline = el('div', 'tnumc-byline');
      const avatar = el('span', 'tnumc-avatar', '⚡'); avatar.setAttribute('aria-hidden', 'true');
      const nameDate = el('div'); nameDate.append(el('strong', '', item.author || '校园同学'));
      const date = new Date(item.createdAt), time = el('time', '', Number.isNaN(date.getTime()) ? '发布时间未知' : date.toLocaleString('zh-CN'));
      if (!Number.isNaN(date.getTime())) time.dateTime = date.toISOString();
      nameDate.append(time); byline.append(avatar, nameDate); header.append(byline);
      if (current.user && (current.user.id === item.userId || current.isModerator)) {
        const remove = button(deleting.has(item.id) ? '正在删除…' : '删除', 'tnumc-delete', () => deleteComment(ctx, item));
        remove.disabled = deleting.has(item.id); remove.setAttribute('aria-label', '删除 ' + (item.author || '校园同学') + ' 的评论'); header.append(remove);
      }
      card.append(header, el('p', 'tnumc-comment-body', item.body)); ctx.list.append(card);
    }
    ctx.more.hidden = !ctx.hasMore; ctx.more.disabled = ctx.loading;
    ctx.more.textContent = ctx.loading ? '正在加载…' : '加载更多评论';
    ctx.refresh.disabled = ctx.loading || !connected();
  }

  async function load(ctx, append = false, force = false) {
    if (!valid(ctx) || (ctx.loading && !force)) return;
    if (!connected()) { message(ctx.status, availableMessage()); ctx.retry.hidden = false; return; }
    if (append && !ctx.hasMore && ctx.loaded) return;
    ctx.retryAppend = append;
    const version = ++ctx.listVersion, before = append ? ctx.before : null;
    ctx.loading = true; ctx.retry.hidden = true;
    message(ctx.status, append ? '正在加载更多回响…' : '正在读取评论…'); renderList(ctx);
    try {
      const response = await api().listComments(ctx.postId, { before, limit: 20 });
      if (!valid(ctx) || version !== ctx.listVersion) return;
      if (!response || !Array.isArray(response.items)) throw new Error('评论列表响应不完整，请重新加载。');
      const items = response.items.filter(item => item && typeof item.id === 'string' && typeof item.body === 'string');
      const merged = append ? [...ctx.items, ...items] : items;
      ctx.items = [...new Map(merged.map(item => [item.id, item])).values()];
      ctx.before = response.before || null; ctx.hasMore = !!response.hasMore && !!ctx.before;
      ctx.parentUnavailable = false; syncDraft(ctx);
      ctx.loaded = true; message(ctx.status, !ctx.hasMore && ctx.items.length ? '已经读到最后一声回响。' : '');
    } catch (error) {
      if (!valid(ctx) || version !== ctx.listVersion) return;
      if (error?.code === '42501') { ctx.parentUnavailable = true; ctx.items = []; ctx.hasMore = false; ctx.loaded = false; syncDraft(ctx); }
      message(ctx.status, errorText(error) + (error?.code === '42501' ? ' 作品可能已下架，当前无法继续读取或参与讨论。' : ''), true);
      ctx.retry.hidden = false;
    } finally {
      if (valid(ctx) && version === ctx.listVersion) { ctx.loading = false; renderList(ctx); }
    }
  }

  async function deleteComment(ctx, item) {
    const current = state();
    if (!valid(ctx) || deleting.has(item.id) || !current.user || (current.user.id !== item.userId && !current.isModerator)) return;
    if (!window.confirm('确定删除这条评论吗？删除后将不再公开显示。')) return;
    const startedAuth = authEpoch;
    deleting.add(item.id); renderList(ctx);
    try {
      await api().deleteComment(item.id);
      if (startedAuth !== authEpoch) return;
      for (const active of controllers.values()) if (valid(active) && active.postId === ctx.postId) {
        // Invalidate an older page load so it cannot restore a just-deleted row.
        active.listVersion += 1; active.loading = false;
        active.items = active.items.filter(comment => comment.id !== item.id);
        renderList(active); message(active.status, '评论已删除。');
      }
    } catch (error) {
      if (startedAuth === authEpoch && valid(ctx)) message(ctx.status, errorText(error) + (error?.uncertain ? ' 请刷新评论确认删除结果。' : ''), true);
    } finally {
      deleting.delete(item.id);
      for (const active of controllers.values()) if (valid(active) && active.postId === ctx.postId) renderList(active);
    }
  }

  function scan() {
    scanQueued = false;
    for (const [node, ctx] of controllers) if (!node.isConnected || node.dataset.commentsPost !== ctx.postId) {
      ctx.disposed = true; ctx.listVersion += 1; controllers.delete(node);
    }
    document.querySelectorAll('[data-comments-post]').forEach(node => { if (!controllers.has(node)) mount(node); });
  }
  function queueScan() { if (!scanQueued) { scanQueued = true; Promise.resolve().then(scan); } }
  window.addEventListener('tnu:community-state', () => {
    const next = userId();
    if (next !== identity) { authEpoch += 1; identity = next; }
    for (const ctx of controllers.values()) if (valid(ctx)) {
      if (ctx.scope !== (next ? draftKey(next, ctx.postId) : '') || ctx.profileSignature !== profileSignature() || !ctx.formNodes && next) renderCompose(ctx);
      else syncDraft(ctx);
      renderList(ctx);
      const isReady = connected();
      if (isReady && !ctx.wasReady) load(ctx, false, true);
      else if (!isReady) message(ctx.status, availableMessage());
      ctx.wasReady = isReady;
    }
    queueScan();
  });
  window.addEventListener('hashchange', queueScan);
  window.addEventListener('tnu:route', queueScan);
  window.addEventListener('tnu:content-updated', queueScan);
  if (typeof MutationObserver !== 'undefined') new MutationObserver(queueScan).observe(document.body, { childList: true, subtree: true });
  scan();
})();
