const {contextBridge,ipcRenderer}=require('electron');
const prefix=process.argv.includes('--blueprint-stream-picker')?'stream-picker':'picker';
contextBridge.exposeInMainWorld('screenPicker',{
  sources:()=>ipcRenderer.invoke(`${prefix}:list`),
  refresh:()=>ipcRenderer.invoke(`${prefix}:refresh`),
  choose:(id,audio)=>ipcRenderer.invoke(`${prefix}:choose`,{id,audio}),
  cancel:()=>ipcRenderer.invoke(`${prefix}:cancel`),
});
