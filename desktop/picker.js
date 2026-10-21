const panel=document.getElementById('sources'),share=document.getElementById('share'),notice=document.getElementById('notice'),audio=document.getElementById('audio');
let sources=[],kind='screen',selected='',pending=false,applicationAudio=false,refreshing=false;
const search=document.getElementById('search'),refresh=document.getElementById('refresh');
function audioOptions(){
 const available=applicationAudio&&/^window:\d+:\d+$/.test(selected);
 audio.querySelector('[value=application]').disabled=!available;
 if(audio.value==='application'&&!available)audio.value='none';
 document.getElementById('audio-help').textContent=audio.value==='system'?'Inclui outros aplicativos e pode incluir o áudio recebido da chamada.':audio.value==='application'?'Experimental: captura o processo e seus filhos; pode incluir outras janelas/abas do aplicativo. Nunca usa áudio do sistema como alternativa.':(applicationAudio?'Áudio do aplicativo é experimental e por processo. Selecione uma janela para habilitar.':'Áudio do aplicativo indisponível: requer Windows build 20348+ e o helper compatível.');
}

function render(){
 panel.replaceChildren();share.disabled=!selected||pending||refreshing;refresh.disabled=pending||refreshing;audio.disabled=pending;audioOptions();
 const category=sources.filter(source=>source.kind===kind);
 const visible=category.filter(source=>source.name.toLocaleLowerCase('pt-BR').includes(search.value.trim().toLocaleLowerCase('pt-BR')));
 document.getElementById('count').textContent=`${visible.length} / ${category.length} fontes`;
 for(const source of visible){const button=document.createElement('button');button.className='source';button.dataset.sourceId=source.id;button.setAttribute('aria-pressed',String(source.id===selected));button.disabled=pending;const frame=document.createElement('div');frame.className='thumbnail';const fallback=document.createElement('span');fallback.className='fallback';fallback.textContent='Prévia indisponível · a janela pode estar minimizada';frame.append(fallback);if(source.thumbnail){const img=document.createElement('img');img.alt='';img.onload=()=>{fallback.hidden=true;};img.onerror=()=>{img.remove();fallback.hidden=false;};img.src=source.thumbnail;frame.append(img);}const label=document.createElement('span');label.className='source-name';label.textContent=source.name;button.title=source.name;button.append(frame,label);button.addEventListener('click',()=>{selected=source.id;render();panel.querySelector('[aria-pressed=true]')?.focus();});button.addEventListener('keydown',event=>{if(['ArrowRight','ArrowDown','ArrowLeft','ArrowUp'].includes(event.key)){event.preventDefault();const buttons=[...panel.querySelectorAll('button')];buttons[(buttons.indexOf(button)+(event.key==='ArrowRight'||event.key==='ArrowDown'?1:buttons.length-1))%buttons.length].focus();}});panel.append(button);}
 notice.textContent=refreshing?'Atualizando fontes…':visible.length?'Selecione uma fonte para continuar.':'Nenhuma fonte disponível nesta categoria.';
}
const tabs=[...document.querySelectorAll('[role=tab]')];
for(const tab of tabs){tab.addEventListener('click',()=>{if(pending)return;kind=tab.dataset.kind;selected='';for(const other of tabs){other.setAttribute('aria-selected',String(other===tab));other.tabIndex=other===tab?0:-1;}panel.setAttribute('aria-labelledby',tab.id);render();});tab.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();const next=tabs.find(other=>other!==tab);next.click();next.focus();}});}
document.getElementById('cancel').addEventListener('click',()=>window.screenPicker.cancel());
document.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();void window.screenPicker.cancel();}});
share.addEventListener('click',async()=>{if(!selected||pending)return;pending=true;share.disabled=true;try{const result=await window.screenPicker.choose(selected,audio.value);if(result?.error){pending=false;render();notice.textContent=result.error;}}catch{pending=false;render();notice.textContent='Não foi possível compartilhar. Tente novamente ou cancele.';}});
window.screenPicker.sources().then(result=>{sources=result.sources;applicationAudio=result.applicationAudio===true;document.getElementById('audio-label').hidden=!result.audio;document.getElementById('audio-help').hidden=!result.audio;render();tabs[0].focus();}).catch(()=>{notice.textContent='Não foi possível carregar as fontes. Cancele e tente novamente.';});

audio.addEventListener('change',audioOptions);
search.addEventListener('input',render);
refresh.addEventListener('click',async()=>{if(pending||refreshing)return;refreshing=true;render();try{const result=await window.screenPicker.refresh();sources=result.sources;applicationAudio=result.applicationAudio===true;if(!sources.some(source=>source.id===selected))selected='';refreshing=false;render();}catch{refreshing=false;render();notice.textContent='Não foi possível atualizar. A lista anterior foi preservada.';}});
