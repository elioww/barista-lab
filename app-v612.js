'use strict';
const $=id=>document.getElementById(id), KEY='barista-lab-v1', CUPS=['음료컵','전용컵','믹서기','휘핑컵','스팀컵'], ACTIONS=['섞어서 녹이기','음료컵에 붓기','갈기','휘핑 5단 50초','섞기','블렌더 전원 켜기','블렌더 1번 버튼','블렌더 20초 표시 후 끄기','스팀하기','스팀 우유 붓기'];
const empty=()=>({score:0,combo:0,history:{}});let shelfPage=0,bookPage={book:0,wrong:0},bookFilter='전체';let data=[],stats=empty(),current=null,log=[],cup=CUPS[0],chosen='',locked=false,errors=[],timer=null,deadline=0,hinted=false,tab='game';
const SHOT_SECONDS=27;let shotBatch=null,shotClock=null;
function el(tag,text,cls){let x=document.createElement(tag);if(text!=null)x.textContent=text;if(cls)x.className=cls;return x}function btn(t,fn,cls){let x=el('button',t,cls);x.type='button';x.onclick=fn;return x}function notice(t){$('notice').textContent=t}function save(){try{localStorage.setItem(KEY,JSON.stringify({data,stats}));notice('')}catch(e){notice('기기 저장에 실패했습니다. 백업 파일을 내보내세요.')}paintStats()}
function valid(raw){let r=raw.recipes;if(!Array.isArray(r)||!r.length||r.length>500)throw Error('레시피 목록을 확인하세요.');let ids=new Set();for(let x of r){if(typeof x.id!=='string'||ids.has(x.id)||typeof x.name!=='string'||typeof x.category!=='string'||!Array.isArray(x.steps)||(!x.steps.length&&x.enabled!==false)||x.steps.some(s=>!CUPS.includes(s.cup)||typeof s.item!=='string'||!s.item))throw Error('레시피 형식 오류: '+(x.name||''));ids.add(x.id)}if(!r.some(x=>x.enabled!==false))throw Error('연습 가능한 레시피가 없습니다.');return r}
async function importFile(f){if(!f)return;try{let raw=JSON.parse(await f.text());let next=valid(raw);let old=data;data=next;if(raw.stats&&typeof raw.stats==='object'&&raw.stats.history)stats=raw.stats;else{let kept={};for(let x of data){let prev=old.find(y=>y.id===x.id);if(prev&&JSON.stringify(prev.steps)===JSON.stringify(x.steps)){if(stats.history[x.id])kept[x.id]=stats.history[x.id];if(stats.history[x.id+'::hot'])kept[x.id+'::hot']=stats.history[x.id+'::hot']}}stats.history=kept;let ids=new Set(data.filter(x=>{let prev=old.find(y=>y.id===x.id);return prev&&JSON.stringify(prev.steps)===JSON.stringify(x.steps)}).map(x=>x.id));stats.memoHistory=Object.fromEntries(Object.entries(stats.memoHistory||{}).filter(([k])=>{try{return ids.has(JSON.parse(k)[1])}catch{return false}}))}save();boot()}catch(e){notice('불러오기 실패: '+e.message)}}
for(let id of ['file','replace'])$(id).onchange=e=>{importFile(e.target.files[0]);e.target.value=''};
function paintStats(){let h=Object.values(stats.history);$('stats').replaceChildren(...[['점수',stats.score],['콤보',stats.combo],['숙련 메뉴',h.filter(x=>x.streak>=3).length]].map(([t,n])=>{let d=el('div');d.append(el('small',t),el('b',n));return d}))}
function boot(){clearInterval(timer);resetShot();$('setup').hidden=!!data.length;$('app').hidden=!data.length;if(!data.length)return;$('category').replaceChildren(...['전체',...new Set(data.filter(x=>x.enabled!==false).map(x=>x.category)),'오답만'].map(t=>{let o=el('option',t);o.value=t;return o}));$('editor').value=JSON.stringify({version:1,recipes:data},null,2);paintStats();switchTab('game');start()}
function switchTab(t){tab=t;for(let k of ['game','book','wrong','study','settings'])$(k).hidden=k!==t;for(let b of $('nav').children)b.classList.toggle('active',b.dataset.tab===t);if(t==='book'||t==='wrong')book(t);if(t==='study')startStudy();if(t==='settings')$('editor').value=JSON.stringify({version:1,recipes:data},null,2)}
$('nav').onclick=e=>{let t=e.target.dataset.tab;if(t)switchTab(t)};$('category').onchange=()=>start();$('mode').onchange=()=>start(current?.id);

function hotEligible(r){return r.enabled!==false&&!/스무디|에이드|아이스티/i.test(r.category+' '+r.name.replace(/\s/g,''))&&!(/제로/.test(r.name)&&r.steps.some(s=>s.cup==='전용컵'))&&!r.steps.some(s=>s.cup==='믹서기'||s.item==='탄산수')}
function hotVariant(r){
 let direct=[],prep=[],steam=[],other=[];
 let existingPrep=r.steps.some(s=>s.cup==='전용컵');
 let powder=r.steps.filter(s=>s.cup==='음료컵'&&/\d+(?:\.\d+)?g$/.test(s.item)&&(!/시럽/.test(s.item))&&(!/시럽/.test(r.description||'')||/파우더/.test(s.item)));
 for(let s of r.steps){let k=key(s.item);if(k==='얼음')continue;
 if(s.cup==='음료컵'&&k==='우유'){steam.push({cup:'스팀컵',item:s.item},{cup:'스팀컵',item:'스팀하기'},{cup:'스팀컵',item:'스팀 우유 붓기'});continue}
 if(s.cup==='음료컵'&&['물','정수','정수물','찬물','차가운 물'].includes(k)){direct.push({...s,item:s.item.replace(k,'뜨거운 물')});continue}
 if(!existingPrep&&powder.includes(s)&&r.steps.some(x=>key(x.item)==='우유')){prep.push({...s,cup:'전용컵'});continue}
 if(s.cup==='음료컵')direct.push({...s});else other.push({...s})}
 if(prep.length)prep.push(...['뜨거운 물','섞어서 녹이기','음료컵에 붓기'].map(item=>({cup:'전용컵',item})));
 return {...r,id:r.id+'::hot',baseId:r.id,temperature:'HOT',steps:[...other,...prep,...steam,...direct]};
}
function orderPool(rows=data){return rows.filter(r=>r.enabled!==false).flatMap(r=>[{...r,temperature:'ICE'},...(hotEligible(r)?[hotVariant(r)]:[])])}


