/* Netlify static frontend → Supabase Auth / REST / private Storage.
 * Public key is sent ONLY in apikey. Authorization contains a real user JWT only.
 * Permissions, moderation and limits are enforced again in the database.
 */
(() => {
  'use strict';
  const config = window.TNU_COMMUNITY_CONFIG || {};
  const configured = /^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(config.url || '') && /^sb_publishable_[\w-]+$/.test(config.publishableKey || '');
  const base = String(config.url || '').replace(/\/$/, '');
  const offline = window.location.protocol === 'file:';
  const SESSION_KEY = 'tnu:community-session:' + base;
  const PROFILE_EVENT_KEY = 'tnu:profile-refresh:' + base;
  const BUCKET = 'tnu-submissions';
  const MAX_IMAGE = 5 * 1024 * 1024;
  const CATEGORY_TYPES = { creative: ['text', 'image'], engineering: ['project'], future: ['idea'], videos: ['video'], comics: ['comic'], jokes: ['text'] };
  const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  const IMAGE_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(?:jpg|jpeg|png|webp)$/i;
  const SELECT = 'id,user_id,category,type,title,body,author_name,url,image_path,status,review_note,created_at,reviewed_at';
  const COMMENT_SELECT = 'id,post_id,user_id,author_name,body,created_at';
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const COMMENT_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
  const localPosts = Array.isArray(window.TNU_CONTENT?.posts) ? window.TNU_CONTENT.posts.slice() : [];
  const state = { configured, ready: false, loading: false, error: '', user: null, isModerator: false, profile: null, profileLoading: false, profileError: '' };
  let session = null, epoch = 0, refreshTask = null, initialization = null, refreshTimer = 0, publicGeneration = 0, contentFingerprint = '';
  let profileGeneration = 0, profileTask = null, profileMutation = null, admissionName = '', admissionOwner = null;
  const blobs = new Map(), imageRequests = new Map(), observed = new WeakSet(), otpSent = new Map();
  let imageObserver = null, mutationObserver = null;

  function emit() { window.dispatchEvent(new CustomEvent('tnu:community-state', { detail: getState() })); }
  function getState() { return { ...state, user: state.user ? { ...state.user } : null, profile: state.profile ? { ...state.profile } : null }; }
  function failure(message, code = '') { const error = new Error(message); error.code = code; return error; }
  function requireOnline() {
    if (!configured) throw failure('社区尚未配置连接，本机草稿仍可使用。', 'CONFIG');
    if (offline) throw failure('本地文件只作预览。请在已部署的 HTTPS 网站上登录或投稿。', 'LOCAL_FILE');
  }
  function requireReady() { requireOnline(); if (!state.ready) throw failure(state.error || '社区正在连接，请稍后重试。', 'NOT_READY'); }
  function friendly(error, status) {
    const raw = String(error?.msg || error?.message || error?.error_description || error?.error || '');
    const code = String(error?.code || error?.error_code || '');
    if (['PGRST202','PGRST205','42P01','42883'].includes(code)) return failure('社区数据库还未初始化，请先完成数据库接入。', 'SETUP');
    if (/email.*not.*authorized|not.*allowed.*email|email_address_not_authorized/i.test(raw + code)) return failure('邮箱发送服务尚未开放给访客，请先配置 Supabase 的邮件发送服务。', code);
    if (/otp_expired|token.*expired|invalid.*token|invalid.*otp|otp.*invalid/i.test(raw + code)) return failure('验证码无效或已过期，请重新获取。', code);
    if (status === 429 || /rate_limit/i.test(code)) return failure('操作太频繁，请稍后再试。', code || 'RATE_LIMIT');
    if (status === 401) return failure('登录已过期，请重新登录。', 'AUTH');
    if (status === 403 || code === '42501') return failure(/[\u3400-\u9fff]/.test(raw) ? raw : '当前账号没有执行这项操作的权限。', code || 'FORBIDDEN');
    return failure(/[\u3400-\u9fff]/.test(raw) ? raw.slice(0, 350) : '请求未完成，请稍后重试。' + (code ? '（' + code + '）' : ''), code || String(status));
  }
  async function rawRequest(path, options = {}) {
    requireOnline();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const headers = { apikey: config.publishableKey, ...options.headers };
    if (options.token) headers.Authorization = 'Bearer ' + options.token;
    const init = { method: options.method || 'GET', headers, signal: controller.signal, cache: 'no-store', credentials: 'omit' };
    if (options.body !== undefined) { headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(options.body); }
    if (options.file) { headers['Content-Type'] = options.file.type; headers['x-upsert'] = 'false'; init.body = options.file; }
    try {
      const response = await fetch(base + path, init);
      if (response.ok && options.blob) return await response.blob();
      const value = await response.text();
      let payload = null;
      try { payload = value ? JSON.parse(value) : null; }
      catch { throw failure('服务器响应不完整，请刷新“我的投稿”确认提交结果。', 'NETWORK'); }
      if (!response.ok) {
        const error = friendly(payload, response.status);
        error.httpStatus = response.status;
        throw error;
      }
      return payload;
    } catch (error) {
      if (error?.code) throw error;
      throw failure(error?.name === 'AbortError' ? '连接超时，请检查网络后重试。' : '暂时无法连接社区，请检查网络后重试。', 'NETWORK');
    } finally { clearTimeout(timeout); }
  }
  function persist() {
    try { if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session)); else localStorage.removeItem(SESSION_KEY); } catch { /* In-memory session still works. */ }
  }
  function readSession() {
    try {
      const value = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      return value && typeof value.access_token === 'string' && typeof value.refresh_token === 'string' && Number.isFinite(value.expires_at) ? value : null;
    } catch { return null; }
  }
  function clearImages() {
    for (const entry of blobs.values()) URL.revokeObjectURL(entry.url);
    blobs.clear(); imageRequests.clear();
    if (typeof document.querySelectorAll === 'function') document.querySelectorAll('img[data-tnu-image]').forEach(img => { img.removeAttribute('src'); img.removeAttribute('data-image-error'); });
  }
  function installSession(value, save = true) {
    const previousUser = state.user?.id || null, nextUser = value?.user?.id || null;
    if (previousUser !== nextUser) {
      if (!previousUser && nextUser && admissionOwner === null) admissionOwner = nextUser;
      else { admissionName = ''; admissionOwner = nextUser; }
    }
    epoch += 1; clearTimeout(refreshTimer); clearImages();
    profileGeneration += 1; profileTask = null; profileMutation = null;
    state.profile = null; state.profileLoading = false; state.profileError = '';
    session = value;
    state.user = value?.user?.id ? { id: value.user.id, email: value.user.email || '' } : null;
    state.isModerator = false;
    if (save) persist();
    if (session) scheduleRefresh();
  }
  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    if (!session) return;
    const delay = Math.min(2147483647, Math.max(15000, (session.expires_at * 1000) - Date.now() - 60000));
    refreshTimer = setTimeout(() => { refreshSession().catch(() => { /* Explicit actions display errors. */ }); }, delay);
  }
  function sessionValue(payload) {
    if (!payload || typeof payload.access_token !== 'string' || typeof payload.refresh_token !== 'string' || !payload.user?.id) throw failure('登录响应不完整，请重新登录。', 'AUTH');
    return { access_token: payload.access_token, refresh_token: payload.refresh_token, expires_at: Number(payload.expires_at) || Math.floor(Date.now()/1000) + Number(payload.expires_in || 3600), user: { id: payload.user.id, email: payload.user.email || '' } };
  }
  async function refreshSession() {
    if (refreshTask) return refreshTask;
    if (!session) throw failure('请先登录再继续。', 'AUTH');
    const currentEpoch = epoch;
    const refreshToken = session.refresh_token;
    refreshTask = (async () => {
      try {
        const value = await rawRequest('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: refreshToken } });
        if (currentEpoch !== epoch) throw failure('账号状态已改变，请重新操作。', 'STALE');
        session = sessionValue(value); state.user = { ...session.user }; persist(); scheduleRefresh(); emit();
        return session.access_token;
      } catch (error) {
        if (currentEpoch === epoch && error.code !== 'NETWORK') { installSession(null); state.error = '登录已过期，请重新登录。'; emit(); }
        else if (currentEpoch === epoch) { refreshTimer = setTimeout(() => refreshSession().catch(() => {}), 30000); }
        throw error;
      } finally { refreshTask = null; }
    })();
    return refreshTask;
  }
  async function accessToken(required) {
    if (!session) { if (required) throw failure('请先登录，再提交或查看投稿。', 'AUTH'); return ''; }
    if ((session.expires_at * 1000) <= Date.now() + 30000) return refreshSession();
    return session.access_token;
  }
  async function request(path, options = {}) {
    const started = epoch;
    const required = options.auth === 'required';
    const useAuth = required || options.auth === 'optional';
    const token = useAuth ? await accessToken(required) : '';
    if (useAuth && started !== epoch) throw failure('账号状态已改变，请重新操作。', 'STALE');
    try {
      const value = await rawRequest(path, { ...options, token });
      if (useAuth && started !== epoch) throw failure('账号状态已改变，请重新操作。', 'STALE');
      return value;
    } catch (error) {
      if (useAuth && started !== epoch) throw failure('账号状态已改变，请重新操作。', 'STALE');
      if (useAuth && error.code === 'AUTH' && session && !options.retried) {
        await refreshSession();
        return request(path, { ...options, retried: true });
      }
      throw error;
    }
  }
  function rpc(name, body, auth = 'required') { return request('/rest/v1/rpc/' + name, { method: 'POST', body: body || {}, auth }); }
  async function updateModerator() {
    if (!state.user) { state.isModerator = false; return; }
    const version = epoch;
    try { const value = await rpc('tnu_is_moderator'); if (epoch === version) state.isModerator = value === true; } catch { if (epoch === version) state.isModerator = false; }
  }
  function cleanAccountName(value) {
    if (typeof value !== 'string') throw failure('请填写账号名。', 'VALIDATION');
    const name = value.normalize('NFKC').replace(/\s+/gu, ' ').trim();
    if (!name || Array.from(name).length > 16 || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(name)) throw failure('账号名需为 1–16 个字，不能包含隐藏或控制字符。', 'VALIDATION');
    return name;
  }
  function setAdmissionName(value) {
    admissionName = cleanAccountName(value); admissionOwner = state.user?.id || null;
    return admissionName;
  }
  function getAdmissionName() { return admissionOwner === (state.user?.id || null) ? admissionName : ''; }
  function normalizeProfile(value) {
    if (!value || Array.isArray(value) || typeof value !== 'object' || typeof value.needs_name !== 'boolean' || typeof value.can_rename !== 'boolean') throw failure('账号资料响应不完整，请重新加载。', 'NETWORK');
    const name = value.display_name;
    if (value.needs_name ? name !== null && name !== '' : typeof name !== 'string' || !name || Array.from(name).length > 16) throw failure('账号资料响应不完整，请重新加载。', 'NETWORK');
    if (value.next_rename_at != null && (typeof value.next_rename_at !== 'string' || !Number.isFinite(Date.parse(value.next_rename_at)))) throw failure('改名时间响应不完整，请重新加载。', 'NETWORK');
    return { displayName: name || '', needsName: value.needs_name, canRename: value.can_rename, nextRenameAt: value.next_rename_at || null };
  }
  async function reloadProfile() {
    requireReady();
    if (!state.user) throw failure('请先登录查看账号资料。', 'AUTH');
    if (profileMutation) throw failure('账号名正在保存，请稍候。', 'BUSY');
    if (profileTask?.epoch === epoch) return profileTask.promise;
    const version = epoch, generation = ++profileGeneration;
    state.profileLoading = true; state.profileError = ''; emit();
    const task = (async () => {
      try {
        const value = normalizeProfile(await rpc('tnu_get_profile'));
        if (version !== epoch || generation !== profileGeneration) throw failure('账号状态已改变，请重新操作。', 'STALE');
        state.profile = value; return { ...value };
      } catch (error) {
        if (version === epoch && generation === profileGeneration) { state.profile = null; state.profileError = error.message; }
        throw error;
      } finally {
        if (version === epoch && generation === profileGeneration) { state.profileLoading = false; emit(); }
        if (profileTask?.promise === task) profileTask = null;
      }
    })();
    profileTask = { epoch: version, promise: task }; return task;
  }
  async function setProfileName(value) {
    requireReady();
    if (!state.user) throw failure('请先登录设置账号名。', 'AUTH');
    if (profileMutation) throw failure('账号名正在保存，请稍候。', 'BUSY');
    const name = cleanAccountName(value), version = epoch, generation = ++profileGeneration;
    const mutation = {}; profileMutation = mutation; profileTask = null;
    state.profileLoading = true; state.profileError = ''; emit();
    try {
      const profile = normalizeProfile(await rpc('tnu_set_profile_name', { p_name: name }));
      if (profile.needsName) throw failure('账号名保存响应不完整，请重新加载账号资料。', 'NETWORK');
      if (version !== epoch || generation !== profileGeneration) throw failure('账号状态已改变，请重新操作。', 'STALE');
      state.profile = profile; admissionName = ''; admissionOwner = state.user.id;
      try { localStorage.setItem(PROFILE_EVENT_KEY, String(Date.now()) + ':' + Math.random()); } catch { /* Other tabs refresh on their next action. */ }
      return { ...profile };
    } catch (error) {
      if (version === epoch && generation === profileGeneration && (error.code === 'NETWORK' || error.httpStatus >= 500)) {
        error.uncertain = true; error.message = '暂时无法确认账号名是否已保存。请先重新加载账号资料，再确认是否需要重试。';
        state.profile = null; state.profileError = error.message;
      }
      throw error;
    } finally {
      if (profileMutation === mutation) profileMutation = null;
      if (version === epoch && generation === profileGeneration) { state.profileLoading = false; emit(); }
    }
  }
  function accountName() {
    if (!state.user) throw failure('请先登录后再发布。', 'AUTH');
    if (state.profileLoading) throw failure('正在确认账号名，请稍后再发布。', 'PROFILE_REQUIRED');
    if (!state.profile || state.profile.needsName || !state.profile.displayName) throw failure(state.profileError || '请先在账号设置中确认你的录取名字，再发布投稿或评论。', 'PROFILE_REQUIRED');
    return state.profile.displayName;
  }
  function mediaPath(path) { return base + '/storage/v1/object/authenticated/' + BUCKET + '/' + path.split('/').map(encodeURIComponent).join('/'); }
  function normalize(row) {
    const imagePath = IMAGE_PATH.test(row.image_path || '') ? row.image_path : '';
    return { id: 'cloud-' + row.id, serverId: row.id, category: row.category, type: row.type, title: row.title || '', summary: String(row.body || '').replace(/\s+/g, ' ').slice(0, 150), body: row.body || '', author: row.author_name || '校园同学', date: String(row.created_at || '').slice(0, 10), status: row.status, reviewNote: row.review_note || '', url: row.url || '', imagePath, media: imagePath ? mediaPath(imagePath) : '', cover: imagePath ? mediaPath(imagePath) : '', tags: ['社区投稿'], example: false, community: true };
  }
  async function refreshPublic() {
    requireReady();
    const generation = ++publicGeneration;
    const rows = await request('/rest/v1/tnu_posts?select=' + SELECT + '&status=eq.approved&order=created_at.desc&limit=100');
    if (generation !== publicGeneration) return;
    const normalized = (Array.isArray(rows) ? rows : []).map(normalize);
    const fingerprint = JSON.stringify(rows);
    if (fingerprint !== contentFingerprint) {
      contentFingerprint = fingerprint;
      window.TNU_CONTENT.posts = [...normalized, ...localPosts];
      window.dispatchEvent(new CustomEvent('tnu:content-updated'));
    }
    return normalized;
  }
  async function initialize() {
    if (initialization) return initialization;
    initialization = (async () => {
      state.loading = true; state.error = ''; emit();
      try {
        requireOnline();
        const health = await rpc('tnu_community_status', {}, 'none');
        if (!health || String(health.version) !== '1') throw failure('社区数据库版本不匹配，请联系维护者。', 'SETUP');
        state.ready = true;
        session = readSession();
        if (session) {
          const restoreEpoch = epoch;
          try {
            const token = await accessToken(true);
            if (restoreEpoch !== epoch) throw failure('账号状态已改变。', 'STALE');
            const user = await rawRequest('/auth/v1/user', { token });
            if (restoreEpoch === epoch) {
              installSession({ ...session, user: { id: user.id, email: user.email || '' } });
              await updateModerator();
              await reloadProfile().catch(() => {});
            }
          } catch { if (restoreEpoch === epoch) installSession(null); }
        }
        await refreshPublic();
      } catch (error) { state.ready = false; state.error = error.message; }
      finally { state.loading = false; emit(); initialization = null; }
      return getState();
    })();
    return initialization;
  }
  function validEmail(value) { return typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
  async function sendOtp(value) {
    requireReady();
    const email = String(value || '').trim().toLowerCase();
    if (!validEmail(email)) throw failure('请填写有效的邮箱地址。', 'VALIDATION');
    if (Date.now() - (otpSent.get(email) || 0) < 60000) throw failure('请等待一分钟后再获取验证码。', 'RATE_LIMIT');
    await rawRequest('/auth/v1/otp', { method: 'POST', body: { email, create_user: true } });
    otpSent.set(email, Date.now());
  }
  async function verifyOtp(value, valueCode) {
    requireReady();
    const email = String(value || '').trim().toLowerCase();
    const token = String(valueCode || '').trim();
    if (!validEmail(email) || !/^\d{6,10}$/.test(token)) throw failure('请填写邮箱和邮件中的验证码。', 'VALIDATION');
    const version = epoch;
    const payload = await rawRequest('/auth/v1/verify', { method: 'POST', body: { email, token, type: 'email' } });
    if (version !== epoch) throw failure('账号状态已改变，请重试登录。', 'STALE');
    installSession(sessionValue(payload)); state.error = '';
    await updateModerator(); await reloadProfile().catch(() => {}); emit(); hydrateImages(document);
    return getState();
  }
  async function signOut() {
    const token = session?.access_token;
    installSession(null); state.error = ''; emit(); hydrateImages(document);
    if (token) await rawRequest('/auth/v1/logout?scope=local', { method: 'POST', token }).catch(() => {});
  }
  async function listOwn() {
    requireReady();
    if (!state.user) throw failure('请先登录查看自己的投稿。', 'AUTH');
    const version = epoch;
    const rows = await request('/rest/v1/tnu_posts?select=' + SELECT + '&user_id=eq.' + encodeURIComponent(state.user.id) + '&order=created_at.desc&limit=100', { auth: 'required' });
    if (version !== epoch) throw failure('账号状态已改变。', 'STALE');
    return (rows || []).map(normalize);
  }
  async function listModeration(status = 'pending') {
    requireReady();
    await updateModerator();
    if (!state.isModerator) throw failure('当前账号不是社区审核员。', 'FORBIDDEN');
    if (!['all','pending','approved','rejected'].includes(status)) throw failure('未知的投稿状态。', 'VALIDATION');
    const query = status === 'all' ? '' : '&status=eq.' + status;
    const rows = await request('/rest/v1/tnu_posts?select=' + SELECT + query + '&order=created_at.desc&limit=100', { auth: 'required' });
    return (rows || []).map(normalize);
  }
  function safeLink(value) {
    const candidate = String(value || '').trim();
    if (!candidate) return '';
    try { const url = new URL(candidate); if (['http:','https:'].includes(url.protocol) && !url.username && !url.password && candidate.length <= 2048) return url.href; } catch {}
    throw failure('作品链接需要是有效的 http:// 或 https:// 地址。', 'VALIDATION');
  }
  async function validImage(file) {
    if (!IMAGE_TYPES[file?.type] || file.size > MAX_IMAGE || file.size < 12) throw failure('请选择不超过 5 MB 的 JPG、PNG 或 WebP 图片。', 'VALIDATION');
    const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const valid = file.type === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : file.type === 'image/png' ? [137,80,78,71,13,10,26,10].every((b,i) => bytes[i] === b) : bytes[0] === 82 && bytes[1] === 73 && bytes[2] === 70 && bytes[3] === 70 && bytes[8] === 87 && bytes[9] === 69 && bytes[10] === 66 && bytes[11] === 80;
    if (!valid) throw failure('文件内容与图片格式不匹配，请重新选择图片。', 'VALIDATION');
  }
  async function submit(value) {
    requireReady();
    const version = epoch;
    const token = await accessToken(true);
    if (version !== epoch) throw failure('账号状态已改变，请重新操作。', 'STALE');
    const owner = state.user?.id;
    if (!owner) throw failure('请先登录后再投稿。', 'AUTH');
    const category = String(value?.category || ''), type = String(value?.type || '');
    const title = String(value?.title || '').trim(), body = String(value?.body || '').trim(), author = accountName();
    if (!CATEGORY_TYPES[category]?.includes(type) || !title || title.length > 60 || !body || body.length > 6000) throw failure('请检查分类、标题和正文是否符合要求。', 'VALIDATION');
    const url = safeLink(value?.url);
    const file = value?.imageFile || null;
    if (['project','video'].includes(type) && !url) throw failure('项目和视频需要填写作品链接。', 'VALIDATION');
    if (['image','comic'].includes(type) && !file) throw failure('图片和漫画投稿需要选择图片文件。', 'VALIDATION');
    if (type === 'video' && file) throw failure('视频投稿请填写观看链接，不上传图片文件。', 'VALIDATION');
    let imagePath = '';
    if (file) {
      await validImage(file);
      if (version !== epoch) throw failure('账号状态已改变，请重新操作。', 'STALE');
      imagePath = await rpc('tnu_reserve_upload', { p_mime: file.type, p_size: file.size });
      if (!IMAGE_PATH.test(imagePath || '') || !imagePath.startsWith(owner + '/')) throw failure('上传申请响应无效，请重试。', 'MEDIA');
      try { await request('/storage/v1/object/' + BUCKET + '/' + imagePath, { method: 'POST', file, auth: 'required' }); }
      catch (error) {
        if (error.code !== 'NETWORK' && error.code !== 'STALE') await rawRequest('/rest/v1/rpc/tnu_cancel_upload', { method: 'POST', token, body: { p_image_path: imagePath } }).catch(() => {});
        throw error;
      }
    }
    try {
      if (version !== epoch) throw failure('账号状态已改变，请重新操作。', 'STALE');
      return await rpc('tnu_submit_post', { p_category: category, p_type: type, p_title: title, p_body: body, p_author_name: author, p_url: url, p_image_path: imagePath });
    } catch (error) {
      // Never delete after a timeout/unknown commit: the post may already exist.
      // Definite validation/authorization failures may clean only unreferenced images.
      const definiteRejection = ['22023','23505','23514','42501','P0001','AUTH','FORBIDDEN'].includes(error.code) && (!error.httpStatus || error.httpStatus < 500);
      if (imagePath && definiteRejection) {
        await rawRequest('/rest/v1/rpc/tnu_cancel_upload', { method: 'POST', token, body: { p_image_path: imagePath } }).catch(() => {});
        await rawRequest('/storage/v1/object/' + BUCKET, { method: 'DELETE', token, body: { prefixes: [imagePath] } }).catch(() => {});
      }
      if (error.code === 'NETWORK' || error.httpStatus >= 500) error.message = '暂时无法确认提交结果。请先打开“我的投稿”查看是否已收到，确认没有后再重试；填写的内容仍保留。';
      throw error;
    }
  }
  async function review(id, action, note = '') {
    requireReady();
    if (!/^[0-9a-f-]{36}$/i.test(id || '') || !['approved','rejected'].includes(action) || String(note).length > 500) throw failure('审核信息不完整。', 'VALIDATION');
    await rpc('tnu_review_post', { p_post_id: id, p_action: action, p_note: String(note).trim() });
    clearImages();
    await refreshPublic();
    hydrateImages(document);
  }
  async function listComments(postId, options = {}) {
    requireReady();
    if (!UUID.test(String(postId || ''))) throw failure('投稿编号无效。', 'VALIDATION');
    const limit = options.limit === undefined ? 20 : Number(options.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw failure('评论页大小无效。', 'VALIDATION');
    let path = '/rest/v1/tnu_comments?select=' + COMMENT_SELECT + '&post_id=eq.' + encodeURIComponent(postId) + '&order=created_at.desc,id.desc&limit=' + (limit + 1);
    if (options.before) {
      const { createdAt, id } = options.before;
      if (!UUID.test(String(id || '')) || !COMMENT_TIME.test(String(createdAt || '')) || !Number.isFinite(Date.parse(createdAt))) throw failure('评论分页位置无效，请重新加载。', 'VALIDATION');
      // Preserve PostgreSQL microseconds: converting the cursor to JS Date would skip rows.
      const cursor = '(created_at.lt.' + createdAt + ',and(created_at.eq.' + createdAt + ',id.lt.' + id + '))';
      path += '&or=' + encodeURIComponent(cursor);
    }
    const rows = await request(path);
    if (!Array.isArray(rows)) throw failure('评论列表响应不完整，请稍后重试。', 'NETWORK');
    const items = rows.slice(0, limit).map(row => ({ id: String(row.id || ''), postId: String(row.post_id || ''), userId: String(row.user_id || ''), author: String(row.author_name || '校园同学'), body: String(row.body || ''), createdAt: String(row.created_at || '') }));
    const last = items[items.length - 1];
    return { items, hasMore: rows.length > limit, before: last ? { createdAt: last.createdAt, id: last.id } : null };
  }
  async function addComment(postId, value = {}) {
    requireReady();
    if (!state.user) throw failure('请先登录后再发表评论。', 'AUTH');
    const body = String(value.body || '').trim();
    const author = accountName();
    const clientId = String(value.clientId || '');
    if (!UUID.test(String(postId || '')) || !UUID.test(clientId) || !body || body.length > 1000) throw failure('评论需填写 1–1000 字正文。', 'VALIDATION');
    try {
      const id = await rpc('tnu_add_comment', { p_post_id: postId, p_body: body, p_author_name: author, p_client_id: clientId });
      if (typeof id !== 'string' || !UUID.test(id)) throw failure('评论响应不完整。', 'NETWORK');
      return id;
    } catch (error) {
      if (error.code === 'NETWORK' || error.code === 'STALE' || error.httpStatus >= 500) {
        error.uncertain = true;
        error.message = '暂时无法确认评论是否已发表。请刷新评论列表；再次提交相同内容会沿用本次请求，避免重复评论。';
      }
      throw error;
    }
  }
  async function deleteComment(commentId) {
    requireReady();
    if (!state.user) throw failure('请先登录后再删除评论。', 'AUTH');
    if (!UUID.test(String(commentId || ''))) throw failure('评论编号无效。', 'VALIDATION');
    await rpc('tnu_delete_comment', { p_comment_id: commentId });
  }
  async function getImage(path) {
    requireReady();
    if (!IMAGE_PATH.test(path || '')) throw failure('图片路径无效。', 'VALIDATION');
    const scope = state.user?.id || 'public';
    const key = scope + ':' + path;
    if (blobs.has(key)) return blobs.get(key).url;
    if (imageRequests.has(key)) return imageRequests.get(key);
    const version = epoch;
    const task = (async () => {
      const blob = await request('/storage/v1/object/authenticated/' + BUCKET + '/' + path, { auth: 'optional', blob: true });
      if (version !== epoch) throw failure('账号状态已改变。', 'STALE');
      if (!IMAGE_TYPES[blob.type] || blob.size > MAX_IMAGE) throw failure('图片暂时无法显示。', 'MEDIA');
      const url = URL.createObjectURL(blob);
      blobs.set(key, { url, path });
      if (blobs.size > 32) { const first = blobs.keys().next().value; const old = blobs.get(first); URL.revokeObjectURL(old.url); blobs.delete(first); }
      return url;
    })();
    imageRequests.set(key, task);
    try { return await task; } finally { if (imageRequests.get(key) === task) imageRequests.delete(key); }
  }
  async function loadImage(img) {
    if (!state.ready || !img?.dataset?.tnuImage || !img.isConnected) return;
    const path = img.dataset.tnuImage, version = epoch;
    try { const url = await getImage(path); if (version === epoch && img.isConnected && img.dataset.tnuImage === path) { img.src = url; img.removeAttribute('data-image-error'); } }
    catch { if (version === epoch && img.isConnected) { img.setAttribute('data-image-error','true'); img.alt = '图片暂时无法显示，请稍后刷新'; } }
  }
  function hydrateImages(parent = document) {
    if (!state.ready || !parent?.querySelectorAll) return;
    const images = [...parent.querySelectorAll('img[data-tnu-image]')];
    if (parent.matches?.('img[data-tnu-image]')) images.push(parent);
    images.forEach(img => {
      if (img.hasAttribute('src') && !img.hasAttribute('data-image-error')) return;
      if (imageObserver) {
        if (!observed.has(img)) { observed.add(img); imageObserver.observe(img); }
        else if (img.getBoundingClientRect().bottom > 0 && img.getBoundingClientRect().top < window.innerHeight + 300) loadImage(img);
      } else loadImage(img);
    });
  }
  if (typeof IntersectionObserver !== 'undefined') imageObserver = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { imageObserver.unobserve(entry.target); loadImage(entry.target); } }), { rootMargin: '250px' });
  if (typeof MutationObserver !== 'undefined') { mutationObserver = new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => { if (node.nodeType === 1) hydrateImages(node); }))); mutationObserver.observe(document.body, { childList: true, subtree: true }); }
  window.addEventListener('storage', event => {
    if (event.key === PROFILE_EVENT_KEY) { if (state.user && !profileMutation) reloadProfile().catch(() => {}); return; }
    if (event.key !== SESSION_KEY) return;
    installSession(readSession(), false);
    emit();
    const version = epoch;
    if (session) rawRequest('/auth/v1/user', { token: session.access_token }).then(async user => { if (version !== epoch || session?.user?.id !== user.id) return; state.user = { id:user.id,email:user.email || '' }; await updateModerator(); if(version !== epoch)return; await reloadProfile().catch(() => {}); if(version !== epoch)return; emit(); hydrateImages(document); }).catch(() => { if(version === epoch){installSession(null); emit();} });
    else { emit(); hydrateImages(document); }
  });
  window.TNU_COMMUNITY = Object.freeze({ getState, initialize, sendOtp, verifyOtp, signOut, listOwn, listModeration, submit, review, refreshPublic, getImage, hydrateImages, listComments, addComment, deleteComment, reloadProfile, setProfileName, getAdmissionName, setAdmissionName });
  if (configured && !offline) initialize();
  else { state.error = offline ? '本地文件仅供预览；登录、投稿和审核请使用已部署的 HTTPS 网站。' : '社区尚未完成连接。'; emit(); }
})();
