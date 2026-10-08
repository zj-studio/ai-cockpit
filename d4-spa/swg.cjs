const fs=require('fs');
const f='app.js';
let s=fs.readFileSync(f,'utf8');
const oldCall="  var ok=window.__startGalaxy && window.__startGalaxy();";
const newCall="  var ok=window.__startGraphForce ? window.__startGraphForce() : (window.__startGalaxy && window.__startGalaxy());";
if(s.includes(oldCall)){ s=s.replace(oldCall,newCall); fs.writeFileSync(f,s); console.log('switched to graph-force'); }
else console.log('oldCall not found: '+s.includes('__startGalaxy'));
