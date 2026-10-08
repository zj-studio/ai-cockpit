/* 全站星空背景：与知识银河同源，固定最底层，不拦截操作 */
(function () {
  if (typeof THREE === "undefined") return;
  var mount = document.createElement("div");
  mount.id = "starBg";
  mount.style.cssText = "position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden";
  document.body.prepend(mount);

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(55, 1, 1, 8000);
  camera.position.z = 900;
  var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  var PR = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(PR);
  renderer.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%";
  mount.appendChild(renderer.domElement);

  var COLORS = [
    [105,231,255],[179,157,255],[255,155,210],
    [98,250,211],[143,211,255],[255,255,255]
  ];
  var N = 1100, R = 2600;
  var pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  var siz = new Float32Array(N), ph = new Float32Array(N),
      sp = new Float32Array(N), tw = new Float32Array(N);
  for (var i = 0; i < N; i++) {
    var u = Math.random(), v = Math.random();
    var theta = 2 * Math.PI * u, phi = Math.acos(2 * v - 1);
    var rr = R * (0.35 + 0.65 * Math.cbrt(Math.random()));
    pos[i*3]   = rr * Math.sin(phi) * Math.cos(theta);
    pos[i*3+1] = rr * Math.sin(phi) * Math.sin(theta);
    pos[i*3+2] = rr * Math.cos(phi) - 400;
    var c = COLORS[Math.floor(Math.random() * COLORS.length)];
    var bright = 0.55 + Math.random() * 0.45;
    col[i*3]   = c[0]/255 * bright;
    col[i*3+1] = c[1]/255 * bright;
    col[i*3+2] = c[2]/255 * bright;
    siz[i] = 4 + Math.random() * 9;
    ph[i] = Math.random() * 6.28;
    sp[i] = 0.6 + Math.random() * 1.6;
    tw[i] = Math.random();
  }
  var geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(siz, 1));
  geo.setAttribute("aPhase", new THREE.BufferAttribute(ph, 1));
  geo.setAttribute("aSpeed", new THREE.BufferAttribute(sp, 1));
  geo.setAttribute("aTw", new THREE.BufferAttribute(tw, 1));

  var VS = [
    "attribute float aSize;",
    "attribute vec3 aColor;",
    "attribute float aPhase;",
    "attribute float aSpeed;",
    "attribute float aTw;",
    "varying vec3 vColor;",
    "varying float vTw;",
    "varying float vPhase;",
    "varying float vSpeed;",
    "uniform float uPR;",
    "uniform float uTime;",
    "void main(){",
    "  vColor=aColor;",
    "  vTw=aTw;",
    "  vPhase=aPhase;",
    "  vSpeed=aSpeed;",
    "  vec4 mv = modelViewMatrix * vec4(position,1.0);",
    "  gl_PointSize = aSize*uPR*(420.0/max(1.0,-mv.z));",
    "  gl_Position = projectionMatrix*mv;",
    "}"
  ].join("\n");
  var FS = [
    "varying vec3 vColor;",
    "varying float vTw;",
    "varying float vPhase;",
    "varying float vSpeed;",
    "uniform float uTime;",
    "void main(){",
    "  vec2 uv = gl_PointCoord - vec2(0.5);",
    "  float d = length(uv);",
    "  if(d>0.5) discard;",
    "  float core = smoothstep(0.13,0.0,d);",
    "  float halo = pow(max(0.0,1.0-d*2.0),2.1);",
    "  float s = 0.5+0.5*sin(uTime*vSpeed+vPhase);",
    "  float tw = 1.0 - vTw*0.35*s;",
    "  float a = clamp(core*0.95+halo*0.7,0.0,1.0)*tw;",
    "  vec3 c = vColor*(0.85+0.5*core)+vec3(core)*0.3;",
    "  gl_FragColor = vec4(c,a);",
    "}"
  ].join("\n");

  var mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPR: { value: PR } },
    vertexShader: VS,
    fragmentShader: FS,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  var points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);

  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  resize();

  var t0 = performance.now();
  function loop(t) {
    var u = (t - t0) / 1000;
    mat.uniforms.uTime.value = u;
    points.rotation.y = u * 0.012;
    points.rotation.x = u * 0.004;
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
