/* 知识图谱 · 知识银河（Galaxy View 重做 · 视觉 demo + 力导向手感）
 * 旁路副本 /opt/cockpit-v070_dev 用，不进生产 v0.6.3。
 * 现网保留：galaxy.json 数据管线、脱敏、零 CDN（vendor/three.min.js）。
 * 视觉：保留星空背景，中心图谱按“知识体→知识库→文档→片段”分层显示。
 * 手感（对标 Obsidian graph view）：默认展示高层网络，缩放后展开片段；拖拽带惯性回弹，
 *       空白拖拽平移，悬停/点击聚焦关联节点，无关关系和标签自动压暗。
 */
(function () {
  'use strict';
  var MOUNT_ID = 'galaxyMount';
  var TEST_RE = /(测试|test|demo|临时|tokenhub|tmp_)/i;
  var mount;
  window.__startGalaxy = function () {
    mount = document.getElementById(MOUNT_ID);
    if (!mount || typeof THREE === 'undefined') return false;
    if (mount.dataset.gxStarted) return true;
    mount.dataset.gxStarted = '1';

  /* ---------------- 脱敏 ---------------- */
  var MASK = [
    [/((?:\d{1,3}\.){3}\d{1,3})/g, '[内网地址]'],
    [/(腾讯云|阿里云|华为云|火山引擎|AWS|Azure|GPU云)/g, '[云服务商]'],
    [/(Dify|dify)/g, '[知识平台]'],
    [/(nginx|Nginx|NGINX)/g, '[网关]'],
    [/(docker|Docker|容器)/g, '[运行环境]'],
    [/(password|passwd|密码|口令|秘钥|密钥|token|api[_-]?key|secret|sk-[A-Za-z0-9]{6,})/gi, '[凭据]'],
    [/(Weaviate|Qdrant|Milvus|pgvector|Postgres|PostgreSQL|Redis)/g, '[存储组件]'],
    [/(\/opt\/[\w\.\-\/]+|\/home\/[\w\.\-\/]+)/g, '[内部路径]'],
    [/(:\d{2,5})\b/g, '[端口]']
  ];
  function mask(s) {
    var t = String(s == null ? '' : s);
    for (var i = 0; i < MASK.length; i++) t = t.replace(MASK[i][0], MASK[i][1]);
    return t;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }
  function hex2rgb(h) {
    h = h.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
  }
  function hashText(value) {
    var h = 2166136261;
    value = String(value || '');
    for (var i = 0; i < value.length; i++) {
      h ^= value.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  var LIB_COLORS = ['#69E7FF', '#B39DFF', '#FF9BD2', '#62FAD3', '#8FD3FF', '#8FD3FF', '#FFA48F'];
  var CORE_COLOR = '#F5C66B';   // 知识库核心金黄
  var NEW_COLOR = '#69E7FF';     // 7 日内新入库青绿

  /* ---------------- DOM 骨架 ---------------- */
  mount.innerHTML =
    '<div id="gxStage" style="position:absolute;inset:0;overflow:hidden;background:radial-gradient(circle at 50% 44%,#0b0b20 0%,#05060f 55%,#020308 100%)"></div>' +
    '<div id="gxLabels" style="position:absolute;inset:0;pointer-events:none;overflow:hidden"></div>' +
    '<div id="gxTip" class="gx-tip" style="display:none"></div>' +
    '<div id="gxHud" class="gx-hud"></div>' +
    '<div id="gxLegend" class="gx-legend"></div>' +
    '<div id="gxState" class="gx-state">正在点亮知识星河…</div>' +
    '<div id="gxDrawer" class="gx-drawer">' +
    '  <div class="gx-drawer-head"><b id="gxDTitle"></b><button id="gxDClose" aria-label="关闭">×</button></div>' +
    '  <div id="gxDMeta" class="gx-drawer-meta"></div>' +
    '  <div id="gxDBody" class="gx-drawer-body"></div>' +
    '</div>';

  var stage = document.getElementById('gxStage');
  var labelLayer = document.getElementById('gxLabels');
  var tip = document.getElementById('gxTip');
  var hud = document.getElementById('gxHud');
  var legendBox = document.getElementById('gxLegend');
  var stateBox = document.getElementById('gxState');
  var drawer = document.getElementById('gxDrawer');
  if (drawer && drawer.parentNode !== document.body) document.body.appendChild(drawer);

  var css = document.createElement('style');
  css.textContent = [
    '#galaxyMount{position:relative;width:100%;height:100%;min-height:660px;z-index:0;pointer-events:auto;background:#020308}',
    '#gxStage canvas{display:block;position:absolute;left:0;top:0;width:100%!important;height:100%!important;touch-action:none;cursor:grab}',
    '#gxStage.grabbing canvas{cursor:grabbing}',
    '.gx-tip{position:absolute;pointer-events:none;z-index:9;max-width:min(300px,78%);padding:8px 10px;border-radius:8px;',
    ' background:rgba(6,10,22,.92);border:1px solid rgba(120,180,255,.28);color:#dbe7ff;font-size:12px;line-height:1.55;',
    ' box-shadow:0 8px 24px rgba(0,0,0,.6)}',
    '.gx-tip b{color:#fff;font-size:12.5px}',
    '.gx-tip .k{color:#8fb4e8}',
    '.gx-hud{display:none}',
    '.gx-legend{position:absolute;left:14px;bottom:14px;z-index:10;display:flex;flex-wrap:wrap;gap:5px 11px;max-width:calc(100% - 28px);color:#d6e3f7;font-size:10.5px;white-space:nowrap;background:rgba(6,8,20,.66);padding:7px 12px;border-radius:12px;border:1px solid rgba(124,92,255,.28);backdrop-filter:blur(6px);box-shadow:0 4px 18px rgba(0,0,0,.45);overflow:hidden}',
    '.gx-legend span{display:inline-flex;align-items:center;gap:5px;color:#e8eefb;white-space:nowrap;flex:none}',
    '.gx-legend i{width:9px;height:9px;border-radius:50%;display:inline-block;box-shadow:0 0 4px currentColor}',
    '.gx-state{position:absolute;inset:0;z-index:12;display:flex;align-items:center;justify-content:center;background:rgba(0,0,8,.86);color:#9fc3ff;font-size:13px}',
    '.gx-drawer{position:fixed;right:0;top:0;bottom:0;width:min(400px,86%);z-index:60;transform:translateX(102%);transition:transform .28s ease;',
    ' background:rgba(5,9,20,.96);border-left:1px solid rgba(120,180,255,.22);color:#cfe0ff;display:flex;flex-direction:column}',
    '.gx-drawer.open{transform:translateX(0)}',
    '.gx-drawer-head{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid rgba(120,180,255,.16);font-size:13.5px}',
    '.gx-drawer-head button{background:none;border:none;color:#8fb4e8;font-size:20px;cursor:pointer;line-height:1}',
    '.gx-drawer-meta{padding:8px 14px;font-size:11.5px;color:#7fa3d6;border-bottom:1px solid rgba(120,180,255,.1)}',
    '.gx-drawer-body{padding:12px 14px;overflow:auto;font-size:12.5px;line-height:1.75;white-space:pre-wrap;word-break:break-word}',
    '.gx-lb{position:absolute;transform:translate(-50%,-160%);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:190px;font-size:12px;font-weight:700;color:#fff;text-shadow:0 0 6px #000,0 0 12px rgba(0,0,0,.95);pointer-events:none;background:rgba(20,14,40,.68);border:1px solid rgba(124,92,255,.45);border-radius:999px;padding:2px 9px;will-change:left,top,opacity}',
    '@media (max-width:760px){.g2{grid-template-columns:1fr!important}.g-graph{display:grid!important;grid-template-columns:minmax(0,1fr)!important}.galaxy-host{width:100%!important;min-height:460px!important}.gx-legend{max-width:calc(100% - 20px);font-size:9px}}'
  ].join('\n');
  document.head.appendChild(css);

  /* ---------------- three 基础 ---------------- */
  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0x04060D);
  var camera = new THREE.PerspectiveCamera(55, 1, 0.1, 8000);
  var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  var PR = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(PR);
  var stageRect = stage.getBoundingClientRect();
  var W = Math.max(1, stageRect.width || 800), H = Math.max(1, stageRect.height || 600);
  renderer.setSize(W, H, false);
  stage.appendChild(renderer.domElement);

  var starMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPR: { value: PR }, uGrow: { value: 0 } },
    vertexShader: [
      'attribute float aSize; attribute vec3 aColor; attribute float aPhase; attribute float aSpeed;',
      'attribute float aTw; attribute float aBirth; attribute float aAlpha;',
      'varying vec3 vColor; varying float vTw; varying float vPhase; varying float vSpeed; varying float vGrow; varying float vAlpha;',
      'uniform float uPR; uniform float uTime; uniform float uGrow;',
      'void main(){',
      '  vColor=aColor; vTw=aTw; vPhase=aPhase; vSpeed=aSpeed; vAlpha=aAlpha;',
      '  float g=1.0; if(uGrow>0.5){ g=clamp((uTime-aBirth)/0.62,0.0,1.0); } vGrow=g;',
      '  vec4 mv = modelViewMatrix * vec4(position,1.0);',
      '  gl_PointSize = aSize*uPR*(420.0/max(1.0,-mv.z))*(0.30+0.70*g)*step(0.001,g);',
      '  gl_Position = projectionMatrix*mv;',
      '}'
    ].join('\n'),
    fragmentShader: [
      'varying vec3 vColor; varying float vTw; varying float vPhase; varying float vSpeed; varying float vGrow; varying float vAlpha;',
      'uniform float uTime;',
      'void main(){',
      '  vec2 uv = gl_PointCoord - vec2(0.5); float d = length(uv); if(d>0.5) discard;',
      '  float core = smoothstep(0.13,0.0,d);',
      '  float halo = pow(max(0.0,1.0-d*2.0),2.1);',
      '  float s = 0.5+0.5*sin(uTime*vSpeed+vPhase);',
      '  float tw = 1.0 - vTw*0.30*s;',
      '  float a = clamp(core*0.95 + halo*0.7, 0.0, 1.0)*tw;',
      '  vec3 c = vColor*(0.85+0.5*core) + vec3(core)*0.35;',
      '  gl_FragColor = vec4(c, a*vAlpha*vGrow);',
      '}'
    ].join('\n'),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  });

  /* ---------------- 参数 ---------------- */
  var ARMS = 3, GAL_R = 420, DUST_COUNT = 1400;
  var AUTO_SPIN = 0, DEFAULT_RADIUS = 820, FOCUS_RADIUS = 300, DETAIL_RADIUS = 620;
  var TEXT_FADE_MULT = 0.85;
  var ANCHOR_K = 0.0060, LINK_K = 0.026, PARENT_K = 0.012, CENTER_K = 0.0010, VEL_DECAY = 0.65;
  var RELEASE_LINK_MUL = 4.2, RELEASE_MAX_SPEED = 6.0, RELEASE_ALPHA_STOP = 0.01;
  var ALPHA_MIN = 0.001, ALPHA_DECAY = 1 - Math.pow(ALPHA_MIN, 1 / 300);
  var REPULSION = 900;

  var group = new THREE.Group(); scene.add(group);
  var cloud = null, lines = null, dust = null;
  var nodes = [], edges = [], restLen = [], idxById = {};
  var posAttr = null, alphaAttr = null, linePosAttr = null, lineColorAttr = null;
  var flowCloud = null, flowPosAttr = null, flowColorAttr = null, flowAlphaAttr = null;
  var flowEdges = [], flowPhase = [], flowSpeed = [], flowBaseColors = null;
  var lineBaseColors = null, rootIdx = -1, labelEls = [];
  var datasetList = [], meta = [];
  var releaseIdx = -1;

  /* ---------------- 数据 ---------------- */
  fetch('galaxy.json', { cache: 'no-store' }).then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }).then(build).catch(function (e) {
    console.warn('知识图谱 galaxy.json 加载失败，退回内联数据', e && e.message);
    if (window.__GALAXY_DATA__) setTimeout(function(){ build(window.__GALAXY_DATA__); }, 0);
  });

  function build(d) {
    var whitelist = d.whitelist || [];
    var allowed = function (ds) {
      if (whitelist.length) return whitelist.indexOf(ds) >= 0;
      return !TEST_RE.test(ds || '');
    };
    // 知识库清单（按白名单顺序）
    datasetList = whitelist.length ? whitelist.slice() : [];
    d.nodes.forEach(function (n) {
      if (datasetList.indexOf(n.dataset) < 0 && allowed(n.dataset)) datasetList.push(n.dataset);
    });

    // 中心知识体
    var rootNode = {
      id: 'ROOT:knowledge', name: '知识总库', dataset: '知识总库', datasetIdx: -1, kind: 'lib',
      color: hex2rgb('#E8F4FF'), home: new THREE.Vector3(0, 0, 0), pos: new THREE.Vector3(0, 0, 0),
      vel: new THREE.Vector3(), size: 68, phase: Math.random() * 6.28, speed: 0.7, tw: 0.45,
      alpha: 1, neighbors: [], deg: 0, isCore: true, isRoot: true, parentIdx: -1, visible: true
    };
    nodes.push(rootNode);
    rootIdx = 0;
    idxById[rootNode.id] = rootIdx;

    // 知识库核心
    var coreIdxByDataset = {};
    datasetList.forEach(function (ds, li) {
      var c = hex2rgb(CORE_COLOR);
      var home = new THREE.Vector3(0, 0, 0);
      nodes.push({
        id: 'CORE:' + ds, name: ds + '（核心）', dataset: ds, datasetIdx: li, kind: 'lib',
        color: c, home: home, pos: home.clone(), vel: new THREE.Vector3(),
        size: 48, phase: Math.random() * 6.28, speed: 0.7 + Math.random() * 0.5, tw: 0.5,
        alpha: 1, neighbors: [], deg: 0, isCore: true, parentIdx: rootIdx, visible: true
      });
      idxById['CORE:' + ds] = nodes.length - 1;
      coreIdxByDataset[ds] = nodes.length - 1;
      edges.push([rootIdx, nodes.length - 1]);
    });

    // 将片段聚合成真实文档节点
    var kept = d.nodes.filter(function (n) { return allowed(n.dataset); });
    var docMap = {};
    kept.forEach(function (n) {
      var key = n.doc || n.id;
      if (docMap[key]) return;
      var li = datasetList.indexOf(n.dataset);
      var c = hex2rgb(LIB_COLORS[(li < 0 ? 0 : li) % LIB_COLORS.length]);
      var name = String(n.doc || n.display_name || key).replace(/\.(md|yml|yaml|json)$/i, '').slice(0, 22);
      var docNode = {
        id: 'DOC:' + key, name: name, dataset: n.dataset, datasetIdx: li, kind: 'doc',
        color: c, home: new THREE.Vector3(), pos: new THREE.Vector3(), vel: new THREE.Vector3(),
        size: 28, phase: Math.random() * 6.28, speed: 0.7 + Math.random() * 0.5, tw: 0.45,
        alpha: 1, neighbors: [], deg: 0, isCore: false, isDoc: true, parentIdx: coreIdxByDataset[n.dataset], visible: true,
        doc: n.doc, preview: n.preview || '', segments: []
      };
      nodes.push(docNode);
      docMap[key] = nodes.length - 1;
      idxById[docNode.id] = docMap[key];
      edges.push([rootIdx, docMap[key]]);
    });

    // 片段节点默认收起，只在缩放或聚焦时展开
    kept.forEach(function (n) {
      var li = datasetList.indexOf(n.dataset);
      var c = hex2rgb(LIB_COLORS[li % LIB_COLORS.length]);
      var parentIdx = docMap[n.doc || n.id];
      var home = new THREE.Vector3();
      nodes.push({
        id: n.id, name: n.display_name || n.doc || n.id, dataset: n.dataset, datasetIdx: li, kind: 'seg',
        color: c, home: home, pos: home.clone(), vel: new THREE.Vector3(),
        size: 10, phase: Math.random() * 6.28, speed: 0.6 + Math.random() * 1.0, tw: 0.4 + Math.random() * 0.4,
        alpha: 0, neighbors: [], deg: 0, isCore: false, isDoc: false, parentIdx: parentIdx, visible: false,
        doc: n.doc, preview: n.preview
      });
      idxById[n.id] = nodes.length - 1;
      if (parentIdx != null) {
        edges.push([parentIdx, nodes.length - 1]);
        nodes[parentIdx].segments.push(nodes.length - 1);
      }
    });

    // 原始片段连边仅作为详情关系保留，不进入默认星链
    nodes.forEach(function (n) { n.extraNeighbors = []; });
    (d.edges || []).forEach(function (e) {
      var a = idxById[e[0]], b = idxById[e[1]];
      if (a == null || b == null) return;
      nodes[a].extraNeighbors.push(b); nodes[b].extraNeighbors.push(a);
    });
    nodes.forEach(function (n) { n.deg = n.neighbors.length; });

    layoutHierarchy();
    edges.forEach(function (ed) {
      var a = nodes[ed[0]], b = nodes[ed[1]];
      var len = a.home.distanceTo(b.home);
      if (a.isCore && b.isCore) len = 190;
      else if (a.isDoc || b.isDoc) len = 70;
      restLen.push(Math.max(42, Math.min(210, len)));
    });

    buildGeometry();
    buildLabels();
    var rootLegendDot = document.querySelector('.lg-row .lg-dot');
    if (rootLegendDot) {
      rootLegendDot.style.background = 'radial-gradient(circle at 35% 35%,#FFF,#B9DFFF)';
      rootLegendDot.style.boxShadow = '0 0 11px rgba(185,223,255,.9)';
    }
    buildLegend(datasetList);
    buildPanel();
    stateBox.style.display = 'none';
    window.__galaxyReady = true;
    window.__galaxyInfo = { nodes: nodes.length, edges: edges.length, flows: edges.length, dust: DUST_COUNT };
    resize();
  }

  function layoutHierarchy() {
    var cores = [];
    var docsByCore = {};
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].isCore && !nodes[i].isRoot) {
        cores.push(i);
        docsByCore[i] = [];
      }
    }
    if (rootIdx >= 0) {
      nodes[rootIdx].home.set(0, 0, 0);
      nodes[rootIdx].pos.copy(nodes[rootIdx].home);
    }
    var coreAngles = {};
    cores.forEach(function (idx, ci) {
      var ang = (ci / Math.max(1, cores.length)) * Math.PI * 2 - Math.PI / 2;
      coreAngles[idx] = ang;
      nodes[idx].home.set(Math.cos(ang) * 170, (ci % 2 ? 34 : -34), Math.sin(ang) * 170);
      nodes[idx].pos.copy(nodes[idx].home);
    });
    for (var d = 0; d < nodes.length; d++) {
      var doc = nodes[d];
      if (!doc.isDoc) continue;
      if (doc.parentIdx >= 0 && docsByCore[doc.parentIdx]) docsByCore[doc.parentIdx].push(d);
    }
    Object.keys(docsByCore).forEach(function (key) {
      var coreIdx = +key;
      var list = docsByCore[key];
      var centerAngle = coreAngles[coreIdx] || 0;
      var sectorWidth = (Math.PI * 2 / Math.max(1, cores.length)) * 0.78;
      list.forEach(function (docIdx, di) {
        var doc = nodes[docIdx];
        var ratio = (di + 0.5) / Math.max(1, list.length);
        var angle = centerAngle - sectorWidth / 2 + ratio * sectorWidth + ((hashText(doc.name) % 17) - 8) * 0.004;
        var shellRadius = 315 + (di % 3) * 18;
        var latitude = (ratio - 0.5) * 1.15;
        doc.home.set(
          Math.cos(angle) * shellRadius,
          Math.sin(latitude) * 135,
          Math.sin(angle) * shellRadius
        );
        doc.pos.copy(doc.home);
      });
    });
    for (var s = 0; s < nodes.length; s++) {
      var seg = nodes[s];
      if (!seg || seg.kind !== 'seg') continue;
      var parentDoc = nodes[seg.parentIdx];
      var angleSeg = (hashText(seg.id) % 360) * Math.PI / 180;
      var elevation = ((hashText(seg.id + ':y') % 200) / 200 - 0.5) * 1.25;
      var ring = 18 + (s % 5) * 6;
      if (parentDoc) {
        var cosEl = Math.cos(elevation);
        seg.home.set(
          parentDoc.home.x + Math.cos(angleSeg) * cosEl * ring,
          parentDoc.home.y + Math.sin(elevation) * ring,
          parentDoc.home.z + Math.sin(angleSeg) * cosEl * ring
        );
      } else {
        seg.home.set(Math.cos(angleSeg) * 520, 0, Math.sin(angleSeg) * 520);
      }
      seg.pos.copy(seg.home);
    }
  }

  function buildGeometry() {
    var N = nodes.length;
    var pos = new Float32Array(N * 3), col = new Float32Array(N * 3), siz = new Float32Array(N);
    var ph = new Float32Array(N), sp = new Float32Array(N), tw = new Float32Array(N), bir = new Float32Array(N), al = new Float32Array(N);
    for (var i = 0; i < N; i++) {
      var n = nodes[i];
      pos[i * 3] = n.pos.x; pos[i * 3 + 1] = n.pos.y; pos[i * 3 + 2] = n.pos.z;
      col[i * 3] = n.color[0]; col[i * 3 + 1] = n.color[1]; col[i * 3 + 2] = n.color[2];
      siz[i] = n.size; ph[i] = n.phase; sp[i] = n.speed; tw[i] = n.tw; al[i] = n.alpha;
    }
    var geo = new THREE.BufferGeometry();
    posAttr = new THREE.Float32BufferAttribute(pos, 3); geo.setAttribute('position', posAttr);
    geo.setAttribute('aColor', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('aSize', new THREE.Float32BufferAttribute(siz, 1));
    geo.setAttribute('aPhase', new THREE.Float32BufferAttribute(ph, 1));
    geo.setAttribute('aSpeed', new THREE.Float32BufferAttribute(sp, 1));
    geo.setAttribute('aTw', new THREE.Float32BufferAttribute(tw, 1));
    geo.setAttribute('aBirth', new THREE.Float32BufferAttribute(bir, 1));
    alphaAttr = new THREE.Float32BufferAttribute(al, 1); geo.setAttribute('aAlpha', alphaAttr);
    cloud = new THREE.Points(geo, starMat);
    cloud.frustumCulled = false;
    group.add(cloud);

    // 星链
    var lp = new Float32Array(edges.length * 6), lc = new Float32Array(edges.length * 6);
    for (var e = 0; e < edges.length; e++) {
      var a = nodes[edges[e][0]], b = nodes[edges[e][1]];
      lp[e * 6] = a.pos.x; lp[e * 6 + 1] = a.pos.y; lp[e * 6 + 2] = a.pos.z;
      lp[e * 6 + 3] = b.pos.x; lp[e * 6 + 4] = b.pos.y; lp[e * 6 + 5] = b.pos.z;
      for (var k = 0; k < 2; k++) {
        var nn = (k === 0) ? a : b;
        lc[e * 6 + k * 3] = nn.color[0]; lc[e * 6 + k * 3 + 1] = nn.color[1]; lc[e * 6 + k * 3 + 2] = nn.color[2];
      }
    }
    var lgeo = new THREE.BufferGeometry();
    linePosAttr = new THREE.Float32BufferAttribute(lp, 3); lgeo.setAttribute('position', linePosAttr);
    lineBaseColors = new Float32Array(lc);
    lineColorAttr = new THREE.Float32BufferAttribute(lc, 3); lgeo.setAttribute('color', lineColorAttr);
    lines = new THREE.LineSegments(lgeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }));
    lines.frustumCulled = false;
    group.add(lines);
    buildFlowGeometry();

    // 装饰星尘（纯视觉，不可点）
    var dp = new Float32Array(DUST_COUNT * 3), dc = new Float32Array(DUST_COUNT * 3), ds = new Float32Array(DUST_COUNT);
    var dph = new Float32Array(DUST_COUNT), dsp = new Float32Array(DUST_COUNT), dtw = new Float32Array(DUST_COUNT), dbi = new Float32Array(DUST_COUNT), dal = new Float32Array(DUST_COUNT);
    for (var j = 0; j < DUST_COUNT; j++) {
      var rr = 620 + Math.random() * 1100;
      var v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(rr);
      dp[j * 3] = v.x; dp[j * 3 + 1] = v.y * 0.7; dp[j * 3 + 2] = v.z;
      var tint = Math.random() < 0.5 ? [0.55, 0.62, 0.85] : [0.7, 0.72, 0.9];
      dc[j * 3] = tint[0]; dc[j * 3 + 1] = tint[1]; dc[j * 3 + 2] = tint[2];
      ds[j] = 5 + Math.random() * 8; dph[j] = Math.random() * 6.28; dsp[j] = 0.3 + Math.random() * 0.6; dtw[j] = 0.3 + Math.random() * 0.4; dal[j] = 1;
    }
    var dgeo = new THREE.BufferGeometry();
    dgeo.setAttribute('position', new THREE.Float32BufferAttribute(dp, 3));
    dgeo.setAttribute('aColor', new THREE.Float32BufferAttribute(dc, 3));
    dgeo.setAttribute('aSize', new THREE.Float32BufferAttribute(ds, 1));
    dgeo.setAttribute('aPhase', new THREE.Float32BufferAttribute(dph, 1));
    dgeo.setAttribute('aSpeed', new THREE.Float32BufferAttribute(dsp, 1));
    dgeo.setAttribute('aTw', new THREE.Float32BufferAttribute(dtw, 1));
    dgeo.setAttribute('aBirth', new THREE.Float32BufferAttribute(dbi, 1));
    dgeo.setAttribute('aAlpha', new THREE.Float32BufferAttribute(dal, 1));
    dust = new THREE.Points(dgeo, starMat);
    dust.frustumCulled = false;
    scene.add(dust);
  }

  function buildFlowGeometry() {
    var count = edges.length;
    var fp = new Float32Array(count * 3), fc = new Float32Array(count * 3);
    var fs = new Float32Array(count), fph = new Float32Array(count), fsp = new Float32Array(count);
    var ftw = new Float32Array(count), fbi = new Float32Array(count), fal = new Float32Array(count);
    flowEdges = [];
    flowPhase = [];
    flowSpeed = [];
    for (var i = 0; i < count; i++) {
      var a = nodes[edges[i][0]], b = nodes[edges[i][1]];
      fp[i * 3] = (a.pos.x + b.pos.x) * 0.5;
      fp[i * 3 + 1] = (a.pos.y + b.pos.y) * 0.5;
      fp[i * 3 + 2] = (a.pos.z + b.pos.z) * 0.5;
      fc[i * 3] = Math.min(1, (a.color[0] + b.color[0]) * 0.52 + 0.22);
      fc[i * 3 + 1] = Math.min(1, (a.color[1] + b.color[1]) * 0.52 + 0.22);
      fc[i * 3 + 2] = Math.min(1, (a.color[2] + b.color[2]) * 0.52 + 0.22);
      fs[i] = (a.isCore || b.isCore) ? 8.5 : ((a.isDoc || b.isDoc) ? 6.2 : 4.2);
      fph[i] = (hashText(a.id + '>' + b.id) % 1000) / 1000;
      fsp[i] = 0.16 + (i % 7) * 0.012;
      ftw[i] = 0.12;
      fbi[i] = 0;
      fal[i] = 0;
      flowEdges.push([a, b]);
      flowPhase.push(fph[i]);
      flowSpeed.push(fsp[i]);
    }
    var fgeo = new THREE.BufferGeometry();
    flowPosAttr = new THREE.Float32BufferAttribute(fp, 3); fgeo.setAttribute('position', flowPosAttr);
    flowBaseColors = new Float32Array(fc);
    flowColorAttr = new THREE.Float32BufferAttribute(fc, 3); fgeo.setAttribute('aColor', flowColorAttr);
    fgeo.setAttribute('aSize', new THREE.Float32BufferAttribute(fs, 1));
    fgeo.setAttribute('aPhase', new THREE.Float32BufferAttribute(fph, 1));
    fgeo.setAttribute('aSpeed', new THREE.Float32BufferAttribute(fsp, 1));
    fgeo.setAttribute('aTw', new THREE.Float32BufferAttribute(ftw, 1));
    fgeo.setAttribute('aBirth', new THREE.Float32BufferAttribute(fbi, 1));
    flowAlphaAttr = new THREE.Float32BufferAttribute(fal, 1); fgeo.setAttribute('aAlpha', flowAlphaAttr);
    flowCloud = new THREE.Points(fgeo, starMat);
    flowCloud.frustumCulled = false;
    group.add(flowCloud);
  }

  function buildLegend(list) {
    legendBox.innerHTML = list.map(function (n, i) {
      return '<span><i style="background:' + LIB_COLORS[i % LIB_COLORS.length] + ';box-shadow:0 0 8px ' + LIB_COLORS[i % LIB_COLORS.length] + '"></i>' + esc(n) + '</span>';
    }).join('') +
      '<span><i style="background:' + CORE_COLOR + ';box-shadow:0 0 10px ' + CORE_COLOR + '"></i>知识库核心</span>' +
      '<span><i style="background:' + NEW_COLOR + ';box-shadow:0 0 10px ' + NEW_COLOR + '"></i>7 日内新入库</span>';
  }

  function buildLabels() {
    labelLayer.innerHTML = '';
    labelEls = [];
    nodes.forEach(function (n, i) {
      if (n.kind === 'seg') return;
      var el = document.createElement('div');
      el.className = 'gx-lb';
      el.textContent = n.name;
      el.title = n.name;
      el.style.display = 'none';
      labelLayer.appendChild(el);
      n.labelEl = el;
      labelEls.push(i);
    });
  }

  function boxOf(x, y, w, h) {
    // .gx-lb uses transform: translate(-50%, -160%)
    return { l: x - w / 2, r: x + w / 2, t: y - 1.6 * h, b: y - 0.6 * h, cy: y - 1.1 * h };
  }
  function updateLabels(active) {
    var width = renderer.domElement.clientWidth, height = renderer.domElement.clientHeight;
    var SAFE = 14, GAP = 3, STEP = 4, MAX_ITER = 80;
    var vis = [];
    // Pass A: visibility + base anchor
    for (var k = 0; k < labelEls.length; k++) {
      var idx = labelEls[k], n = nodes[idx], el = n.labelEl;
      if (!el) continue;
      var strong = n.isRoot || n.isCore;
      var related = active >= 0 && ((n.isRoot || n.isCore || n.isDoc) && n._activeSet);
      var show = n.visible && (strong || (n.isDoc && (camRadius < 820 || active === idx || related)));
      if (!show) { el.style.display = 'none'; continue; }
      var s = screenOf(n.pos);
      if (s.z < -1 || s.z > 1 || s.x < -160 || s.x > width + 160 || s.y < -100 || s.y > height + 100) {
        el.style.display = 'none'; continue;
      }
      el.style.display = 'block';
      el.style.left = s.x.toFixed(1) + 'px';
      el.style.top = s.y.toFixed(1) + 'px';
      el.style.opacity = strong ? '1' : (active >= 0 && !related && active !== idx ? '0.22' : '0.86');
      vis.push({ n: n, el: el, strong: strong, related: related, sx: s.x, sy: s.y });
    }
    if (!vis.length) return;
    // Pass B: measure size once (batched read)
    for (var p = 0; p < vis.length; p++) {
      var it = vis[p], r = it.el.getBoundingClientRect();
      it.w = r.width; it.h = r.height;
      it.box = boxOf(it.sx, it.sy, it.w, it.h);
    }
    // Pass C: clamp into safe margins (fix edge clipping)
    for (var q = 0; q < vis.length; q++) {
      var u = vis[q];
      u.sx = Math.max(SAFE + u.w / 2, Math.min(width - SAFE - u.w / 2, u.sx));
      u.sy = Math.max(SAFE + 1.6 * u.h, Math.min(height - SAFE + 0.6 * u.h, u.sy));
      u.box = boxOf(u.sx, u.sy, u.w, u.h);
    }
    // Pass D: collision relaxation (vertical nudge)
    // Pass D: collision relaxation (所有标签参与；核心/根标签也互相分离)
    for (var iter = 0; iter < MAX_ITER; iter++) {
      var moved = false;
      for (var a = 0; a < vis.length; a++) {
        var A = vis[a];
        for (var b = 0; b < vis.length; b++) {
          if (vis[b] === A) continue;
          var B = vis[b];
          var ox = (A.w + B.w) / 2 + GAP - Math.abs(A.box.l - B.box.l);
          var oy = (A.h + B.h) / 2 + GAP - Math.abs(A.box.cy - B.box.cy);
          if (ox > 0 && oy > 0) {
            if (A.strong && B.strong) {
              // 两个核心/根：按实际重叠量互相反向推开，确保彻底分离
              var ovY = (A.h + B.h) / 2 + GAP - Math.abs(A.box.cy - B.box.cy);
              if (ovY > 0) {
                var d2 = A.box.cy <= B.box.cy ? -1 : 1;
                A.sy += d2 * (ovY / 2 + 1); B.sy -= d2 * (ovY / 2 + 1);
                A.sy = Math.max(SAFE + 1.6 * A.h, Math.min(height - SAFE + 0.6 * A.h, A.sy));
                B.sy = Math.max(SAFE + 1.6 * B.h, Math.min(height - SAFE + 0.6 * B.h, B.sy));
                A.box = boxOf(A.sx, A.sy, A.w, A.h);
                B.box = boxOf(B.sx, B.sy, B.w, B.h);
              }
            } else {
              // 优先移动非核心标签
              var mover = (!A.strong && B.strong) ? A : ((A.strong && !B.strong) ? B : A);
              var otherCy = (mover === A) ? B.box.cy : A.box.cy;
              var md = mover.box.cy <= otherCy ? -1 : 1;
              mover.sy += md * STEP;
              mover.sy = Math.max(SAFE + 1.6 * mover.h, Math.min(height - SAFE + 0.6 * mover.h, mover.sy));
              mover.box = boxOf(mover.sx, mover.sy, mover.w, mover.h);
            }
            moved = true;
          }
        }
      }
      if (!moved) break;
    }
    // Pass D3: 强标签（根/核心）垂直等距排布，确保互不重叠
    var strongs = vis.filter(function (v) { return v.strong && !v._hidden; }).sort(function (a, b) { return a.box.cy - b.box.cy; });
    for (var si = 1; si < strongs.length; si++) {
      var prev = strongs[si - 1], cur = strongs[si];
      var minGap = (prev.h + cur.h) / 2 + GAP;
      if (cur.box.cy - prev.box.cy < minGap) {
        cur.sy = prev.sy + minGap;
        cur.sy = Math.max(SAFE + 1.6 * cur.h, Math.min(height - SAFE + 0.6 * cur.h, cur.sy));
        cur.box = boxOf(cur.sx, cur.sy, cur.w, cur.h);
      }
    }
    for (var sj = strongs.length - 2; sj >= 0; sj--) {
      var nx = strongs[sj + 1], cur2 = strongs[sj];
      var minGap2 = (cur2.h + nx.h) / 2 + GAP;
      if (nx.box.cy - cur2.box.cy < minGap2) {
        cur2.sy = nx.sy - minGap2;
        cur2.sy = Math.max(SAFE + 1.6 * cur2.h, Math.min(height - SAFE + 0.6 * cur2.h, cur2.sy));
        cur2.box = boxOf(cur2.sx, cur2.sy, cur2.w, cur2.h);
      }
    }
    // Pass E: dense aggregation — 隐藏仍压在核心/根上或重叠>=4个的低优先级非核心标签
    for (var d = 0; d < vis.length; d++) {
      var M = vis[d];
      if (M.strong || M.related || M._hidden) continue;
      var hits = 0, coreHit = false;
      for (var e = 0; e < vis.length; e++) {
        if (vis[e] === M || vis[e]._hidden) continue;
        var ox2 = (M.w + vis[e].w) / 2 + 1 - Math.abs(M.box.l - vis[e].box.l);
        var oy2 = (M.h + vis[e].h) / 2 + 1 - Math.abs(M.box.cy - vis[e].box.cy);
        if (ox2 > 0 && oy2 > 0) { hits++; if (vis[e].strong) coreHit = true; }
      }
      if (coreHit || hits >= 4) { M.el.style.display = 'none'; M._hidden = true; }
    }
    // Apply final positions
    for (var f = 0; f < vis.length; f++) {
      var V = vis[f];
      if (V._hidden) continue;
      V.el.style.left = V.sx.toFixed(1) + 'px';
      V.el.style.top = V.sy.toFixed(1) + 'px';
    }
  }

  function labelBoxesOverlap(a, b, gap) {
    var g = gap || 0;
    return a.l < b.r + g && a.r > b.l - g && a.t < b.b + g && a.b > b.t - g;
  }

  function labelCandidates(sx, sy, w, h) {
    var dx = w * 0.58 + 8, dy = h * 1.15;
    return [
      [sx, sy],
      [sx + dx, sy],
      [sx - dx, sy],
      [sx, sy + dy],
      [sx + dx, sy + dy],
      [sx - dx, sy + dy],
      [sx, sy - dy],
      [sx + dx, sy - dy],
      [sx - dx, sy - dy],
      [sx, sy + dy * 2],
      [sx, sy - dy * 2],
      [sx + dx * 1.6, sy],
      [sx - dx * 1.6, sy]
    ];
  }

  function updateLabelsSafe(active) {
    var width = renderer.domElement.clientWidth;
    var height = renderer.domElement.clientHeight;
    if (!width || !height || !labelEls.length) return;
    var SAFE = 12;
    var GAP = 5;
    var canvasRect = renderer.domElement.getBoundingClientRect();
    var visibleLeft = -canvasRect.left;
    var visibleTop = -canvasRect.top;
    var visibleRight = window.innerWidth - canvasRect.left;
    var visibleBottom = window.innerHeight - canvasRect.top;
    var mobile = width <= 760;
    var activeIdx = active;
    var interactingNow = dragging || interacting;
    var viewScale = DEFAULT_RADIUS / Math.max(1, camRadius);
    var labelZoomAlpha = Math.max(0, Math.min(1, Math.log2(viewScale) + 1 - TEXT_FADE_MULT));
    var labelsGloballyVisible = labelZoomAlpha > 0.001;
    var raw = [];
    var all = [];

    for (var k = 0; k < labelEls.length; k++) {
      var idx = labelEls[k];
      var n = nodes[idx];
      var el = n.labelEl;
      if (!el) continue;
      var strong = n.isRoot || n.isCore;
      var isActive = activeIdx === idx;
      var related = activeIdx >= 0 && n._activeSet;
      var allowDoc = n.isDoc && (!interactingNow && camRadius < (mobile ? 560 : 640));
      var show = n.visible && (isActive || (activeIdx < 0 && labelsGloballyVisible && (strong || allowDoc)));
      if (!show) {
        el.style.display = 'none';
        continue;
      }
      var s = screenOf(n.pos);
      if (s.z < -1 || s.z > 1 || s.x < -220 || s.x > width + 220 || s.y < -160 || s.y > height + 160) {
        el.style.display = 'none';
        continue;
      }
      var score = strong ? 1000 : (isActive ? 900 : (related ? 760 + Math.min(60, n.deg || 0) : 180 + Math.min(40, n.deg || 0)));
      var item = {
        idx: idx,
        n: n,
        el: el,
        strong: strong,
        isActive: isActive,
        related: related,
        sx: s.x,
        sy: s.y,
        score: score,
        textAlpha: isActive ? 1 : labelZoomAlpha,
        box: null
      };
      raw.push(item);
      all.push(item);
    }

    raw.sort(function (a, b) { return b.score - a.score; });

    var strongItems = raw.filter(function (v) { return v.strong; });
    var activeItems = raw.filter(function (v) { return !v.strong && v.isActive; });
    var relatedItems = raw.filter(function (v) { return !v.strong && !v.isActive && v.related; });
    var docItems = raw.filter(function (v) { return !v.strong && !v.isActive && !v.related; });
    var docBudget = interactingNow ? 0 : (mobile ? 4 : (camRadius < 460 ? 10 : 6));
    var relatedBudget = mobile ? 4 : 8;
    var totalBudget = mobile ? 8 : 16;

    var selected = [];
    var used = {};
    function add(item) {
      if (!item || used[item.idx]) return;
      used[item.idx] = true;
      selected.push(item);
    }
    if (activeIdx >= 0) {
      for (var ai = 0; ai < raw.length; ai++) {
        if (raw[ai].isActive) { add(raw[ai]); break; }
      }
    } else {
      strongItems.forEach(add);
      relatedItems.slice(0, relatedBudget).forEach(add);
      docItems.slice(0, docBudget).forEach(function (item) {
        if (selected.length < totalBudget) add(item);
      });
    }

    var selectedMap = {};
    selected.forEach(function (item) { selectedMap[item.idx] = true; });
    for (var h = 0; h < all.length; h++) {
      if (!selectedMap[all[h].idx]) all[h].el.style.display = 'none';
    }

    var layerRect = labelLayer.getBoundingClientRect();
    var obstacles = [];
    [tip, drawer].forEach(function (node) {
      if (!node) return;
      var style = window.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return;
      var r = node.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      obstacles.push({
        l: r.left - layerRect.left,
        r: r.right - layerRect.left,
        t: r.top - layerRect.top,
        b: r.bottom - layerRect.top
      });
    });

    var occupied = [];
    selected.sort(function (a, b) { return b.score - a.score; });
    for (var q = 0; q < selected.length; q++) {
      var item2 = selected[q];
      item2.el.style.display = 'block';
      var rr = item2.el.getBoundingClientRect();
      item2.w = Math.max(1, rr.width);
      item2.h = Math.max(1, rr.height);
      var candidates = labelCandidates(item2.sx, item2.sy, item2.w, item2.h);
      var placed = false;
      for (var c = 0; c < candidates.length; c++) {
        var minX = Math.max(SAFE + item2.w / 2, visibleLeft + SAFE + item2.w / 2);
        var maxX = Math.min(width - SAFE - item2.w / 2, visibleRight - SAFE - item2.w / 2);
        var minY = Math.max(SAFE + 1.6 * item2.h, visibleTop + SAFE + 1.6 * item2.h);
        var maxY = Math.min(height - SAFE + 0.6 * item2.h, visibleBottom - SAFE + 0.6 * item2.h);
        var hit = false;
        if (maxX < minX || maxY < minY) {
          hit = true;
          continue;
        }
        var cx = Math.max(minX, Math.min(maxX, candidates[c][0]));
        var cy = Math.max(minY, Math.min(maxY, candidates[c][1]));
        var box = boxOf(cx, cy, item2.w, item2.h);
        for (var o = 0; o < occupied.length; o++) {
          if (labelBoxesOverlap(box, occupied[o], GAP)) { hit = true; break; }
        }
        if (!hit) {
          for (var ob = 0; ob < obstacles.length; ob++) {
            if (labelBoxesOverlap(box, obstacles[ob], GAP + 3)) { hit = true; break; }
          }
        }
        if (hit) continue;
        item2.sx = cx;
        item2.sy = cy;
        item2.box = box;
        occupied.push(box);
        item2.el.style.left = cx.toFixed(1) + 'px';
        item2.el.style.top = cy.toFixed(1) + 'px';
        item2.el.style.opacity = String(item2.isActive ? 1 : item2.textAlpha);
        placed = true;
        break;
      }
      if (!placed) {
        if (item2.strong) {
          var fx = Math.max(SAFE + item2.w / 2, Math.min(width - SAFE - item2.w / 2, item2.sx));
          var fy = Math.max(SAFE + 1.6 * item2.h, Math.min(height - SAFE + 0.6 * item2.h, item2.sy));
          item2.el.style.left = fx.toFixed(1) + 'px';
          item2.el.style.top = fy.toFixed(1) + 'px';
          item2.el.style.opacity = '1';
          occupied.push(boxOf(fx, fy, item2.w, item2.h));
        } else {
          item2.el.style.display = 'none';
          item2._hidden = true;
        }
      }
    }

    var visible = selected.filter(function (item) { return !item._hidden; });
    var overlaps = 0;
    for (var a = 0; a < visible.length; a++) {
      for (var b = a + 1; b < visible.length; b++) {
        if (labelBoxesOverlap(visible[a].box, visible[b].box, 0)) overlaps++;
      }
    }
    window.__galaxyLabelStats = {
      visible: visible.length,
      overlaps: overlaps,
      dragging: !!interactingNow,
      active: activeIdx
    };
  }

  /* ---------------- 筛选面板（保留控件，规格14） ---------------- */
  var gxFilter = { type: 'all', lib: -1, kw: '' };
  function buildPanel() {
    var slot = document.getElementById('gxPanelSlot');
    var types = [['all', '全部'], ['lib', '知识库'], ['doc', '文档'], ['seg', '片段']];
    var html = '<div class="gx-panel" id="gxPanel">' +
      '<div class="gx-panel-t">星河</div>' +
      '<div class="gx-chips" id="gxTypeChips">' + types.map(function (t) {
        return '<span class="gx-chip' + (t[0] === 'all' ? ' on' : '') + '" data-type="' + t[0] + '">' + t[1] + '</span>';
      }).join('') + '</div>' +
      (datasetList.length ? '<div class="gx-chips" id="gxLibChips">' + datasetList.map(function (n, i) {
        var c = LIB_COLORS[i % LIB_COLORS.length];
        return '<span class="gx-chip" data-lib="' + i + '" style="border-color:' + c + '55"><i style="display:inline-block;width:6px;height:6px;border-radius:50%;background:' + c + ';margin-right:4px"></i>' + n + '</span>';
      }).join('') + '</div>' : '') +
      '<input class="gx-search" id="gxSearch" placeholder="搜索节点名…" />' +
      '<div class="gx-stat" id="gxStat"></div>' +
      '</div>';
    var btns = '<div class="gx-btns">' +
      '<button class="gx-btn" id="gxReset">重置布局</button>' +
      '<button class="gx-btn" id="gxFocus">聚焦中心</button>' +
      '<button class="gx-btn" id="gxExport">导出图谱</button>' +
      '</div>';
    if (slot) slot.insertAdjacentHTML('beforeend', html + btns);
    var tc = document.getElementById('gxTypeChips');
    if (tc) tc.addEventListener('click', function (e) {
      var s = e.target.closest('.gx-chip'); if (!s) return;
      gxFilter.type = s.getAttribute('data-type');
      [].forEach.call(tc.children, function (c) { c.classList.toggle('on', c === s); });
      applyFilter();
    });
    var lc = document.getElementById('gxLibChips');
    if (lc) lc.addEventListener('click', function (e) {
      var s = e.target.closest('.gx-chip'); if (!s) return;
      gxFilter.lib = (gxFilter.lib === +s.getAttribute('data-lib')) ? -1 : +s.getAttribute('data-lib');
      [].forEach.call(lc.children, function (c) { c.style.opacity = (gxFilter.lib < 0 || c === s) ? 1 : 0.45; });
      applyFilter();
    });
    var se = document.getElementById('gxSearch');
    if (se) se.addEventListener('input', function () { gxFilter.kw = se.value.trim(); applyFilter(); });
    var rb = document.getElementById('gxReset'); if (rb) rb.addEventListener('click', function () { resetView(); applyFilter(); });
    var fb = document.getElementById('gxFocus'); if (fb) fb.addEventListener('click', function () { unfocus(); resetView(); });
    var eb = document.getElementById('gxExport'); if (eb) eb.addEventListener('click', exportPng);
    applyFilter();
  }

  function basePassesFilter(n) {
    return (gxFilter.type === 'all' || n.kind === gxFilter.type) &&
      (gxFilter.lib < 0 || n.datasetIdx === gxFilter.lib) &&
      (gxFilter.kw === '' || (n.name || '').toLowerCase().indexOf(gxFilter.kw.toLowerCase()) >= 0);
  }

  function syncVisibility(previewIdx) {
    var active = focusIdx >= 0 ? focusIdx : (previewIdx >= 0 ? previewIdx : -1);
    var activeSet = {};
    if (active >= 0 && nodes[active]) {
      activeSet[active] = 1;
      (nodes[active].neighbors || []).forEach(function (idx) { activeSet[idx] = 1; });
      (nodes[active].extraNeighbors || []).forEach(function (idx) { activeSet[idx] = 1; });
    }
    var detail = gxFilter.type === 'seg' || focusIdx >= 0 || camRadius < DETAIL_RADIUS;
    var vis = 0;
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var base = basePassesFilter(n);
      var searched = gxFilter.kw !== '' && base;
      var show = base && (n.kind !== 'seg' || detail || !!activeSet[i] || searched);
      n.visible = show;
      n._activeSet = !!activeSet[i];
      if (show) vis++;

      if (!base) n.alpha = 0.02;
      else if (!show) n.alpha = 0.01;
      else if (active >= 0) n.alpha = activeSet[i] ? 1 : 0.08;
      else if (n.kind === 'seg') n.alpha = detail ? 0.46 : 0.01;
      else if (n.isRoot || n.isCore) n.alpha = 1;
      else n.alpha = 0.88;
    }
    if (alphaAttr) {
      for (var j = 0; j < nodes.length; j++) alphaAttr.array[j] = nodes[j].alpha;
      alphaAttr.needsUpdate = true;
    }
    updateLineColors(active, activeSet);
    var st = document.getElementById('gxStat');
    if (st) st.textContent = '可见星 ' + vis + ' / ' + nodes.length + ' · 连线 ' + edges.length;
    updateLabelsSafe(active);
  }

  function updateLineColors(active, activeSet) {
    if (!lineColorAttr || !lineBaseColors) return;
    for (var i = 0; i < edges.length; i++) {
      var a = nodes[edges[i][0]], b = nodes[edges[i][1]];
      var weight = 0;
      if (a.visible && b.visible) {
        if (active < 0) {
          weight = (a.isCore && b.isCore) ? 0.58 : ((a.isDoc || b.isDoc) ? 0.32 : 0.16);
        } else if (activeSet[edges[i][0]] && activeSet[edges[i][1]]) {
          weight = 0.78;
        } else {
          weight = 0.025;
        }
      }
      for (var k = 0; k < 2; k++) {
        var off = i * 6 + k * 3;
        lineColorAttr.array[off] = lineBaseColors[off] * weight;
        lineColorAttr.array[off + 1] = lineBaseColors[off + 1] * weight;
        lineColorAttr.array[off + 2] = lineBaseColors[off + 2] * weight;
      }
      if (flowAlphaAttr && flowColorAttr && flowBaseColors) {
        var flowWeight = weight > 0.1 ? Math.min(1, weight * 1.15) : 0;
        flowAlphaAttr.array[i] = flowWeight;
        flowColorAttr.array[i * 3] = flowBaseColors[i * 3] * flowWeight;
        flowColorAttr.array[i * 3 + 1] = flowBaseColors[i * 3 + 1] * flowWeight;
        flowColorAttr.array[i * 3 + 2] = flowBaseColors[i * 3 + 2] * flowWeight;
      }
    }
    lineColorAttr.needsUpdate = true;
    if (flowAlphaAttr) flowAlphaAttr.needsUpdate = true;
    if (flowColorAttr) flowColorAttr.needsUpdate = true;
  }

  function updateFlow(time) {
    if (!flowCloud || !flowPosAttr || !flowEdges.length) return;
    for (var i = 0; i < flowEdges.length; i++) {
      var a = flowEdges[i][0], b = flowEdges[i][1];
      var t = (flowPhase[i] + time * flowSpeed[i]) % 1;
      flowPosAttr.array[i * 3] = a.pos.x + (b.pos.x - a.pos.x) * t;
      flowPosAttr.array[i * 3 + 1] = a.pos.y + (b.pos.y - a.pos.y) * t;
      flowPosAttr.array[i * 3 + 2] = a.pos.z + (b.pos.z - a.pos.z) * t;
    }
    flowPosAttr.needsUpdate = true;
  }

  function applyFilter() {
    syncVisibility(-1);
  }
  function resetView() { camTarget.set(0, 0, 0); camRadius = DEFAULT_RADIUS; camTheta = 0.60; camPhi = 0.70; syncVisibility(-1); }

  function exportPng() {
    try {
      var url = renderer.domElement.toDataURL('image/png');
      var a = document.createElement('a'); a.href = url; a.download = 'knowledge-galaxy.png'; a.click();
    } catch (e) { /* 跨域画布可能受限，忽略 */ }
  }

  /* ---------------- 力导向 ---------------- */
  var alpha = 0, alphaTarget = 0;
  function reheat(target) { alpha = Math.max(alpha, target || 0.3); }
  function step() {
    var i, j, n;
    for (i = 0; i < nodes.length; i++) {
      n = nodes[i];
      n._fx = 0; n._fy = 0; n._fz = 0;
      if (!n.visible && n !== dragNode) continue;
      var anchorK = n.isCore ? ANCHOR_K * 2.2 : (n.isDoc ? ANCHOR_K * 1.8 : ANCHOR_K * 1.15);
      if (i === releaseIdx && alpha > RELEASE_ALPHA_STOP) anchorK = 0;
      n._fx += (n.home.x - n.pos.x) * anchorK;
      n._fy += (n.home.y - n.pos.y) * anchorK;
      n._fz += (n.home.z - n.pos.z) * anchorK;
      n._fx -= n.pos.x * CENTER_K;
      n._fy -= n.pos.y * CENTER_K * 0.6;
      n._fz -= n.pos.z * CENTER_K;
    }
    // 可见节点之间保留空间，避免重新缠成毛线团
    for (i = 0; i < nodes.length; i++) {
      var a = nodes[i];
      if (!a.visible && a !== dragNode) continue;
      for (j = i + 1; j < nodes.length; j++) {
        var b = nodes[j];
        if (!b.visible && b !== dragNode) continue;
        var rx = b.pos.x - a.pos.x, ry = b.pos.y - a.pos.y, rz = b.pos.z - a.pos.z;
        var d2 = rx * rx + ry * ry + rz * rz;
        if (d2 < 1) d2 = 1;
        var inv = 1 / Math.sqrt(d2);
        var force = REPULSION / (d2 + 160);
        if (a.kind === 'seg' && b.kind === 'seg') continue;
        if (a.kind === 'seg' || b.kind === 'seg') force *= 0.24;
        if (force > 0.7) force = 0.7;
        var fx = rx * inv * force, fy = ry * inv * force, fz = rz * inv * force;
        a._fx -= fx; a._fy -= fy; a._fz -= fz;
        b._fx += fx; b._fy += fy; b._fz += fz;
      }
    }
    // 层级连线弹簧
    for (i = 0; i < edges.length; i++) {
      var a = nodes[edges[i][0]], b = nodes[edges[i][1]];
      if ((!a.visible && a !== dragNode) || (!b.visible && b !== dragNode)) continue;
      var dx = b.pos.x - a.pos.x, dy = b.pos.y - a.pos.y, dz = b.pos.z - a.pos.z;
      var len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.001;
      var rest = restLen[i];
      var releaseMul = (releaseIdx >= 0 && alpha > RELEASE_ALPHA_STOP &&
        (edges[i][0] === releaseIdx || edges[i][1] === releaseIdx)) ? RELEASE_LINK_MUL : 1;
      var k = LINK_K * releaseMul * (len - rest) / len;
      a._fx += dx * k; a._fy += dy * k; a._fz += dz * k;
      b._fx -= dx * k; b._fy -= dy * k; b._fz -= dz * k;
    }
    for (i = 0; i < nodes.length; i++) {
      n = nodes[i];
      if (n === dragNode) continue;
      if (!n.visible) { n.vel.multiplyScalar(0.65); continue; }
      var strength = alpha;
      n.vel.x = (n.vel.x + n._fx * strength) * VEL_DECAY;
      n.vel.y = (n.vel.y + n._fy * strength) * VEL_DECAY;
      n.vel.z = (n.vel.z + n._fz * strength) * VEL_DECAY;
      var vlen = n.vel.length();
      var vmax = (i === releaseIdx && alpha > RELEASE_ALPHA_STOP) ? RELEASE_MAX_SPEED : 2.4;
      if (vlen > vmax) n.vel.multiplyScalar(vmax / vlen);
      n.pos.x += n.vel.x; n.pos.y += n.vel.y; n.pos.z += n.vel.z;
      var radius = n.pos.length();
      if (radius > GAL_R * 2.2) n.pos.multiplyScalar((GAL_R * 2.2) / radius);
    }
    if (releaseIdx >= 0 && alpha <= RELEASE_ALPHA_STOP) releaseIdx = -1;
  }

  /* ---------------- 相机 ---------------- */
  var camTarget = new THREE.Vector3(0, 0, 0), camRadius = DEFAULT_RADIUS, camTheta = 0.60, camPhi = 0.70;
  function updateCamera() {
    var x = camTarget.x + camRadius * Math.sin(camPhi) * Math.cos(camTheta);
    var y = camTarget.y + camRadius * Math.cos(camPhi);
    var z = camTarget.z + camRadius * Math.sin(camPhi) * Math.sin(camTheta);
    camera.position.set(x, y, z); camera.lookAt(camTarget);
  }

  /* ---------------- 交互 ---------------- */
  var ray = new THREE.Raycaster();
  ray.params.Points = { threshold: 14 };
  var pointer = new THREE.Vector2(-9, -9);
  var dragNode = null, dragCandidate = null, dragging = false, interacting = false, pointerDown = false, downX = 0, downY = 0, moved = 0;
  var hoverIdx = -1, focusIdx = -1, focusAnim = 0, lastHover = -1;
  var plane = new THREE.Plane(), planeN = new THREE.Vector3(), hit = new THREE.Vector3();
  var panRight = new THREE.Vector3(), panUp = new THREE.Vector3();

  function setPointer(e) {
    var r = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  }
  function pick() {
    ray.setFromCamera(pointer, camera);
    var hits = ray.intersectObject(cloud);
    return hits.length ? hits[0].index : -1;
  }
  function screenOf(v) {
    var p = v.clone().project(camera);
    var r = renderer.domElement.getBoundingClientRect();
    return { x: (p.x * 0.5 + 0.5) * r.width, y: (-p.y * 0.5 + 0.5) * r.height, z: p.z };
  }

  renderer.domElement.addEventListener('pointerdown', function (e) {
    pointerDown = true;
    interacting = false;
    hoverIdx = -1; lastHover = -1; tip.style.display = 'none';
    if (focusIdx < 0) syncVisibility(-1);
    releaseIdx = -1;
    if (renderer.domElement.setPointerCapture) {
      try { renderer.domElement.setPointerCapture(e.pointerId); } catch (err) {}
    }
    setPointer(e); downX = e.clientX; downY = e.clientY; moved = 0;
    var idx = pick();
    if (idx >= 0) { dragCandidate = idx; dragging = false; }
    else { dragCandidate = null; dragging = false; }
    stage.classList.add('grabbing');
  });
  renderer.domElement.addEventListener('pointermove', function (e) {
    setPointer(e);
    if (!pointerDown) {
      var hoverIdxNow = pick();
      if (hoverIdxNow >= 0) {
        showTip(hoverIdxNow, e);
        lastHover = hoverIdxNow;
      } else {
        hideTip();
        lastHover = -1;
      }
      return;
    }
    var dx = e.clientX - downX, dy = e.clientY - downY;
    moved = Math.max(moved, Math.abs(dx) + Math.abs(dy));
    if (moved > 4) interacting = true;
    if (dragCandidate != null && moved > 4) {
      if (!dragging && focusIdx >= 0) {
        focusIdx = -1; focusAnim = 0;
        if (drawer) drawer.classList.remove('open');
        syncVisibility(-1);
      }
      dragging = true; dragNode = nodes[dragCandidate]; alphaTarget = 0.3; reheat(0.3);
    }
    if (dragging && dragNode) {
      reheat(0.3);
      ray.setFromCamera(pointer, camera);
      camera.getWorldDirection(planeN);
      plane.setFromNormalAndCoplanarPoint(planeN, dragNode.pos);
      if (ray.ray.intersectPlane(plane, hit)) {
        dragNode.vel.set(hit.x - dragNode.pos.x, hit.y - dragNode.pos.y, hit.z - dragNode.pos.z).multiplyScalar(0.55);
        dragNode.pos.copy(hit);
      }
      return;
    }
    if (dragCandidate == null) {
      // 空白处拖拽 = 平移，贴近 Obsidian graph 的探索手感
      panRight.setFromMatrixColumn(camera.matrixWorld, 0);
      panUp.setFromMatrixColumn(camera.matrixWorld, 1);
      var panScale = camRadius / Math.max(1, renderer.domElement.clientWidth);
      camTarget.addScaledVector(panRight, -dx * panScale);
      camTarget.addScaledVector(panUp, dy * panScale);
      downX = e.clientX; downY = e.clientY;
      return;
    }
  });
  function endDrag() {
    if (dragging && dragNode) {
      dragNode.vel.set(0, 0, 0);
      releaseIdx = dragCandidate;
      alphaTarget = 0;
      reheat(0.3);
    }
    dragNode = null; dragging = false; interacting = false; dragCandidate = null; stage.classList.remove('grabbing');
  }
  renderer.domElement.addEventListener('pointerup', function (e) {
    if (!dragging && dragCandidate != null && moved <= 4) {
      // 点击星 = 聚焦钻入
      focusOn(dragCandidate);
    } else if (!dragging && dragCandidate == null && moved <= 4) {
      unfocus();
    }
    pointerDown = false;
    endDrag();
    hideTip();
    if (renderer.domElement.releasePointerCapture) {
      try { renderer.domElement.releasePointerCapture(e.pointerId); } catch (err) {}
    }
  });
  renderer.domElement.addEventListener('pointerleave', function () { if (!pointerDown) hideTip(); });
  renderer.domElement.addEventListener('pointercancel', function () { pointerDown = false; endDrag(); hideTip(); });
  window.addEventListener('blur', function () { if (pointerDown) { pointerDown = false; endDrag(); hideTip(); } });
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape') unfocus(); });

  renderer.domElement.addEventListener('wheel', function (e) {
    e.preventDefault();
    camRadius *= (e.deltaY > 0 ? 1.14 : 0.88);
    camRadius = Math.max(260, Math.min(3200, camRadius));
    syncVisibility(-1);
  }, { passive: false });

  function nearestToCursor(e) {
    var r = renderer.domElement.getBoundingClientRect();
    var cx = e.clientX - r.left, cy = e.clientY - r.top, best = -1, bd = 90;
    for (var i = 0; i < nodes.length; i++) {
      var s = screenOf(nodes[i].pos); if (s.z > 1) continue;
      var dd = Math.hypot(s.x - cx, s.y - cy);
      if (dd < bd) { bd = dd; best = i; }
    }
    return best;
  }

  function focusOn(idx) {
    focusIdx = idx; focusAnim = 1; unfocusNeighbors();
    highlightNeighbors(idx, true);
    openDrawer(idx);
  }
  function unfocus() {
    if (focusIdx >= 0) highlightNeighbors(focusIdx, false);
    focusIdx = -1; focusAnim = 0;
    if (drawer) drawer.classList.remove('open');
    syncVisibility(-1);
  }
  function highlightNeighbors(idx, on) {
    if (focusIdx >= 0) syncVisibility(on ? idx : -1);
  }
  function unfocusNeighbors() { /* 由 highlightNeighbors(false) 恢复 */ }

  function showTip(idx, e) {
    var n = nodes[idx];
    tip.innerHTML = '<b>' + esc(n.name) + '</b><br><span class="k">库</span> ' + esc(n.dataset) + ' · <span class="k">关联</span> ' + n.deg;
    tip.style.display = 'block';
    tip.style.left = Math.min(e.clientX + 14, (stageRect.width || 800) - 220) + 'px';
    tip.style.top = (e.clientY + 14) + 'px';
    hoverIdx = idx;
  }
  function hideTip() {
    tip.style.display = 'none'; hoverIdx = -1;
    if (focusIdx < 0) updateLabelsSafe(-1);
  }

  /* 详情抽屉：点星滑出（规格9/11） */
  function openDrawer(idx) {
    if (!drawer) return;
    var n = nodes[idx]; if (!n) return;
    var title = document.getElementById('gxDTitle');
    var meta = document.getElementById('gxDMeta');
    var body = document.getElementById('gxDBody');
    var dateTxt = n.birth || '';
    if (title) title.textContent = n.name || n.id;
    if (meta) meta.textContent = '库：' + (n.dataset || '-') + ' · 关联星 ' + n.deg + (dateTxt ? ' · ' + dateTxt : '');
    var html = '';
    if (n.preview) html += '<div class="gx-prev">' + esc(n.preview) + '</div>';
    if (n.doc) html += '<div class="gx-docmeta">来源文档：' + esc(n.doc) + '</div>';
    if (!html) html = '<div class="gx-docmeta">（该节点暂无片段预览）</div>';
    if (body) body.innerHTML = html;
    drawer.classList.add('open');
  }

  document.getElementById('gxDClose') && document.getElementById('gxDClose').addEventListener('click', function () { drawer.classList.remove('open'); });

  /* ---------------- 循环 ---------------- */
  var t0 = performance.now();
  function loop() {
    requestAnimationFrame(loop);
    window.__galaxyFrames = (window.__galaxyFrames || 0) + 1;
    var t = (performance.now() - t0) / 1000;
    starMat.uniforms.uTime.value = t;
    if (dust) dust.rotation.y += 0.00018;
    step(performance.now());
    alpha += (alphaTarget - alpha) * ALPHA_DECAY;
    if (alpha < ALPHA_MIN) alpha = 0;
    // 同步几何
    if (cloud && posAttr) {
      for (var i = 0; i < nodes.length; i++) {
        posAttr.array[i * 3] = nodes[i].pos.x; posAttr.array[i * 3 + 1] = nodes[i].pos.y; posAttr.array[i * 3 + 2] = nodes[i].pos.z;
      }
      posAttr.needsUpdate = true;
    }
    if (lines && linePosAttr) {
      for (var e = 0; e < edges.length; e++) {
        var a = nodes[edges[e][0]], b = nodes[edges[e][1]];
        linePosAttr.array[e * 6] = a.pos.x; linePosAttr.array[e * 6 + 1] = a.pos.y; linePosAttr.array[e * 6 + 2] = a.pos.z;
        linePosAttr.array[e * 6 + 3] = b.pos.x; linePosAttr.array[e * 6 + 4] = b.pos.y; linePosAttr.array[e * 6 + 5] = b.pos.z;
      }
      linePosAttr.needsUpdate = true;
    }
    updateFlow(t);
    // 聚焦动画
    if (focusAnim > 0 && focusIdx >= 0) {
      camTarget.lerp(nodes[focusIdx].pos, 0.06);
      camRadius += (FOCUS_RADIUS - camRadius) * 0.06;
    } else {
      camTheta += AUTO_SPIN; // 极慢自转
    }
    updateCamera();
    updateLabelsSafe(focusIdx >= 0 ? focusIdx : (dragging && dragCandidate != null ? dragCandidate : hoverIdx));
    renderer.render(scene, camera);
  }
  loop();

  /* ---------------- 尺寸 ---------------- */
  function resize() {
    stageRect = stage.getBoundingClientRect();
    W = Math.max(1, stageRect.width || 800); H = Math.max(1, stageRect.height || 600);
    camera.aspect = W / H; camera.updateProjectionMatrix();
    renderer.setSize(W, H, false);
  }
  window.__galaxyResize = resize;
  if (window.ResizeObserver) { try { new ResizeObserver(resize).observe(stage); } catch (e) {} }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
    return true;
  };
})();


