const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('screenPicker',{
  sources:()=>ipcRenderer.invoke('picker:list'),
  choose:(id,audio)=>ipcRenderer.invoke('picker:choose',{id,audio}),
  cancel:()=>ipcRenderer.invoke('picker:cancel'),
});
