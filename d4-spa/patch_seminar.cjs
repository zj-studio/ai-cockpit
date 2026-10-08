const fs = require('fs');
const f = 'app.js';
let s = fs.readFileSync(f, 'utf8');

const startMark = 'RENDER.seminar=function(){';
const endMark = 'renderRoute();';
const i0 = s.indexOf(startMark);
const i1 = s.indexOf(endMark);
if (i0 < 0 || i1 < 0 || i1 <= i0) { console.error('markers not found', i0, i1); process.exit(1); }
const head = s.slice(0, i0);
const tail = s.slice(i1);

const newFn = RENDER.seminar=function(){
  var sessions=loadSeminarSessions();
  var cfg=seminarCfg();
  var pg=#page-seminar;
  pg.innerHTML='<div class="phead"><h2><span class="barline"></span>项目研讨室</h2>'+
    '<div class="crumb">'+esc(cfg.project)+' · '+esc(cfg.topic)+' · 多员工协同研讨'+(cfg.id?" · 自定义会话":" · 示例回放")+'</div>'+
    '<button class="btn-pass" style="padding:7px 15px;border-radius:10px;cursor:pointer;flex:none" id="newSeminar">＋ 新建研讨</button></div>'+
    '<div class="sem-tabs" id="semTabs">'+
      '<button class="sem-tab on" data-tab="free">自由研讨</button>'+
      '<button class="sem-tab" data-tab="chat">微信群聊</button>'+
    '</div>'+
    '<div class="sem-pane" id="semPaneFree"><div class="seminar-layout"><div class="seminar-stage" id="semStage"></div>'+
    '<div class="sem-side" id="semSide"></div></div></div>'+
    '<div class="sem-pane" id="semPaneChat" style="display:none"><div id="discussion-mount"></div></div>';
  var stage=#semStage;
  cfg.messages.forEach(function(m){
    if(m.sys){
      var b=el("div","sem-sys"); b.textContent=m.text;
      stage.appendChild(b); return;
    }
    var s=staffById(m.who);
    if(!s) return;
    var w=el("div","sem-speaker");
    w.innerHTML='<span class="sem-ava">'+realAvatar(s)+"</span>"+
      '<div class="sem-card"><div class="sem-who">'+s.full+"</div>"+esc(m.text)+"</div>";
    stage.appendChild(w);
  });
  var side=#semSide;
  side.innerHTML="<h4>参会成员 · "+cfg.participants.length+" 人</h4>";
  cfg.participants.forEach(function(id){
    var s=staffById(id);
    var p=el("div","participant");
    p.innerHTML='<span class="s-ava" style="width:26px;height:26px;border-radius:8px">'+realAvatar(s)+"</span>"+
      s.name+'<i style="background:var(--green)"></i>';
    p.onclick=function(){staffModal(s)};
    side.appendChild(p);
  });
  if(sessions.length){
    side.insertAdjacentHTML("beforeend",'<h4 style="margin-top:16px">历史研讨</h4>');
    sessions.slice().reverse().forEach(function(se){
      var r=el("div","sem-hist"+(se.id===cfg.id?" on":""));
      r.innerHTML='<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(se.project)+' · '+esc(se.topic)+'</span>'+
        '<span style="font-size:10px;color:var(--txt-3);flex:none">'+esc((se.time||"").slice(5))+"</span>";
      r.onclick=function(){CUR_SEMINAR=se.id;RENDER.seminar();};
      side.appendChild(r);
    });
  }
  side.insertAdjacentHTML("beforeend",
    '<button class="btn-pass" style="width:100%;margin-top:18px;padding:10px;border-radius:10px;cursor:pointer" id="genMinute">生成研讨纪要</button>');
  #newSeminar.onclick=openSeminarCreator;
  #genMinute.onclick=openSeminarMinute;
  function semTab(name){
    var free=#semPaneFree, chat=#semPaneChat;
    if(free) free.style.display = name==="free" ? "" : "none";
    if(chat) chat.style.display = name==="chat" ? "" : "none";
    document.querySelectorAll("#semTabs .sem-tab").forEach(function(b){ b.classList.toggle("on", b.dataset.tab===name); });
    if(name==="chat" && window.__mountDiscussion) window.__mountDiscussion();
  }
  document.querySelectorAll("#semTabs .sem-tab").forEach(function(b){
    b.onclick=function(){ semTab(b.dataset.tab); };
  });
  semTab("chat");
};

;

fs.writeFileSync(f, head + newFn + tail);
console.log('replaced OK, bytes', Buffer.byteLength(newFn, 'utf8'));
