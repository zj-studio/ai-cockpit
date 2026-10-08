const fs=require('fs');
const f='index.html';
let s=fs.readFileSync(f,'utf8');
s=s.replace('<script src="galaxy3d.js"></script>','<script src="galaxy3d.js"></script>\n<script src="graph-force.js"></script>');
fs.writeFileSync(f,s);
console.log('injected graph-force.js:',s.includes('graph-force.js'));
