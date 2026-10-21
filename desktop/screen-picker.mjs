import { BrowserWindow, desktopCapturer, ipcMain } from 'electron';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url));
const pickerUrl=pathToFileURL(path.join(here,'picker.html')).href;
export function createScreenPicker(parent, options={}) {
  let active,generation=0;
  const enumerate=()=>desktopCapturer.getSources({types:['screen','window'],thumbnailSize:{width:320,height:180},fetchWindowIcons:false});
  const describe=sources=>sources.map(source=>({id:source.id,name:source.name,kind:source.id.startsWith('screen:')?'screen':'window',thumbnail:source.thumbnail.isEmpty?.()?null:source.thumbnail.toDataURL()}));
  const permitted=event=>active && event.sender===active.window.webContents && event.senderFrame===active.window.webContents.mainFrame && event.senderFrame.url===pickerUrl;
  const listing=()=>({sources:active.sources,audio:active.audio,applicationAudio:active.audio&&options.applicationAudio===true});
  ipcMain.handle('picker:list',event=>{if(!permitted(event))throw Error('Invalid picker');return listing();});
  ipcMain.handle('picker:refresh',async event=>{
    if(!permitted(event)||active.pending||active.refreshing)throw Error('Invalid picker');
    const current=active;current.refreshing=true;
    try{const sources=await enumerate();if(active!==current)throw Error('Closed picker');current.sources=describe(sources);return listing();}finally{current.refreshing=false;}
  });
  ipcMain.handle('picker:cancel',event=>{if(permitted(event))active.finish(null);});
  ipcMain.handle('picker:choose',async(event,value)=>{
    if(!permitted(event)||active.pending||active.refreshing||!value||typeof value.id!=='string'||!['none','system','application'].includes(value.audio)||!active.sources.some(source=>source.id===value.id))return {error:'Seleção inválida.'};
    if(value.audio!=='none'&&!active.audio||value.audio==='application'&&(!options.applicationAudio||!/^window:\d+:\d+$/.test(value.id)))return {error:'Áudio do aplicativo indisponível para esta fonte.'};
    const current=active;current.pending=true;
    try {
      const sources=await desktopCapturer.getSources({types:['screen','window'],thumbnailSize:{width:0,height:0}});
      if(active!==current)return {error:'Seleção encerrada.'};
      const source=sources.find(source=>source.id===value.id);
      if(!source){current.pending=false;return {error:'A fonte foi fechada. Escolha outra ou cancele.'};}
      if(value.audio==='application')await options.startApplicationAudio(source.id);
      if(active!==current){options.cancelAudio?.();return {error:'Seleção encerrada.'};}
      current.finish({video:source,applicationAudio:value.audio==='application',...(value.audio==='system'?{audio:'loopback'}:{})});return {ok:true};
    }catch{options.cancelAudio?.();if(active===current)current.pending=false;return {error:value.audio==='application'?'Não foi possível capturar este aplicativo. Nenhum áudio do sistema foi ativado. Escolha outra fonte ou Sem áudio.':'Não foi possível selecionar a fonte. Tente novamente ou cancele.'};}
  });
  return {
    cancel(){generation++;active?.finish(null);},
    async choose(audioRequested){
      if(active)return null;
      const attempt=generation;
      let sources;
      try {sources=await enumerate();}catch{return null;}
      if(active||parent.isDestroyed()||attempt!==generation)return null;
      return new Promise(resolve=>{
        const window=new BrowserWindow({parent,modal:true,width:780,height:620,minWidth:520,minHeight:460,title:'Compartilhar tela',backgroundColor:'#10151b',autoHideMenuBar:true,webPreferences:{preload:path.join(here,'picker-preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,partition:'blueprint-picker'}});
        let finished=false;const timer=setTimeout(()=>finish(null),120000);
        window.webContents.session.setPermissionCheckHandler(()=>false);
        window.webContents.session.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
        function finish(value){if(finished)return;finished=true;clearTimeout(timer);if(!value)options.cancelAudio?.();active=undefined;sources=[];if(!window.isDestroyed())window.destroy();resolve(value);}
        active={window,finish,pending:false,audio:audioRequested&&process.platform==='win32',sources:describe(sources)};
        window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
        window.webContents.on('will-navigate',event=>event.preventDefault());
        window.webContents.on('will-attach-webview',event=>event.preventDefault());
        window.webContents.on('render-process-gone',()=>finish(null));
        window.on('closed',()=>finish(null));
        void window.loadFile(path.join(here,'picker.html')).catch(()=>finish(null));
      });
    },
  };
}
