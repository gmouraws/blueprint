import { BrowserWindow, desktopCapturer, ipcMain } from 'electron';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url));
const pickerUrl=pathToFileURL(path.join(here,'picker.html')).href;
export function createScreenPicker(parent) {
  let active,generation=0;
  const permitted=event=>active && event.sender===active.window.webContents && event.senderFrame===active.window.webContents.mainFrame && event.senderFrame.url===pickerUrl;
  ipcMain.handle('picker:list',event=>{if(!permitted(event))throw Error('Invalid picker');return {sources:active.sources,audio:active.audio};});
  ipcMain.handle('picker:cancel',event=>{if(permitted(event))active.finish(null);});
  ipcMain.handle('picker:choose',async(event,value)=>{
    if(!permitted(event)||active.pending||!value||typeof value.id!=='string'||typeof value.audio!=='boolean'||!active.sources.some(source=>source.id===value.id))return {error:'Seleção inválida.'};
    const current=active;current.pending=true;
    try {
      const sources=await desktopCapturer.getSources({types:['screen','window'],thumbnailSize:{width:0,height:0}});
      if(active!==current)return {error:'Seleção encerrada.'};
      const source=sources.find(source=>source.id===value.id);
      if(!source){current.pending=false;return {error:'A fonte foi fechada. Escolha outra ou cancele.'};}
      current.finish({video:source,...(current.audio&&value.audio?{audio:'loopback'}:{})});return {ok:true};
    }catch{if(active===current)current.pending=false;return {error:'Não foi possível selecionar a fonte. Tente novamente ou cancele.'};}
  });
  return {
    cancel(){generation++;active?.finish(null);},
    async choose(audioRequested){
      if(active)return null;
      const attempt=generation;
      let sources;
      try {sources=await desktopCapturer.getSources({types:['screen','window'],thumbnailSize:{width:320,height:180},fetchWindowIcons:false});}catch{return null;}
      if(active||parent.isDestroyed()||attempt!==generation)return null;
      return new Promise(resolve=>{
        const window=new BrowserWindow({parent,modal:true,width:780,height:620,minWidth:520,minHeight:460,title:'Compartilhar tela',backgroundColor:'#10151b',autoHideMenuBar:true,webPreferences:{preload:path.join(here,'picker-preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,partition:'blueprint-picker'}});
        let finished=false;const timer=setTimeout(()=>finish(null),120000);
        window.webContents.session.setPermissionCheckHandler(()=>false);
        window.webContents.session.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
        function finish(value){if(finished)return;finished=true;clearTimeout(timer);active=undefined;sources=[];if(!window.isDestroyed())window.destroy();resolve(value);}
        active={window,finish,pending:false,audio:audioRequested&&process.platform==='win32',sources:sources.map(source=>({id:source.id,name:source.name,kind:source.id.startsWith('screen:')?'screen':'window',thumbnail:source.thumbnail.isEmpty?.() ? null : source.thumbnail.toDataURL()}))};
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
