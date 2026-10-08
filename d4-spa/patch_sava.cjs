const fs=require("fs");
let s=fs.readFileSync("index.html","utf8");
const anchor="#page-tasks tbody td>div{vertical-align:middle}";
const add="#page-tasks tbody td>div{vertical-align:middle}\n#page-tasks tbody .s-ava{margin:0 0 auto} /* D4-002 对齐表头：清除 auto 水平外边距 */";
if(s.includes(anchor) && !s.includes("#page-tasks tbody .s-ava{margin:0 0 auto}")){
  s=s.replace(anchor, add);
  fs.writeFileSync("index.html",s);
  console.log("patched");
}else{
  console.log("anchor missing or already patched: ", s.includes("#page-tasks tbody .s-ava{margin:0 0 auto}"));
}