let memoLast='',memoTick=0,memoQueue=[],memoContext='',memoQuestion=null;
function memoMode(){return ['ingredients','amounts'].includes($('mode').value)}
function memoShuffle(arr){let a=[...arr];for(let i=a.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function memoDay(){let d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function memoQuestions(rows,mode){
 let active=rows.filter(r=>r.enabled!==false),all=[...new Set(active.flatMap(r=>r.steps.filter(s=>!ACTIONS.includes(s.item)).map(s=>s.item)))],keys=[...new Set(all.map(key))];
 let qs=[];
 for(let r of active){
  let items=[...new Set(r.steps.filter(s=>!ACTIONS.includes(s.item)).map(s=>s.item))];
  let rk=new Set(items.map(key));
  if(mode==='ingredients'){
   let core=[...rk].filter(k=>!['얼음','물','정수','뜨거운 물','우유','샷','에스프레소','에스프레소샷'].includes(k));
   if(!core.length)core=[...rk];
   for(let k of core){
    let wrong=keys.filter(x=>!rk.has(x));
    if(wrong.length)qs.push({id:JSON.stringify([mode,r.id,k]),recipe:r,ingredient:k,answer:k,wrong,prompt:'이 메뉴에 들어가는 재료는?'});
   }
  }else{
   for(let item of items){let [k,v]=split(item);if(!v||!(/^\d/.test(v)))continue;
    let unit=v.replace(/^\d+(?:\.\d+)?/,'');
    let candidates=quantities(k,all).map(x=>split(x)[1]).filter(x=>x&&x!==v&&x.replace(/^\d+(?:\.\d+)?/,'')===unit);
    let defaults=unit==='g'?[20,22,30,40,45,50,60,70,80]:unit==='ml'?[120,150,160,180,200,220]:unit==='펌프'?[1,1.5,2,2.5,3,4]:unit==='스푼'?[1,2,3,4,5]:unit==='샷'?[1,2,3,4]:unit==='개'?[2,4,6,8,10,12]:unit.includes('스쿱')?[1,2,3,4]:[1,2,3,4,6,10];
    let wrong=[...new Set([...candidates,...defaults.map(n=>n+unit)])].filter(x=>x!==v&&!items.includes(k+' '+x));
    if(wrong.length)qs.push({id:JSON.stringify([mode,r.id,item]),recipe:r,ingredient:k,answer:v,wrong,prompt:k+'은 얼마나 넣어야 할까?'});
   }
  }
 }
 return qs;
}
function memoPick(qs,hist,tick,queue,last,day){
 let map=new Map(qs.map(q=>[q.id,q]));let due=queue.filter(x=>x.due<=tick&&map.has(x.id)&&x.id!==last).sort((a,b)=>a.due-b.due);
 if(due.length)return map.get(due[0].id);
 let waiting=new Set(queue.filter(x=>x.due>tick).map(x=>x.id));
 let pool=qs.filter(q=>q.id!==last&&!waiting.has(q.id));if(!pool.length)pool=qs.filter(q=>q.id!==last);if(!pool.length)pool=qs;
 const priority=q=>{let h=hist[q.id];return !h?2:(h.streak<3?0:h.day!==day?1:3)};
 let min=Math.min(...pool.map(priority));return memoShuffle(pool.filter(q=>priority(q)===min))[0];
}
function memoStart(){
 if($('mode').value==='amounts'){blankStart();return}
 clearInterval(timer);resetShot();current=null;deadline=0;let mode=$('mode').value,cat=$('category').value,context=mode+'|'+cat;
 if(context!==memoContext){memoContext=context;memoLast='';memoTick=0;memoQueue=[]}
 let hist=stats.memoHistory||(stats.memoHistory={}),all=memoQuestions(data,mode),qs=all.filter(q=>cat==='전체'||q.recipe.category===cat||cat==='오답만'&&hist[q.id]?.miss);
 let root=$('gamebody');root.className='memoMode';root.replaceChildren();
 if(!qs.length){root.append(el('p','해당 분류의 암기 문제가 없습니다. 다른 분류를 선택하세요.'));return}
 memoTick++;let q=memoPick(qs,hist,memoTick,memoQueue,memoLast,memoDay());memoQuestion=q;memoLast=q.id;
 memoQueue=memoQueue.filter(x=>x.id!==q.id);
 let total=qs.reduce((a,x)=>a+(hist[x.id]?.attempts||0),0),correct=qs.reduce((a,x)=>a+(hist[x.id]?.correct||0),0),mastered=qs.filter(x=>hist[x.id]?.streak>=3).length;
 let overview=el('div',null,'memoOverview');overview.append(el('span','암기 '+mastered+' / '+qs.length),el('span',total?'정답률 '+Math.round(correct/total*100)+'%':'첫 연습'));root.append(overview);
 let progress=el('div',null,'memoProgress'),bar=el('div');bar.style.width=(100*mastered/qs.length)+'%';progress.append(bar);root.append(progress);
 let head=el('div',null,'memoHead');head.append(el('small',mode==='amounts'?'용량 암기':'재료 암기'),el('h2',q.recipe.name),el('p',q.prompt));root.append(head);
 let options=el('div',null,'memoOptions'),choices=memoShuffle([q.answer,...memoShuffle(q.wrong).slice(0,3)]),footer=el('div',null,'memoFooter');let done=false;
 for(let opt of choices){let b=btn(opt,()=>answer(opt));options.append(b)}
 root.append(options,footer);
 function answer(opt){if(done)return;done=true;let ok=opt===q.answer,h=hist[q.id]||{attempts:0,correct:0,miss:0,streak:0};h.attempts++;h.correct+=ok?1:0;h.miss+=ok?0:1;h.streak=ok?h.streak+1:0;h.day=memoDay();hist[q.id]=h;
 if(!ok||h.streak<3)memoQueue.push({id:q.id,due:memoTick+4+Math.floor(Math.random()*3)});
 save();for(let b of options.children){b.disabled=true;if(b.textContent===q.answer)b.classList.add('memoCorrect');else if(b.textContent===opt)b.classList.add('memoWrong')}
 footer.append(el('h3',ok?'정답':'정답: '+q.answer),el('p',q.recipe.name+' · '+(mode==='amounts'?q.ingredient+' ':'')+q.answer),el('small',h.streak>=3?'암기 완료 · 다음 날 복습':'연속 정답 '+h.streak+'/3'));
 root.classList.add('memoAnswered');
 let review=el('div',null,'memoRecipe');review.append(el('h3','전체 레시피 · ICE 기준'));
 for(let c of CUPS){let steps=q.recipe.steps.filter(s=>s.cup===c);if(!steps.length)continue;let group=el('div',null,'memoRecipeGroup');group.append(el('h4',c));for(let s of steps){let row=el('div',null,'memoRecipeRow'),[k,v]=split(s.item);row.append(el('span',k),el('span',v));if((mode==='amounts'&&k===q.ingredient&&v===q.answer)||(mode==='ingredients'&&k===q.answer))row.classList.add('memoRecipeHighlight');group.append(row)}review.append(group)}
 if(q.recipe.note)review.append(el('p',q.recipe.note,'memoRecipeNote'));
 footer.append(review,btn('다음 문제',memoStart,'primary'));
 }
}


let blankLevel='basic',blankTick=0,blankQueue=[],blankLast='',blankContext='';
function blankParts(r){
 return r.steps.map((s,i)=>{let [name,v]=split(s.item),m=v.match(/^(\d+(?:\.\d+)?)(.*)$/);return {...s,i,name,number:m?m[1]:null,unit:m?m[2]:'',tail:m?'':v,action:ACTIONS.includes(s.item)}})
}
function blankFields(r,level){
 let fields=[];for(let p of blankParts(r)){if(p.action)continue;
 if(level!=='basic')fields.push({id:JSON.stringify(['blank-name',r.id,p.i+':'+p.item]),i:p.i,kind:'name',answer:p.name});
 if(p.number!==null)fields.push({id:JSON.stringify(['blank-number',r.id,p.i+':'+p.item]),i:p.i,kind:'number',answer:p.number,unit:p.unit});
 }return fields
}
function blankPlan(r,level,hist,focus=[]){
 let fields=blankFields(r,level);if(focus.length){let selected=fields.filter(f=>focus.includes(f.id));if(selected.length)return selected}
 if(level!=='mixed')return fields;
 let out=[];for(let p of blankParts(r)){let group=fields.filter(f=>f.i===p.i);if(!group.length)continue;
 let min=Math.min(...group.map(f=>hist[f.id]?.streak||0));out.push(memoShuffle(group.filter(f=>(hist[f.id]?.streak||0)===min))[0])}
 return out
}
function blankMatch(f,value){
 let t=String(value??'').trim();if(!t)return false;
 if(f.kind==='number'){if(f.unit&&t.endsWith(f.unit))t=t.slice(0,-f.unit.length).trim();return /^\d+(?:\.\d+)?$/.test(t)&&Number(t)===Number(f.answer)}
 const norm=v=>String(v).normalize('NFKC').replace(/\s+/g,'').toLowerCase();
 let a=norm(f.answer),b=norm(t);
 if(a===b)return true;
 const aliases=[['물','정수','정수물','찬물','차가운물'],['뜨거운물','온수','핫워터'],['샷','에스프레소','에스프레소샷']];
 return aliases.some(xs=>xs.includes(a)&&xs.includes(b))
}
function blankStart(){
 clearInterval(timer);resetShot();current=null;deadline=0;
 let root=$('gamebody');root.className='memoMode blankMode';root.replaceChildren();
 let hist=stats.memoHistory||(stats.memoHistory={}),cat=$('category').value,ctx=blankLevel+'|'+cat;
 if(ctx!==blankContext){blankContext=ctx;blankLast='';blankTick=0;blankQueue=[]}
 let candidates=data.filter(r=>r.enabled!==false&&(cat==='전체'||r.category===cat||cat==='오답만')&&blankFields(r,blankLevel).length);
 let rows=candidates.filter(r=>cat!=='오답만'||blankFields(r,blankLevel).some(f=>hist[f.id]?.miss));
 let levels=el('div',null,'blankLevels');for(let [v,label] of [['basic','초급 · 용량'],['mixed','중급 · 랜덤'],['advanced','고급 · 전체']]){let b=btn(label,()=>{blankLevel=v;blankStart()},blankLevel===v?'active':'');b.setAttribute('aria-pressed',String(blankLevel===v));levels.append(b)}root.append(levels);
 if(!rows.length){root.append(el('p','해당 분류의 빈칸 문제가 없습니다. 다른 분류나 난이도를 선택하세요.'));return}
 blankTick++;
 let qlist=rows.map(r=>{let fields=blankFields(r,blankLevel),hs=fields.map(f=>hist[f.id]);return {id:r.id,r,fields,priority:hs.some(h=>h&&h.streak<3)?0:hs.some(h=>h&&h.day!==memoDay())?1:hs.some(h=>!h)?2:3}});
 let due=blankQueue.filter(x=>x.due<=blankTick&&x.id!==blankLast&&qlist.some(q=>q.id===x.id)).sort((a,b)=>a.due-b.due)[0];
 let waiting=new Set(blankQueue.filter(x=>x.due>blankTick).map(x=>x.id));
 let pool=qlist.filter(q=>q.id!==blankLast&&!waiting.has(q.id));if(!pool.length)pool=qlist.filter(q=>q.id!==blankLast);if(!pool.length)pool=qlist;
 let q=due?qlist.find(x=>x.id===due.id):memoShuffle(pool.filter(x=>x.priority===Math.min(...pool.map(y=>y.priority))))[0];
 let retry=due||blankQueue.find(x=>x.id===q.id);blankQueue=blankQueue.filter(x=>x.id!==q.id);blankLast=q.id;
 let fields=blankPlan(q.r,blankLevel,hist,retry?.fields||[]),byIndex=new Map();for(let f of fields){let slot=byIndex.get(f.i)||{};slot[f.kind]=f;byIndex.set(f.i,slot)}
 let all=qlist.flatMap(x=>x.fields),total=all.reduce((n,f)=>n+(hist[f.id]?.attempts||0),0),correct=all.reduce((n,f)=>n+(hist[f.id]?.correct||0),0),mastered=all.filter(f=>hist[f.id]?.streak>=3).length;
 let overview=el('div',null,'memoOverview');overview.append(el('span','빈칸 암기 '+mastered+' / '+all.length),el('span',total?'정답률 '+Math.round(correct/total*100)+'%':'첫 연습'));root.append(overview);
 let head=el('div',null,'blankHead');head.append(el('small','ICE 기준'+(retry?' · 오답 복습':'')),el('h2',q.r.name),el('p',retry?'이전에 틀렸거나 아직 익숙하지 않은 빈칸을 다시 채워 보세요.':blankLevel==='basic'?'재료의 용량을 숫자로 입력하세요.':blankLevel==='mixed'?'비어 있는 재료명 또는 용량을 채우세요.':'재료명과 용량을 모두 입력하세요.'));root.append(head);
 let form=el('form',null,'blankForm'),scroll=el('div',null,'blankScroll'),inputs=new Map(),feedbacks=new Map(),done=false;
 function makeInput(f){let input=el('input');input.type='text';input.className=f.kind==='number'?'blankNumber':'blankName';input.inputMode=f.kind==='number'?'decimal':'text';input.autocomplete='off';input.spellcheck=false;input.enterKeyHint='next';input.placeholder=f.kind==='number'?'?':'재료명';input.setAttribute('aria-label',f.kind==='number'?'용량 '+(f.unit||'숫자'):'재료명');inputs.set(f.id,input);return input}
 for(let c of CUPS){let parts=blankParts(q.r).filter(p=>p.cup===c);if(!parts.length)continue;let group=el('div',null,'blankGroup');group.append(el('h3',c));
 for(let p of parts){let block=el('div',null,'blankBlock'),line=el('div',null,'blankLine'),slot=byIndex.get(p.i)||{};
 if(p.action){line.append(el('span',p.item,'blankAction'))}
 else{let left=el('div',null,'blankLabel');left.append(slot.name?makeInput(slot.name):el('span',p.name));line.append(left);
 if(p.number!==null){let right=el('div',null,'blankAmount');right.append(slot.number?makeInput(slot.number):el('b',p.number));if(p.unit)right.append(el('span',p.unit));line.append(right)}else if(p.tail)line.append(el('span',p.tail))}
 block.append(line);let fback=el('div',null,'blankFeedback');feedbacks.set(p.i,fback);block.append(fback);group.append(block)}
 scroll.append(group)}
 let footer=el('div',null,'blankFooter'),result=el('div',null,'blankResult'),check=btn('정답 확인',()=>{},'primary');check.type='submit';footer.append(result,check);form.append(scroll,footer);root.append(form);
 form.addEventListener('keydown',e=>{if(e.key!=='Enter'||e.isComposing||done||!e.target.matches('.blankLine input'))return;e.preventDefault();let fields=[...inputs.values()],i=fields.indexOf(e.target);if(i>=0&&i<fields.length-1)fields[i+1].focus({preventScroll:true});else e.target.blur()});
 form.onsubmit=e=>{e.preventDefault();if(done)return;done=true;document.activeElement?.blur();let ok=0,redo=[];
 for(let f of fields){let input=inputs.get(f.id),value=input.value,right=blankMatch(f,value),h=hist[f.id]||{attempts:0,correct:0,miss:0,streak:0};h.attempts++;h.correct+=right?1:0;h.miss+=right?0:1;h.streak=right?h.streak+1:0;h.day=memoDay();hist[f.id]=h;input.readOnly=true;input.classList.add(right?'blankRight':'blankWrong');input.setAttribute('aria-invalid',String(!right));if(right)ok++;else{let row=feedbacks.get(f.i);row.append(el('div',(value.trim()?'입력: '+value:'미입력')+' → 정답: '+f.answer+(f.kind==='number'?f.unit:'')));input.value=f.answer}if(!right)redo.push(f.id)}
 if(redo.length)blankQueue.push({id:q.id,due:blankTick+4+Math.floor(Math.random()*3),fields:redo});
 save();root.classList.add('blankAnswered');result.append(el('h3','정답 '+ok+' / '+fields.length),el('p',ok===fields.length?'전체 정답 · 레시피를 한 번 더 확인하세요.':'틀린 빈칸을 정답으로 바꿔 표시했어요. 이후 다시 출제됩니다.'));
 if(q.r.note)scroll.append(el('p',q.r.note,'memoRecipeNote'));check.textContent='다음 문제';check.type='button';check.onclick=blankStart;scroll.scrollTop=0;
 };
}

function start(id){if(memoMode()){memoStart();return}clearInterval(timer);resetShot();let cat=$('category').value,pool=orderPool().filter(x=>(cat==='전체'||x.category===cat||cat==='오답만'&&stats.history[x.id]?.miss));if(id){let found=orderPool().find(x=>x.id===id);if(found)pool=[found]}if(!pool.length){current=null;$('gamebody').replaceChildren(el('div','해당 메뉴가 없습니다. 다른 분류를 선택하세요.','panel'));return}let alternatives=pool.filter(x=>x.id!==current?.id);if(alternatives.length)pool=alternatives;current=pool[Math.floor(Math.random()*pool.length)];log=[];cup=CUPS[0];chosen='';shelfPage=0;locked=false;errors=[];hinted=false;deadline=$('mode').value==='timed'?Date.now()+45000:0;render();if(deadline)timer=setInterval(()=>{let left=Math.max(0,Math.ceil((deadline-Date.now())/1000));let t=$('timer');if(t)t.textContent=left+'초';if(left===0)submit()},200)}
function split(s){let m=s.match(/^(.*?) (\d+(?:\.\d+)?(?:스쿱 가득|ml|펌프|스푼|샷|스쿱|g|개)?|가득|한 꼬집)$/);return m?[m[1],m[2]]:[s,'']}
function key(s){return split(s)[0]}function equal(a,b){return a.item===b.item&&a.cup===b.cup}
function grade(recipe,actual,strict=true){let out=[],used=new Set();for(let e of recipe.steps){let i=actual.findIndex((a,j)=>!used.has(j)&&equal(a,e));if(i>=0){used.add(i);continue}i=actual.findIndex((a,j)=>!used.has(j)&&a.item===e.item);if(i>=0){used.add(i);out.push('컵 오류: '+e.item+'은(는) '+actual[i].cup+'이 아니라 '+e.cup+'에 넣어야 해.');continue}i=actual.findIndex((a,j)=>!used.has(j)&&key(a.item)===key(e.item));if(i>=0){used.add(i);out.push('용량 오류: '+actual[i].item+' → '+e.item+'.'+(actual[i].cup!==e.cup?' 컵도 '+e.cup+'으로 변경.':''));continue}out.push('누락: '+e.cup+' · '+e.item)}actual.forEach((a,i)=>{if(!used.has(i))out.push((recipe.steps.some(e=>e.item===a.item)?'중복':'불필요')+' 투입: '+a.cup+' · '+a.item)});if(strict&&recipe.ordered!==false){for(let c of CUPS){let a=actual.filter(x=>x.cup===c).map(x=>x.item),b=recipe.steps.filter(x=>x.cup===c).map(x=>x.item);if(a.length===b.length&&b.every(x=>a.includes(x))){if(c==='전용컵'){let dissolve=a.indexOf('섞어서 녹이기'),pourIndex=a.indexOf('음료컵에 붓기');let ingredients=a.map((item,index)=>({item,index})).filter(x=>!ACTIONS.includes(x.item));let hot=ingredients.find(x=>/^뜨거운\s*물$/.test(key(x.item)));if(hot&&ingredients.some(x=>x.index>hot.index))out.push('전용컵 순서 오류: 뜨거운 물은 재료를 모두 넣은 후 마지막에 넣어야 해.');if(dissolve>=0&&ingredients.some(x=>x.index>dissolve))out.push('전용컵 순서 오류: 모든 재료를 넣은 뒤 녹여야 해.');if(dissolve>=0&&pourIndex>=0&&pourIndex<dissolve)out.push('전용컵 순서 오류: 녹인 뒤 음료컵에 부어야 해.')}else if(a.join('|')!==b.join('|'))out.push(c+' 순서 오류: '+b.join(' → '))}}let pour=actual.findIndex(x=>x.item==='음료컵에 붓기');if(pour>=0){let mix=recipe.steps.some(x=>x.cup==='전용컵');if(mix&&recipe.temperature!=='HOT'&&pour!==actual.length-1)out.push('옮겨 붓기는 두 컵 준비 후 마지막에 해야 해.');if(!mix&&recipe.steps.some(x=>x.cup==='믹서기')&&actual.some((x,i)=>x.cup==='음료컵'&&i<pour))out.push('믹서기에서 갈아 붓고 나서 음료컵 재료를 추가해야 해.')}}return out}
function isShot(k){return ['샷','에스프레소','에스프레소샷'].includes(k.replace(/\s/g,''))}
function shotRemaining(batch,now=Date.now()){return batch?Math.max(0,Math.ceil((batch.readyAt-now)/1000)):0}
function resetShot(){clearInterval(shotClock);shotClock=null;shotBatch=null}
function updateShotButton(){let b=$('shotControl');if(!b||!shotBatch)return;let left=shotRemaining(shotBatch);b.textContent=left?'샷 추출 '+left+'초':'샷 붓기';b.disabled=left>0;b.classList.toggle('extracting',left>0);b.classList.toggle('ready',left===0);b.setAttribute('aria-label',left?'샷 추출 중 '+left+'초 남음':'추출 완료된 샷을 선택한 컵에 붓기');if(!left){clearInterval(shotClock);shotClock=null}}
function beginShot(item){if(locked||shotBatch)return;shotBatch={item,readyAt:Date.now()+SHOT_SECONDS*1000};chosen='';shelfPage=0;render();shotClock=setInterval(updateShotButton,200)}
function pourShot(){if(locked||!shotBatch||shotRemaining(shotBatch)>0)return;let item=shotBatch.item;resetShot();log.push({cup,item});chosen='';shelfPage=0;render()}
function add(item){if(locked)return;if(isShot(key(item))){beginShot(item);return}log.push({cup,item});chosen='';shelfPage=0;render()}function color(v){return /우유|휘핑크림/.test(v)?'#f0efec':/얼음|물|탄산/.test(v)?'#e2e2e2':/말차/.test(v)?'#a9a9a9':/딸기|복숭아/.test(v)?'#bcbcbc':/고구마/.test(v)?'#999999':'#777777'}
function showPhoto(r){if(typeof r.photo!=='string'||!/^data:image\/(jpeg|png|webp);base64,/.test(r.photo))return null;let img=el('img');img.src=r.photo;img.alt=r.name;img.style.cssText='display:block;width:100%;max-height:180px;object-fit:contain;border-radius:12px;margin:8px auto';return img}
function photoPicker(r){let label=el('label','사진 추가 또는 변경','file'),input=el('input');input.type='file';input.accept='image/*';label.append(input);input.onchange=()=>{let f=input.files[0];if(!f)return;let u=URL.createObjectURL(f),im=new Image();im.onload=()=>{try{let scale=Math.min(1,360/Math.max(im.width,im.height)),cv=document.createElement('canvas');cv.width=Math.max(1,Math.round(im.width*scale));cv.height=Math.max(1,Math.round(im.height*scale));cv.getContext('2d').drawImage(im,0,0,cv.width,cv.height);r.photo=cv.toDataURL('image/jpeg',.65);save();book(tab)}catch(e){notice('사진 저장 실패: '+e.message)}finally{URL.revokeObjectURL(u)}};im.onerror=()=>{URL.revokeObjectURL(u);notice('사진을 열 수 없습니다.')};im.src=u};return label}
function pager(index,total,change){let bar=el('div',null,'pager');let prev=btn('‹',()=>change(index-1)),next=btn('›',()=>change(index+1));prev.disabled=index<=0;next.disabled=index>=total-1;prev.setAttribute('aria-label','이전 페이지');next.setAttribute('aria-label','다음 페이지');bar.append(prev,el('span',(index+1)+' / '+total),next);return bar}
function detailsDialog(title,lines){let d=el('dialog',null,'detailDialog'),head=el('div',null,'row');head.append(el('h3',title),btn('닫기',()=>d.close()));let content=el('div',null,'dialogText');for(let line of lines)content.append(el('p',line));d.append(head,content);document.body.append(d);d.addEventListener('close',()=>d.remove(),{once:true});if(d.showModal)d.showModal();else d.setAttribute('open','')}
function compactCount(){let h=window.visualViewport?.height||window.innerHeight;return h<740?8:12}
function render(){if(!current)return;let root=$('gamebody');root.replaceChildren();root.classList.remove('memoMode','memoAnswered','blankMode','blankAnswered');root.classList.toggle('guideMode',$('mode').value==='guide'&&!locked);root.classList.toggle('resultMode',locked);
let ticket=el('div',null,'ticket');let info=el('div',null,'ticketInfo');info.append(el('small',current.temperature+' · '+current.category),el('h2',current.name));let t=el('small',deadline?Math.max(0,Math.ceil((deadline-Date.now())/1000))+'초':current.temperature+' / 제조 연습');t.id='timer';info.append(t);ticket.append(info);let photo=showPhoto(current);if(photo)ticket.append(photo);root.append(ticket);
if($('mode').value==='guide'&&!locked){let guide=el('div',null,'guideStrip');let next=current.steps.find(s=>!log.some(x=>equal(x,s)));let label=next?next.cup+' · '+next.item:'모든 단계 입력 완료';guide.append(el('div','가이드: '+label),btn('전체 레시피',()=>detailsDialog('가이드 레시피',[recipeText(current)])));root.append(guide)}
if(locked){let feedback=el('div',null,'panel feedback');feedback.append(el('h2',errors.length?'제조 실패 · 오류 '+errors.length+'개':hinted?'힌트로 제조 성공':'제조 성공!',errors.length?'':'good'));
let lines=errors.length?errors:['모든 재료와 제조 과정이 맞았어요.'];let first=el('div',lines[0],errors.length?'err':'good');feedback.append(first);if(lines.length>1)feedback.append(btn('전체 오류 '+lines.length+'개 보기',()=>detailsDialog('틀린 이유',lines)));feedback.append(el('h3','정답 레시피'));let recipe=el('p',recipeText(current),'recipePreview');feedback.append(recipe);feedback.append(btn('정답 전체 보기',()=>detailsDialog('정답 레시피',[recipeText(current),...(current.note?[current.note]:[])])));root.append(feedback);let bottom=el('div',null,'row resultActions');bottom.append(btn('다시 만들기',()=>start(current.id)),btn('다음 주문',()=>start(),'primary'));root.append(bottom);return}
let cs=el('div',null,'cups');for(let c of (current.temperature==='HOT'&&current.steps.some(s=>s.cup==='스팀컵')?['음료컵','전용컵','스팀컵','믹서기']:CUPS.filter(x=>x!=='스팀컵'))){let b=btn(c,()=>{cup=c;render()},'cupbtn'+(cup===c?' selected':''));let v=el('div',null,'vessel');let moved=log.some(x=>x.cup===c&&['음료컵에 붓기','스팀 우유 붓기'].includes(x.item));let layers=moved?[]:log.filter(x=>x.cup===c&&!ACTIONS.includes(x.item));if(c===CUPS[0])for(let x of log.filter(x=>['음료컵에 붓기','스팀 우유 붓기'].includes(x.item)))layers.push({item:x.item==='스팀 우유 붓기'?'우유':'혼합액'});for(let x of layers){let layer=el('div',null,'layer');layer.style.background=color(x.item);v.append(layer)}b.append(v);b.setAttribute('aria-pressed',String(cup===c));cs.append(b)}root.append(cs);
let shelf=el('div',null,'panel shelf');
let all=[...new Set(orderPool().flatMap(x=>x.steps.map(s=>s.item)))].filter(x=>!ACTIONS.includes(x));
const keys=[...new Set(all.map(key))];
const pinned=[{label:'얼음',match:k=>k==='얼음'},{label:'우유',match:k=>k==='우유'},{label:'정수',match:k=>['물','정수','정수물','찬물','차가운 물'].includes(k)},{label:'뜨거운 물',match:k=>['뜨거운물','온수','핫워터'].includes(k.replace(/\s/g,''))},{label:'샷',match:isShot}].map(x=>({...x,keys:keys.filter(x.match)}));
let groups=keys.filter(k=>!pinned.some(p=>p.keys.includes(k))).sort((a,b)=>a.localeCompare(b,'ko'));
function pickIngredient(k){let vals=quantities(k,all);if(vals.length===1){add(vals[0]);return}if(!vals.length)return;chosen=k;shelfPage=0;render()}
let quick=el('div',null,'quickIngredients');for(let [i,p] of pinned.entries()){let selected=p.keys.includes(chosen)||chosen==='@quick'+i;let isMachine=p.label==='샷';let button=btn(isMachine?'샷 추출':p.label,()=>{if(isMachine&&shotBatch){pourShot();return}if(p.keys.length===1)pickIngredient(p.keys[0]);else{chosen='@quick'+i;shelfPage=0;render()}},'quickIngredient'+(selected?' selected':''));button.disabled=!p.keys.length;button.setAttribute('aria-pressed',String(selected));if(isMachine)button.id='shotControl';quick.append(button)}shelf.append(quick);
let activeQuick=chosen.startsWith('@quick')?pinned[Number(chosen.slice(6))]:null;
let count=compactCount(),opts=activeQuick?activeQuick.keys.flatMap(k=>quantities(k,all)):chosen?quantities(chosen,all):groups;let pages=Math.max(1,Math.ceil(opts.length/count));let page=Math.min(shelfPage,pages-1);shelfPage=page;
let sh=el('div',null,'shelfHead');sh.append(el('h3',chosen?(activeQuick?.label||pinned.find(p=>p.keys.includes(chosen))?.label||chosen)+(chosen==='@quick4'||isShot(chosen)?' 추출량':' 용량'):'기타 재료 · '+cup));if(chosen)sh.append(btn('‹ 재료',()=>{chosen='';shelfPage=0;render()}));shelf.append(sh);
let grid=el('div',null,'materials');for(let k of opts.slice(page*count,(page+1)*count)){if(chosen)grid.append(btn(isShot(key(k))?(split(k)[1]||k)+' 추출':activeQuick?k:split(k)[1]||'넣기',()=>{shelfPage=0;add(k)}));else grid.append(btn(k,()=>pickIngredient(k)))}shelf.append(grid);if(pages>1)shelf.append(pager(page,pages,p=>{shelfPage=p;render()}));root.append(shelf);
let tools=el('div',null,'materials toolrow');let isNew=data.some(r=>r.steps.some(s=>s.item==='블렌더 전원 켜기'));let choices=cup==='믹서기'?(isNew?[['전원 켜기','블렌더 전원 켜기'],['1번 버튼','블렌더 1번 버튼'],['20초·끄기','블렌더 20초 표시 후 끄기'],['붓기','음료컵에 붓기']]:[['갈기','갈기'],['붓기','음료컵에 붓기']]):cup==='전용컵'?[['녹이기','섞어서 녹이기'],['붓기','음료컵에 붓기']]:cup==='휘핑컵'?[['휘핑','휘핑 5단 50초'],['붓기','음료컵에 붓기']]:cup==='스팀컵'?[['스팀하기','스팀하기'],['우유 붓기','스팀 우유 붓기']]:[['섞기','섞기']];for(let [label,a] of choices)tools.append(btn(label,()=>add(a)));root.append(tools);
let rec=el('div',null,'recordBar');let last=log.at(-1);let recent=el('span',last?log.length+'회 · '+last.item:'아직 재료 없음');recent.title=last?last.cup+' · '+last.item:'';rec.append(recent,btn('기록',()=>detailsDialog('제조 기록',log.length?log.map((x,i)=>(i+1)+'. '+x.cup+' · '+x.item):['아직 투입한 재료가 없습니다.'])),btn('취소',()=>{log.pop();render()}),btn('초기화',()=>{resetShot();log=[];chosen='';shelfPage=0;cup=CUPS[0];render()}),btn('힌트',()=>{hinted=true;detailsDialog('힌트',[recipeText(current)])}));root.append(rec,btn('제조 완료 · 채점',submit,'primary submitBtn'));updateShotButton()}
function quantities(k,all){let opts=all.filter(x=>key(x)===k);let numeric=opts.map(x=>split(x)[1]).filter(v=>/^\d/.test(v));if(k==='얼음'){if(numeric.some(v=>v.includes('스쿱')))opts=[...new Set([...opts,'얼음 1스쿱 가득','얼음 2스쿱 가득'])];return opts}let units=[...new Set(numeric.map(v=>v.replace(/^\d+(?:\.\d+)?/,'')))];for(let unit of units){let ns=unit==='g'?[22,30,40,45,50,70,80]:unit==='ml'||k==='우유'?[160,180,200]:unit==='샷'?[1,2,3,4]:unit==='개'?[4,6,8,10]:unit==='스푼'||unit==='펌프'?[1,2,2.5,3,4]:k==='물'?[80,100,120]:[1,2,2.5,3,4,6,10];opts=[...new Set([...opts,...ns.map(n=>k+' '+n+unit)])]}return opts}
function recipeText(r){return CUPS.map(c=>{let s=r.steps.filter(x=>x.cup===c).map(x=>x.item);return s.length?c+': '+s.join(' → '):''}).filter(Boolean).join(' / ')}
function submit(){if(locked||!current)return;locked=true;clearInterval(timer);resetShot();errors=grade(current,log,$('mode').value!=='easy');if(deadline&&Date.now()>=deadline)errors.push('시간 초과: 45초 안에 제조를 완료해야 해.');let h=stats.history[current.id]||{attempts:0,correct:0,miss:0,streak:0,lastErrors:[]};h.attempts++;if($('mode').value==='guide'){let gh=stats.guideHistory||(stats.guideHistory={});let row=gh[current.id]||{attempts:0,correct:0};row.attempts++;if(!errors.length)row.correct++;gh[current.id]=row;save();render();return}if(errors.length){h.miss++;h.streak=0;h.lastErrors=errors;stats.combo=0}else if(hinted){h.streak=0;stats.combo=0;stats.score+=30;h.correct++}else{h.correct++;h.streak++;stats.combo++;stats.score+=100+Math.min(stats.combo-1,5)*10}stats.history[current.id]=h;save();render()}
function book(t){let root=$(t);root.replaceChildren();let p=el('div',null,'panel compactBook');let head=el('div',null,'row');head.append(el('h2',t==='book'?'레시피 도감':'오답 노트'));let filter=el('select');for(let f of ['전체',...new Set(data.map(x=>x.category))]){let o=el('option',f);o.value=f;filter.append(o)}filter.value=bookFilter;filter.onchange=()=>{bookFilter=filter.value;bookPage[t]=0;book(t)};head.append(filter);p.append(head);let rows=data.filter(x=>(t==='book'||stats.history[x.id]?.miss||stats.history[x.id+'::hot']?.miss||stats.productHistory?.[x.id]?.miss)&&(bookFilter==='전체'||x.category===bookFilter));if(!rows.length){p.append(el('p','해당 메뉴가 없습니다.'));root.append(p);return}let index=Math.min(bookPage[t]||0,rows.length-1);bookPage[t]=index;let select=el('select');for(let [i,r] of rows.entries()){let o=el('option',r.name);o.value=i;select.append(o)}select.value=index;select.onchange=()=>{bookPage[t]=Number(select.value);book(t)};p.append(select);let r=rows[index],h=stats.history[r.id],d=el('div',null,'recipe');let photo=showPhoto(r);if(photo)d.append(photo);d.append(el('h2',r.name));if(Number.isFinite(r.price))d.append(el('b',r.price.toLocaleString('ko-KR')+'원'));let desc=[r.description,recipeText(r),r.note].filter(Boolean);if(desc.length)d.append(el('p',desc.join(' / '),'recipePreview'));if(h)d.append(el('p','정답 '+h.correct+'/'+h.attempts+' · 오답 '+h.miss+'회 · 연속 정답 '+h.streak+'회','sub'));let hot=hotEligible(r)?hotVariant(r):null;let full=[...desc,...(hot?['HOT: '+recipeText(hot)]:[]),...(t==='wrong'?[...(h?.lastErrors||[]),...(stats.history[r.id+'::hot']?.lastErrors||[])]:[])];if(full.length)d.append(btn('전체 설명 / 레시피 보기',()=>detailsDialog(r.name,full)));p.append(d);let a=el('div',null,'row');if(t==='book'){a.append(photoPicker(r));if(photo)a.append(btn('사진 삭제',()=>{r.photo=null;save();book(t)}))}if(r.enabled!==false)a.append(btn('ICE 연습',()=>{switchTab('game');if(memoMode())$('mode').value='guide';start(r.id)}));if(hot)a.append(btn('HOT 연습',()=>{switchTab('game');if(memoMode())$('mode').value='guide';start(hot.id)}));p.append(a,pager(index,rows.length,n=>{bookPage[t]=n;book(t)}));root.append(p)}
function download(name,raw){let url=URL.createObjectURL(new Blob([JSON.stringify(raw,null,2)],{type:'application/json'})),a=el('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
$('export').onclick=()=>download('recipes-private.json',{version:1,recipes:data});$('backup').onclick=()=>download('barista-backup.json',{version:1,recipes:data,stats});$('reset').onclick=()=>{if(confirm('학습 기록만 초기화할까요?')){stats=empty();save()}};$('erase').onclick=()=>{if(confirm('이 기기의 레시피와 기록을 모두 삭제할까요?')){data=[];stats=empty();try{localStorage.removeItem(KEY)}catch(e){}boot()}};$('editSave').onclick=()=>{try{let next=valid(JSON.parse($('editor').value));data=next;stats=empty();save();boot()}catch(e){notice(e.message)}};

let studyCat='전체',studyMode='설명',lastStudy=null;
const studyButton=btn('상품 암기',()=>{});studyButton.dataset.tab='study';$('nav').insertBefore(studyButton,$('nav').lastElementChild);$('nav').style.flexWrap='wrap';studyButton.style.minWidth='0';let studySection=el('section');studySection.id='study';studySection.hidden=true;$('settings').before(studySection);
function shuffleStudy(xs){let a=[...xs];for(let i=a.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function startStudy(){
  let root=$('study');root.replaceChildren();let panel=el('div',null,'panel');panel.append(el('h2','고객 응대 · 상품 암기'));
  if(studyCat==='베이커리'&&studyMode==='가격')studyMode='설명';let controls=el('div',null,'row'),cat=el('select'),mode=el('select');
  for(let t of ['전체','베이커리','음료','오답만']){let o=el('option',t);o.value=t;cat.append(o)}cat.value=studyCat;cat.onchange=()=>{studyCat=cat.value;lastStudy=null;startStudy()};
  for(let t of (studyCat==='베이커리'?['설명','사진 이름','직접 설명']:['설명','가격','사진 이름','직접 설명'])){let o=el('option',t);o.value=t;mode.append(o)}mode.value=studyMode;mode.onchange=()=>{studyMode=mode.value;lastStudy=null;startStudy()};controls.append(cat,mode);panel.append(controls);
  let products=data.filter(r=>r.description&&Number.isFinite(r.price));let hist=stats.productHistory||(stats.productHistory={});let all=Object.values(hist);panel.append(el('p','정답 '+all.reduce((a,b)=>a+(b.correct||0),0)+'회 · 오답 '+all.reduce((a,b)=>a+(b.miss||0),0)+'회','sub'));
  let pool=products.filter(r=>(studyCat==='전체'||r.productType===studyCat||studyCat==='오답만'&&hist[r.id]?.miss)&&(studyMode!=='사진 이름'||r.photo)&&(studyMode!=='가격'||r.productType!=='베이커리'));
  if(!pool.length){panel.append(el('p','해당 상품이 없습니다. 최신 메뉴 JSON을 불러오거나 다른 분류를 선택하세요.'));root.append(panel);return}
  let next=pool.filter(r=>r.id!==lastStudy);if(!next.length)next=pool;let r=shuffleStudy(next)[0];lastStudy=r.id;
  let photo=showPhoto(r);if(photo){if(studyMode==='사진 이름')photo.alt='상품 사진';panel.append(photo)}
  if(studyMode!=='사진 이름')panel.append(el('h2',r.name));
  if(r.productType==='베이커리')panel.append(el('p','맛과 재료 특징을 손님에게 설명하는 연습이에요. 가격은 외우지 않아도 됩니다.','sub'));let answer=studyMode==='가격'?String(r.price):studyMode==='사진 이름'?r.name:r.description;
  let prompt=studyMode==='가격'?'이 상품의 가격은?':studyMode==='사진 이름'?'이 사진의 메뉴명은?':studyMode==='직접 설명'?'손님에게 어떤 상품인지 직접 말해 보세요.':'손님이 어떤 맛인지 물어봤어요. 올바른 설명은?';panel.append(el('p',prompt));let options=el('div',null,'actions');options.style.flexDirection='column';panel.append(options);let result=el('div',null,'studyResult');panel.append(result);let done=false;
  function reveal(ok,choice){if(done)return;done=true;options.hidden=true;for(let b of options.querySelectorAll('button'))b.disabled=true;let h=hist[r.id]||{correct:0,miss:0};if(ok)h.correct++;else h.miss++;hist[r.id]=h;save();result.append(el('h3',ok?'정답!':'다시 기억하기',ok?'good':''));if(!ok&&choice)result.append(btn('내 답변 확인',()=>detailsDialog('오답 비교',['선택: '+choice,'정답: '+r.description])));result.append(el('b',r.name+' · '+r.price.toLocaleString('ko-KR')+'원'),el('p',r.description,'recipePreview'));if(r.note)result.append(btn('추가 설명',()=>detailsDialog(r.name,[r.description,r.note])));result.append(btn('다음 상품',startStudy,'primary'))}
  if(studyMode==='직접 설명'){let revealButton=btn('정답 설명 확인',()=>{revealButton.disabled=true;options.hidden=true;result.replaceChildren(el('b',r.name+' · '+r.price.toLocaleString('ko-KR')+'원'),el('p',r.description,'recipePreview'));let assess=el('div',null,'row');assess.append(btn('기억했어요',()=>{result.replaceChildren();reveal(true)}),btn('다시 외울래요',()=>{result.replaceChildren();reveal(false)}));result.append(assess)});options.append(revealButton)}
  else{let field=studyMode==='가격'?'price':studyMode==='사진 이름'?'name':'description';let candidates=studyMode==='가격'?products.filter(x=>x.productType!=='베이커리'):products;let distractors=shuffleStudy(candidates.filter(x=>x.id!==r.id&&x.productType===r.productType)).concat(shuffleStudy(candidates.filter(x=>x.id!==r.id&&x.productType!==r.productType)));let wrong=[...new Set(distractors.map(x=>String(x[field])))].filter(x=>x!==answer).slice(0,3);let display=v=>studyMode==='가격'?Number(v).toLocaleString('ko-KR')+'원':v;let choices=shuffleStudy([answer,...wrong]);for(let v of choices){let b=btn(display(v),()=>reveal(v===answer,display(v)));b.style.textAlign='left';options.append(b)}}
  root.append(panel)
}

let previousPageSize=compactCount(),normalViewport=0,viewportWidth=0,focusFrame=0;
function activeBlankInput(){let x=document.activeElement;return x?.matches('#gamebody.blankMode .blankLine input:not([readonly])')?x:null}
function keepBlankVisible(){
 cancelAnimationFrame(focusFrame);focusFrame=requestAnimationFrame(()=>{let x=activeBlankInput(),list=x?.closest('.blankScroll');if(!list)return;
 let r=x.closest('.blankBlock').getBoundingClientRect(),v=list.getBoundingClientRect(),pad=8;
 if(r.bottom>v.bottom-pad)list.scrollTop+=r.bottom-v.bottom+pad;
 else if(r.top<v.top+pad)list.scrollTop+=r.top-v.top-pad;
 });
}
function syncViewport(reveal=true){
 let vv=window.visualViewport,h=Math.floor(vv?.height||window.innerHeight),w=Math.round(vv?.width||window.innerWidth),main=document.querySelector('main'),focused=!!activeBlankInput();
 if(Math.abs(w-viewportWidth)>20){viewportWidth=w;normalViewport=h}
 if(!focused)normalViewport=h;
 let editing=focused&&(h<620||Math.max(window.innerHeight,normalViewport)-h>90);
 document.documentElement.style.setProperty('--app-height',h+'px');
 document.documentElement.style.setProperty('--viewport-top',Math.max(0,vv?.offsetTop||0)+'px');
 main.classList.toggle('keyboardEditing',editing);
 main.classList.toggle('short',h<740);main.classList.toggle('tiny',h<620);
 let n=compactCount();if(n!==previousPageSize){previousPageSize=n;if(tab==='game'&&current&&!locked&&!memoMode())render()}
 if(focused&&reveal)keepBlankVisible();
}
syncViewport();window.addEventListener('resize',()=>syncViewport());window.visualViewport?.addEventListener('resize',()=>syncViewport());window.visualViewport?.addEventListener('scroll',()=>syncViewport(false));
document.addEventListener('focusin',e=>{if(e.target.matches('.blankLine input'))syncViewport()});
document.addEventListener('focusout',e=>{if(e.target.matches('.blankLine input'))requestAnimationFrame(()=>syncViewport())});
try{let saved=JSON.parse(localStorage.getItem(KEY));if(saved){data=valid({recipes:saved.data});stats=saved.stats||empty()}}catch(e){}boot();if('serviceWorker'in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).catch(()=>notice('오프라인 설정 실패. 온라인으로 이용할 수 있습니다.'));
