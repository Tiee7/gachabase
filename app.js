import {renderPack} from './pack-ui.js';
import {initialPool} from './data.js';
import {renderQuiz} from './quiz-ui.js';
import {validatePool,validateSave,drawPack,rarities,startQuestion,answerQuestion,checkJsonSize,parseJson,serializeJson} from './core.js';
const $=s=>document.querySelector(s), KEY='gachabase.v1';
let state=validateSave({pool:structuredClone(initialPool),owned:{},deck:{},packs:0,pending:null,autoReveal:true,reducedMotion:false}), view='pack',pack=null,search='',filter='',ownedOnly=false,storageFailed=false,storageReadBlocked=false,storageReadMessage='';
function notice(message){$('#toast').textContent=message;clearTimeout(notice.timer);notice.timer=setTimeout(()=>$('#toast').textContent='',5000);}
try {const saved=localStorage.getItem(KEY);if(saved)state=validateSave(parseJson(saved,'backup'),initialPool);}catch(e){storageFailed=true;storageReadBlocked=e.code==='RESOURCE_LIMIT';storageReadMessage=e.message;}
function persist(){state.pending=pack?{ids:pack.cards.map(c=>c.id),revealed:[...pack.revealed]}:null;try{if(storageReadBlocked)throw Error(storageReadMessage);localStorage.setItem(KEY,JSON.stringify(state));storageFailed=false;}catch(e){storageFailed=true;notice('浏览器保存不可用。请导出完整备份，避免刷新后丢失。');}if($('#detail-storage'))$('#detail-storage').textContent=storageFailed?'本地保存不可用。请关闭详情，前往卡池工作室导出完整备份，避免刷新后丢失。':'';}
if(state.pending)pack={cards:state.pending.ids.map(id=>state.pool.cards.find(c=>c.id===id)),revealed:[...state.pending.revealed]};
let stage='ready',timers=[],running=false;
const systemMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
const reduced=()=>state.reducedMotion||systemMotion.matches;
function cancelSequence(){timers.forEach(clearTimeout);timers=[];running=false;}
function schedule(fn,ms){timers.push(setTimeout(fn,ms));}
function paintReveal(i){
 if(!pack||pack.revealed[i])return;
 pack.revealed[i]=true;persist();
 const slot=document.querySelector(`[data-slot="${i}"]`);
 if(slot){slot.classList.add('flipped');const back=slot.querySelector('.face-back'),front=slot.querySelector('.face-front');const focused=back.contains(document.activeElement);back.inert=true;back.setAttribute('aria-hidden','true');front.inert=false;front.removeAttribute('aria-hidden');if(focused)front.querySelector('button').focus({preventScroll:true});}
 if($('#pack-status'))$('#pack-status').textContent=`已揭晓 ${pack.revealed.filter(Boolean).length} / 5 张，已存入收藏。`;
}
function revealSequence(){
 cancelSequence();if(!pack)return;
 if(stage==='opening'){stage='dealing';render();}
 const current=pack,remaining=pack.revealed.map((v,i)=>v?-1:i).filter(i=>i>=0);
 running=!!remaining.length;
 if($('#sequence'))$('#sequence').textContent=running?'暂停自动揭晓':'已全部揭晓';
 remaining.forEach((i,n)=>schedule(()=>{if(pack!==current||view!=='pack')return;paintReveal(i);if(n===remaining.length-1){running=false;if($('#sequence'))$('#sequence').textContent='已全部揭晓';}},reduced()?n*60:450+n*460));
}
function beginPack(){
 if(pack)return;
 cancelSequence();pack={cards:drawPack(state.pool),revealed:Array(5).fill(false)};
 for(const c of pack.cards)state.owned[c.id]=Math.min(1000000,(state.owned[c.id]||0)+1);
 state.packs=Math.min(Number.MAX_SAFE_INTEGER,state.packs+1);persist();stage=reduced()?'ready':'opening';render();window.scrollTo({top:0,behavior:'instant'});
 const current=pack;
 if(stage==='opening')schedule(()=>{if(pack!==current||view!=='pack')return;stage='dealing';render();if(state.autoReveal)revealSequence();},1400);
 else if(state.autoReveal)revealSequence();
}
systemMotion.addEventListener('change',()=>{if(reduced()){cancelSequence();stage='ready';render();}});
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const count=()=>Object.values(state.owned).reduce((a,b)=>a+b,0);
function card(c,options={}){
 const n=state.owned[c.id]||0,level=state.levels[c.id]||0,tag=options.preview?'div':'button';
 const names={N:'普通',R:'稀有',SR:'珍稀',SSR:'典藏'};
 return `<${tag} class="card ${c.rarity} ${options.dim?'unowned':''} ${c.art?'illustrated':''}" ${options.preview?'':`data-card="${escape(c.id)}"`}>
 ${c.art?`<img class="card-illustration" src="assets/${c.art}.jpg" alt="" loading="lazy" decoding="async">`:''}<span class="card-shade" aria-hidden="true"></span><span class="card-foil" aria-hidden="true"></span>
 <div class="card-top"><span>${escape(c.category)}</span><b>${c.rarity} · ${names[c.rarity]}</b></div>
 <div class="art" aria-hidden="true"><span>${escape(c.symbol)}</span><i>✦</i></div>
 <div class="card-content"><small>${escape(c.unit)}</small><h3>${escape(c.title)}</h3><p>${escape(c.era)}</p><div class="card-bottom"><span>${n?'收藏 ×'+n:'尚未收藏'}</span><strong>强化 +${level}</strong></div></div></${tag}>`;
}
function render(){
 document.documentElement.dataset.motion=reduced()?'reduced':'full';
 document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
 const total=state.pool.cards.length, found=Object.keys(state.owned).length;
 const stats=`<section class="stats"><div><b>${found}<small> / ${total}</small></b><span>图鉴收集</span></div><div><b>${state.packs}</b><span>已开启卡包</span></div><div><b>${count()}</b><span>珍藏卡片</span></div><div><b>${Math.round(found/total*100)}<small>%</small></b><span>探索进度</span></div></section>`;
 let body='';
 if(view==='pack')body=renderPack({pool:state.pool,pack,stats,stage,escape,card,autoReveal:state.autoReveal,reducedMotion:state.reducedMotion,running});
 if(view==='collection'||view==='deck'){
 const isDeck=view==='deck'; let cards=state.pool.cards.filter(c=>(!isDeck||state.deck[c.id])&&(!ownedOnly||state.owned[c.id])&&(!filter||c.rarity===filter)&&`${c.title} ${c.unit} ${c.category} ${c.text}`.toLowerCase().includes(search.toLowerCase()));
 body=`<section class="page-heading"><span class="eyebrow">${isDeck?'YOUR CURATED STORIES':'THE COLLECTION'}</span><h1>${isDeck?'我的卡组':'收藏图鉴'}</h1><p>${isDeck?'卡组总数不限。同卡最多 2 张，且不能超过实际拥有数量；重复卡保留在收藏中。':'每一张卡片，都是通向过去的一扇窗。'}</p></section>${stats}<div class="toolbar"><input id="search" aria-label="搜索卡片" placeholder="搜索人物、时代、知识…" value="${escape(search)}"><select id="rarity" aria-label="稀有度筛选"><option value="">全部稀有度</option>${rarities.map(r=>`<option ${filter===r?'selected':''}>${r}</option>`).join('')}</select><label><input id="owned-only" type="checkbox" ${ownedOnly?'checked':''}> 仅看已收藏</label><span>${isDeck?'卡组 '+Object.values(state.deck).reduce((a,b)=>a+b,0)+' 张':cards.length+' 张卡片'}</span></div><div class="cards gallery">${cards.map(c=>card(c,{dim:!state.owned[c.id]})).join('')||'<div class="empty">这里还没有卡片。试试开启卡包、调整筛选或在详情中加入卡组。</div>'}</div>`;
 }
 if(view==='studio')body=`<section class="page-heading"><span class="eyebrow">MAKE IT YOURS</span><h1>你的主题，你的卡池。</h1><p>历史只是开始。用同一套规则，收藏任何你热爱的世界。</p></section><section class="studio"><div><h2>卡池编辑器</h2><p>直接编辑 JSON，或导入 .json 文件。应用前会完整校验，错误不会改变当前收藏。</p><p>每张卡需填写 id、title、unit、category、era、text、symbol、source 和 rarity（N/R/SR/SSR）。最多 500 张、8,000,000 个 UTF-8 字节；相同 ID 表示同一张卡，修改内容会沿用其收藏和强化等级。可选 art 为本地图案名，questions 为练习题数组；无题不能强化。</p><p>应用卡池将保留仍存在的 ID 对应进度。删除的 ID 会移出收藏，请先备份。</p><div class="actions"><button class="primary" id="apply">校验并应用卡池</button><button id="export-pool">导出卡池</button><button id="choose-pool">导入卡池</button><input id="import-pool" type="file" accept=".json,application/json" hidden></div><h2>进度备份</h2><p>完整备份含卡池、收藏、卡组、强化等级、已结算题目、未揭晓卡包与动态偏好。恢复将替换当前进度。备份最多 12,000,000 个 UTF-8 字节，卡池接纳时已预留完整进度空间。</p><div class="actions"><button id="backup">导出完整备份</button><button id="choose-restore">恢复备份</button><input id="restore" type="file" accept=".json,application/json" hidden></div><p id="editor-error" role="alert"></p></div><textarea id="editor" aria-label="卡池 JSON 编辑器" spellcheck="false">${escape(JSON.stringify(state.pool,null,2))}</textarea></section>`;
 $('#app').innerHTML=(storageFailed?`<div id="storage-warning" class="warning" role="alert">${storageReadBlocked?escape(storageReadMessage)+' 原存档保留且不会被自动覆盖；编辑应用或恢复备份会按确认结果替换。':'本地保存读取或写入失败。当前可继续使用，请及时导出完整备份；原存储未被主动删除。'}</div>`:'')+body;
 bind();
 if(stage==='dealing')stage='ready';
}
function detail(id){
 const c=state.pool.cards.find(c=>c.id===id);if(!c)return;
 cancelSequence();
 const session=startQuestion(state,id);persist();
 const level=state.levels[id]||0;
 $('#detail-body').innerHTML=`<div class="detail-visual">${card(c,{preview:true})}<p class="hint">插画用于氛围示意，不作为历史实物或人物肖像依据。</p></div><div class="dossier"><span class="eyebrow">KNOWLEDGE ARCHIVE / ${c.rarity}</span><h2>${escape(c.title)}</h2><p>${escape(c.era)} · ${escape(c.unit)}</p><p class="knowledge">${escape(c.text)}</p><small class="source-note">${escape(c.source)}</small><div class="inventory-summary"><span>收藏 <b>${state.owned[id]||0}</b></span><span>卡组 <b>${state.deck[id]||0}</b></span><span>备用 <b>${Math.max(0,(state.owned[id]||0)-(state.deck[id]||0))}</b></span></div><div class="actions"><button id="add-deck">加入卡组</button><button id="remove-deck">移出一张</button></div><p id="deck-feedback" role="status"></p><p class="warning" id="detail-storage" role="alert">${storageFailed?'本地保存不可用。请关闭详情，前往卡池工作室导出完整备份，避免刷新后丢失。':''}</p><div id="quiz-region">${renderQuiz({card:c,session,level,owned:state.owned[id],escape})}</div><p class="hint">稀有度是抽取分组，强化是本机学习进度。二者均不代表历史价值。</p></div>`;
 $('#add-deck').onclick=()=>{const n=state.deck[id]||0;if(n>=Math.min(2,state.owned[id]||0))return ($('#deck-feedback').textContent='无法加入：收藏数量不足或同卡已达 2 张。');state.deck[id]=n+1;persist();detail(id);};
 $('#remove-deck').onclick=()=>{if(state.deck[id]>1)state.deck[id]--;else delete state.deck[id];persist();detail(id);};
 bindQuiz(c,session);
 if(!$('#detail').open)$('#detail').showModal();
}
function bindQuiz(c,session){
 document.querySelectorAll('[data-answer]').forEach(button=>button.onclick=()=>{
  const result=answerQuestion(state,session,Number(button.dataset.answer));
  if(!result)return;
  // Settle synchronously before persisting or replacing any UI; stale handlers are harmless.
  persist();
  $('#quiz-region').innerHTML=renderQuiz({card:c,session,level:result.level,owned:state.owned[c.id],escape});
  const badge=$('#detail .card-bottom strong');if(badge)badge.textContent='强化 +'+result.level;
  bindQuiz(c,session);
  $('#quiz-region [role="status"]').setAttribute('tabindex','-1');
  $('#quiz-region [role="status"]').focus({preventScroll:true});
 });
 if($('#next-question'))$('#next-question').onclick=()=>{
  if(!session?.settled||state.quizSession!==session)return;
  const next=startQuestion(state,c.id,true);persist();
  $('#quiz-region').innerHTML=renderQuiz({card:c,session:next,level:state.levels[c.id]||0,owned:state.owned[c.id],escape});
  bindQuiz(c,next);$('#quiz-region [data-answer]')?.focus({preventScroll:true});
 };
}
function download(name,value,kind){let text;try{text=serializeJson(value,kind);}catch(e){$('#editor-error').textContent=e.message;return;}const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function apply(pool){cancelSequence();state=validateSave({...state,pool,quizSession:null,pending:null});storageReadBlocked=false;storageReadMessage='';pack=null;stage='ready';persist();render();notice('卡池已应用，保留同 ID 的收藏和强化；移除 ID 的进度不保留。');}
function bind(){
 document.querySelectorAll('[data-card]').forEach(b=>b.onclick=()=>detail(b.dataset.card));
 document.querySelectorAll('[data-reveal]').forEach(b=>b.onclick=()=>paintReveal(Number(b.dataset.reveal)));
 const on=(id,fn)=>{if($(id))$(id).onclick=fn;};
 on('#open-pack',beginPack);on('#pack-art',beginPack);
 on('#sequence',()=>{if(running){cancelSequence();$('#sequence').textContent='继续依次揭晓';}else revealSequence();});
 on('#reveal-all',()=>{cancelSequence();if(!pack)return;if(stage==='opening'){stage='ready';render();}pack.cards.forEach((_,i)=>paintReveal(i));});
 on('#finish',()=>{cancelSequence();pack=null;stage='ready';persist();render();});
 if($('#auto-reveal'))$('#auto-reveal').onchange=e=>{state.autoReveal=e.target.checked;persist();if(!state.autoReveal&&running){cancelSequence();$('#sequence').textContent='依次揭晓';}};
 if($('#reduced-motion'))$('#reduced-motion').onchange=e=>{state.reducedMotion=e.target.checked;cancelSequence();if(pack)stage='ready';persist();render();};
 if($('#search'))$('#search').oninput=e=>{search=e.target.value;const p=e.target.selectionStart;render();$('#search').focus();$('#search').setSelectionRange(p,p);};
 if($('#rarity'))$('#rarity').onchange=e=>{filter=e.target.value;render();};
 if($('#owned-only'))$('#owned-only').onchange=e=>{ownedOnly=e.target.checked;render();};
 on('#apply',()=>{try{const pool=validatePool(parseJson($('#editor').value,'pool'));if(confirm('应用卡池？移除的卡片进度会被删除，请确认已备份。'))apply(pool);}catch(e){$('#editor-error').textContent=e.message;}});
 on('#choose-pool',()=>$('#import-pool').click());on('#choose-restore',()=>$('#restore').click());
 on('#export-pool',()=>download('gachabase-pool.json',state.pool,'pool'));on('#backup',()=>download('gachabase-backup.json',{...state,version:2},'backup'));
 for(const id of ['import-pool','restore'])if($('#'+id))$('#'+id).onchange=async e=>{try{const file=e.target.files[0];if(!file)return;const kind=id==='import-pool'?'pool':'backup';checkJsonSize(file.size,kind);const raw=parseJson(await file.text(),kind);if(id==='import-pool'){const pool=validatePool(raw);$('#editor').value=JSON.stringify(pool,null,2);notice('已载入编辑器，点击校验并应用后生效。');}else{const next=validateSave(raw,initialPool);if(confirm('恢复将替换当前全部进度，是否继续？')){cancelSequence();state=next;storageReadBlocked=false;storageReadMessage='';pack=state.pending?{cards:state.pending.ids.map(id=>state.pool.cards.find(c=>c.id===id)),revealed:[...state.pending.revealed]}:null;stage='ready';persist();render();notice('完整备份已恢复。');}}}catch(e){$('#editor-error').textContent='导入失败：'+e.message;}finally{e.target.value='';}};
}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{cancelSequence();stage='ready';view=b.dataset.view;search='';filter='';ownedOnly=false;render();window.scrollTo(0,0);});
$('#close').onclick=()=>{$('#detail').close();render();};
$('#detail').addEventListener('click',e=>{if(e.target===$('#detail')){$('#detail').close();render();}});
$('#detail').addEventListener('cancel',()=>render());
render();
