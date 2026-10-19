import { defaultConfig, normalizeConfig, addMessage, moveMessage, duplicateMessage, removeMessage, reactionLabel, MAX_MESSAGES } from './state.js';
import { renderPhone, generatePng } from './phone.js';

const $ = (selector) => document.querySelector(selector);
const STORAGE_KEY = 'fake-messages:conversation:v1';
let config = defaultConfig();
let activeTab = 'conversation';
let openOptions = new Set();
let saveTimer, previewFrame, toastTimer, uploadTarget, dragId;
let storageWarning = false;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function button(text, className, action, label) {
  const node = el('button', className, text); node.type = 'button';
  if (label) node.setAttribute('aria-label', label);
  node.addEventListener('click', action);
  return node;
}
function notify(message) {
  $('#toast').textContent = message; $('#toast').classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3500);
}
function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    $('#save-state').replaceChildren(el('i'), document.createTextNode('Saved on this device'));
    storageWarning = false;
  } catch {
    $('#save-state').textContent = 'Draft not saved · export JSON';
    if (!storageWarning) notify('Device storage is full or unavailable. Export JSON to keep your draft.');
    storageWarning = true;
  }
}
function changed({ panel = false } = {}) {
  $('#save-state').textContent = 'Saving…';
  clearTimeout(saveTimer); saveTimer = setTimeout(persist, 400);
  if (panel) renderPanel();
  cancelAnimationFrame(previewFrame); previewFrame = requestAnimationFrame(updatePreview);
}
function resizePhone() {
  const mount = $('#phone-mount'); const stage = $('#phone-stage');
  const phone = mount.firstElementChild;
  if (!phone || !stage.clientWidth) return;
  const scale = Math.min(1, (stage.clientWidth - 16) / phone.offsetWidth, stage.clientHeight / phone.offsetHeight);
  mount.style.transform = `scale(${scale})`;
}
function updatePreview() {
  $('#phone-mount').replaceChildren(renderPhone(config)); resizePhone();
  $('#message-count').textContent = `${config.messages.length} of ${MAX_MESSAGES} messages`;
  $('#add-message').disabled = config.messages.length >= MAX_MESSAGES;
}
function field(label, value, onChange, options = {}) {
  const wrap = el('label', 'field'); wrap.append(el('span', 'field-label', label));
  const input = el('input'); input.type = options.type || 'text'; input.value = value ?? '';
  for (const key of ['min','max','maxLength','placeholder','step']) if (options[key] !== undefined) input[key] = options[key];
  input.addEventListener(options.event || 'input', () => onChange(input.value, input));
  wrap.append(input); return wrap;
}
function select(label, value, choices, onChange) {
  const wrap = el('label', 'field'); wrap.append(el('span', 'field-label', label));
  const input = el('select');
  for (const [v, text] of choices) { const option = el('option', '', text); option.value = v; input.append(option); }
  input.value = value ?? ''; input.addEventListener('change', () => onChange(input.value));
  wrap.append(input); return wrap;
}
function toggle(label, value, onChange) {
  const wrap = el('label', 'toggle-row'); wrap.append(el('span', '', label));
  const input = el('input'); input.type = 'checkbox'; input.checked = value;
  input.setAttribute('role', 'switch'); input.addEventListener('change', () => onChange(input.checked));
  wrap.append(input); return wrap;
}
function segments(label, value, choices, onChange, className = '') {
  const group = el('div', `segmented ${className}`); group.setAttribute('role','group'); group.setAttribute('aria-label',label);
  for (const [v, text] of choices) {
    const b = button(text, '', () => onChange(v)); b.setAttribute('aria-pressed', String(v === value)); group.append(b);
  }
  return group;
}
function settingGroup(label, node) { const group = el('div', 'control-group'); group.append(el('span','field-label',label),node); return group; }
function optional(object, key, value) { if (value) object[key] = value; else delete object[key]; }
function autoSize(textarea) { textarea.style.height = 'auto'; textarea.style.height = `${Math.max(60, textarea.scrollHeight)}px`; }
function uploadImage(target) { uploadTarget = target; $('#image-upload').value = ''; $('#image-upload').click(); }
function focusMessage(id) {
  activeTab = 'conversation'; setView('edit'); syncTabs(); renderPanel();
  requestAnimationFrame(() => {
    const card = document.querySelector(`[data-card-id="${CSS.escape(id)}"]`);
    card?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); card?.querySelector('textarea')?.focus();
  });
}

