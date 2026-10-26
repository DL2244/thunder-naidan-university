const $=s=>document.querySelector(s);let left=5,paused=false,timer,entered=false;document.body.classList.add('intro-active');
let seed=71;for(let n=0;n<65;n++){seed=(seed*16807)%2147483647;const x=seed/2147483647;seed=(seed*16807)%2147483647;const y=seed/2147483647;const s=document.createElement('i');s.className='star';s.style.cssText=`left:${x*100}%;top:${y*100}%;animation-delay:${x*5}s;opacity:${.2+y*.6}`;$('.stars').append(s)}
function start(){clearInterval(timer);timer=setInterval(()=>{if(paused)return;left--;$('#seconds').textContent=left;$('.progress').style.strokeDashoffset=1225*(left/5);if(left<=0)enter()},1000)}
function enter(){if(entered)return;entered=true;clearInterval(timer);$('#campus').hidden=false;$('#entrance').classList.add('leaving');document.body.classList.remove('intro-active');setTimeout(()=>{$('#entrance').hidden=true;$('#entrance').style.display='none';},650)}
$('#enter').onclick=enter;$('#pause').onclick=()=>{paused=!paused;$('#pause').textContent=paused?'继续':'暂停'};$('#replay').onclick=()=>{entered=false;left=5;paused=false;$('#seconds').textContent=5;$('#pause').textContent='暂停';$('.progress').style.strokeDashoffset=1225;$('#entrance').hidden=false;$('#entrance').style.display='flex';$('#entrance').classList.remove('leaving');document.body.classList.add('intro-active');start()};if(!location.hash.startsWith('#/'))start();
const dialog=$('#dialog');let admissionMode='',admissionOwner='';function show(html){admissionMode='';if(!entered){paused=true;$('#pause').textContent='继续'}$('#dialog-content').innerHTML=html;if(!dialog.open)dialog.showModal()}$('.close').onclick=()=>dialog.close();dialog.addEventListener('click',e=>{const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close()});
const about=()=>show('<div class="eyebrow">A LITTLE IMAGINATION</div><h2>欢迎来到雷霆奶蛋大学</h2><p>这是一所围绕奶蛋形象创作的虚构大学。我们把好奇、勇气和快乐，变成一场可以漫游的校园体验。</p><p>本站的院系、活动及通知书均为创意内容，不代表真实教育机构或学历招生。</p>');$('#about-intro').onclick=about;$('#about-footer').onclick=about;
$('#menu').onclick=()=>{const open=$('.nav nav').classList.toggle('open');$('#menu').setAttribute('aria-expanded',open)};document.querySelectorAll('.nav nav a').forEach(a=>a.onclick=()=>{$('.nav nav').classList.remove('open');$('#menu').setAttribute('aria-expanded',false)});
const life={'奶蛋放空俱乐部':'今日放空任务：找一处舒服的角落，把手机放下，看五分钟天空。你不需要每一刻都有产出。','深夜脑洞放映室':'今日脑洞题：如果月亮是一颗奶蛋，它每天晚上都在想什么？拿起纸笔，写下你的第一个答案。','满电草坪音乐会':'今日音乐提案：挑一首最喜欢的歌，戴上耳机散散步。把今天的小确幸，装进自己的歌单。'};document.querySelectorAll('[data-life]').forEach(b=>b.onclick=()=>show(`<div class="eyebrow">CAMPUS LIFE / 校园生活提案</div><h2>${b.dataset.life}</h2><p>${life[b.dataset.life]}</p><p class="form-tip">这是虚构校园的日常灵感提案，无需预约或报名。</p>`));
const news=[['致新同学：你的无限可能，已准时送达。','欢迎来到雷奶大！入学第一课：暂时放下“我应该是什么样”，想一想“我想尝试什么”。<br><br>逛逛三个学院，挑一个今天就能开始的小实验。也别忘了领取一份写着自己名字的入学通知书。'],['第一届“奇怪但有用”脑洞征集计划开启','给雨伞加一个看云窗口？让闹钟先讲个笑话？那些看起来不太正经的念头，也可能让生活好一点。<br><br>今天的校园创意练习：在纸上画下一个“奇怪但有用”的发明，再给它取个名字。'],['今天也没关系，慢慢发光也很了不起。','亲爱的同学：<br><br>不是每天都要满电，也不是每一份努力都立刻看得见。累了就停一会儿，好好吃饭，好好睡觉。<br><br>你可以是一颗慢慢充电的奶蛋。你的节奏，也值得被尊重。<br><br>—— 你的校园搭子，奶蛋']];document.querySelectorAll('[data-news]').forEach(b=>b.onclick=()=>{const n=news[b.dataset.news];show(`<div class="eyebrow">奶蛋校园编辑部 / 创意专栏</div><h2>${n[0]}</h2><p>${n[1]}</p>`)});
function admissionState(){try{return window.TNU_COMMUNITY?.getState()||{}}catch{return {}}}
function admissionAccount(){dialog.close();admissionMode='';window.TNU_COMMUNITY_UI?.open({tab:'own',focusProfile:true})}
function admissionButton(label){const button=document.createElement('button');button.type='button';button.className='primary';button.textContent=label;button.onclick=admissionAccount;$('#dialog-content').append(button)}
function admissionLetter(name,fixed){
 show('<div class="eyebrow">YOUR POSSIBILITY IS LIMITLESS</div><div class="letter"><span>⚡ 雷霆奶蛋大学</span><h3>入学通知书</h3><div class="letter-name"></div><p>恭喜你被正式录取为<br>「无限可能探索者」！</p><p>请携带你的好奇心与热爱，<br>随时开启属于自己的闪亮旅程。</p><small>校训：敢想 · 敢试 · 敢发光<br>创意纪念通知书 · 非真实学历证明</small></div><p class="form-tip" id="admission-note"></p>');
 $('.letter-name').textContent=name+' 同学';admissionMode=fixed?'fixed':'preview';admissionOwner=admissionState().user?.id||'guest';
 $('#admission-note').textContent=fixed?'已使用你的校园账号名。欢迎截图收藏；修改名字请前往账号设置，每个自然月可改一次。':'这是一份本页预览，名字尚未确认或占用。登录并确认校园账号名后，通知书、投稿与评论才会统一使用它。';
 admissionButton(fixed?'查看账号设置':admissionState().user?'确认校园账号名':'登录并确认账号名');
}
function apply(){
 const current=admissionState(),profile=current.profile,owner=current.user?.id||'guest';
 if(current.user&&(current.profileLoading||current.profileError||!profile)){
  show('<div class="eyebrow">WELCOME TO TNU</div><h2>先找回你的校园名字。</h2><p id="admission-profile-message"></p><button type="button" class="primary" id="admission-profile-retry">重新加载账号名</button>');
  admissionMode='waiting';admissionOwner=owner;$('#admission-profile-message').textContent=current.profileLoading?'正在读取账号名，请稍候…':current.profileError||'账号名还没有加载出来，请重试。';
  $('#admission-profile-retry').disabled=!!current.profileLoading;
  $('#admission-profile-retry').onclick=async()=>{const button=$('#admission-profile-retry');button.disabled=true;try{await window.TNU_COMMUNITY?.reloadProfile()}catch(error){if(admissionState().user?.id===owner&&$('#admission-profile-message'))$('#admission-profile-message').textContent=error.message||'账号名暂时无法读取，请稍后重试。'}finally{if(admissionState().user?.id===owner&&$('#admission-profile-retry'))$('#admission-profile-retry').disabled=false}};return;
 }
 if(current.user&&profile?.displayName&&!profile.needsName){admissionLetter(profile.displayName,true);return}
 show('<div class="eyebrow">WELCOME TO TNU</div><h2>下一位闪亮新同学，<br>就是你。</h2><form id="apply-form"><label for="student">预览名字 · 1–16 字</label><input id="student" name="student" required maxlength="32" placeholder="奶蛋该怎么称呼你？" autocomplete="nickname"><button class="primary" type="submit">生成通知书预览 ↗</button><p class="form-tip">先预览这份纪念通知书。名字需要登录后另行确认，此时还没有注册或占用。</p></form>');
 admissionMode='form';admissionOwner=owner;$('#student').value=window.TNU_COMMUNITY?.getAdmissionName?.()||'';
 $('#apply-form').onsubmit=e=>{e.preventDefault();const latest=admissionState();if((latest.user?.id||'guest')!==owner){apply();return}if(latest.user&&(latest.profileLoading||latest.profileError||!latest.profile||latest.profile.displayName&&!latest.profile.needsName)){apply();return}const name=$('#student').value.normalize('NFKC').replace(/\s+/gu,' ').trim();if(!name||Array.from(name).length>16||/[\p{Cf}\p{Cc}\p{Cs}]/u.test(name)){$('#student').setCustomValidity('请输入1–16字的名字，并移除隐藏字符。');$('#student').reportValidity();return}window.TNU_COMMUNITY?.setAdmissionName?.(name);admissionLetter(name,false)};
 $('#student').oninput=()=>$('#student').setCustomValidity('');
}
document.querySelectorAll('[data-apply]').forEach(b=>b.onclick=apply);
window.addEventListener('tnu:community-state',()=>{if(!dialog.open||!admissionMode)return;const current=admissionState(),owner=current.user?.id||'guest';if(owner!==admissionOwner||current.user&&(current.profileLoading||current.profileError||!current.profile)||current.user&&current.profile?.displayName&&!current.profile.needsName||admissionMode==='waiting'||admissionMode==='fixed')apply()});
let audio,on=false,oscillators=[];$('#sound').onclick=async()=>{try{if(!audio){audio=new(window.AudioContext||window.webkitAudioContext)();const gain=audio.createGain();gain.gain.value=.025;gain.connect(audio.destination);[130.81,196,261.63].forEach(f=>{const o=audio.createOscillator();o.type='sine';o.frequency.value=f;o.connect(gain);o.start();oscillators.push(o)})}on=!on;if(on)await audio.resume();else await audio.suspend();$('#sound').setAttribute('aria-pressed',on);$('#sound span').textContent=on?'关闭氛围音':'开启氛围音'}catch{$('#sound span').textContent='当前浏览器不支持音频'}};

// 学院页可通过链接直接访问；浏览器后退、前进保持正常。
function syncAcademyEntrance(){
  if(location.hash.startsWith('#/')){
    enter();
    $('#entrance').style.display='none';
    $('#entrance').hidden=true;
  }
}
window.addEventListener('hashchange',syncAcademyEntrance);
syncAcademyEntrance();
document.getElementById('draft-library').onclick=()=>window.TNU_DRAFTS.openLibrary();
