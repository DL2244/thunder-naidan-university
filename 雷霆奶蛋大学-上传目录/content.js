/* 奶蛋内容库：在 posts 数组中添加条目，再重新部署，即可向所有访客展示。
 * 示例内容均标注 example: true；删除该条目即可移除示例。
 * 本文件使用普通脚本，让双击 index.html 的离线预览同样可用。
 */
window.TNU_CONTENT = {
  version: 2,
  games: [
    { id: 'echo-assault', title: '回响突击', section: '勇气试炼', description: '奶蛋已举起剑盾，等待第一声回响。完整游戏设计完成后，在这里开启试炼。', status: 'coming-soon', url: '' },
    { id: 'action-lab', title: '行动实验', section: '行动实验', description: '把想法变成操作，用一次次尝试找到通关方式。对应游戏正在筹备。', status: 'coming-soon', url: '' },
    { id: 'team-play', title: '团队协助', section: '团队协助', description: '把彼此的超能力拼在一起。对应协作游戏将在完成后加入。', status: 'coming-soon', url: '' }
  ],
  categories: [
    { id: 'creative', school: 'curiosity', title: '创意表达', eyebrow: 'CREATIVE EXPRESSION', description: '收集有创意、够抽象的文字与图片，让不按常理出牌的想法被看见。', accepts: ['text', 'image'] },
    { id: 'engineering', school: 'curiosity', title: '脑洞工程', eyebrow: 'IDEAS MADE REAL', description: '记录已经落地的项目。从第一个版本到真正能用，每一步都有迹可循。', accepts: ['project'] },
    { id: 'future', school: 'curiosity', title: '未来畅想', eyebrow: 'WHAT IF LAB', description: '给还没实现的灵感留个位置。先记下来，再慢慢把它变成现实。', accepts: ['idea'] },
    { id: 'videos', school: 'joy', title: '抽象视频', eyebrow: 'UNEXPECTED CINEMA', description: '收藏让人“再看一遍”的抽象视频，把快乐暂停在这一帧。', accepts: ['video'] },
    { id: 'comics', school: 'joy', title: '搞笑漫画', eyebrow: 'COMIC CORNER', description: '用一格、四格或一整篇漫画，装下那些一本正经的离谱日常。', accepts: ['comic'] },
    { id: 'jokes', school: 'joy', title: '笑话补给站', eyebrow: 'DAILY DOSE OF JOY', description: '冷笑话、谐音梗、日常小段子。轻轻松松补充一点快乐。', accepts: ['text'] }
  ],
  posts: [
    {
      id: 'creative-alarm', category: 'creative', type: 'text', title: '把闹钟改名为“梦想启动器”',
      summary: '改名后的第三天，我开始对梦想使用稍后提醒。',
      body: '我把闹钟的名字改成了“梦想启动器”。\n\n第一天：梦想，启动！\n第二天：梦想可以再等五分钟。\n第三天：我和梦想达成共识——先睡饱，再远航。\n\n创意不一定解决问题，有时它只是让问题变得有点可爱。',
      tags: ['抽象文字', '日常脑洞'], author: '奶蛋编辑部', date: '2026-10-18', example: true
    },
    {
      id: 'creative-thinking', category: 'creative', type: 'image', title: '脑袋里有个小小发电站',
      summary: '一颗正在认真思考的奶蛋。还没得出答案，但灯已经亮了。',
      body: '这是奇思妙想学院的思考版奶蛋形象：手托下巴、抱着小本子，把突如其来的灵感先记下来。\n\n图片使用 AI 根据网站已有奶蛋形象生成，是本站的校园视觉示例。',
      cover: 'assets/mascot-thinking.png', media: 'assets/mascot-thinking.png', tags: ['视觉创意', '奶蛋形象'], author: '奶蛋编辑部', date: '2026-10-18', example: true
    },
    {
      id: 'engineering-tnu', category: 'engineering', type: 'project', title: '雷霆奶蛋大学官网',
      summary: '从一个奶蛋形象出发，把想象中的大学做成真的可以逛的网站。',
      body: '起点是一只圆滚滚的黄色奶蛋，第一步是设计入校仪式与校园首页。\n\n现在，三个学院正在长出各自的内容：创意与灵感的收藏馆、未来的游戏试炼场，以及快乐内容补给站。\n\n项目采用 HTML、CSS 与原生 JavaScript，通过 Netlify 静态托管上线。后续计划加入更多真实作品，并逐步筹备公开投稿社区。',
      url: 'https://reliable-crisp-2e28c6.netlify.app', status: '已落地', tags: ['网站', '持续更新'], author: '雷霆奶蛋大学', date: '2026-10-18', example: false
    },
    {
      id: 'future-mood', category: 'future', type: 'idea', title: '如果心情也能存进天气罐头',
      summary: '把今天的快乐封存起来，留给未来的阴天。',
      body: '灵感：做一个可以记录当日心情、照片与一句话的小工具，把每一天变成一罐独特的天气。\n\n设想中的体验：\n1. 选一种天气，写下此刻的心情。\n2. 给这份心情选一个未来的开启日期。\n3. 在某个普通的日子，重新收到过去给自己的温柔。\n\n这是一份灵感草稿，尚未开发。',
      status: '灵感草稿', tags: ['未落地', '情绪记录'], author: '奶蛋编辑部', date: '2026-10-18', example: true
    },
    {
      id: 'future-community', category: 'future', type: 'idea', title: '奶蛋校园共创社区',
      summary: '让来逛校园的朋友，也能分享自己的创意和快乐。',
      body: '未来希望开放类似论坛的投稿与交流：访客可以按学院分区分享文字、图片、视频和项目。\n\n当前版本：支持本机草稿，也准备了邮箱登录、云端投稿与审核入口。完成社区开通设置后，可以从各学院提交内容；审核通过后才会公开。\n\n后续方向：作者主页、评论、点赞与内容举报。欢迎先把第一份创意写下来，再通过社区入口提交。',
      status: '接入中', tags: ['共创社区', '持续更新'], author: '雷霆奶蛋大学', date: '2026-10-18', example: false
    },
    {
      id: 'joke-battery', category: 'jokes', type: 'text', title: '满电的秘诀',
      summary: '老师问奶蛋：“你怎么每天都精力满满？”',
      body: '老师问奶蛋：“你怎么每天都精力满满？”\n\n奶蛋认真回答：“因为我把待办清单改名成了待机清单。”\n\n老师：“……”\n奶蛋：“省电模式也是一种生活方式。”',
      tags: ['校园段子', '省电模式'], author: '奶蛋编辑部', date: '2026-10-18', example: true
    },
    {
      id: 'joke-homework', category: 'jokes', type: 'text', title: '这题超出壳纲了',
      summary: '奶蛋交了一份空白作业，并附上一段说明。',
      body: '奶蛋交了一份空白作业。\n\n老师：“你的答案呢？”\n奶蛋：“我正在孵化。”\n老师：“什么时候能交？”\n奶蛋：“等灵感破壳的那一天。”',
      tags: ['冷笑话', '奶蛋日常'], author: '奶蛋编辑部', date: '2026-10-18', example: true
    }
  ]
};
