const { contextBridge, ipcRenderer } = require('electron');
const guestStream=process.argv.includes('--blueprint-stream-window');
if(guestStream)contextBridge.exposeInMainWorld('blueprintStreamDesktop',{
  version:1,
  diagnostic:stage=>ipcRenderer.invoke('stream:diagnostic',stage),
  consumeInvite:()=>ipcRenderer.invoke('stream:invite'),
  usageRead:()=>ipcRenderer.invoke('stream:usage-read'),
  usageWrite:rows=>ipcRenderer.invoke('stream:usage-write',rows),
  configure:value=>ipcRenderer.invoke('stream:configure',value),
});
const subscribe = (channel, callback) => { const listener = (_event, value) => callback(value); ipcRenderer.on(channel, listener); return () => ipcRenderer.removeListener(channel, listener); };
contextBridge.exposeInMainWorld('blueprintDesktop', {
  configure: state => ipcRenderer.invoke('room:configure', state),
  onAction: callback => subscribe('room:action', callback),
  onConflicts: callback => subscribe('room:conflicts', callback),
  settings: () => ipcRenderer.invoke('room:settings'),
  startup: enabled => ipcRenderer.invoke('room:startup', enabled),
});
let recording = false;
function inputState() { const target = document.activeElement; ipcRenderer.send('room:input', { recording, typing: !!target?.closest('input,textarea,select,[contenteditable="true"],[role="textbox"],[data-shortcut-editor]') }); }
window.addEventListener('blueprint-recording', event => { recording = event.detail === true; inputState(); });
document.addEventListener('focusin', inputState); document.addEventListener('focusout', () => queueMicrotask(inputState));
// Main destroys the WebContents on explicit exit; Chromium releases all capture, including observers.

// Installed in the main world before the hosted application obtains getDisplayMedia.
// The hosted SDK receives a normal video + ScreenShareAudio MediaStream; no web deploy.
function installCapture(contextBridge, ipcRenderer) {
  const prefix=guestStream?'stream-capture':'capture';
  contextBridge.exposeInMainWorld('blueprintCapture', {
    claim:()=>ipcRenderer.invoke(`${prefix}:claim`),
    pull:id=>ipcRenderer.invoke(`${prefix}:pull`,id),
    stop:id=>ipcRenderer.invoke(`${prefix}:stop`,id),
  });
  contextBridge.executeInMainWorld({func:()=>{
    if(!navigator.mediaDevices?.getDisplayMedia)return;
    const original=navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
    const bridge=window.blueprintCapture;
    navigator.mediaDevices.getDisplayMedia=async options=>{
      const stream=await original(options);
      let grant;
      try {
        grant=await bridge.claim();if(!grant)return stream;
        if(typeof MediaStreamTrackGenerator!=='function'||typeof AudioData!=='function')throw Error('Áudio do aplicativo indisponível nesta versão.');
        const audio=new MediaStreamTrackGenerator({kind:'audio'}),writer=audio.writable.getWriter();
        const video=stream.getVideoTracks()[0];if(!video||video.readyState!=='live')throw Error('Captura encerrada.');
        let ended=false,firstTimestamp,anchor;const originalStops=new Map();
        const finish=(unexpected=false)=>{
          if(ended)return;ended=true;void bridge.stop(grant.id);void writer.abort().catch(()=>{});
          for(const [track,stop] of originalStops){stop();if(unexpected)track.dispatchEvent(new Event('ended'));}
          window.removeEventListener('pagehide',onHide);
        };
        const onHide=()=>finish();
        for(const track of [video,audio]){const stop=track.stop.bind(track);originalStops.set(track,stop);track.stop=()=>finish();track.addEventListener('ended',()=>finish(),{once:true});}
        window.addEventListener('pagehide',onHide,{once:true});
        // Never connect to an AudioContext destination or local speakers.
        stream.addTrack(audio);
        void (async()=>{
          try {while(!ended){
            const packet=await bridge.pull(grant.id);if(!packet){finish(true);break;}
            if(firstTimestamp===undefined){firstTimestamp=packet.timestamp;anchor=performance.now()*1000;}
            const data=new AudioData({format:'f32',sampleRate:48000,numberOfFrames:packet.frames,numberOfChannels:2,timestamp:Math.round(anchor+packet.timestamp-firstTimestamp),data:packet.data});
            try{await writer.write(data);}finally{data.close();}
          }}catch{finish(true);}
        })();
        return stream;
      } catch(error){stream.getTracks().forEach(track=>track.stop());if(grant)void bridge.stop(grant.id);throw error;}
    };
  }});
};

installCapture(contextBridge, ipcRenderer);
