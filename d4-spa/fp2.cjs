const fs=require('fs');
const f='graph-force.js';
let s=fs.readFileSync(f,'utf8');
// 1) 初始分布更大：库在半径~180，片段在半径~300
s=s.replace("x:(Math.random()*2-1)*120,y:(Math.random()*2-1)*120,vx:0,vy:0,r:22","x:(Math.random()*2-1)*170,y:(Math.random()*2-1)*170,vx:0,vy:0,r:22");
s=s.replace("x:(Math.random()*2-1)*240,y:(Math.random()*2-1)*240,vx:0,vy:0,r:9","x:(Math.random()*2-1)*300,y:(Math.random()*2-1)*300,vx:0,vy:0,r:9");
// 2) 力参数：斥力更大、弹簧更软、中心向心力减弱
s=s.replace("var KR=900, KS=0.03, KSPRING=0.06, KVISC=0.85, KC=0.02;","var KR=5200, KS=0.03, KSPRING=0.018, KVISC=0.8, KC=0.0035;");
// 3) 斥力公式降低分母影响让节点明显散开
s=s.replace("var f=KR/(d2+900);if(a.kind==='seg'||b.kind==='seg')f*=0.55;","var f=KR/(d2+1400);if(a.kind==='seg'||b.kind==='seg')f*=0.6;");
// 4) 理想长度加长，层级拉开
s=s.replace("function ideal(a,b){var ra=a.r+b.r;if(a.kind==='seg'&&b.kind==='seg')return ra+30;if(a.kind==='lib'&&b.kind!=='seg')return ra+10;if(a.kind==='root')return ra+70;return ra+55;}","function ideal(a,b){var ra=a.r+b.r;if(a.kind==='seg'&&b.kind==='seg')return ra+42;if((a.kind==='lib'&&b.kind!=='seg')||(a.kind!=='seg'&&b.kind==='lib'))return ra+28;if(a.kind==='root'||b.kind==='root')return ra+130;return ra+90;}");
// 5) 漂移增强一点
s=s.replace("n.vx+=(Math.random()-0.5)*0.015; n.vy+=(Math.random()-0.5)*0.015;","n.vx+=(Math.random()-0.5)*0.02; n.vy+=(Math.random()-0.5)*0.02;");
// 6) 每帧多跑几轮让布局更快散开
s=s.replace("for(var s=0;s<2;s++)step();","for(var s=0;s<4;s++)step();");
fs.writeFileSync(f,s);
console.log('params updated');
