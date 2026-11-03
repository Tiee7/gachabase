export const rarities = ['N','R','SR','SSR'];
export const JSON_LIMITS=Object.freeze({pool:8000000,backup:12000000});
export class ResourceLimitError extends Error {
  constructor(kind){
    super(`资源大小超限：${kind==='pool'?'卡池':'完整备份'}最多 ${JSON_LIMITS[kind].toLocaleString('en-US')} 个 UTF-8 字节。这是处理上限，不表示数据损坏；当前进度未被替换。`);
    this.name='ResourceLimitError';this.code='RESOURCE_LIMIT';
  }
}
export function checkJsonSize(bytes,kind){
  if(!Object.hasOwn(JSON_LIMITS,kind))throw Error('未知 JSON 类型。');
  if(bytes>JSON_LIMITS[kind])throw new ResourceLimitError(kind);
}
export function parseJson(text,kind){
  checkJsonSize(new TextEncoder().encode(text).byteLength,kind);
  try{return JSON.parse(text);}catch(e){if(e instanceof SyntaxError)throw Error('JSON 语法错误，请检查括号、引号或文件内容。');throw e;}
}
export function serializeJson(value,kind){
  const text=JSON.stringify(value,null,2);
  checkJsonSize(new TextEncoder().encode(text).byteLength,kind);
  return text;
}
function checkPoolBudget(pool){
  serializeJson(pool,'pool');
  // Reserve the full bounded progress envelope before accepting content. This
  // includes nested indentation in the exact format used by exported backups.
  const ids=pool.cards.map(c=>c.id),longest=ids.reduce((a,b)=>a.length>=b.length?a:b);
  serializeJson({version:2,pool,owned:Object.fromEntries(ids.map(id=>[id,1000000])),deck:Object.fromEntries(ids.map(id=>[id,2])),levels:Object.fromEntries(ids.map(id=>[id,5])),quizSession:{cardId:longest,questionIndex:19,settled:false,selected:null},packs:Number.MAX_SAFE_INTEGER,pending:{ids:Array(5).fill(longest),revealed:Array(5).fill(false)},autoReveal:false,reducedMotion:false},'backup');
}
export function validatePool(value) {
  if (!value || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 80) throw Error('卡池名称应为 1–80 字。');
  if (!Array.isArray(value.cards) || !value.cards.length || value.cards.length > 500) throw Error('卡池需要 1–500 张卡。');
  const ids = new Set();
  const cards = value.cards.map((c,i) => {
    if (!c || typeof c !== 'object') throw Error(`第 ${i+1} 张卡格式错误。`);
    const result = {};
    for (const [key,max] of Object.entries({id:80,title:60,unit:80,category:40,era:100,text:600,source:500})) {
      if (typeof c[key] !== 'string' || !c[key].trim() || c[key].length > max) throw Error(`第 ${i+1} 张卡的 ${key} 需为 1–${max} 字。`);
      result[key] = c[key].trim();
    }
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(result.id) || ['constructor','prototype','__proto__'].includes(result.id)) throw Error('ID 只能使用英文字母、数字、连字符和下划线，且不可使用保留名称。');
    if (ids.has(result.id)) throw Error(`重复 ID：${result.id}`);
    ids.add(result.id);
    if (!rarities.includes(c.rarity)) throw Error(`第 ${i+1} 张卡稀有度应为 N / R / SR / SSR。`);
    result.rarity=c.rarity;
    if(c.art!==undefined){
      if(!['bronze','qinhan','threekingdoms','sages','emperor','redcliffs'].includes(c.art))throw Error(`第 ${i+1} 张卡 art 不在本地图案列表中。`);
      result.art=c.art;
    }
    if(c.questions!==undefined){
      if(!Array.isArray(c.questions)||c.questions.length>20)throw Error(`第 ${i+1} 张卡 questions 需为最多 20 道题的数组。`);
      result.questions=c.questions.map((q,j)=>{
        if(!q||typeof q.question!=='string'||!q.question.trim()||q.question.length>300)throw Error(`第 ${i+1} 张卡第 ${j+1} 题题干无效。`);
        if(!Array.isArray(q.options)||q.options.length<2||q.options.length>6||q.options.some(x=>typeof x!=='string'||!x.trim()||x.length>200)||new Set(q.options.map(x=>x.trim())).size!==q.options.length)throw Error(`第 ${i+1} 张卡第 ${j+1} 题选项无效或重复。`);
        if(!Number.isInteger(q.answer)||q.answer<0||q.answer>=q.options.length)throw Error(`第 ${i+1} 张卡第 ${j+1} 题答案索引无效。`);
        if(q.explanation!==undefined&&(typeof q.explanation!=='string'||q.explanation.length>600))throw Error('题目解析需为最多 600 字的文本。');
        return {question:q.question.trim(),options:q.options.map(x=>x.trim()),answer:q.answer,explanation:q.explanation||''};
      });
    }
    return result;
  });
  const pool={name:value.name.trim(),cards};
  checkPoolBudget(pool);return pool;
}
export function drawPack(pool,random=Math.random) {
  const weights={N:60,R:25,SR:12,SSR:3};
  const total=pool.cards.reduce((s,c)=>s+weights[c.rarity],0);
  return Array.from({length:5},()=>{let r=random()*total;return pool.cards.find(c=>(r-=weights[c.rarity])<0)||pool.cards.at(-1);});
}
export function validateSave(raw,samplePool) {
  if(!raw||typeof raw!=='object')throw Error('备份格式无效。');
  const pool=validatePool(raw.pool);
  // Only exact, unchanged legacy sample cards receive their authored questions.
  if(raw.version!==2&&samplePool)for(const card of pool.cards){
    const sample=samplePool.cards.find(c=>c.id===card.id);
    if(card.questions===undefined&&sample&&['title','unit','category','era','text','rarity','source'].every(k=>card[k]===sample[k])){
      card.questions=structuredClone(sample.questions||[]);card.art=sample.art;
    }
  }
  const valid=new Set(pool.cards.map(c=>c.id));
  const clean=(v)=>Object.fromEntries(Object.entries(v||{}).filter(([id,n])=>valid.has(id)&&Number.isSafeInteger(n)&&n>0&&n<=1000000));
  const owned=clean(raw.owned),deck=clean(raw.deck);
  for(const id in deck)deck[id]=Math.min(deck[id],owned[id]||0,2);
  const p=raw.pending;
  const pending=p&&Array.isArray(p.ids)&&p.ids.length===5&&p.ids.every(id=>valid.has(id))&&Array.isArray(p.revealed)&&p.revealed.length===5&&p.revealed.every(v=>typeof v==='boolean')?{ids:[...p.ids],revealed:[...p.revealed]}:null;
  const levels=Object.fromEntries(pool.cards.map(c=>[c.id,Number.isInteger(raw.levels?.[c.id])&&raw.levels[c.id]>=0&&raw.levels[c.id]<=5?raw.levels[c.id]:0]));
  const q=raw.quizSession,card=pool.cards.find(c=>c.id===q?.cardId),question=Number.isInteger(q?.questionIndex)?card?.questions?.[q.questionIndex]:null;
  const quizSession=question&&owned[card.id]&&typeof q.settled==='boolean'&&((!q.settled&&q.selected===null)||(q.settled&&Number.isInteger(q.selected)&&q.selected>=0&&q.selected<question.options.length))?{cardId:card.id,questionIndex:q.questionIndex,settled:q.settled,selected:q.selected}:null;
  checkPoolBudget(pool);
  const save={version:2,pool,owned,deck,levels,quizSession,packs:Number.isSafeInteger(raw.packs)&&raw.packs>=0?raw.packs:0,pending,autoReveal:raw.autoReveal!==false,reducedMotion:raw.reducedMotion===true};
  serializeJson(save,'backup');return save;
}

export function startQuestion(state,id,next=false){
  const card=state.pool.cards.find(c=>c.id===id);
  if(!card||!state.owned[id]||!card.questions?.length)return null;
  const prior=state.quizSession;
  if(!next&&prior?.cardId===id)return prior;
  const questionIndex=prior?.cardId===id?(prior.questionIndex+1)%card.questions.length:0;
  return state.quizSession={cardId:id,questionIndex,settled:false,selected:null};
}
export function answerQuestion(state,session,selected){
  if(!session||state.quizSession!==session||session.settled)return null;
  const card=state.pool.cards.find(c=>c.id===session.cardId),q=card?.questions?.[session.questionIndex];
  if(!q||!state.owned[card.id]||!Number.isInteger(selected)||selected<0||selected>=q.options.length)return null;
  session.settled=true;session.selected=selected;
  const before=state.levels[card.id]||0,correct=selected===q.answer;
  const level=Math.max(0,Math.min(5,before+(correct?1:-1)));
  state.levels[card.id]=level;
  return {correct,before,level};
}
