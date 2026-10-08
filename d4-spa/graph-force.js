/* 知识图谱 · 核心放射星图 v18（Canvas 2D，零依赖，Obsidian 手感）
 * 结构：唯一中心「知识总库」+ 全部知识点为等大小星点；每点仅一条连到中心的边，
 *       无任何其它节点间分支。
 * 手感：对齐 Obsidian graph view —— 拖拽节点跟手、松手弹性回弹；滚轮缩放、空白平移；
 *       放大到阈值才出标签、悬停看标签。
 * 数据：galaxy.json（362 条知识）。
 */
(function () {
  'use strict';
  var MOUNT = 'galaxyMount';
  var ROOT_COLOR = 'rgba(238,244,255,1)';
  var NODE_COLOR = 'rgba(205,214,230,0.94)';
  var NODE_HOVER = 'rgba(252,254,255,1)';
  var EDGE_COLOR = 'rgba(168,175,190,0.16)';
  var EDGE_HOVER = 'rgba(228,236,252,0.6)';
  var LABEL_THRESHOLD = 1.06;
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];});}
  function h32(v){v=String(v||'');var h=2166136261;for(var i=0;i<v.length;i++){h^=v.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0)/4294967296;}

  window.__startGraphForce = function () {
    var mount = document.getElementById(MOUNT);
    if (!mount) return false;
    if (mount.dataset.gfInit) return true;
    mount.dataset.gfInit = '1';
    var olds = mount.querySelectorAll('canvas');
    for (var oi = 0; oi < olds.length; oi++) { if (olds[oi] && olds[oi].parentNode) olds[oi].parentNode.removeChild(olds[oi]); }

    var data = window.__GALAXY_DATA__ || { nodes: [], edges: [] };
    var src = data.nodes || [];
    var rootLabel = data.rootLabel || '知识总库';

    var canvas = document.createElement('canvas');
    canvas.style.cssText = 'width:100%;height:100%;display:block;background:transparent;cursor:grab;touch-action:none';
    var ctx = canvas.getContext('2d');
    mount.appendChild(canvas);

    var W = 1, H = 1, DPR = 1;
    function size(){
      DPR = Math.max(1, window.devicePixelRatio || 1);
      W = mount.clientWidth || window.innerWidth;
      H = mount.clientHeight || window.innerHeight;
      canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      warm();
    }
    window.__galaxyResize = size;

    // ---- 节点：唯一中心 + 全部等大小星点 ----
    var nodes = [], byId = {}, edges = [];
    function mk(o){ o.r = o.r || 2.4; o.x=0;o.y=0;o.vx=0;o.vy=0;o.fx=0;o.fy=0;o.home=[0,0];o.homeR=0;return o; }
    var root = mk({ id:'__ROOT__', label:rootLabel, isRoot:true, r:7 });
    nodes.push(root); byId[root.id] = root;
    var dots = [];
    src.forEach(function (s, i) {
      var n = mk({ id:s.id || ('n'+i), label:(s.display_name||s.doc||s.id), doc:s.doc||'', preview:s.preview||'', dataset:s.dataset||'' });
      nodes.push(n); byId[n.id] = n; dots.push(n);
    });
    var N = nodes.length;
    var linkMap = {};
    dots.forEach(function (n) { edges.push({ a:root, b:n }); linkMap[n.id] = 1; });
    var E = edges.length;

    // ---- 同心环布局：点绕中心分布，越外层越密 ----
    var RINGS = 12;
    function planRings(){
      var maxR = Math.min(W, H) * 0.44;
      var r0 = maxR * 0.22, gap = (maxR - r0) / Math.max(1, RINGS - 1);
      var per = [], total = 0;
      for (var ri = 0; ri < RINGS; ri++) { var c = Math.round(2 * Math.PI * (ri + 0.5)); per.push(c); total += c; }
      var idx = 0, n = dots.length;
      for (ri = 0; ri < RINGS; ri++) {
        var cnt = Math.max(1, Math.round(n * per[ri] / total));
        var rad = r0 + ri * gap;
        for (var j = 0; j < cnt && idx < n; j++, idx++) {
          var ang = (j + 0.5) / cnt * Math.PI * 2 + ri * 0.6 + (h32(dots[idx].id) * 0.5 - 0.25);
          var rr = rad * (0.9 + h32(dots[idx].id + ':r') * 0.2);
          dots[idx].home = [Math.cos(ang) * rr, Math.sin(ang) * rr];
          dots[idx].homeR = rr;
        }
      }
      for (; idx < n; idx++) {
        var a2 = h32(dots[idx].id) * Math.PI * 2;
        var rr2 = maxR * (0.96 + h32(dots[idx].id + ':q') * 0.08);
        dots[idx].home = [Math.cos(a2) * rr2, Math.sin(a2) * rr2];
        dots[idx].homeR = rr2;
      }
    }

    // ---- 力学：弹簧回 home + 轻斥力 + 阻尼（Obsidian 弹性手感）----
    var SPRING_K = 0.16, REP = 380, DAMP = 0.84, MAXF = 2.6, RC_MIN = 0.82, RC_MAX = 1.25;
    var DRAG_K = 0.085, DRAG_DAMP = 0.932, DRAG_MAXF = 1.05, RAD_K = 0.05, REST_V = 0.3;
    function step(){
      var i, j, n, m, dx, dy, d, f;
      for (i = 0; i < N; i++) { nodes[i].fx = 0; nodes[i].fy = 0; }
      for (i = 0; i < N; i++) {
        n = nodes[i];
        for (j = i + 1; j < N; j++) {
          m = nodes[j];
          dx = n.x - m.x; dy = n.y - m.y; d = Math.sqrt(dx * dx + dy * dy) || 0.01;
          if (d > 60) continue;
          f = REP / (d * d);
          dx /= d; dy /= d;
          n.fx += dx * f; n.fy += dy * f; m.fx -= dx * f; m.fy -= dy * f;
        }
      }
      for (i = 0; i < N; i++) {
        n = nodes[i];
        var KK = dragNode ? DRAG_K : SPRING_K;
        n.fx += (root.x + n.home[0] - n.x) * KK;
        n.fy += (root.y + n.home[1] - n.y) * KK;
        if (!n.isRoot) {
          var arx = n.x - root.x, ary = n.y - root.y;
          var arr = Math.sqrt(arx * arx + ary * ary) || 0.01;
          var alo = n.homeR * RC_MIN, ahi = n.homeR * RC_MAX;
          var aov = (arr < alo) ? (alo - arr) : (arr > ahi ? -(arr - ahi) : 0);
          if (aov) { n.fx += arx / arr * aov * RAD_K; n.fy += ary / arr * aov * RAD_K; }
        }
      }
      for (i = 0; i < N; i++) {
        n = nodes[i];
        if (dragNode === n) continue;
        if (n.isRoot) { n.x = 0; n.y = 0; n.vx = 0; n.vy = 0; continue; }
        var sx = n.fx, sy = n.fy, md = Math.sqrt(sx * sx + sy * sy);
        var dmN = dragNode ? DRAG_DAMP : DAMP, mxN = dragNode ? DRAG_MAXF : MAXF;
        if (md > mxN) { sx = sx / md * mxN; sy = sy / md * mxN; }
        n.vx = n.vx * dmN + sx; n.vy = n.vy * dmN + sy;
        if (!dragNode && (n.vx * n.vx + n.vy * n.vy) < REST_V * REST_V) { n.vx = 0; n.vy = 0; }
        n.x += n.vx; n.y += n.vy;
      }
    }
    function warm(){
      planRings();
      for (var i = 0; i < N; i++) {
        var n = nodes[i];
        if (n.isRoot) { n.x = 0; n.y = 0; } else { n.x = n.home[0] + (h32(n.id+':w') - 0.5) * 8; n.y = n.home[1] + (h32(n.id+':v') - 0.5) * 8; }
        n.vx = 0; n.vy = 0;
      }
    }

    // ---- 相机与交互 ----
    var cam = { z:1.0, x:0, y:0 };
    function SX(wx){ return (wx - cam.x) * cam.z + W / 2; }
    function SY(wy){ return (wy - cam.y) * cam.z + H / 2; }
    function WX(sx){ return (sx - W / 2) / cam.z + cam.x; }
    function WY(sy){ return (sy - H / 2) / cam.z + cam.y; }

    var hover = null, sel = null, dragNode = null, panning = false, moved = false, down = false, px0 = 0, py0 = 0, sx0 = 0, sy0 = 0;
    function nodeAt(mx, my){
      var best = null, bd = 1e9;
      for (var i = 0; i < N; i++) {
        var n = nodes[i];
        var dx = SX(n.x) - mx, dy = SY(n.y) - my, dd = Math.sqrt(dx * dx + dy * dy);
        var rr = Math.max(14, (n.r + 3) * cam.z + 12);
        if (dd < rr && dd < bd) { bd = dd; best = n; }
      }
      return best;
    }
    function evPos(e){
      var t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || e;
      var r = mount.getBoundingClientRect();
      return { mx: t.clientX - r.left, my: t.clientY - r.top };
    }
    function onDown(e){ if (e.cancelable) e.preventDefault(); var p = evPos(e); down = true; moved = false; px0 = p.mx; py0 = p.my; sx0 = p.mx; sy0 = p.my; var hit = nodeAt(p.mx, p.my); if (hit) dragNode = hit; else panning = true; canvas.style.cursor = 'grabbing'; }
    function onMove(e){ var p = evPos(e); if (down && (Math.abs(p.mx - sx0) + Math.abs(p.my - sy0) > 4)) moved = true; if (down && dragNode) { dragNode.x = WX(p.mx); dragNode.y = WY(p.my); dragNode.vx = 0; dragNode.vy = 0; } else if (down && panning) { cam.x -= (p.mx - px0) / cam.z; cam.y -= (p.my - py0) / cam.z; } px0 = p.mx; py0 = p.my; hover = down ? hover : nodeAt(p.mx, p.my); canvas.style.cursor = hover ? 'pointer' : 'grab'; }
    function onUp(e){ if (dragNode && !moved) onSelect(dragNode); dragNode = null; panning = false; down = false; canvas.style.cursor = 'grab'; }
    if (window.PointerEvent) {
      canvas.addEventListener('pointerdown', onDown);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    } else {
      canvas.addEventListener('mousedown', onDown);
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      canvas.addEventListener('touchstart', onDown, { passive: false });
      window.addEventListener('touchmove', onMove, { passive: false });
      window.addEventListener('touchend', onUp);
    }
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      var f = e.deltaY < 0 ? 1.15 : 0.87;
      cam.z = Math.min(5, Math.max(0.4, cam.z * f));
    }, { passive: false });

    var tip = null;
    function ensureTip(){
      if (tip) return tip;
      tip = document.createElement('div');
      tip.style.cssText = 'position:absolute;z-index:5;max-width:260px;padding:9px 12px;border-radius:10px;font-size:11.5px;line-height:1.5;color:#EAF0FF;background:rgba(10,15,32,.94);border:1px solid rgba(120,160,255,.32);box-shadow:0 8px 26px rgba(0,0,0,.5);display:none;pointer-events:none';
      mount.appendChild(tip); return tip;
    }
    function onSelect(n){
      var t = ensureTip();
      var sub = n.isRoot ? '' : (n.doc ? esc(n.doc) : '');
      t.innerHTML = '<div style="font-weight:700;color:#F2F6FF">' + esc(n.label) + '</div>' +
        (sub ? '<div style="color:#9AA7C7;margin-top:3px">' + sub + '</div>' : '') +
        (n.preview ? '<div style="margin-top:5px;color:#5E6B8D;font-size:10.5px">' + esc(n.preview.slice(0, 80)) + '</div>' : '');
      t.style.display = 'block'; t.style.left = '16px'; t.style.top = '14px'; sel = n;
    }

    function draw(){
      ctx.clearRect(0, 0, W, H);
      var focus = sel, rel = null;
      if (focus) {
        rel = {}; rel[focus.id] = 1;
        if (focus.isRoot) { for (var k = 0; k < E; k++) rel[edges[k].b.id] = 1; }
        else rel[root.id] = 1;
      }
      var e, i, n;
      for (e = 0; e < E; e++) {
        var en = edges[e];
        var act = focus && rel[en.a.id] && rel[en.b.id];
        var x1 = SX(en.a.x), y1 = SY(en.a.y), x2 = SX(en.b.x), y2 = SY(en.b.y);
        ctx.strokeStyle = act ? EDGE_HOVER : (focus ? EDGE_COLOR.replace('0.16', '0.05') : EDGE_COLOR);
        ctx.lineWidth = act ? 1.2 : 0.6;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      }
      for (i = 0; i < N; i++) {
        n = nodes[i];
        var x = SX(n.x), y = SY(n.y), rr = Math.max(1.5, n.r * cam.z);
        var on = !focus || rel[n.id];
        ctx.globalAlpha = (focus && !on) ? 0.12 : 1;
        ctx.beginPath(); ctx.arc(x, y, rr, 0, 6.283);
        ctx.fillStyle = n.isRoot ? ROOT_COLOR : (n === focus ? NODE_HOVER : NODE_COLOR);
        ctx.fill();
        if (focus === n) { ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(245,250,255,.9)'; ctx.beginPath(); ctx.arc(x, y, rr + 2.6, 0, 6.283); ctx.stroke(); }
        if (dragNode === n) { ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.beginPath(); ctx.arc(x, y, rr + 6, 0, 6.283); ctx.fill(); }
      }
      ctx.globalAlpha = 1;
      var showAll = cam.z >= LABEL_THRESHOLD;
      var lastLx = -1e9, lastLy = 0;
      for (i = 0; i < N; i++) {
        n = nodes[i];
        if (!showAll && focus !== n) continue;
        var lx = SX(n.x), ly = SY(n.y);
        var aax = SX(root.x + n.home[0]), aay = SY(root.y + n.home[1]);
        if (showAll && focus !== n && Math.abs(aax - lastLx) < 46 && Math.abs(aay - lastLy) < 20) continue;
        var on2 = !focus || rel[n.id];
        ctx.globalAlpha = (focus && !on2) ? 0.12 : 0.92;
        ctx.font = (focus === n ? '600 12px ' : (n.isRoot ? '600 12px ' : '400 10.5px ')) + '"PingFang SC","Microsoft YaHei",sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillStyle = focus === n ? 'rgba(250,252,255,1)' : (n.isRoot ? 'rgba(230,238,255,.96)' : 'rgba(184,198,224,.85)');
        ctx.fillText(n.label, Math.round(lx), Math.round(ly + Math.max(1.5, n.r * cam.z) + 5));
        if (showAll) { lastLx = aax; lastLy = aay; }
      }
      ctx.globalAlpha = 1;
    }
    function loop(){ step(); draw(); requestAnimationFrame(loop); }

    size();
    requestAnimationFrame(loop);
    window.__galaxyReady = true;
    window.__galaxyInfo = { nodes: N, edges: E, dataNodes: src.length, dots: dots.length };
    window.__kgNodes = nodes.map(function (n) { return { x:n.x, y:n.y, home:n.home.slice(), r:n.r, isRoot:!!n.isRoot, label:n.label }; });
    return true;
  };
})();
