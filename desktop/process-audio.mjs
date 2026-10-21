import { spawn, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

// Only main calls start with a freshly enumerated, explicitly selected source.
export function createProcessAudio(executable) {
  let active;
  let supported=false;
  try { supported=process.platform==='win32'&&execFileSync(executable,['--capabilities'],{encoding:'utf8',timeout:3000,windowsHide:true}).trim()==='supported'; } catch { /* Fail closed if helper/API is unavailable. */ }
  function stop(){if(!active)return;const previous=active;active=undefined;clearTimeout(previous.deadline);clearInterval(previous.watchdog);previous.waiter?.(null);previous.child.kill();previous.queue=[];}
  return {
    supported,
    stop,
    async start(sourceId){
      stop();const match=/^window:(\d+):\d+$/.exec(sourceId);
      if(!supported||!match||BigInt(match[1])===0n)throw Error('unsupported-target');
      const child=spawn(executable,[match[1],String(process.pid)],{windowsHide:true,stdio:['ignore','pipe','pipe']});
      const current={child,id:randomUUID(),queue:[],queuedFrames:0,waiter:null,claimed:false,lastPull:Date.now()};active=current;
      current.deadline=setTimeout(()=>{if(active===current)stop();},10000);
      current.watchdog=setInterval(()=>{if(active===current&&Date.now()-current.lastPull>5000)stop();},1000);
      let pending=Buffer.alloc(0);
      child.stdout.on('data',chunk=>{
        if(active!==current)return;
        pending=Buffer.concat([pending,chunk]);
        while(pending.length>=12){
          const frames=pending.readUInt32LE(0);
          if(!frames||frames>2048){stop();return;}
          const size=12+frames*8;if(pending.length<size)break;
          const timestamp=pending.readDoubleLE(4);
          if(!Number.isFinite(timestamp)){stop();return;}
          const packet={frames,timestamp,data:new Uint8Array(pending.subarray(12,size))};pending=pending.subarray(size);
          if(current.waiter){const resolve=current.waiter;current.waiter=null;resolve(packet);}
          else {current.queue.push(packet);current.queuedFrames+=frames;while(current.queuedFrames>4800){current.queuedFrames-=current.queue.shift().frames;}}
        }
        if(pending.length>16400)stop();
      });
      child.on('exit',()=>{if(active===current)stop();});
      await new Promise((resolve,reject)=>{
        let status='';const timeout=setTimeout(()=>{if(active===current)stop();reject(Error('activation-timeout'));},8500);
        const failed=()=>{clearTimeout(timeout);reject(Error(['unsupported','invalid-target','inaccessible-target','activation-failed','capture-failed'].includes(status.trim())?status.trim():'capture-unavailable'));};
        child.once('error',failed);child.once('exit',failed);
        child.stderr.on('data',chunk=>{
          status=(status+chunk.toString()).slice(-128);
          if(status.trim()==='ready'){clearTimeout(timeout);child.removeListener('exit',failed);child.removeListener('error',failed);resolve();}
        });
      });
      if(active!==current)throw Error('capture-cancelled');
    },
    claim(){if(!active||active.claimed)return null;active.claimed=true;clearTimeout(active.deadline);return {id:active.id};},
    pull(id){
      if(!active||!active.claimed||id!==active.id||active.waiter)return Promise.resolve(null);
      active.lastPull=Date.now();const packet=active.queue.shift();if(packet){active.queuedFrames-=packet.frames;return Promise.resolve(packet);}
      return new Promise(resolve=>{active.waiter=resolve;});
    },
    release(id){if(active?.id===id)stop();},
  };
}
