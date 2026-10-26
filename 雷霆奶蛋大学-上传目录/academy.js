/* Academy portals. Content lives in content.js; all submitted/displayed strings are escaped. */
(() => {
  'use strict';
  const root = document.getElementById('academy-app');
  const home = document.getElementById('university-home');
  if (!root || !home) return;

  const baseTitle = '雷霆奶蛋大学 · 让每一颗奶蛋，闪闪发光';
  const schools = {
    curiosity: { title: '奇思妙想学院', en: 'SCHOOL OF CURIOSITY', number: '01', symbol: '✳', className: 'curiosity', image: 'assets/mascot-thinking.png', alt: '托着下巴认真思考的奶蛋', line: '想法再奇怪，\n也值得被看见。', intro: '一个没头没尾的句子，一件认真做完的小作品，或是还没来得及实现的脑洞。把它们放在这里，慢慢长成新的可能。', note: '奶蛋正在思考：如果灵感也有形状……', categories: ['creative', 'engineering', 'future'] },
    action: { title: '雷霆行动学院', en: 'SCHOOL OF ACTION', number: '02', symbol: 'ϟ', className: 'action', image: 'assets/mascot-guardian.png', alt: '一手拿盾牌、一手拿剑，准备出发的奶蛋', line: '盾牌已举起，\n勇气正在加载。', intro: '从一个人的勇敢，到一群人的默契。奶蛋已经整装待发，三间游戏实验室正在筹备中。', note: '守护你的好奇，也守护你的下一次出发。', categories: [] },
    joy: { title: '快乐生活学院', en: 'SCHOOL OF JOY', number: '03', symbol: '☻', className: 'joy', image: 'assets/mascot-happy.png', alt: '张开双臂、开心大笑着跳起来的奶蛋', line: '今天的快乐，\n请查收。', intro: '收藏让你反复回看的抽象视频、让嘴角失控的漫画，还有那些突如其来的冷笑话。快乐很小，也可以装满一整座学院。', note: '今日课题：认真收集不太正经的快乐。', categories: ['videos', 'comics', 'jokes'] }
  };
  const categoryVisuals = {
    creative: { symbol: '“ ”', en: 'CREATIVE EXPRESSION', label: '文字 / 图片', note: '让一句话、一张图，拥有自己的奇怪逻辑。' },
    engineering: { symbol: '⌘', en: 'IDEA ENGINEERING', label: '已落地项目', note: '从「我想到了」到「我做出来了」。' },
    future: { symbol: '↗', en: 'FUTURE IMAGININGS', label: '未落地灵感', note: '先把未来写下来，答案可以慢慢找。' },
    videos: { symbol: '▶', en: 'ABSURD CINEMA', label: '抽象视频', note: '当大脑试图理解，快乐已经发生。' },
    comics: { symbol: '▤', en: 'COMIC CORNER', label: '搞笑漫画', note: '一格、两格，然后忍不住笑出声。' },
    jokes: { symbol: 'ha!', en: 'SMALL DOSE OF JOY', label: '笑话收藏', note: '允许谐音梗，允许冷笑话，允许很无聊。' }
  };
  const typeNames = { text: '文字', image: '图片', project: '项目', idea: '灵感', video: '视频', comic: '漫画' };
  const listState = new Map();
  let currentRoute = '';
  let pendingFocus = 0;
  let actionWelcomeShown = false;

  const text = value => String(value == null ? '' : value);
  const escape = value => text(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const data = () => window.TNU_CONTENT || { categories: [], posts: [] };
  const categories = () => Array.isArray(data().categories) ? data().categories : [];
  const posts = () => Array.isArray(data().posts) ? data().posts : [];
  const byCategory = id => posts().filter(post => post.category === id);
  const getCategory = id => categories().find(item => item.id === id);
  const schoolFor = category => schools[category?.school] || schools.curiosity;
  const categoryPath = id => '#/collection/' + encodeURIComponent(id);
  const postPath = id => '#/post/' + encodeURIComponent(id);
  const back = (href, label) => `<a class="academy-back" href="${escape(href)}"><span aria-hidden="true">←</span> ${escape(label)}</a>`;
  const draftButton = (id, label = '写一份投稿草稿') => `<button class="academy-button academy-button-light" type="button" data-draft="${escape(id)}">${escape(label)} <span aria-hidden="true">↗</span></button>`;
  function safeURL(value, allowLocal = false) {
    const candidate = text(value).trim();
    if (!candidate) return '';
    if (allowLocal && /^(?:\.\/)?assets\/[\w\u3400-\u9fff%/. -]+$/u.test(candidate) && !candidate.includes('..')) return candidate;
    try {
      const parsed = new URL(candidate);
      return ['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password ? parsed.href : '';
    } catch { return ''; }
  }
  function imageTag(value, alt, className = '', lazy = true) {
    const url = safeURL(value, true);
    const config = window.TNU_COMMUNITY_CONFIG;
    const prefix = config?.url?.replace(/\/$/, '') + '/storage/v1/object/authenticated/tnu-submissions/';
    if (config?.url && url.startsWith(prefix)) {
      const path = url.slice(prefix.length);
      if (/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(?:jpg|jpeg|png|webp)$/i.test(path)) return `<img class="${className}" data-tnu-image="${escape(path)}" alt="${escape(alt)}"${lazy ? ' loading="lazy"' : ''}>`;
      return '';
    }
    const source = url && window.TNU_ASSETS?.[url] || url;
    return url ? `<img class="${className}" src="${escape(source)}" alt="${escape(alt)}"${lazy ? ' loading="lazy"' : ''}>` : '';
  }
  function safeGameURL(value) {
    const candidate = text(value).trim();
    const external = safeURL(candidate);
    if (external) return external;
    // Only real relative HTML pages may become local game links.
    return /^[\w./%\u3400-\u9fff-]+\.html(?:[?#][^<>"'\\]*)?$/u.test(candidate) && !candidate.includes('..') && !candidate.startsWith('//') ? candidate : '';
  }
  function statusTag(post) {
    if (post.example) return '<span class="academy-tag academy-tag-example">示例内容</span>';
    if (post.community) return '<span class="academy-tag">社区投稿</span>';
    if (post.status) return `<span class="academy-tag">${escape(post.status)}</span>`;
    if (post.category === 'engineering') return '<span class="academy-tag">已落地</span>';
    if (post.category === 'future') return '<span class="academy-tag">未落地</span>';
    return '';
  }
  function exampleNote(items) {
    const amount = items.filter(item => item.example).length;
    return amount ? `<p class="academy-example-note"><span aria-hidden="true">✳</span> ${amount === items.length ? '当前展示的是示例内容，用来预览这里未来的样子。' : '标有「示例内容」的条目用于展示页面效果。'}后续可替换为真实收藏。</p>` : '';
  }
  function renderSchool(id) {
    const school = schools[id];
    if (!school) return renderNotFound();
    document.title = school.title + ' · 雷霆奶蛋大学';
    const isAction = id === 'action';
    const hero = `<section class="academy-hero academy-hero-${school.className}">
      <div class="academy-hero-inner">
        <div class="academy-hero-copy">${back('#academics', '返回院系探索')}<p class="academy-kicker">${school.number} / ${school.en}</p><h1 tabindex="-1">${school.title}</h1><h2>${school.line.split('\n').map(escape).join('<br>')}</h2><p class="academy-intro">${school.intro}</p>
        ${isAction ? '<div class="academy-waiting"><span class="academy-status-dot"></span> 敬请期待 · 游戏筹备中</div><button class="academy-button academy-button-gold" data-soon="学院筹备进度" type="button">看看奶蛋的准备清单 <span aria-hidden="true">↗</span></button>' : `<a class="academy-button" href="#academy-collections">${id === 'curiosity' ? '翻开灵感收藏册' : '寻找今日快乐'} <span aria-hidden="true">↓</span></a>`}
        </div>
        <figure class="academy-mascot academy-mascot-${school.className}"><span class="academy-art-word" aria-hidden="true">${isAction ? 'READY?' : id === 'joy' ? 'ha ha!' : 'WHAT IF?'}</span><span class="academy-art-star" aria-hidden="true">${school.symbol}</span>${imageTag(school.image, school.alt, '', false)}<figcaption>${school.note}</figcaption><span class="academy-art-index" aria-hidden="true">TNU / ${school.number}</span></figure>
      </div>
    </section>`;
    if (isAction) {
      root.innerHTML = hero + renderGames() + renderNeighbors(id);
      return;
    }
    const collectionCards = school.categories.map((categoryId, index) => {
      const category = getCategory(categoryId);
      if (!category) return '';
      const visual = categoryVisuals[categoryId];
      const count = byCategory(categoryId).length;
      return `<a class="academy-collection-card collection-${categoryId}" href="${categoryPath(categoryId)}"><div class="academy-collection-top"><span>0${index + 1}</span><span>${escape(visual.label)}</span></div><div class="academy-collection-symbol" aria-hidden="true">${visual.symbol}</div><p class="academy-card-en">${visual.en}</p><h3>${escape(category.title)} <span aria-hidden="true">↗</span></h3><p>${escape(category.description || visual.note)}</p><div class="academy-card-foot"><span>${count ? `${count} 份收藏${byCategory(categoryId).some(post => post.example) ? ' · 含示例' : ''}` : '等待第一份收藏'}</span><span>进入收藏室 →</span></div></a>`;
    }).join('');
    const recentPosts = posts().filter(post => school.categories.includes(post.category)).slice(0, 3);
    root.innerHTML = hero + `<section class="academy-section" id="academy-collections"><div class="academy-section-title"><div><p class="academy-kicker">${id === 'joy' ? 'GOOD MOOD, THREE WAYS' : 'THREE ROOMS FOR YOUR IDEAS'}</p><h2>${id === 'joy' ? '快乐，有三个入口。' : '给每一种想法，一个位置。'}</h2></div><p>${id === 'joy' ? '选一个喜欢的角落，先开心一会儿。' : '表达、落地、畅想，从这里出发。'}</p></div><div class="academy-collections">${collectionCards}</div></section>
      <section class="academy-section academy-recent"><div class="academy-section-title"><div><p class="academy-kicker">ON THE SHELF</p><h2>${id === 'joy' ? '快乐收集站' : '灵感展台'}</h2></div><p>每个小小的发现，都有被收藏的理由。</p></div>${recentPosts.length ? `<div class="academy-post-grid">${recentPosts.map(renderPostCard).join('')}</div>${exampleNote(recentPosts)}` : renderEmpty('这里还留着空位。', '第一份收藏，可能就是你的下一个发现。')}
      </section>${renderContribution(school.categories[0])}${renderNeighbors(id)}`;
  }
  function renderGames() {
    const defaults = [
      { title: '勇气试炼', symbol: '⚑', subtitle: '回响突击 · 预留游戏入口', body: '未来将在这里迎来「回响突击」。世界、关卡与挑战仍在设计，先把这份勇气留给下一次出发。', status: '设计中' },
      { title: '行动实验', symbol: 'ϟ', subtitle: '把想法变成一次行动', body: '尝试、判断，再迈出一步。相应的互动游戏将在开发完成后接入这里。', status: '筹备中' },
      { title: '团队协助', symbol: '⋈', subtitle: '一个人的勇气，一群人的回响', body: '为合作与默契预留的游戏空间。和队友并肩的故事，正在等待被写下。', status: '筹备中' }
    ];
    const configured = Array.isArray(data().games) ? data().games : [];
    const games = defaults.map((fallback, index) => {
      const game = configured[index] || {};
      const href = game.status === 'ready' ? safeGameURL(game.url) : '';
      const heading = game.section || fallback.title;
      const subtitle = game.title && game.title !== heading ? game.title + ' · ' + (href ? '可进入游戏' : '预留游戏入口') : fallback.subtitle;
      return { ...fallback, title: heading, subtitle, body: game.description || fallback.body, status: href ? '已开放' : fallback.status, href };
    });
    const ready = games.some(game => game.href);
    return `<section class="academy-section academy-game-section"><div class="academy-section-title"><div><p class="academy-kicker">THE NEXT ADVENTURE</p><h2>${ready ? '把勇气，交给下一场冒险。' : '下一场冒险，正在孵化。'}</h2></div><p>游戏完成后，会从这里正式开放。</p></div><div class="academy-game-grid">${games.map((game, index) => `<article class="academy-game"><div class="academy-game-head"><span>LAB / 0${index + 1}</span><span class="academy-tag">${escape(game.status)}</span></div><div class="academy-game-symbol" aria-hidden="true">${game.symbol}</div><h3>${escape(game.title)}</h3><p class="academy-game-subtitle">${escape(game.subtitle)}</p><p>${escape(game.body)}</p>${game.href ? `<a class="academy-game-ready" href="${escape(game.href)}"${/^https?:/i.test(game.href) ? ' target="_blank" rel="noopener noreferrer"' : ''}>进入游戏 <span aria-hidden="true">↗</span></a>` : `<button type="button" data-soon="${escape(game.title)}">敬请期待 <span aria-hidden="true">↗</span></button>`}</article>`).join('')}</div><p class="academy-honest-note">${ready ? '已开放的实验室可从「进入游戏」访问，其他实验室仍在筹备中。' : '目前尚未接入可游玩的游戏。「敬请期待」可查看每个实验室的筹备说明。'}</p></section>`;
  }
  function renderPostCard(post) {
    const category = getCategory(post.category);
    const cover = safeURL(post.cover, true);
    return `<a class="academy-post-card${cover ? ' has-cover' : ''}" href="${postPath(post.id)}">${cover ? `<div class="academy-post-cover">${imageTag(cover, post.title)}</div>` : `<div class="academy-post-placeholder placeholder-${escape(post.category)}" aria-hidden="true">${categoryVisuals[post.category]?.symbol || '✳'}</div>`}<div class="academy-post-info"><div class="academy-post-meta"><span>${escape(category?.title || typeNames[post.type] || '收藏')}</span>${statusTag(post)}</div><h3>${escape(post.title)}</h3><p>${escape(post.summary || '')}</p><div class="academy-post-bottom"><span>${escape(post.author || '奶蛋校园编辑部')}</span><span aria-hidden="true">↗</span></div></div></a>`;
  }
  function renderEmpty(title, description, categoryId) {
    return `<div class="academy-empty"><span class="academy-empty-symbol" aria-hidden="true">✳</span><h3>${escape(title)}</h3><p>${escape(description)}</p>${categoryId ? draftButton(categoryId, '把第一份灵感写成草稿') : ''}</div>`;
  }
  function renderContribution(categoryId) {
    return `<section class="academy-contribute"><div><p class="academy-kicker">MAKE ROOM FOR YOUR SPARK</p><h2>这个位置，也留给你的脑洞。</h2><p>先把想法存成自己的草稿，也可以登录后提交到社区。<br>投稿审核通过后，会出现在对应学院。</p></div><div class="academy-contribution-actions"><button type="button" class="academy-button" data-community="submit" data-category="${escape(categoryId)}">向社区投稿 <span aria-hidden="true">↗</span></button>${draftButton(categoryId)}<small>本机保存不会上传；社区投稿需要明确提交审核。</small></div></section>`;
  }
  function renderNeighbors(selected) {
    return `<nav class="academy-other-schools" aria-label="继续探索学院"><span>继续逛逛</span>${Object.entries(schools).filter(([id]) => id !== selected).map(([id, school]) => `<a href="#/school/${id}">${school.title} <span aria-hidden="true">↗</span></a>`).join('')}<a href="#academics">校园首页 <span aria-hidden="true">↗</span></a></nav>`;
  }
  function renderCollection(id) {
    const category = getCategory(id);
    if (!category) return renderNotFound();
    const school = schoolFor(category);
    const visual = categoryVisuals[id] || { en: 'COLLECTION', symbol: '✳', note: '' };
    const state = listState.get(id) || { query: '', type: 'all' };
    listState.set(id, state);
    const accepted = Array.isArray(category.accepts) ? category.accepts : [];
    const typeFilters = accepted.length > 1 ? accepted.map(type => `<button type="button" data-type="${escape(type)}" aria-pressed="${state.type === type}">${escape(typeNames[type] || type)}</button>`).join('') : '';
    document.title = category.title + ' · ' + school.title;
    root.innerHTML = `<div class="academy-collection-page collection-page-${escape(id)}"><header class="academy-collection-header"><div>${back('#/school/' + category.school, '返回' + school.title)}<p class="academy-kicker">${escape(visual.en)} / COLLECTION</p><h1 tabindex="-1">${escape(category.title)}<span aria-hidden="true">${visual.symbol}</span></h1><p>${escape(category.description || visual.note)}</p></div><div class="academy-collection-invitation">${draftButton(id)}<small>收藏想法，从第一份草稿开始。</small></div></header>
      <section class="academy-section academy-shelf"><div class="academy-shelf-tools"><div class="academy-filter-group" role="group" aria-label="按内容类型筛选"><button type="button" data-type="all" aria-pressed="${state.type === 'all'}">全部收藏</button>${typeFilters}</div><label class="academy-search"><span class="academy-search-icon" aria-hidden="true">⌕</span><span class="academy-sr-only">搜索${escape(category.title)}</span><input id="academy-search" type="search" maxlength="150" placeholder="搜标题、内容或标签" value="${escape(state.query)}" autocomplete="off"></label></div><div class="academy-results-line"><span id="academy-results-count" role="status" aria-live="polite"></span><span>${id === 'engineering' ? '只收录已落地的项目' : id === 'future' ? '专门留给尚未落地的灵感' : '让每份收藏都有自己的位置'}</span></div><div id="academy-results"></div></section>${renderContribution(id)}${renderNeighbors(category.school)}</div>`;
    updateResults(id);
    const search = root.querySelector('#academy-search');
    search.addEventListener('input', () => { state.query = search.value; updateResults(id); });
    root.querySelectorAll('[data-type]').forEach(button => button.addEventListener('click', () => {
      state.type = button.dataset.type;
      root.querySelectorAll('[data-type]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      updateResults(id);
    }));
  }
  function updateResults(id) {
    const state = listState.get(id);
    const all = byCategory(id);
    const query = state.query.trim().toLocaleLowerCase();
    const filtered = all.filter(post => {
      const haystack = [post.title, post.summary, post.body, ...(Array.isArray(post.tags) ? post.tags : [])].map(text).join(' ').toLocaleLowerCase();
      return (state.type === 'all' || post.type === state.type) && (!query || haystack.includes(query));
    });
    root.querySelector('#academy-results-count').textContent = `共 ${all.length} 份收藏${query || state.type !== 'all' ? ` · 找到 ${filtered.length} 份` : ''}`;
    const result = root.querySelector('#academy-results');
    result.innerHTML = filtered.length ? `<div class="academy-post-grid">${filtered.map(renderPostCard).join('')}</div>${exampleNote(filtered)}` : all.length ? renderEmpty('暂时没有匹配的收藏。', '换个关键词，或者切换到「全部收藏」再找找。') : renderEmpty('这里正等待第一份收藏。', '内容还没有入库。可以先写一份自己的草稿，后续再加入正式收藏。', id);
  }
  function bodyMarkup(body) {
    const string = Array.isArray(body) ? body.join('\n\n') : text(body);
    return string.split(/\n\s*\n/).filter(Boolean).map(paragraph => `<p>${escape(paragraph).replace(/\n/g, '<br>')}</p>`).join('');
  }
  function renderPost(id) {
    const post = posts().find(item => text(item.id) === id);
    if (!post) return renderNotFound();
    const category = getCategory(post.category);
    const school = schoolFor(category);
    const cover = safeURL(post.cover, true);
    const media = safeURL(post.media, true);
    const external = safeURL(post.url);
    let mediaMarkup = '';
    if (post.type === 'video' && media && /\.(mp4|webm|ogg)(\?|#|$)/i.test(media)) {
      mediaMarkup = `<figure class="academy-detail-media"><video controls playsinline preload="metadata"${cover ? ` poster="${escape(window.TNU_ASSETS?.[cover] || cover)}"` : ''}><source src="${escape(media)}">你的浏览器无法播放这段视频。</video><figcaption>点击播放按钮观看 · 无自动播放</figcaption></figure>`;
    } else if ((post.type === 'image' || post.type === 'comic') && (media || cover)) {
      mediaMarkup = `<figure class="academy-detail-media">${imageTag(media || cover, post.title)}<figcaption>${post.type === 'comic' ? '漫画收藏' : '图片收藏'}</figcaption></figure>`;
    } else if (cover) {
      mediaMarkup = `<figure class="academy-detail-media academy-detail-cover">${imageTag(cover, post.title)}</figure>`;
    }
    if (post.type === 'video' && !mediaMarkup && !external) mediaMarkup = '<div class="academy-detail-placeholder"><span aria-hidden="true">▶</span><p>这条视频收藏还没有加入视频文件或观看链接。</p></div>';
    document.title = text(post.title) + ' · ' + text(category?.title || school.title);
    root.innerHTML = `<article class="academy-detail"><header>${back(categoryPath(post.category), '返回' + (category?.title || '收藏室'))}<div class="academy-detail-meta"><span>${escape(category?.title || '校园收藏')}</span>${statusTag(post)}<span>${escape(typeNames[post.type] || '收藏')}</span></div><h1 tabindex="-1">${escape(post.title)}</h1>${post.summary ? `<p class="academy-detail-summary">${escape(post.summary)}</p>` : ''}<div class="academy-author-line"><span class="academy-author-avatar" aria-hidden="true">⚡</span><span>${escape(post.author || '奶蛋校园编辑部')}</span>${post.date ? `<span>${escape(post.date)}</span>` : ''}</div></header>${post.example ? '<aside class="academy-detail-example">这是用于预览的示例内容，可在后续替换成你的真实收藏。</aside>' : ''}${mediaMarkup}<div class="academy-reading">${bodyMarkup(post.body)}</div>${external ? `<a class="academy-button academy-external" href="${escape(external)}" target="_blank" rel="noopener noreferrer">${post.type === 'video' ? '前往原站观看视频' : post.type === 'project' ? '查看项目链接' : '查看原始链接'} <span aria-hidden="true">↗</span></a><p class="academy-link-note">将在新标签页打开外部网站。</p>` : ''}${Array.isArray(post.tags) && post.tags.length ? `<ul class="academy-tags" aria-label="内容标签">${post.tags.map(tag => `<li># ${escape(tag)}</li>`).join('')}</ul>` : ''}<div class="academy-detail-end"><span>一份小小的收藏，一点新的回响。</span>${back(categoryPath(post.category), '回到收藏室')}</div>${post.community && post.serverId ? `<section data-comments-post="${escape(post.serverId)}"></section>` : `<section class="academy-comment-placeholder"><h2>把回响留给真实的作品。</h2><p>校园示例暂不开放评论。欢迎写一份自己的作品，审核通过后即可参与讨论。</p>${draftButton(post.category)}</section>`}</article>${renderNeighbors(category?.school)}`;
  }
  function renderNotFound() {
    document.title = '收藏还没找到 · 雷霆奶蛋大学';
    root.innerHTML = `<section class="academy-not-found"><p class="academy-kicker">A LITTLE DETOUR</p><span aria-hidden="true">?</span><h1 tabindex="-1">奶蛋还没找到这一页。</h1><p>这个学院或收藏可能已调整，回到校园再逛逛吧。</p><a class="academy-button" href="#academics">返回院系探索 <span aria-hidden="true">↗</span></a></section>`;
  }
  function soonDialog(subject) {
    let dialog = document.getElementById('academy-soon-dialog');
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'academy-soon-dialog';
      dialog.className = 'academy-soon-dialog';
      dialog.setAttribute('aria-labelledby', 'academy-soon-title');
      document.body.appendChild(dialog);
      dialog.addEventListener('click', event => {
        if (event.target.closest('[data-close-soon]')) dialog.close();
        if (event.target === dialog) {
          const box = dialog.getBoundingClientRect();
          if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
        }
      });
    }
    const description = subject === '勇气试炼' ? '「回响突击」将在完全设计好后接入勇气试炼。目前仍在设计中，暂时没有可游玩的版本。' : subject === '行动实验' ? '行动实验的专属游戏正在筹备。等规则、关卡和体验准备好了，奶蛋会在这里打开入口。' : subject === '团队协助' ? '团队协助的专属游戏将在后续开发。未来期待在这里和伙伴一起完成挑战。' : '勇气试炼为「回响突击」预留；行动实验、团队协助也将分别接入对应游戏。当前都处于设计或筹备阶段。';
    dialog.innerHTML = `<button type="button" class="close" data-close-soon aria-label="关闭筹备说明">×</button><p class="academy-kicker">ADVENTURE IN THE MAKING</p>${imageTag('assets/mascot-guardian.png', '持盾执剑的奶蛋守护者', 'academy-dialog-mascot')}<h2 id="academy-soon-title">敬请期待</h2><p class="academy-soon-subtitle">${escape(subject)}</p><p>${description}</p><p class="academy-soon-note">奶蛋正在准备，让下一次出发更有回响。</p><button type="button" class="academy-button" data-close-soon>收到，继续探索 <span aria-hidden="true">↗</span></button>`;
    dialog.showModal();
  }
  root.addEventListener('click', event => {
    const draft = event.target.closest('[data-draft]');
    if (draft) window.dispatchEvent(new CustomEvent('tnu:draft', { detail: { category: draft.dataset.draft } }));
    const soon = event.target.closest('[data-soon]');
    if (soon) soonDialog(soon.dataset.soon);
    const anchor = event.target.closest('a[href="#academy-collections"]');
    if (anchor) {
      event.preventDefault();
      root.querySelector('#academy-collections')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
  });
  function route(force = false) {
    const hash = window.location.hash;
    const isAcademy = hash.startsWith('#/');
    home.hidden = isAcademy;
    root.hidden = !isAcademy;
    document.body.classList.toggle('academy-active', isAcademy);
    window.dispatchEvent(new CustomEvent('tnu:route', { detail: { isAcademy } }));
    if (!isAcademy) {
      if (currentRoute) {
        document.title = baseTitle;
        currentRoute = '';
        requestAnimationFrame(() => { const target = document.getElementById(hash.slice(1)); if (target) target.scrollIntoView(); });
      }
      return;
    }
    if (!force && hash === currentRoute) return;
    currentRoute = hash;
    const soon = document.getElementById('academy-soon-dialog');
    if (!force && soon?.open) soon.close();
    const parts = hash.slice(2).split('/');
    let id;
    try { id = decodeURIComponent(parts.slice(1).join('/')); } catch { id = ''; }
    if (parts[0] === 'school') renderSchool(id);
    else if (parts[0] === 'collection') renderCollection(id);
    else if (parts[0] === 'post') renderPost(id);
    else renderNotFound();
    window.TNU_COMMUNITY?.hydrateImages(root);
    if(force)return;
    cancelAnimationFrame(pendingFocus);
    pendingFocus = requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'instant' });
      root.querySelector('h1')?.focus({ preventScroll: true });
      if (parts[0] === 'school' && id === 'action' && !actionWelcomeShown) {
        actionWelcomeShown = true;
        soonDialog('雷霆行动学院');
      }
    });
  }
  window.addEventListener('hashchange', () => route());
  window.addEventListener('tnu:content-updated', () => {
    const active = document.activeElement;
    const fieldId = active?.id;
    const selection = fieldId === 'academy-search' ? [active.selectionStart,active.selectionEnd] : null;
    route(true);
    if (fieldId && fieldId === 'academy-search') {
      const replacement = root.querySelector('#academy-search');
      replacement?.focus({preventScroll:true});
      if(selection&&replacement?.type!=='search')replacement?.setSelectionRange(...selection);
    }
  });
  window.TNU_ACADEMY = { refresh: () => route(true), route };
  route();
})();