function renderConversation(panel) {
  panel.append(el('h2', 'section-title', 'Contact'));
  const contact = el('div', 'contact-row');
  const photo = button('＋', 'contact-photo', () => uploadImage((data) => { config.contact.photo = data; changed({panel:true}); }), 'Add contact photo');
  if (config.contact.photo) { const img = el('img'); img.src = config.contact.photo; img.alt = ''; photo.replaceChildren(img); }
  const contactField = el('div', 'contact-field');
  contactField.append(field('Name',config.contact.name,(value) => {
    config.contact.name = value;
    document.querySelectorAll('.sender-toggle button:first-child').forEach((b) => b.textContent = value || 'Contact');
    changed();
  },{maxLength:80,placeholder:'Contact name'}));
  if (config.contact.photo) contactField.append(button('Remove photo','subtle-button',() => { delete config.contact.photo; changed({panel:true}); }));
  contact.append(photo,contactField); panel.append(contact);
  const heading = el('div','section-heading'); heading.append(el('h2','section-title','Messages'),el('span','','DRAG TO REORDER')); panel.append(heading);
  const list = el('div','message-list');
  config.messages.forEach((message,index) => list.append(renderMessage(message,index))); panel.append(list);
}
function renderMessage(message, index) {
  const card = el('article',`message-card ${message.from === 'me' ? 'outgoing' : ''}`); card.dataset.cardId = message._id;
  const top = el('div','message-top');
  top.append(segments(`Message ${index+1} sender`,message.from,[['them',config.contact.name || 'Contact'],['me','You']],(v) => { message.from = v; changed({panel:true}); },'sender-toggle'));
  const tools = el('div','message-tools');
  const drag = button('⠿','icon-button drag-handle',() => {},`Drag message ${index+1} to reorder`);
  drag.title = 'Drag to reorder · Alt + ↑/↓'; drag.draggable = true;
  drag.addEventListener('dragstart',(event) => { dragId = message._id; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain',message._id); card.classList.add('dragging'); });
  drag.addEventListener('dragend',() => { dragId = null; document.querySelectorAll('.dragging,.drag-over').forEach(n => n.classList.remove('dragging','drag-over')); });
  drag.addEventListener('keydown',(event) => {
    if (event.altKey && ['ArrowUp','ArrowDown'].includes(event.key)) {
      event.preventDefault(); if (moveMessage(config,message._id,event.key==='ArrowUp'?-1:1)) { changed({panel:true}); focusMessage(message._id); }
    }
  });
  card.addEventListener('dragover',(event) => { if (dragId) { event.preventDefault(); card.classList.add('drag-over'); } });
  card.addEventListener('dragleave',() => card.classList.remove('drag-over'));
  card.addEventListener('drop',(event) => {
    event.preventDefault(); card.classList.remove('drag-over');
    const sourceIndex = config.messages.findIndex(m=>m._id===dragId);
    if (sourceIndex>=0) { moveMessage(config,dragId,index-sourceIndex); changed({panel:true}); } dragId=null;
  });
  const menuButton = button('···','icon-button',() => {
    const existing = card.querySelector('.menu'); document.querySelectorAll('.menu').forEach(n=>n.remove());
    document.querySelectorAll('[aria-expanded=true].message-menu-button').forEach(n=>n.setAttribute('aria-expanded','false'));
    if (existing) return;
    const menu = el('div','menu'); menu.setAttribute('role','group'); menu.setAttribute('aria-label',`Message ${index+1} actions`);
    const actions = [
      ['Move up',()=>moveMessage(config,message._id,-1),index===0],
      ['Move down',()=>moveMessage(config,message._id,1),index===config.messages.length-1],
      ['Duplicate',()=>duplicateMessage(config,message._id),config.messages.length>=MAX_MESSAGES],
      ['Delete',()=>removeMessage(config,message._id),config.messages.length<=1],
    ];
    actions.forEach(([label,action,disabled]) => { const b = button(label,label==='Delete'?'delete':'',()=>{action();changed({panel:true});}); b.disabled=disabled; menu.append(b); });
    card.append(menu); menuButton.setAttribute('aria-expanded','true');
  },`Message ${index+1} menu`);
  menuButton.classList.add('message-menu-button'); menuButton.setAttribute('aria-expanded','false');
  tools.append(drag,menuButton); top.append(tools); card.append(top);
  const text = el('textarea','message-text'); text.value=message.text || ''; text.maxLength=8000; text.rows=2;
  text.placeholder='Write a message…'; text.setAttribute('aria-label',`Message ${index+1} text`);
  text.addEventListener('input',()=>{message.text=text.value;autoSize(text);changed();}); card.append(text);
  if (message.image) {
    const wrap=el('div','message-image'); const img=el('img');img.src=message.image;img.alt=`Message ${index+1} attachment`;
    wrap.append(img,button('✕','',()=>{delete message.image;changed({panel:true});},`Remove message ${index+1} image`));card.append(wrap);
  }
  const bottom=el('div','message-bottom');
  bottom.append(button('▧  Attach image','attach-button',()=>uploadImage(data=>{message.image=data;changed({panel:true});}),`Attach image to message ${index+1}`));
  bottom.append(el('span','reaction-summary',(message.reactions||[]).map(reactionLabel).join(' ')));
  const expand=button(openOptions.has(message._id)?'Options ⌃':'Options ⌄','options-button',()=>{openOptions.has(message._id)?openOptions.delete(message._id):openOptions.add(message._id);renderPanel();},`Message ${index+1} options`);
  expand.setAttribute('aria-expanded',String(openOptions.has(message._id))); bottom.append(expand);card.append(bottom);
  if (openOptions.has(message._id)) card.append(renderMessageOptions(message,index));
  requestAnimationFrame(()=>autoSize(text)); return card;
}
function renderMessageOptions(message,index) {
  const options=el('div','message-options');const grid=el('div','grid-2');
  grid.append(select('Message type',message.transport||'',[['','Default'],['imessage','iMessage'],['sms','SMS']],v=>{optional(message,'transport',v);changed();}),select('Receipt',message.receipt||'',[['','None'],['delivered','Delivered'],['read','Read']],v=>{optional(message,'receipt',v);changed();})); options.append(grid);
  let localTime='';
  if(message.at){const d=new Date(message.at);localTime=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
  options.append(field('Date & time · optional',localTime,v=>{optional(message,'at',v?new Date(v).toISOString():'');changed();},{type:'datetime-local',event:'change'}));
  for(const [from,label] of [['them',config.contact.name||'Contact'],['me','You']]){
    const group=el('div','field');group.append(el('span','field-label',`${label}’s reaction`));const picker=el('div','reaction-picker');
    const current=(message.reactions||[]).find(r=>r.from===from);
    const setReaction=(reaction)=>{message.reactions=(message.reactions||[]).filter(r=>r.from!==from);if(reaction)message.reactions.push({from,...reaction});changed({panel:true});};
    const none=button('⊘','',()=>setReaction(null),`Remove ${label}'s reaction on message ${index+1}`);none.setAttribute('aria-pressed',String(!current));picker.append(none);
    for(const type of ['love','like','dislike','laugh','emphasize','question']){const b=button(reactionLabel({type}),'',()=>setReaction({type}),`${label}: ${type}`);b.setAttribute('aria-pressed',String(current?.type===type));picker.append(b);}
    group.append(picker);
    group.append(field(`Custom emoji · ${label}`,current?.emoji||'',(v)=>{message.reactions=(message.reactions||[]).filter(r=>r.from!==from);if(v.trim())message.reactions.push({from,emoji:v.trim()});changed();},{maxLength:16,placeholder:'e.g. 🧀'}));options.append(group);
  }
  const linkField=field('Link URL · optional',message.link?.url||'',(v,input)=>{
    if(!v){delete message.link;input.setCustomValidity('');changed();return;}
    try{const url=new URL(v);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error();message.link={...message.link,url:v};input.setCustomValidity('');changed();}catch{input.setCustomValidity('Enter a complete http:// or https:// URL.');}
  },{type:'url',maxLength:4096,placeholder:'https://example.com',event:'change'});
  options.append(linkField,field('Link title · optional',message.link?.title||'',v=>{if(message.link){optional(message.link,'title',v);changed();}},{maxLength:300,placeholder:'A title for the link preview'}));
  return options;
}
function renderAppearance(panel){
  panel.append(settingGroup('Device theme',segments('Device theme',config.theme,[['light','☀  Light'],['dark','☾  Dark']],v=>{config.theme=v;changed({panel:true});},'wide-toggle')));
  panel.append(settingGroup('Default message type',segments('Default message type',config.transport,[['imessage','iMessage'],['sms','SMS']],v=>{config.transport=v;changed({panel:true});},'wide-toggle')));
  panel.append(settingGroup('Conversation position',segments('Conversation position',config.scroll_position,[['bottom','Latest at bottom'],['latest-top','Latest at top']],v=>{config.scroll_position=v;changed({panel:true});},'wide-toggle')));
  const bg=el('div','background-grid');const current=config.background||'default';
  for(const [value,label] of [['default','None'],['colour','Colour'],['sky','Sky'],['water','Water'],['aurora','Aurora'],['image','Image']]){
    const b=button('','background-option',()=>{if(value==='image'){uploadImage(data=>{config.background=data;changed({panel:true});});}else{config.background=value;changed({panel:true});}});
    b.setAttribute('aria-label',`${label} background`); b.setAttribute('aria-pressed',String(value===current||(value==='image'&&current.startsWith('data:'))||(value==='colour'&&current.startsWith('#'))));
    b.append(el('span',`background-swatch bg-${value==='default'?'none':value}`,value==='image'?'＋':''),el('span','',label));bg.append(b);
  }
  panel.append(settingGroup('Background',bg));
  if(current==='colour'||current.startsWith('#'))panel.append(field('Custom colour',current.startsWith('#')?current:'#c7d9e8',v=>{config.background=v;changed();},{type:'color'}));
  panel.append(toggle('Notifications silenced',config.notifications_silenced,v=>{config.notifications_silenced=v;changed();}));
  panel.append(field('Back-to-app label',config.back_to_app||'',v=>{optional(config,'back_to_app',v);changed();},{maxLength:40,placeholder:'e.g. Instagram'}));
}
function renderStatus(panel){
  const status=config.status;const now=new Date();const currentTime=`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  const timeField=field('Time',status.time==='current'?currentTime:status.time,v=>{if(v){status.time=v;changed();}},{type:'time',event:'change'});
  timeField.querySelector('input').disabled=status.time==='current';panel.append(timeField);
  const current=el('label','checkbox-label');const check=el('input');check.type='checkbox';check.checked=status.time==='current';check.addEventListener('change',()=>{status.time=check.checked?'current':currentTime;changed({panel:true});});current.append(check,el('span','','Use current time'));timeField.append(current);
  panel.append(select('Clock format',String(config.clock_format),[['12','12-hour'],['24','24-hour']],v=>{config.clock_format=Number(v);changed();}));
  const grid=el('div','grid-2');grid.append(field('Battery percentage',status.battery,v=>{status.battery=Math.min(100,Math.max(0,Number(v)));changed();},{type:'number',min:0,max:100}),field('Unread conversations',config.unread_count,v=>{config.unread_count=Math.min(999,Math.max(0,Number(v)));changed();},{type:'number',min:0,max:999}));panel.append(grid);
  panel.append(toggle('Charging',status.charging,v=>{status.charging=v;changed();}));
  panel.append(el('h2','section-title','Connection'),settingGroup('Network',segments('Network',status.network,[['wifi','Wi-Fi'],['5G','5G'],['LTE','LTE']],v=>{status.network=v;changed({panel:true});},'wide-toggle')));
  if(status.network==='wifi')panel.append(select('Wi-Fi signal',String(status.wifi_strength),[['0','No signal'],['1','1 bar'],['2','2 bars'],['3','3 bars']],v=>{status.wifi_strength=Number(v);changed();}));
  panel.append(select('Cellular signal',String(status.cellular_strength),[['0','No signal'],['1','1 bar'],['2','2 bars'],['3','3 bars'],['4','4 bars']],v=>{status.cellular_strength=Number(v);changed();}));
  panel.append(button('⤨  Randomize','secondary',()=>{status.battery=10+Math.floor(Math.random()*91);config.unread_count=Math.floor(Math.random()*30);status.wifi_strength=1+Math.floor(Math.random()*3);status.cellular_strength=1+Math.floor(Math.random()*4);changed({panel:true});}));
}
function exportJson(){
  const blob=new Blob([JSON.stringify(config,null,2)+'\n'],{type:'application/json'});const url=URL.createObjectURL(blob);
  download(url,'conversation.json');setTimeout(()=>URL.revokeObjectURL(url),1000);notify('Conversation JSON exported.');
}
function download(url,name){const a=el('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();}
function renderAdvanced(panel){
  panel.append(el('h2','section-title','Conversation details'),field('Location · optional',config.contact.location||'',v=>{optional(config.contact,'location',v);changed();},{maxLength:100,placeholder:'e.g. Chicago, IL'}));
  const actions=el('div','advanced-actions');actions.append(button('↥  Import JSON','secondary',()=>{$('#json-upload').value='';$('#json-upload').click();}),button('⌘  Edit JSON','secondary',()=>{$('#json-input').value=JSON.stringify(config,null,2);$('#json-error').textContent='';$('#json-dialog').showModal();}),button('↧  Export JSON','secondary',exportJson));panel.append(actions);
  const info=el('div','advanced-info');info.append(el('strong','','Private by design.'),document.createTextNode(' Your draft is saved in this browser. Images and conversations are processed on your device. Export JSON to move your project to another browser or keep a backup.'));panel.append(info);
  panel.append(button('Reset to sample conversation','reset-button',()=>$('#reset-dialog').showModal()));
}
function renderPanel(){
  const scroll=$('#panel-scroll').scrollTop;const panel=el('div');panel.id=`panel-${activeTab}`;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',`tab-${activeTab}`);
  ({conversation:renderConversation,appearance:renderAppearance,status:renderStatus,advanced:renderAdvanced})[activeTab](panel);
  $('#editor-panel').replaceChildren(panel);$('#panel-scroll').scrollTop=scroll;
}
function syncTabs(){document.querySelectorAll('[data-tab]').forEach(b=>{const selected=b.dataset.tab===activeTab;b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;});}
function setView(view){$('.workspace').dataset.view=view;document.querySelectorAll('[data-view][role=tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.view===view)));requestAnimationFrame(resizePhone);}
document.querySelectorAll('[data-tab]').forEach((b,index)=>{
  b.addEventListener('click',()=>{activeTab=b.dataset.tab;syncTabs();$('#panel-scroll').scrollTop=0;renderPanel();});
  b.addEventListener('keydown',event=>{const tabs=[...document.querySelectorAll('[data-tab]')];let next;if(event.key==='ArrowRight')next=(index+1)%4;if(event.key==='ArrowLeft')next=(index+3)%4;if(event.key==='Home')next=0;if(event.key==='End')next=3;if(next!==undefined){event.preventDefault();tabs[next].click();tabs[next].focus();}});
});
document.querySelectorAll('[data-view][role=tab]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
$('#add-message').addEventListener('click',()=>{const message=addMessage(config);if(message){changed();focusMessage(message._id);}});
$('#phone-mount').addEventListener('click',event=>{const message=event.target.closest('[data-message-id]');if(message)focusMessage(message.dataset.messageId);});
document.addEventListener('click',event=>{if(!event.target.closest('.message-menu-button,.menu')){document.querySelectorAll('.menu').forEach(n=>n.remove());document.querySelectorAll('.message-menu-button').forEach(n=>n.setAttribute('aria-expanded','false'));}});
document.addEventListener('keydown',event=>{if(event.key==='Escape')document.querySelectorAll('.menu').forEach(n=>n.remove());});
$('#json-upload').addEventListener('change',async event=>{
  const file=event.target.files[0];if(!file)return;
  try{const next=normalizeConfig(JSON.parse(await file.text()));config=next;openOptions.clear();changed({panel:true});notify('Conversation imported.');}catch(error){notify(`Import failed: ${error.message}`);}
});
$('#format-json').addEventListener('click',()=>{try{$('#json-input').value=JSON.stringify(JSON.parse($('#json-input').value),null,2);$('#json-error').textContent='';}catch(error){$('#json-error').textContent=error.message;}});
$('#apply-json').addEventListener('click',()=>{try{config=normalizeConfig(JSON.parse($('#json-input').value));openOptions.clear();changed({panel:true});$('#json-dialog').close();notify('Conversation updated.');}catch(error){$('#json-error').textContent=error.message;}});
$('#cancel-reset').addEventListener('click',()=>$('#reset-dialog').close());
$('#confirm-reset').addEventListener('click',()=>{config=defaultConfig();openOptions.clear();activeTab='conversation';syncTabs();changed({panel:true});$('#reset-dialog').close();notify('Sample conversation restored.');});

async function readImage(file){
  if(file.size>5*1024*1024)throw new Error('Choose an image smaller than 5 MB.');
  if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type))throw new Error('Use a PNG, JPEG, WebP, or GIF image.');
  const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Could not read that image.'));reader.readAsDataURL(file);});
  const image=new Image();image.src=data;try{await image.decode();}catch{throw new Error('That file could not be decoded as an image.');}
  if(!image.naturalWidth||!image.naturalHeight)throw new Error('That image is empty.');
  const scale=Math.min(1,1600/Math.max(image.naturalWidth,image.naturalHeight));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
  const result=canvas.toDataURL(file.type==='image/jpeg'?'image/jpeg':'image/png',.9);
  if(!result.startsWith('data:image/'))throw new Error('That image could not be processed.');
  return result;
}
$('#image-upload').addEventListener('change',async event=>{const file=event.target.files[0];if(!file||!uploadTarget)return;const target=uploadTarget;try{target(await readImage(file));notify('Image added.');}catch(error){notify(error.message);}});
$('#generate').addEventListener('click',async()=>{
  const generate=$('#generate');generate.disabled=true;generate.textContent='Rendering your screenshot…';
  try{
    const snapshot=normalizeConfig(config);const scale=Number($('#export-scale').value);const frame=$('#include-frame').checked;
    const data=await generatePng(snapshot,{frame,scale});const image=$('#export-image');image.src=data;
    await image.decode();$('#export-info').textContent=`${image.naturalWidth} × ${image.naturalHeight} · PNG`;
    $('#download-png').href=data;$('#download-png').download=`${snapshot.contact.name.replace(/[^a-z0-9]+/gi,'-').toLowerCase()||'conversation'}.png`;
    $('#export-dialog').showModal();
  }catch(error){notify(`Could not export: ${error.message}`);}finally{generate.disabled=false;generate.textContent='↓  Generate screenshot';}
});
window.addEventListener('pagehide',persist);
new ResizeObserver(resizePhone).observe($('#phone-stage'));
setInterval(()=>{if(config.status.time==='current')updatePreview();},60000);
try{const saved=localStorage.getItem(STORAGE_KEY);if(saved)config=normalizeConfig(JSON.parse(saved));}catch{notify('Your saved draft could not be loaded. The sample is ready to edit.');}
renderPanel();updatePreview();
