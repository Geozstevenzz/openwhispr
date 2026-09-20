const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..', '..');
const runtime = path.join(root, '.private', 'diction');
const env = {...process.env};
for (const line of fs.readFileSync(path.join(runtime,'.env'),'utf8').split(/\r?\n/)) {
  const match=/^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line);
  if(match) env[match[1]]=match[2];
}
env.TEMP=env.TMP=path.join(runtime,'tmp');
if(env.DICTION_FFMPEG_DIR) env.PATH=env.DICTION_FFMPEG_DIR+path.delimiter+env.PATH;
const children=new Map();
let stopping=false;
const status=http.createServer((req,res)=>{
  res.setHeader('Content-Type','application/json');
  res.end(JSON.stringify({services:[...children].map(([name,child])=>({name,pid:child.pid}))}));
});
status.on('error',err=>{if(err.code==='EADDRINUSE')process.exit(0);throw err;});
function start(name,file,args){
  if(stopping)return;
  const log=fs.openSync(path.join(runtime,'logs',name+'.log'),'a');
  const child=spawn(file,args,{cwd:root,env,windowsHide:true,stdio:['ignore','ignore',log]});
  fs.closeSync(log);children.set(name,child);
  child.on('error',()=>{});
  child.on('close',()=>{children.delete(name);if(!stopping)setTimeout(()=>start(name,file,args),5000);});
}
status.listen(8181,'127.0.0.1',()=>{
  start('bridge',process.execPath,[path.join(root,'examples','diction-whisper-bridge','bridge.mjs')]);
  start('gateway',path.join(runtime,'bin','diction-gateway.exe'),[]);
});
function stop(){stopping=true;for(const child of children.values())child.kill();status.close();}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
