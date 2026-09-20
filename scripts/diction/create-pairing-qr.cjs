const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const runtime=path.resolve(__dirname,'..','..','.private','diction');
const env={...process.env};
for(const line of fs.readFileSync(path.join(runtime,'.env'),'utf8').split(/\r?\n/)){
  const match=/^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line);
  if(match)env[match[1]]=match[2];
}
if(process.argv[2])env.DICTION_TEST_AUDIO=path.resolve(process.argv[2]);
const result=spawnSync(path.join(runtime,'bin','diction-pairqr.exe'),[path.join(runtime,'pairing.png')],{
  env,windowsHide:true,encoding:'utf8',timeout:210000
});
if(result.stdout)process.stdout.write(result.stdout);
if(result.stderr)process.stderr.write(result.stderr);
if(result.error)throw result.error;
process.exitCode=result.status??1;
