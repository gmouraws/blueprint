const panel=document.getElementById('sources'),share=document.getElementById('share'),notice=document.getElementById('notice'),audio=document.getElementById('audio');
let sources=[],kind='screen',selected='',pending=false;
function render(){
 panel.replaceChildren();share.disabled=!selected||pending;
 const visible=sources.filter(source=>source.kind===kind);
 for(const source of visible){const button=document.createElement('button');button.className='source';button.setAttribute('aria-pressed',String(source.id===selected));button.disabled=pending;const img=document.createElement('img');img.src=source.thumbnail;img.alt='';const label=document.createElement('span');label.textContent=source.name;button.append(img,label);button.addEventListener('click',()=>{selected=source.id;render();panel.querySelector('[aria-pressed=true]')?.focus();});button.addEventListener('keydown',event=>{if(['ArrowRight','ArrowDown','ArrowLeft','ArrowUp'].includes(event.key)){event.preventDefault();const buttons=[...panel.querySelectorAll('button')];buttons[(buttons.indexOf(button)+(event.key==='ArrowRight'||event.key==='ArrowDown'?1:buttons.length-1))%buttons.length].focus();}});panel.append(button);}
 notice.textContent=visible.length?'Selecione uma fonte para continuar.':'Nenhuma fonte disponível nesta categoria.';
}
const tabs=[...document.querySelectorAll('[role=tab]')];
for(const tab of tabs){tab.addEventListener('click',()=>{if(pending)return;kind=tab.dataset.kind;selected='';for(const other of tabs){other.setAttribute('aria-selected',String(other===tab));other.tabIndex=other===tab?0:-1;}panel.setAttribute('aria-labelledby',tab.id);render();});tab.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();const next=tabs.find(other=>other!==tab);next.click();next.focus();}});}
document.getElementById('cancel').addEventListener('click',()=>window.screenPicker.cancel());
document.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();void window.screenPicker.cancel();}});
share.addEventListener('click',async()=>{if(!selected||pending)return;pending=true;share.disabled=true;try{const result=await window.screenPicker.choose(selected,audio.checked);if(result?.error){pending=false;render();notice.textContent=result.error;}}catch{pending=false;render();notice.textContent='Não foi possível compartilhar. Tente novamente ou cancele.';}});
window.screenPicker.sources().then(result=>{sources=result.sources;document.getElementById('audio-label').hidden=!result.audio;document.getElementById('audio-help').hidden=!result.audio;render();tabs[0].focus();}).catch(()=>{notice.textContent='Não foi possível carregar as fontes. Cancele e tente novamente.';});
