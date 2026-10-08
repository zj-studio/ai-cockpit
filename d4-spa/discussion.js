/* ============================================================
   项目研讨室 v0.1 —— 驾舱员工模块内群聊界面
   加载方式：index.html 末尾 <script src="discussion.js"></script>
   设计原则：不修改 hall.js 任何代码，只在员工模块注入 Tab 和研讨室内容。
            删掉这一行 script 引用即回到只有员工大厅的状态。
   依赖：后端 API（见底部「后端接口约定」）
   ============================================================ */
(function () {
  "use strict";

  /* ---------- 路径与 API ---------- */
  var PREFIX = (location.pathname.match(/^\/(?:cockpit|cockpit-v063|cockpit-v070(?:_dev)?)\//) || ["/cockpit/"])[0];
  var API = PREFIX + "api";
  var PROD = (PREFIX === "/cockpit/");

  /* ---------- 员工名册（用于选人面板和气泡渲染） ---------- */
  var EMPLOYEE_ROSTER = [
    { role: "bohu",     name: "伯虎",   dept: "业务部",       emoji: "💼", role_name: "商机线索·谈单话术·推动成单" },
    { role: "xiaoming", name: "小明",   dept: "业务部",       emoji: "📊", role_name: "调研·竞争分析·策略制定" },
    { role: "qiuxiang", name: "秋香",   dept: "交付实施部",    emoji: "🎨", role_name: "PPT·图片视觉内容制作" },
    { role: "shusheng", name: "书生",   dept: "交付实施部",    emoji: "🎬", role_name: "短视频·动画·影像内容" },
    { role: "xiaoqiang",name: "小强",   dept: "交付实施部",    emoji: "💻", role_name: "前后端开发·技术方案" },
    { role: "ruhua",    name: "如花",   dept: "交付实施部",    emoji: "🌸", role_name: "文案策划·品牌叙事" },
    { role: "jiqimao",  name: "机器猫", dept: "售后部",       emoji: "🤖", role_name: "运维·巡检·故障处理" },
    { role: "xiaojing", name: "小景",   dept: "客服部",       emoji: "🎧", role_name: "客户咨询·工单处理" },
    { role: "xiaomo",   name: "小墨",   dept: "综合部",       emoji: "📝", role_name: "老板助理·协调·纪要", is_minutes: true },
    { role: "huaan",    name: "华安",   dept: "交付实施部",    emoji: "⚡", role_name: "开发交付·项目实施" }
  ];

  // 默认参会四人（经典圆桌）
  var DEFAULT_PARTICIPANTS = ["bohu", "xiaoming", "ruhua", "xiaoqiang"];

  // 通过 role 查员工信息
  function empOf(role) {
    for (var i = 0; i < EMPLOYEE_ROSTER.length; i++) {
      if (EMPLOYEE_ROSTER[i].role === role) return EMPLOYEE_ROSTER[i];
    }
    return { role: role, name: role, dept: "", emoji: "💬", role_name: "" };
  }

  /* ---------- 状态 ---------- */
  var rooms = [];              // 房间列表
  var curRoom = null;          // 当前房间
  var busy = false;            // 是否正在讨论中
  var el = {};                 // DOM 引用
  var modalStep = 1;           // 新建弹窗当前步骤
  var modalParticipants = [];  // 新建弹窗已选成员

  /* ---------- 工具函数（与 hall.js 逻辑一致，避免依赖） ---------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function cleanThink(s) {
    return String(s || "").replace(/<think>/g, "").replace(/<\/\s*think>/g, "")
      .replace(/<!--[\s\S]*?-->/g, "").replace(/^\s+/, "");
  }

  function splitThink(raw) {
    var i = String(raw || "").indexOf("</think>");
    if (i < 0) return { think: "", answer: String(raw || "") };
    return { think: cleanThink(String(raw).slice(0, i)), answer: String(raw).slice(i + 8).replace(/^\s+/, "") };
  }

  function miniMd(s) {
    return esc(s)
      .replace(/`([^`\n]+)`/g, '<code style="background:rgba(255,255,255,.09);padding:1px 5px;border-radius:5px">$1</code>')
      .replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>")
      .replace(/(^|\n)\s*[-*]\s+/g, "$1• ");
  }

  function fmtTime(ts) {
    if (!ts) return "";
    // 2026-09-10 13:31:00 → 09-10 13:31
    var parts = ts.split(" ");
    if (parts.length < 2) return ts;
    var d = parts[0].slice(5); // MM-DD
    var t = parts[1].slice(0, 5); // HH:MM
    return d + " " + t;
  }

  /* ---------- 样式 ---------- */
  var CSS = [
    /* Tab 栏 */
    ".disc-tabs{display:flex;gap:4px;background:var(--glass);border:1px solid var(--border);border-radius:12px;padding:4px;margin-bottom:14px;width:fit-content}",
    ".disc-tabs .tab{padding:7px 18px;font-size:13px;border-radius:8px;cursor:pointer;color:var(--text-dim);transition:all .18s;user-select:none}",
    ".disc-tabs .tab:hover{color:var(--text-soft)}",
    ".disc-tabs .tab.active{background:linear-gradient(135deg,rgba(124,92,255,.35),rgba(105,231,255,.2));color:#fff;border:1px solid rgba(124,92,255,.45);box-shadow:0 2px 10px rgba(124,92,255,.2)}",

    /* Tab 内容切换 */
    ".tab-pane{display:none}",
    ".tab-pane.active{display:block}",

    /* 研讨室主体布局 */
    ".disc-wrap{display:grid;grid-template-columns:minmax(240px,280px) 1fr;gap:14px;align-items:start}",
    "@media(max-width:1180px){.disc-wrap{grid-template-columns:1fr}}",

    /* 房间列表 */
    ".disc-room-list{display:flex;flex-direction:column;gap:10px;max-height:70vh;overflow:auto;padding-right:3px}",
    ".disc-room-list::-webkit-scrollbar{width:6px}",
    ".disc-room-list::-webkit-scrollbar-thumb{background:rgba(255,255,255,.14);border-radius:3px}",
    ".disc-new-btn{padding:11px 14px;background:linear-gradient(135deg,rgba(124,92,255,.3),rgba(105,231,255,.18));border:1px solid rgba(124,92,255,.45);border-radius:12px;color:#fff;font-size:13px;font-weight:600;cursor:pointer;text-align:center;transition:all .18s;margin-bottom:4px}",
    ".disc-new-btn:hover{box-shadow:0 4px 16px rgba(124,92,255,.3);transform:translateY(-1px)}",
    ".room-card{padding:12px 13px;background:var(--glass);border:1px solid var(--border);border-radius:12px;cursor:pointer;transition:all .18s}",
    ".room-card:hover{border-color:var(--border-strong);transform:translateY(-2px);box-shadow:0 0 20px rgba(105,231,255,.1)}",
    ".room-card.active{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent) inset,0 8px 26px rgba(105,231,255,.1)}",
    ".room-card .room-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}",
    ".room-card .room-name{font-size:13.5px;font-weight:600;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".room-card .room-status{font-size:10px;padding:2px 7px;border-radius:10px;font-weight:600}",
    ".room-status.done{background:rgba(94,234,212,.12);color:#5eead4;border:1px solid rgba(94,234,212,.3)}",
    ".room-status.running{background:rgba(255,180,84,.12);color:#ffb454;border:1px solid rgba(255,180,84,.3)}",
    ".room-status.idle{background:rgba(138,148,176,.12);color:#8a94b0;border:1px solid var(--border)}",
    ".room-card .room-topic{font-size:11.5px;color:var(--text-dim);line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin-bottom:8px}",
    ".room-card .room-meta{display:flex;justify-content:space-between;align-items:center;font-size:10.5px;color:var(--text-dim)}",
    ".room-card .room-avatars{display:flex}",
    ".room-card .room-avatars span{width:18px;height:18px;border-radius:5px;display:grid;place-items:center;font-size:10px;margin-left:-3px;border:1px solid #0a0e1a;background:var(--glass)}",
    ".room-card .room-avatars span:first-child{margin-left:0}",

    /* 群聊右侧面板 */
    ".disc-chat-pane{display:flex;flex-direction:column;min-height:600px;background:var(--glass);border:1px solid var(--border);border-radius:12px;overflow:hidden}",
    ".disc-head{display:flex;align-items:center;gap:12px;padding:14px 18px;border-bottom:1px solid var(--border);background:rgba(15,20,40,.75)}",
    ".disc-head .dh-main{flex:1;min-width:0}",
    ".disc-head .dh-name{font-size:15px;font-weight:700;display:flex;align-items:center;gap:8px;flex-wrap:wrap}",
    ".disc-head .dh-topic{font-size:12px;color:var(--text-dim);margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".disc-head .dh-participants{display:flex;gap:4px}",
    ".disc-head .dh-participants .p{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;font-size:14px;border:1px solid var(--border);background:var(--glass)}",
    ".dh-members-tag{font-size:10px;padding:2px 8px;border-radius:10px;background:rgba(105,231,255,.1);border:1px solid rgba(105,231,255,.25);color:var(--accent);font-weight:600;cursor:pointer;transition:.16s}",
    ".dh-members-tag:hover{background:rgba(105,231,255,.2)}",

    /* 消息区 */
    ".disc-msgs{flex:1;overflow-y:auto;padding:18px 20px;display:flex;flex-direction:column;gap:14px;min-height:420px}",
    ".disc-msgs::-webkit-scrollbar{width:7px}",
    ".disc-msgs::-webkit-scrollbar-thumb{background:rgba(255,255,255,.12);border-radius:4px}",

    /* 轮次分隔 */
    ".disc-round-divider{display:flex;align-items:center;gap:10px;margin:6px 0;color:var(--text-dim);font-size:11px}",
    ".disc-round-divider::before,.disc-round-divider::after{content:\"\";flex:1;height:1px;background:linear-gradient(to right,transparent,var(--border),transparent)}",
    ".disc-round-divider .badge{padding:3px 12px;border-radius:12px;background:rgba(255,180,84,.1);border:1px solid rgba(255,180,84,.25);color:#ffb454;font-weight:600;white-space:nowrap}",

    /* 角色气泡基础 */
    ".disc-bubble{display:flex;gap:10px;max-width:85%;animation:bubIn .25s ease-out}",
    "@keyframes bubIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}",
    ".disc-bubble .b-avatar{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;font-size:17px;flex:0 0 auto;border:1px solid var(--border);background:var(--glass)}",
    ".disc-bubble .b-body{flex:1;min-width:0}",
    ".disc-bubble .b-meta{display:flex;align-items:center;gap:8px;margin-bottom:4px}",
    ".disc-bubble .b-name{font-size:12.5px;font-weight:600}",
    ".disc-bubble .b-dept{font-size:10.5px;color:var(--text-dim)}",
    ".disc-bubble .b-round{font-size:10px;padding:1px 6px;border-radius:8px;background:var(--accent-dim);color:var(--accent);font-weight:600}",
    ".disc-bubble .b-content{padding:10px 13px;border-radius:12px;font-size:13px;line-height:1.75;white-space:pre-wrap;word-break:break-word;border-bottom-left-radius:5px;background:var(--glass);border:1px solid var(--border)}",
    ".disc-bubble .b-content .think{margin:0 0 8px;font-size:11.5px;line-height:1.6;color:var(--text-dim);opacity:.85;border-left:2px solid rgba(105,231,255,.5);padding:6px 0 6px 9px;max-height:100px;overflow:auto}",
    ".disc-bubble .b-content .think b{display:block;font-size:10.5px;letter-spacing:.5px;color:var(--accent);margin-bottom:3px}",

    /* 角色配色 */
    ".disc-bubble.bohu .b-avatar{background:rgba(255,160,80,.15);border-color:rgba(255,160,80,.35)}",
    ".disc-bubble.bohu .b-name{color:#ffa050}",
    ".disc-bubble.bohu .b-content{background:rgba(255,160,80,.08);border-color:rgba(255,160,80,.25)}",
    ".disc-bubble.xiaoming .b-avatar{background:rgba(80,220,180,.15);border-color:rgba(80,220,180,.35)}",
    ".disc-bubble.xiaoming .b-name{color:#50dcb4}",
    ".disc-bubble.xiaoming .b-content{background:rgba(80,220,180,.08);border-color:rgba(80,220,180,.25)}",
    ".disc-bubble.ruhua .b-avatar{background:rgba(220,120,220,.15);border-color:rgba(220,120,220,.35)}",
    ".disc-bubble.ruhua .b-name{color:#dc78dc}",
    ".disc-bubble.ruhua .b-content{background:rgba(220,120,220,.08);border-color:rgba(220,120,220,.25)}",
    ".disc-bubble.xiaoqiang .b-avatar{background:rgba(124,92,255,.2);border-color:rgba(124,92,255,.45)}",
    ".disc-bubble.xiaoqiang .b-name{color:#a78bfa}",
    ".disc-bubble.xiaoqiang .b-content{background:rgba(124,92,255,.12);border-color:rgba(124,92,255,.35)}",
    ".disc-bubble.qiuxiang .b-avatar{background:rgba(255,200,100,.15);border-color:rgba(255,200,100,.35)}",
    ".disc-bubble.qiuxiang .b-name{color:#ffc864}",
    ".disc-bubble.qiuxiang .b-content{background:rgba(255,200,100,.08);border-color:rgba(255,200,100,.25)}",
    ".disc-bubble.shusheng .b-avatar{background:rgba(100,180,255,.15);border-color:rgba(100,180,255,.35)}",
    ".disc-bubble.shusheng .b-name{color:#64b4ff}",
    ".disc-bubble.shusheng .b-content{background:rgba(100,180,255,.08);border-color:rgba(100,180,255,.25)}",
    ".disc-bubble.jiqimao .b-avatar{background:rgba(150,200,150,.15);border-color:rgba(150,200,150,.35)}",
    ".disc-bubble.jiqimao .b-name{color:#96c896}",
    ".disc-bubble.jiqimao .b-content{background:rgba(150,200,150,.08);border-color:rgba(150,200,150,.25)}",
    ".disc-bubble.xiaojing .b-avatar{background:rgba(255,150,180,.15);border-color:rgba(255,150,180,.35)}",
    ".disc-bubble.xiaojing .b-name{color:#ff96b4}",
    ".disc-bubble.xiaojing .b-content{background:rgba(255,150,180,.08);border-color:rgba(255,150,180,.25)}",
    ".disc-bubble.xiaomo .b-avatar{background:rgba(105,231,255,.2);border-color:rgba(105,231,255,.45)}",
    ".disc-bubble.xiaomo .b-name{color:var(--accent)}",
    ".disc-bubble.xiaomo .b-content{background:rgba(105,231,255,.1);border-color:rgba(105,231,255,.3)}",
    ".disc-bubble.huaan .b-avatar{background:rgba(255,220,100,.15);border-color:rgba(255,220,100,.35)}",
    ".disc-bubble.huaan .b-name{color:#ffdc64}",
    ".disc-bubble.huaan .b-content{background:rgba(255,220,100,.08);border-color:rgba(255,220,100,.25)}",

    /* 小墨纪要卡片 */
    ".disc-summary-card{align-self:center;width:100%;max-width:92%;background:linear-gradient(135deg,rgba(105,231,255,.08),rgba(124,92,255,.06));border:1px solid rgba(105,231,255,.3);border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(105,231,255,.08);animation:cardIn .4s ease-out}",
    "@keyframes cardIn{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}",
    ".summary-header{display:flex;align-items:center;gap:10px;padding:12px 16px;background:rgba(105,231,255,.1);border-bottom:1px solid rgba(105,231,255,.2)}",
    ".summary-header .sh-icon{width:32px;height:32px;border-radius:9px;display:grid;place-items:center;font-size:16px;background:rgba(105,231,255,.2);border:1px solid rgba(105,231,255,.4)}",
    ".summary-header .sh-title{font-size:14px;font-weight:700;color:var(--accent)}",
    ".summary-header .sh-sub{font-size:11px;color:var(--text-dim);margin-top:2px}",
    ".summary-body{padding:14px 16px}",
    ".summary-section{margin-bottom:12px}",
    ".summary-section:last-child{margin-bottom:0}",
    ".summary-section .ss-title{font-size:12.5px;font-weight:700;margin-bottom:8px;display:flex;align-items:center;gap:6px}",
    ".summary-section .ss-title.consensus{color:#5eead4}",
    ".summary-section .ss-title.dispute{color:#ffb454}",
    ".summary-section .ss-title.action{color:var(--accent)}",
    ".summary-section ul{list-style:none;padding:0}",
    ".summary-section li{font-size:12.5px;line-height:1.7;color:var(--text-soft);padding-left:16px;position:relative;margin-bottom:4px}",
    ".summary-section li::before{content:\"•\";position:absolute;left:4px;color:var(--text-dim)}",
    ".summary-section.consensus li::before{color:#5eead4}",
    ".summary-section.dispute li::before{color:#ffb454}",
    ".summary-section.action li::before{color:var(--accent)}",
    ".p-tag{display:inline-block;font-size:10px;padding:1px 6px;border-radius:6px;margin-right:6px;font-weight:700;vertical-align:middle}",
    ".p-tag.p0{background:rgba(255,107,107,.15);color:#ff8080;border:1px solid rgba(255,107,107,.3)}",
    ".p-tag.p1{background:rgba(255,180,84,.15);color:#ffc477;border:1px solid rgba(255,180,84,.3)}",
    ".p-tag.p2{background:rgba(105,231,255,.12);color:var(--accent);border:1px solid rgba(105,231,255,.25)}",

    /* 输入区 */
    ".disc-input-bar{display:flex;gap:10px;padding:12px 16px;border-top:1px solid var(--border);background:rgba(255,255,255,.02)}",
    ".disc-input-bar textarea{flex:1;resize:none;min-height:44px;max-height:120px;padding:10px 13px;border-radius:10px;border:1px solid var(--border);background:rgba(255,255,255,.03);color:var(--text);font-size:13px;line-height:1.6;font-family:inherit;outline:none;transition:border-color .16s}",
    ".disc-input-bar textarea:focus{border-color:var(--accent)}",
    ".disc-input-bar textarea::placeholder{color:var(--text-dim);opacity:.6}",
    ".disc-start-btn{flex:0 0 auto;padding:0 20px;border-radius:10px;border:1px solid rgba(124,92,255,.5);background:linear-gradient(135deg,rgba(124,92,255,.4),rgba(105,231,255,.22));color:#fff;font-size:13px;font-weight:700;cursor:pointer;transition:all .16s}",
    ".disc-start-btn:hover:not(:disabled){box-shadow:0 4px 16px rgba(124,92,255,.35)}",
    ".disc-start-btn:disabled{opacity:.45;cursor:not-allowed}",
    ".disc-tip{padding:0 16px 10px;font-size:10.5px;color:var(--text-dim);text-align:center}",

    /* 空状态 */
    ".disc-empty{margin:auto;text-align:center;color:var(--text-dim);font-size:13px;line-height:2;padding:40px 20px}",
    ".disc-empty .big-emoji{font-size:40px;margin-bottom:12px;display:block}",
    ".disc-empty b{display:block;font-size:15px;color:var(--text);margin-bottom:6px}",

    /* 打字光标 */
    ".cursor{display:inline-block;width:6px;height:12px;vertical-align:-2px;margin-left:3px;background:var(--accent);border-radius:2px;animation:bl .9s steps(2) infinite}",
    "@keyframes bl{50%{opacity:0}}",

    /* Modal 弹窗 */
    ".modal-mask{position:fixed;inset:0;background:rgba(0,0,0,.6);backdrop-filter:blur(4px);display:grid;place-items:center;z-index:9999;animation:fadeIn .2s ease-out}",
    "@keyframes fadeIn{from{opacity:0}to{opacity:1}}",
    ".modal-box{width:90%;max-width:560px;background:rgba(15,20,40,.95);border:1px solid var(--border-strong);border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.5);overflow:hidden;animation:slideUp .25s ease-out}",
    "@keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}",
    ".modal-header{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid var(--border)}",
    ".modal-header .mh-title{font-size:15px;font-weight:700;display:flex;align-items:center;gap:8px}",
    ".modal-header .mh-close{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;cursor:pointer;color:var(--text-dim);transition:.16s;font-size:16px}",
    ".modal-header .mh-close:hover{background:rgba(255,255,255,.08);color:var(--text)}",

    /* 步骤指示器 */
    ".modal-steps{display:flex;align-items:center;justify-content:center;gap:8px;padding:14px 18px 0}",
    ".modal-steps .step-dot{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font-size:11px;font-weight:700;background:var(--glass);border:1px solid var(--border);color:var(--text-dim)}",
    ".modal-steps .step-dot.active{background:linear-gradient(135deg,rgba(124,92,255,.4),rgba(105,231,255,.25));border-color:rgba(124,92,255,.5);color:#fff}",
    ".modal-steps .step-dot.done{background:rgba(94,234,212,.15);border-color:rgba(94,234,212,.4);color:#5eead4}",
    ".modal-steps .step-line{width:40px;height:2px;background:var(--border);border-radius:1px}",
    ".modal-steps .step-line.done{background:rgba(94,234,212,.4)}",

    /* Modal 步骤内容 */
    ".modal-step{padding:16px 18px;min-height:200px}",
    ".modal-step.hidden{display:none}",
    ".form-group{margin-bottom:14px}",
    ".form-group label{display:block;font-size:12px;color:var(--text-soft);margin-bottom:6px;font-weight:600}",
    ".form-group label .hint{color:var(--text-dim);font-weight:400;font-size:10.5px;margin-left:6px}",
    ".form-group input[type=text],.form-group textarea{width:100%;padding:9px 12px;border-radius:8px;border:1px solid var(--border);background:rgba(255,255,255,.03);color:var(--text);font-size:13px;font-family:inherit;outline:none;transition:border-color .16s;box-sizing:border-box}",
    ".form-group input[type=text]:focus,.form-group textarea:focus{border-color:var(--accent)}",
    ".form-group textarea{resize:vertical;min-height:70px;line-height:1.6}",
    ".form-group .error{color:#ff8080;font-size:11px;margin-top:4px;min-height:14px}",

    /* 员工多选网格 */
    ".employee-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:10px}",
    "@media(max-width:480px){.employee-grid{grid-template-columns:1fr}}",
    ".emp-select-card{padding:10px 12px;background:var(--glass);border:1px solid var(--border);border-radius:10px;cursor:pointer;transition:all .18s;display:flex;align-items:center;gap:10px;position:relative}",
    ".emp-select-card:hover{border-color:var(--border-strong);transform:translateY(-1px)}",
    ".emp-select-card.selected{border-color:var(--accent);background:rgba(105,231,255,.08);box-shadow:0 0 0 1px var(--accent) inset}",
    ".emp-select-card.disabled{opacity:.6;cursor:default}",
    ".emp-select-card .emp-avatar{width:32px;height:32px;border-radius:9px;display:grid;place-items:center;font-size:16px;background:var(--glass);border:1px solid var(--border);flex:0 0 auto}",
    ".emp-select-card .emp-info{flex:1;min-width:0}",
    ".emp-select-card .emp-name{font-size:12.5px;font-weight:600}",
    ".emp-select-card .emp-dept{font-size:10.5px;color:var(--text-dim);margin-top:2px}",
    ".emp-select-card .emp-check{width:18px;height:18px;border-radius:50%;border:1px solid var(--border);flex:0 0 auto;display:grid;place-items:center;font-size:11px;color:transparent;transition:all .18s}",
    ".emp-select-card.selected .emp-check{background:var(--accent);border-color:var(--accent);color:#0a0e1a;font-weight:700}",
    ".emp-badge{position:absolute;top:6px;right:6px;font-size:9px;padding:1px 6px;border-radius:8px;background:rgba(105,231,255,.12);border:1px solid rgba(105,231,255,.3);color:var(--accent);font-weight:600}",

    /* 已选计数栏 */
    ".selected-footer{display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--glass);border-radius:8px;border:1px solid var(--border);margin-top:8px}",
    ".selected-footer .sf-count{font-size:11.5px;color:var(--text-soft)}",
    ".selected-footer .sf-count b{color:var(--accent)}",
    ".selected-footer .sf-hint{font-size:10.5px;color:var(--text-dim)}",

    /* Modal 底部按钮 */
    ".modal-footer{display:flex;justify-content:space-between;align-items:center;padding:12px 18px;border-top:1px solid var(--border);background:rgba(0,0,0,.2)}",
    ".modal-footer .mf-left{display:flex;gap:8px}",
    ".modal-footer .mf-right{display:flex;gap:8px}",
    ".btn{padding:7px 16px;border-radius:8px;font-size:12.5px;font-weight:600;cursor:pointer;transition:all .16s;border:1px solid var(--border);background:var(--glass);color:var(--text-soft)}",
    ".btn:hover:not(:disabled){border-color:var(--border-strong);color:var(--text)}",
    ".btn:disabled{opacity:.4;cursor:not-allowed}",
    ".btn-primary{background:linear-gradient(135deg,rgba(124,92,255,.4),rgba(105,231,255,.22));border-color:rgba(124,92,255,.5);color:#fff}",
    ".btn-primary:hover:not(:disabled){box-shadow:0 4px 14px rgba(124,92,255,.3)}",

    /* 系统消息 */
    ".disc-system{align-self:center;font-size:11px;color:var(--text-dim);padding:4px 12px;background:rgba(255,255,255,.04);border-radius:10px}"
  ].join("");

  var st = document.createElement("style");
  st.textContent = CSS;
  document.head.appendChild(st);

  /* ================================================================
     第一部分：Tab 栏注入 + 员工/研讨室切换
     ================================================================ */

  function injectTabs() {
    var viewEmployees = document.getElementById("view-employees");
    if (!viewEmployees || document.getElementById("discTabs")) return;

    // 在模块标题下方插入 Tab 栏
    var moduleHead = viewEmployees.querySelector(".module-head") || viewEmployees.querySelector("h2");
    var tabsHtml =
      '<div class="disc-tabs" id="discTabs">' +
        '<div class="tab active" data-tab="employees">在岗员工</div>' +
        '<div class="tab" data-tab="discussion">项目研讨室</div>' +
      '</div>';

    if (moduleHead && moduleHead.parentNode) {
      moduleHead.insertAdjacentHTML("afterend", tabsHtml);
    } else {
      viewEmployees.insertAdjacentHTML("afterbegin", tabsHtml);
    }

    // 给员工大厅内容包一层 tab-pane
    var hallWrap = viewEmployees.querySelector(".hall-wrap");
    if (hallWrap) {
      var employeesPane = document.createElement("div");
      employeesPane.className = "tab-pane active";
      employeesPane.id = "tabEmployees";
      hallWrap.parentNode.insertBefore(employeesPane, hallWrap);
      employeesPane.appendChild(hallWrap);
    }

    // 插入研讨室 tab-pane（空的，稍后渲染）
    var discPane = document.createElement("div");
    discPane.className = "tab-pane";
    discPane.id = "tabDiscussion";
    discPane.innerHTML = '<div class="disc-empty"><span class="big-emoji">🗨️</span><b>加载研讨室中…</b>请稍候</div>';

    var tabs = document.getElementById("discTabs");
    if (tabs) {
      tabs.insertAdjacentElement("afterend", discPane);
    } else {
      viewEmployees.appendChild(discPane);
    }

    // Tab 切换事件
    document.querySelectorAll("#discTabs .tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        var target = this.dataset.tab;
        document.querySelectorAll("#discTabs .tab").forEach(function (t) {
          t.classList.toggle("active", t.dataset.tab === target);
        });
        document.getElementById("tabEmployees").classList.toggle("active", target === "employees");
        document.getElementById("tabDiscussion").classList.toggle("active", target === "discussion");
        if (target === "discussion") {
          initDiscussion();
        }
      });
    });
  }

  /* ================================================================
     第二部分：研讨室主界面
     ================================================================ */

  var discussionInited = false;

  function initDiscussion() {
    if (discussionInited) return;
    discussionInited = true;

    var pane = document.getElementById("tabDiscussion");
    if (!pane) return;

    pane.innerHTML =
      '<div class="disc-wrap">' +
        // 左侧：房间列表
        '<div class="disc-room-list" id="discRoomList">' +
          '<div class="disc-new-btn" id="discNewBtn">＋ 新建研讨室</div>' +
          '<div style="text-align:center;color:var(--text-dim);font-size:12px;padding:20px 0">加载房间列表…</div>' +
        '</div>' +
        // 右侧：群聊区
        '<div class="disc-chat-pane" id="discChatPane">' +
          '<div class="disc-empty" style="margin:auto"><span class="big-emoji">💬</span><b>选择一个研讨室</b>从左侧选择或新建一个研讨室开始讨论</div>' +
        '</div>' +
      '</div>';

    // 绑定新建按钮
    document.getElementById("discNewBtn").addEventListener("click", openNewRoomModal);

    // 加载房间列表
    loadRooms();
  }

  /* ---------- 房间列表 ---------- */

  function loadRooms() {
    var listEl = document.getElementById("discRoomList");
    if (!listEl) return;

    fetch(API + "/rooms", { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        rooms = data.rooms || [];
        renderRoomList();
      })
      .catch(function (err) {
        // 后端还没好的时候，显示空状态 + 提示
        var loading = listEl.querySelector("div[style*=text-align]");
        if (loading) {
          loading.innerHTML = '暂无房间<br><span style="font-size:10.5px;opacity:.6">点上方按钮创建第一个研讨室<br>（后端 API 未就绪时创建功能不可用）</span>';
        }
        // 红线：生产驾驶舱禁止用 mock 冒充真实讨论；API 不通时显示“数据接入中”
        if (PROD) {
          var l2 = listEl.querySelector("div[style*=text-align]");
          if (l2) l2.innerHTML = '数据接入中<br><span style="font-size:10.5px;opacity:.6">后端接口未连接，稍后自动重试</span>';
          return;
        }
        rooms = getMockRooms();
        renderRoomList();
      });
  }

  function renderRoomList() {
    var listEl = document.getElementById("discRoomList");
    if (!listEl) return;

    var btn = document.getElementById("discNewBtn");
    listEl.innerHTML = "";
    listEl.appendChild(btn);

    if (!rooms.length) {
      var empty = document.createElement("div");
      empty.style.cssText = "text-align:center;color:var(--text-dim);font-size:12px;padding:20px 0";
      empty.textContent = "暂无研讨室";
      listEl.appendChild(empty);
      return;
    }

    rooms.forEach(function (room) {
      var card = document.createElement("div");
      card.className = "room-card" + (curRoom && curRoom.id === room.id ? " active" : "");
      card.dataset.id = room.id;

      var statusText = { idle: "待开始", running: "进行中", done: "已完成" }[room.status] || room.status;

      var participants = room.participants ? JSON.parse(room.participants || "[]") : [];
      var avatarHtml = participants.slice(0, 4).map(function (role) {
        var e = empOf(role);
        return '<span title="' + esc(e.name) + '">' + e.emoji + '</span>';
      }).join("");
      if (participants.length > 4) {
        avatarHtml += '<span style="font-size:9px;background:rgba(255,255,255,.08)">+' + (participants.length - 4) + '</span>';
      }

      card.innerHTML =
        '<div class="room-top">' +
          '<div class="room-name">' + esc(room.name) + '</div>' +
          '<span class="room-status ' + esc(room.status) + '">' + esc(statusText) + '</span>' +
        '</div>' +
        '<div class="room-topic">' + esc(room.topic || "（无议题）") + '</div>' +
        '<div class="room-meta">' +
          '<div class="room-avatars">' + avatarHtml + '</div>' +
          '<span>' + esc(fmtTime(room.updated_at || room.created_at)) + '</span>' +
        '</div>';

      card.addEventListener("click", function () {
        openRoom(room);
      });

      listEl.appendChild(card);
    });
  }

  /* ---------- 打开房间 ---------- */

  function openRoom(room) {
    curRoom = room;

    // 更新左侧选中状态
    document.querySelectorAll(".room-card").forEach(function (c) {
      c.classList.toggle("active", parseInt(c.dataset.id, 10) === room.id);
    });

    var pane = document.getElementById("discChatPane");
    if (!pane) return;

    var participants = room.participants ? JSON.parse(room.participants || "[]") : [];
    var participantAvatars = participants.map(function (role) {
      var e = empOf(role);
      return '<div class="p" title="' + esc(e.name) + ' · ' + esc(e.dept) + '">' + e.emoji + '</div>';
    }).join("");

    pane.innerHTML =
      // 头部
      '<div class="disc-head">' +
        '<div class="dh-main">' +
          '<div class="dh-name">' +
            esc(room.name) +
            '<span class="room-status ' + esc(room.status) + '" style="font-size:10px;padding:2px 8px">' +
              esc({ idle: "待开始", running: "进行中", done: "已完成" }[room.status] || room.status) +
            '</span>' +
            '<span class="dh-members-tag" title="参会成员">⚙️ ' + participants.length + '人</span>' +
          '</div>' +
          '<div class="dh-topic">' + esc(room.topic || "（无议题）") + '</div>' +
        '</div>' +
        '<div class="dh-participants">' + participantAvatars + '</div>' +
      '</div>' +
      // 消息区
      '<div class="disc-msgs" id="discMsgs">' +
        '<div class="disc-empty"><span class="big-emoji">⏳</span><b>加载讨论历史…</b>请稍候</div>' +
      '</div>' +
      // 输入区
      '<div class="disc-input-bar">' +
        '<textarea id="discInput" rows="1" placeholder="输入议题，点「开始研讨」让参会同事一起讨论…（Enter 发送 / Shift+Enter 换行）" ' +
          (room.status === "running" ? "disabled" : "") + '></textarea>' +
        '<button class="disc-start-btn" id="discStartBtn" ' +
          (room.status === "running" ? "disabled" : "") + '>' +
          (room.status === "done" ? "再来一次" : "开始研讨") +
        '</button>' +
      '</div>' +
      '<div class="disc-tip">💡 圆桌讨论由 AI 员工自主发言 · 历史自动保存 · 多房间并行不串</div>';

    el.msgs = pane.querySelector("#discMsgs");
    el.input = pane.querySelector("#discInput");
    el.startBtn = pane.querySelector("#discStartBtn");

    // 输入框自适应高度
    if (el.input) {
      el.input.addEventListener("input", function () {
        this.style.height = "auto";
        this.style.height = Math.min(this.scrollHeight, 120) + "px";
      });
      el.input.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" && !ev.shiftKey) {
          ev.preventDefault();
          startDiscussion();
        }
      });
    }

    if (el.startBtn) {
      el.startBtn.addEventListener("click", startDiscussion);
    }

    // 加载历史消息
    loadHistory(room.id);
  }

  function loadHistory(roomId) {
    if (!el.msgs) return;

    fetch(API + "/discussion/history?room_id=" + roomId, { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        var messages = data.messages || [];
        el.msgs.innerHTML = "";
        if (!messages.length) {
          el.msgs.innerHTML =
            '<div class="disc-empty">' +
              '<span class="big-emoji">🎯</span>' +
              '<b>开始一场圆桌讨论</b>' +
              '在下方输入议题，让参会的 AI 同事各抒己见<br>' +
              '<span style="opacity:.7;font-size:11.5px">小墨会在最后整理纪要</span>' +
            '</div>';
          return;
        }
        renderMessages(messages);
      })
      .catch(function () {
        // 红线：生产驾驶舱禁止 mock 历史；显示数据接入中
        if (PROD) {
          el.msgs.innerHTML = '<div class="disc-system">数据接入中，真实讨论需后端接口连接后发起</div>';
          return;
        }
        el.msgs.innerHTML = "";
        renderMessages(getMockMessages());
      });
  }

  /* ---------- 渲染消息列表 ---------- */

  var lastRound = 0;

  function renderMessages(messages) {
    lastRound = 0;
    messages.forEach(function (msg) {
      if (msg.node_type === "summary") {
        appendSummaryCard(msg);
      } else if (msg.node_type === "system") {
        appendSystemMsg(msg.content || "");
      } else {
        appendBubble(msg);
      }
    });
    scrollDown();
  }

  function appendBubble(msg) {
    if (!el.msgs) return;
    var role = msg.role || "unknown";
    var emp = empOf(role);

    // 轮次分隔
    if (msg.round && msg.round !== lastRound) {
      lastRound = msg.round;
      var divider = document.createElement("div");
      divider.className = "disc-round-divider";
      var label = msg.round === 1 ? "第一轮 · 各自表态" : "第二轮 · 互相挑刺";
      divider.innerHTML = '<span class="badge">' + label + '</span>';
      el.msgs.appendChild(divider);
    }

    var bubble = document.createElement("div");
    bubble.className = "disc-bubble " + esc(role);

    var parts = splitThink(msg.answer || msg.content || "");
    var answerHtml = miniMd(parts.answer || msg.answer || msg.content || "");
    var thinkHtml = "";
    if (parts.think || msg.think) {
      thinkHtml = '<div class="think"><b>💭 思考过程</b>' + esc(parts.think || msg.think || "") + '</div>';
    }

    var roundBadge = msg.round ? '<span class="b-round">R' + msg.round + '</span>' : "";

    bubble.innerHTML =
      '<div class="b-avatar">' + emp.emoji + '</div>' +
      '<div class="b-body">' +
        '<div class="b-meta">' +
          '<span class="b-name">' + esc(msg.role_name || emp.name) + '</span>' +
          '<span class="b-dept">' + esc(emp.dept) + '</span>' +
          roundBadge +
        '</div>' +
        '<div class="b-content">' + thinkHtml + answerHtml + '</div>' +
      '</div>';

    el.msgs.appendChild(bubble);
    scrollDown();
    return bubble;
  }

  function appendSummaryCard(msg) {
    if (!el.msgs) return;

    var content = msg.content || msg.answer || "";

    // 解析三段式纪要（简单的正则解析，兼容 markdown 格式）
    var consensus = extractSection(content, ["共识", "①共识", "① 共识"]);
    var disputes = extractSection(content, ["分歧", "②分歧点", "② 分歧点", "分歧点"]);
    var actions = extractSection(content, ["行动项", "③行动项", "③ 行动项建议", "行动项建议"]);

    var card = document.createElement("div");
    card.className = "disc-summary-card";

    card.innerHTML =
      '<div class="summary-header">' +
        '<div class="sh-icon">📝</div>' +
        '<div>' +
          '<div class="sh-title">小墨纪要 · 讨论总结</div>' +
          '<div class="sh-sub">' + (msg.role_name || "小墨") + '整理 · 共识 ' + consensus.items.length + ' 条 · 分歧 ' + disputes.items.length + ' 条 · 行动 ' + actions.items.length + ' 项</div>' +
        '</div>' +
      '</div>' +
      '<div class="summary-body">' +
        renderSummarySection("consensus", "✓ 共 识", consensus.items || []) +
        renderSummarySection("dispute", "⚡ 分歧点", disputes.items || []) +
        renderSummarySection("action", "🎯 行动项建议", actions.items || []) +
      '</div>';

    el.msgs.appendChild(card);
    scrollDown();
    return card;
  }

  function renderSummarySection(cls, title, items) {
    if (!items.length) return "";
    var lis = items.map(function (item) {
      // 提取 P0/P1/P2 标签
      var tag = "";
      var clean = item;
      var pMatch = item.match(/^P([0-3])/i);
      if (pMatch) {
        tag = '<span class="p-tag p' + pMatch[1] + '">P' + pMatch[1] + '</span>';
        clean = item.replace(/^P[0-3][（(]?[^）)]*[）)]?\s*[：:]?\s*/i, "").trim();
      }
      return "<li>" + tag + miniMd(clean) + "</li>";
    }).join("");
    return '<div class="summary-section ' + cls + '"><div class="ss-title">' + title + '</div><ul>' + lis + '</ul></div>';
  }

  function appendSystemMsg(text) {
    if (!el.msgs) return;
    var div = document.createElement("div");
    div.className = "disc-system";
    div.textContent = text;
    el.msgs.appendChild(div);
    scrollDown();
    return div;
  }

  // 从纪要文本中提取某个 section 的列表项
  function extractSection(text, possibleHeadings) {
    var lines = text.split("\n");
    var inSection = false;
    var items = [];
    var currentItem = "";

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;

      // 检查是否是目标标题
      var isHeading = false;
      for (var j = 0; j < possibleHeadings.length; j++) {
        if (line.indexOf(possibleHeadings[j]) >= 0 && /^[#\-\d\s]*[①②③]?\s*(##?|###?|【|共识|分歧|行动)/.test(line)) {
          isHeading = true;
          break;
        }
      }

      // 简化版：只要行包含关键词且后面有冒号或等号或换行跟着列表
      var foundHeading = false;
      for (var k = 0; k < possibleHeadings.length; k++) {
        var h = possibleHeadings[k];
        if (line.indexOf(h) >= 0 && line.length < 30) {
          foundHeading = true;
          break;
        }
      }

      if (foundHeading && !inSection) {
        inSection = true;
        continue;
      }

      if (inSection) {
        // 检查是否到了下一个大标题
        var nextSection = false;
        var allHeadings = ["共识", "分歧", "行动项", "待澄清", "风险"];
        for (var m = 0; m < allHeadings.length; m++) {
          if (possibleHeadings.indexOf(allHeadings[m]) >= 0) continue; // 跳过自己
          if (line.indexOf(allHeadings[m]) >= 0 && line.length < 30) {
            nextSection = true;
            break;
          }
        }
        if (nextSection) break;

        // 列表项
        if (/^[-•*]\s+/.test(line) || /^\d+[.、]\s+/.test(line)) {
          if (currentItem) items.push(currentItem);
          currentItem = line.replace(/^[-•*]\s+/, "").replace(/^\d+[.、]\s+/, "");
        } else if (/^\s+/.test(lines[i]) && currentItem) {
          // 续行
          currentItem += " " + line;
        } else if (currentItem) {
          // 可能是下一个 section 了，或者是缩进内容
          if (line.length > 40) {
            currentItem += " " + line;
          } else {
            break;
          }
        }
      }
    }
    if (currentItem) items.push(currentItem);

    return { items: items };
  }

  function scrollDown() {
    if (el.msgs) {
      el.msgs.scrollTop = el.msgs.scrollHeight;
    }
  }

  /* ---------- 发起讨论 ---------- */

  function startDiscussion() {
    if (!curRoom || busy) return;
    var topic = (el.input && el.input.value || "").trim() || curRoom.topic;
    if (!topic) {
      if (el.input) el.input.focus();
      return;
    }

    busy = true;
    if (el.input) el.input.disabled = true;
    if (el.startBtn) {
      el.startBtn.disabled = true;
      el.startBtn.textContent = "讨论中…";
    }

    // 清空消息区或追加"开始"系统消息
    if (el.msgs) {
      // 如果是"再来一次"，清空历史（实际后端会新建消息序列，前端只追加系统消息）
      appendSystemMsg("📢 讨论开始 · 议题：" + topic);
    }

    lastRound = 0;

    fetch(API + "/discussion/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room_id: curRoom.id, topic: topic })
    })
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        if (!response.body) throw new Error("无流式响应");

        var reader = response.body.getReader();
        var decoder = new TextDecoder();
        var buf = "";

        // 当前正在接收的节点
        var currentNode = null;
        var currentBubble = null;
        var currentThink = "";
        var currentAnswer = "";
        var inThink = null; // null=未判定, true=思考中, false=正文中

        function feed(text) {
          if (!currentBubble || !currentNode) return;
          var ansEl = currentBubble.querySelector(".ans");
          var thinkEl = currentBubble.querySelector(".think");

          var raw = (currentNode._raw || "") + text;
          currentNode._raw = raw;

          if (inThink === null) {
            if (/^\s*<think>/.test(raw)) {
              inThink = true;
            } else if (raw.indexOf("<think>") >= 0) {
              inThink = true;
            } else if (raw.replace(/\s/g, "").length >= 6) {
              inThink = false;
              currentAnswer = raw;
              if (ansEl) ansEl.innerHTML = miniMd(currentAnswer);
              scrollDown();
              return;
            } else {
              return;
            }
          }

          if (inThink) {
            var endIdx = raw.indexOf("</think>");
            if (endIdx >= 0) {
              inThink = false;
              currentThink = raw.slice(0, endIdx);
              currentAnswer = raw.slice(endIdx + 8).replace(/^\s+/, "");
              if (thinkEl) {
                thinkEl.style.display = "";
                thinkEl.innerHTML = "<b>💭 思考过程</b>" + esc(cleanThink(currentThink));
              }
              if (ansEl) ansEl.innerHTML = miniMd(currentAnswer);
            } else {
              if (thinkEl) {
                thinkEl.style.display = "";
                thinkEl.innerHTML = "<b>💭 思考中…</b>" + esc(cleanThink(raw));
              }
            }
          } else {
            currentAnswer += text;
            if (ansEl) ansEl.innerHTML = miniMd(currentAnswer);
          }
          scrollDown();
        }

        function processFrame(frame) {
          var ev = "", data = "";
          frame.split("\n").forEach(function (ln) {
            if (ln.indexOf("event:") === 0) ev = ln.slice(6).trim();
            else if (ln.indexOf("data:") === 0) data = ln.slice(5).trim();
          });
          if (!ev || !data) return;

          var o = {};
          try { o = JSON.parse(data); } catch (e) { return; }

          if (ev === "node_start") {
            // 新节点开始
            currentNode = o;
            inThink = null;
            currentThink = "";
            currentAnswer = "";
            currentNode._raw = "";

            if (o.node_type === "summary") {
              // 纪要节点：后面用 summary_end 处理
            } else {
              // 普通发言节点：创建气泡
              currentBubble = appendBubble({
                role: o.role,
                role_name: o.role_name,
                round: o.round,
                node_type: o.node_type || "speaker",
                content: ""
              });
              // 加光标
              var ansDiv = currentBubble.querySelector(".b-content");
              if (ansDiv) {
                ansDiv.innerHTML = '<div class="think" style="display:none"></div><span class="ans"></span><span class="cursor"></span>';
              }
            }

          } else if (ev === "token") {
            // 流式 token
            feed(o.text || "");

          } else if (ev === "node_end") {
            // 节点结束
            if (currentBubble) {
              var cur = currentBubble.querySelector(".cursor");
              if (cur) cur.remove();
              // 确保最终内容渲染
              var ansEl = currentBubble.querySelector(".ans");
              if (ansEl && currentAnswer) {
                ansEl.innerHTML = miniMd(currentAnswer);
              }
            }
            currentNode = null;
            currentBubble = null;

          } else if (ev === "summary_start") {
            // 纪要开始
            currentNode = { node_type: "summary" };
            currentNode._raw = "";
            inThink = false;
            currentAnswer = "";
            // 创建一个占位卡片
            var card = document.createElement("div");
            card.className = "disc-summary-card";
            card.id = "liveSummaryCard";
            card.innerHTML =
              '<div class="summary-header">' +
                '<div class="sh-icon">📝</div>' +
                '<div><div class="sh-title">小墨纪要 · 整理中</div>' +
                '<div class="sh-sub">正在汇总讨论结论…</div></div>' +
              '</div>' +
              '<div class="summary-body"><div class="summary-section"><div class="ss-title consensus">✓ 共 识</div><ul><li style="list-style:none;color:var(--text-dim)">整理中… <span class="cursor"></span></li></ul></div></div>';
            if (el.msgs) el.msgs.appendChild(card);
            currentBubble = card;
            scrollDown();

          } else if (ev === "summary_token") {
            // 纪要流式（简单起见，最后完整渲染，这里不做流式）
            currentAnswer += o.text || "";

          } else if (ev === "summary_end") {
            // 纪要完成
            var liveCard = document.getElementById("liveSummaryCard");
            if (liveCard) liveCard.remove();
            appendSummaryCard({
              role: "xiaomo",
              role_name: o.role_name || "小墨",
              content: o.content || currentAnswer,
              node_type: "summary"
            });
            currentNode = null;
            currentBubble = null;

          } else if (ev === "error") {
            appendSystemMsg("❌ 出错：" + (o.message || "未知错误"));
            busy = false;
            if (el.startBtn) {
              el.startBtn.disabled = false;
              el.startBtn.textContent = "重试";
            }
            if (el.input) el.input.disabled = false;

          } else if (ev === "done") {
            // 全部完成
            busy = false;
            if (el.startBtn) {
              el.startBtn.disabled = false;
              el.startBtn.textContent = "再来一次";
            }
            if (el.input) el.input.disabled = false;
            appendSystemMsg("✅ 讨论结束");
            // 刷新房间状态
            loadRooms();
          }
        }

        return reader.read().then(function processResult(result) {
          if (result.done) return;
          buf += decoder.decode(result.value, { stream: true });
          var idx;
          while ((idx = buf.indexOf("\n\n")) >= 0) {
            var frame = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            try { processFrame(frame); } catch (e) { console.error("SSE frame error:", e); }
          }
          return reader.read().then(processResult);
        });
      })
      .catch(function (err) {
        busy = false;
        if (el.startBtn) {
          el.startBtn.disabled = false;
          el.startBtn.textContent = "开始研讨";
        }
        if (el.input) el.input.disabled = false;
        appendSystemMsg("❌ 讨论发起失败：" + err.message);
      });
  }

  /* ================================================================
     第三部分：新建研讨室弹窗
     ================================================================ */

  function openNewRoomModal() {
    // 重置状态
    modalStep = 1;
    modalParticipants = DEFAULT_PARTICIPANTS.slice();

    // 如果已存在，直接显示
    var existing = document.getElementById("newRoomModal");
    if (existing) {
      existing.style.display = "";
      resetModalForm();
      updateModalStep();
      return;
    }

    // 创建 modal
    var mask = document.createElement("div");
    mask.className = "modal-mask";
    mask.id = "newRoomModal";
    mask.innerHTML =
      '<div class="modal-box">' +
        '<div class="modal-header">' +
          '<div class="mh-title">✨ 新建研讨室</div>' +
          '<div class="mh-close" id="modalClose">✕</div>' +
        '</div>' +
        // 步骤指示器
        '<div class="modal-steps">' +
          '<div class="step-dot active" id="stepDot1">1</div>' +
          '<div class="step-line" id="stepLine1"></div>' +
          '<div class="step-dot" id="stepDot2">2</div>' +
        '</div>' +
        // 第一步：基本信息
        '<div class="modal-step" id="modalStep1">' +
          '<div class="form-group">' +
            '<label>房间名称 <span class="hint">（必填）</span></label>' +
            '<input type="text" id="modalRoomName" placeholder="如：Q4产品路线图研讨">' +
            '<div class="error" id="modalNameError"></div>' +
          '</div>' +
          '<div class="form-group">' +
            '<label>研讨议题 <span class="hint">（可选，也可以进去再输入）</span></label>' +
            '<textarea id="modalTopic" rows="3" placeholder="描述一下要讨论的问题…"></textarea>' +
          '</div>' +
        '</div>' +
        // 第二步：选择成员
        '<div class="modal-step hidden" id="modalStep2">' +
          '<div style="font-size:12px;color:var(--text-soft);margin-bottom:10px;font-weight:600">选择参会成员</div>' +
          '<div class="employee-grid" id="empGrid">' + buildEmployeeGrid() + '</div>' +
          '<div class="selected-footer">' +
            '<div class="sf-count">已选 <b id="selCount">' + modalParticipants.length + '</b> 人</div>' +
            '<div class="sf-hint">最少 2 人 · 小墨自动加入</div>' +
          '</div>' +
        '</div>' +
        // 底部按钮
        '<div class="modal-footer">' +
          '<div class="mf-left">' +
            '<button class="btn" id="modalCancel">取消</button>' +
            '<button class="btn" id="modalPrev" style="display:none">← 上一步</button>' +
          '</div>' +
          '<div class="mf-right">' +
            '<button class="btn btn-primary" id="modalNext">下一步 →</button>' +
            '<button class="btn btn-primary" id="modalCreate" style="display:none" disabled>创建研讨室</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(mask);

    // 绑定事件
    mask.querySelector("#modalClose").addEventListener("click", closeModal);
    mask.querySelector("#modalCancel").addEventListener("click", closeModal);
    mask.addEventListener("click", function (e) {
      if (e.target === mask) closeModal();
    });

    mask.querySelector("#modalPrev").addEventListener("click", function () {
      modalStep = 1;
      updateModalStep();
    });

    mask.querySelector("#modalNext").addEventListener("click", function () {
      var nameInput = mask.querySelector("#modalRoomName");
      var name = nameInput.value.trim();
      var errEl = mask.querySelector("#modalNameError");
      if (!name) {
        errEl.textContent = "请输入房间名称";
        nameInput.focus();
        return;
      }
      errEl.textContent = "";
      modalStep = 2;
      updateModalStep();
    });

    mask.querySelector("#modalCreate").addEventListener("click", createRoom);

    // 员工卡片点击
    mask.querySelectorAll(".emp-select-card").forEach(function (card) {
      card.addEventListener("click", function () {
        if (this.classList.contains("disabled")) return;
        var role = this.dataset.role;
        var idx = modalParticipants.indexOf(role);
        if (idx >= 0) {
          modalParticipants.splice(idx, 1);
          this.classList.remove("selected");
          this.querySelector(".emp-check").textContent = "";
        } else {
          modalParticipants.push(role);
          this.classList.add("selected");
          this.querySelector(".emp-check").textContent = "✓";
        }
        updateSelectedCount();
      });
    });

    // ESC 关闭
    document.addEventListener("keydown", function escHandler(e) {
      if (e.key === "Escape") {
        closeModal();
        document.removeEventListener("keydown", escHandler);
      }
    });

    updateModalStep();
    // 自动聚焦
    setTimeout(function () {
      var input = mask.querySelector("#modalRoomName");
      if (input) input.focus();
    }, 100);
  }

  function buildEmployeeGrid() {
    return EMPLOYEE_ROSTER.map(function (emp) {
      var isSelected = modalParticipants.indexOf(emp.role) >= 0;
      var isMinutes = emp.is_minutes;
      var disabled = isMinutes ? " disabled" : "";
      var selected = isSelected ? " selected" : "";
      var badge = isMinutes ? '<div class="emp-badge">纪要员</div>' : "";
      return (
        '<div class="emp-select-card' + selected + disabled + '" data-role="' + emp.role + '">' +
          '<div class="emp-avatar">' + emp.emoji + '</div>' +
          '<div class="emp-info">' +
            '<div class="emp-name">' + emp.name + '</div>' +
            '<div class="emp-dept">' + emp.dept + ' · ' + emp.role_name + '</div>' +
          '</div>' +
          '<div class="emp-check">' + (isSelected ? "✓" : "") + '</div>' +
          badge +
        '</div>'
      );
    }).join("");
  }

  function updateModalStep() {
    var mask = document.getElementById("newRoomModal");
    if (!mask) return;

    mask.querySelector("#modalStep1").classList.toggle("hidden", modalStep !== 1);
    mask.querySelector("#modalStep2").classList.toggle("hidden", modalStep !== 2);

    var dot1 = mask.querySelector("#stepDot1");
    var dot2 = mask.querySelector("#stepDot2");
    var line1 = mask.querySelector("#stepLine1");

    dot1.className = "step-dot" + (modalStep >= 1 ? " active" : "");
    dot2.className = "step-dot" + (modalStep >= 2 ? " active" : "");
    line1.className = "step-line" + (modalStep >= 2 ? " done" : "");

    mask.querySelector("#modalPrev").style.display = modalStep === 2 ? "" : "none";
    mask.querySelector("#modalNext").style.display = modalStep === 1 ? "" : "none";
    mask.querySelector("#modalCreate").style.display = modalStep === 2 ? "" : "none";

    updateSelectedCount();
  }

  function updateSelectedCount() {
    var countEl = document.getElementById("selCount");
    if (countEl) countEl.textContent = modalParticipants.length;
    var createBtn = document.getElementById("modalCreate");
    if (createBtn) {
      createBtn.disabled = modalParticipants.length < 2;
    }
  }

  function resetModalForm() {
    var mask = document.getElementById("newRoomModal");
    if (!mask) return;
    mask.querySelector("#modalRoomName").value = "";
    mask.querySelector("#modalTopic").value = "";
    mask.querySelector("#modalNameError").textContent = "";
    modalParticipants = DEFAULT_PARTICIPANTS.slice();
    // 重置卡片选中状态
    mask.querySelectorAll(".emp-select-card").forEach(function (card) {
      var role = card.dataset.role;
      var isSelected = modalParticipants.indexOf(role) >= 0;
      card.classList.toggle("selected", isSelected);
      var check = card.querySelector(".emp-check");
      if (check) check.textContent = isSelected ? "✓" : "";
    });
    modalStep = 1;
  }

  function closeModal() {
    var mask = document.getElementById("newRoomModal");
    if (mask) mask.style.display = "none";
  }

  function createRoom() {
    var mask = document.getElementById("newRoomModal");
    var name = mask.querySelector("#modalRoomName").value.trim();
    var topic = mask.querySelector("#modalTopic").value.trim();

    if (!name) return;

    var createBtn = mask.querySelector("#modalCreate");
    createBtn.disabled = true;
    createBtn.textContent = "创建中…";

    fetch(API + "/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name,
        topic: topic,
        participants: modalParticipants
      })
    })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (room) {
        closeModal();
        loadRooms();
        // 自动打开新房间
        setTimeout(function () {
          openRoom(room);
        }, 200);
      })
      .catch(function (err) {
        // 后端未就绪时，前端 mock 创建（仅用于开发调试）
        var newRoom = {
          id: Date.now(),
          name: name,
          topic: topic,
          status: "idle",
          participants: JSON.stringify(modalParticipants),
          created_at: new Date().toISOString().replace("T", " ").slice(0, 19),
          updated_at: new Date().toISOString().replace("T", " ").slice(0, 19),
          node_count: 0,
          has_summary: 0
        };
        rooms.unshift(newRoom);
        renderRoomList();
        closeModal();
        appendSystemMsg("ℹ️ 原型模式：房间已创建（后端 API 未就绪，讨论功能暂不可用）");
        openRoom(newRoom);
      })
      .finally(function () {
        createBtn.disabled = false;
        createBtn.textContent = "创建研讨室";
      });
  }

  /* ================================================================
     第四部分：Mock 数据（后端未就绪时的前端调试用）
     ================================================================ */

  function getMockRooms() {
    return [
      {
        id: 1, name: "周末团建去哪", topic: "部门周末团建选什么地方、什么形式？预算每人500以内。",
        status: "done", participants: '["bohu","xiaoming","ruhua","xiaoqiang","xiaomo"]',
        created_at: "2026-09-12 21:00:00", updated_at: "2026-09-12 21:25:00",
        node_count: 9, has_summary: 1
      },
      {
        id: 2, name: "智慧城市二期投标", topic: "重庆某区智慧城市二期1800万，打不打、怎么打？",
        status: "done", participants: '["bohu","xiaoming","ruhua","xiaoqiang","xiaomo"]',
        created_at: "2026-09-10 13:31:00", updated_at: "2026-09-10 13:55:00",
        node_count: 9, has_summary: 1
      },
      {
        id: 3, name: "AI办公盒子营销", topic: "新款企业级AI办公盒子下月上市，社媒营销内容怎么策划？",
        status: "done", participants: '["bohu","xiaoming","ruhua","xiaoqiang","xiaomo"]',
        created_at: "2026-09-10 14:10:00", updated_at: "2026-09-10 14:34:00",
        node_count: 9, has_summary: 1
      },
      {
        id: 4, name: "Q4 产品路线图", topic: "Q4 产品迭代优先级怎么排？AI 办公盒子 vs 巡店系统 v2。",
        status: "idle", participants: '["bohu","xiaoqiang","xiaomo"]',
        created_at: "2026-09-11 10:00:00", updated_at: "2026-09-11 10:00:00",
        node_count: 0, has_summary: 0
      }
    ];
  }

  function getMockMessages() {
    return [
      { role: "bohu", role_name: "伯虎", round: 1, node_type: "speaker",
        think: "团建的核心目标是什么？是放松还是凝聚团队？预算每人500，按10人算就是5000。考虑到大家平时加班多，应该选能真正放松的地方。",
        answer: "我建议选近郊的民宿包栋，不要搞那种团建公司的拓展项目。原因有三：\n\n第一，大家平时对着电脑够累了，周末就该找个能躺平的地方，烧烤＋桌游＋发呆就行。\n\n第二，民宿包栋自由度高，想睡懒觉的睡懒觉，想聊天的聊天，不强制参加所有活动。\n\n第三，预算够。近郊民宿10人两晚大概3000-4000，剩下的钱搞烧烤＋采购，500每人预算完全打得住。" },
      { role: "xiaoming", role_name: "小明", round: 1, node_type: "speaker",
        think: "伯虎说的民宿太佛系了，团建还是要有点团队建设的感觉吧？不然跟在家待着有什么区别...",
        answer: "我不同意伯虎的民宿方案。团建的目的不只是放松，更重要的是破冰和团队融合。\n\n民宿包栋最后就是几个人凑一起玩手机，跟在公司没区别。我建议搞户外运动类的——比如漂流＋露营，或者攀岩＋烧烤。\n\n一起经历点有点挑战性但又不危险的活动，团队凝聚力提升才明显。预算方面，漂流人均200多，露营人均100多，加吃饭正好500以内打住。" },
      { role: "ruhua", role_name: "如花", round: 1, node_type: "speaker",
        think: "两个方案都有道理，但都不够有记忆点。要不要搞主题派对？我可以负责视觉...",
        answer: "我有个不同的想法——咱们搞「主题派对」怎么样？\n\n不用跑远，就租个市区的 loft 或者轰趴馆，搞一个复古Disco主题或者复古游戏主题，大家穿主题服装来，拍照超出片。\n\n好处：不用开车两小时、不怕天气不好、老人小孩也能参加、预算好控制。轰趴馆场地费＋餐饮＋装饰道具，人均300-400够了。\n\n关键是仪式感拉满，我可以负责视觉物料和布置，设计室出图很快的。" },
      { role: "xiaoqiang", role_name: "小强", round: 1, node_type: "speaker",
        think: "三个人三个方案，我从执行角度说几个实际问题吧...",
        answer: "我从执行角度说几个问题：\n\n第一，民宿包栋的话，10个人需要至少5间房，好一点的民宿周末很抢手，得提前两周以上订。\n\n第二，漂流＋露营，咱们团队里有几个人会搭帐篷？露营装备谁出？如果要租的话成本上去了，而且万一遇上下雨就全泡汤。\n\n第三，轰趴馆我支持——室内、不受天气影响、设施齐全、不用提前准备太多东西。但如花说的主题派对，布置和服装会不会增加大家的负担？\n\n我的建议：先搞个投票，三个方案让大家选，少数服从多数。" },
      { role: "xiaomo", role_name: "小墨", node_type: "summary",
        content: "## ① 共识\n\n1. 不搞高强度拓展训练，团建以放松和交流为主\n2. 轰趴馆是最稳妥的底案：不受天气影响、预算可控、设施齐全\n3. 不搞强制主题/服装，提供道具自愿参与\n\n## ② 分歧点\n\n1. 户外活动要不要加：小明主张白天加户外项目增加记忆点，伯虎小强担心超预算＋有人身体原因参加不了\n2. 过夜不过夜：伯虎倾向住一晚（深度交流），如花小强建议不过夜（自由度高）\n\n## ③ 行动项建议\n\n**P0** 小强：本周内出3个轰趴馆备选（市区、人均300以内、含餐饮＋KTV＋桌游）\n**P0** 小明：发匿名投票（轰趴馆 / 民宿 / 户外＋轰趴二选一），周三前截止\n**P1** 如花：准备拍照道具＋背景板＋交换礼物环节物料，预算控制在300以内\n**P2** 伯虎：确认最终预算上限和可参加人数，周五前锁定场地" }
    ];
  }

  /* ================================================================
     启动
     ================================================================ */

  function mountDiscussionTo(mount) {
    if (!mount) return false;
    if (!mount.querySelector("#tabDiscussion")) {
      var pane = document.createElement("div");
      pane.id = "tabDiscussion";
      pane.className = "tab-pane active";
      mount.appendChild(pane);
    }
    discussionInited = false;
    initDiscussion();
    return true;
  }
  window.__mountDiscussion = function () {
    var mount = document.getElementById("discussion-mount");
    return mount ? mountDiscussionTo(mount) : false;
  };
  function boot() {
    // 优先：生产驾驶舱研讨室页独立挂载（#discussion-mount）
    if (window.__mountDiscussion && window.__mountDiscussion()) return;
    // 兜底：v070 员工模块 Tab 注入（hall.js 可能后执行）
    var tryInject = function () {
      var viewEl = document.getElementById("view-employees");
      if (viewEl && viewEl.querySelector(".hall-wrap")) {
        injectTabs();
      } else {
        setTimeout(tryInject, 500);
      }
    };
    tryInject();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  /* ================================================================
     后端接口约定（旺财施工参照）
     ================================================================
  GET  /api/rooms                  → { rooms: [{id,name,topic,status,participants,created_at,updated_at,node_count,has_summary}] }
  POST /api/rooms                  → { id, name, topic, status, participants, created_at, updated_at }
  GET  /api/rooms/:id              → { id, name, topic, ... }
  POST /api/discussion/run         → SSE 流（event: node_start/token/node_end/summary_start/summary_token/summary_end/error/done）
  GET  /api/discussion/history?room_id=X  → { room_id, messages: [{id,role,role_name,round,node_type,content,think,answer,emoji,dept,created_at}] }
  ================================================================ */

})();
