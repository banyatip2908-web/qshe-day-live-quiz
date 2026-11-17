import {createGameAudio} from './sound.js';
const $=id=>document.getElementById(id),show=(id,yes)=>$(id).classList.toggle('hidden',!yes);
const shapes=['▲','◆','●','■'];
let room='',token='',socket=null,state=null,clockSkew=0,questions=[],editAt=-1,reconnect=null,dirty=false;
const gameAudio=createGameAudio();
let soundEnabled=false;
$('musicVolume').addEventListener('input',()=>gameAudio.setVolume(Number($('musicVolume').value)/100));
gameAudio.setVolume(Number($('musicVolume').value)/100);
$('soundToggle').addEventListener('click',async()=>{
 try{
  soundEnabled=await gameAudio.toggle();
  $('soundToggle').textContent=soundEnabled?'♫ ปิดเพลงประกอบ':'♫ เปิดเพลงประกอบ';
  $('soundStatus').textContent=soundEnabled?'เสียงเล่นบนเครื่องพิธีกร':'ปิดเสียงแล้ว';
 }catch(e){$('soundStatus').textContent='ไม่สามารถเล่นเสียงได้ กรุณาตรวจสอบลำโพง';}
});
const deepCopy=x=>JSON.parse(JSON.stringify(x));
const saved=()=>{try{return JSON.parse(localStorage.getItem('qshe-host')||'null')}catch{return null}};
const initial=(()=>{const h=location.hash.slice(1).split('.');return h.length===2?{pin:h[0],token:h[1]}:saved()})();
if(initial?.pin&&initial?.token){room=initial.pin;token=initial.token;show('createPanel',false);show('hostPanel',true);initHost();}
$('createForm').addEventListener('submit',async e=>{
 e.preventDefault();$('createError').textContent='';$('createButton').disabled=true;
 try{const res=await fetch('/api/rooms',{method:'POST',headers:{'X-Create-Key':$('createKey').value.trim()}});const data=await res.json();if(!res.ok)throw new Error(data.error||'สร้างห้องไม่สำเร็จ');room=data.pin;token=data.hostToken;localStorage.setItem('qshe-host',JSON.stringify({pin:room,token}));location.hash=room+'.'+token;show('createPanel',false);show('hostPanel',true);initHost();}
 catch(err){$('createError').textContent=err.message;}
 finally{$('createButton').disabled=false;}
});
function initHost(){
 $('hostPin').textContent=room;$('invitePin').textContent=room;
 const url=location.origin+'/?pin='+room;
 $('inviteUrl').textContent=url;
 $('roomQr').src=`https://api.qrserver.com/v1/create-qr-code/?size=190x190&margin=5&data=${encodeURIComponent(url)}`;
 connect();
}
function connect(){clearTimeout(reconnect);const proto=location.protocol==='https:'?'wss:':'ws:';
 socket=new WebSocket(`${proto}//${location.host}/api/rooms/${room}/ws?${new URLSearchParams({role:'host',token})}`);
 socket.onopen=()=>{$('connLabel').textContent='เชื่อมต่อแล้ว';$('connDot').style.background='#4fe6a3';};
 socket.onmessage=e=>{if(e.data==='pong')return;let d;try{d=JSON.parse(e.data)}catch{return;}if(d.type==='state')render(d);if(d.type==='stats'){updateStats(d);}if(d.type==='error'){message(d.error,'error');}};
 socket.onerror=()=>socket.close();
 socket.onclose=()=>{$('connLabel').textContent='ขาดการเชื่อมต่อ — กำลังเชื่อมใหม่';$('connDot').style.background='#ef8589';reconnect=setTimeout(connect,1900)};
}
function updateStats(s){$('playerCount').textContent=s.players+'/100'; $('answeredCount').textContent=s.answered;}
function message(s,kind='ok'){const el=$('hostMessage');el.textContent=s;el.style.color=kind==='error'?'#ffa4ae':'#9cf4bc';setTimeout(()=>{if(el.textContent===s)el.textContent='';},6500)}
function command(type,additional={}){if(socket?.readyState!==WebSocket.OPEN){message('ยังไม่เชื่อมต่อเซิร์ฟเวอร์','error');return;}socket.send(JSON.stringify({type,...additional}));}
function render(s){
 const wasLobby=state?.status==='lobby';state=s;clockSkew=Date.now()-(s.serverNow||Date.now());
 gameAudio.setPhase(s.status);
 $('phaseLabel').textContent={lobby:'รอเริ่มเกม',question:'กำลังตอบคำถาม',reveal:'เฉลยคำตอบ',finished:'เกมจบแล้ว'}[s.status]||s.status;
 $('stageTag').textContent=s.status.toUpperCase();updateStats(s);$('totalQuestions').textContent=10;
 show('lobbyStage',s.status==='lobby');show('questionStage',['question','reveal'].includes(s.status));show('finishStage',s.status==='finished');
 show('startBtn',s.status==='lobby');show('revealBtn',s.status==='question');show('nextBtn',s.status==='reveal');
 $('nextBtn').textContent=s.question?.index===s.question?.total?'⏭ จบเกมทันที':'⏭ ข้ามช่วงเฉลย';
 show('autoAdvanceMessage',s.status==='reveal');
 $('editState').textContent=s.status==='lobby'?'แก้ไขก่อนเริ่มเกม':'ล็อกการแก้ไขแล้ว';
 $('addQ').disabled=s.status!=='lobby';$('saveQ').disabled=s.status!=='lobby';$('importQ').disabled=s.status!=='lobby';
 if(!dirty || !wasLobby || s.status!=='lobby'){questions=deepCopy(s.questions);dirty=false;drawQuestions();}
 if(s.question && ['question','reveal'].includes(s.status)){
   const q=s.question;$('hostQuestionTopic').textContent=q.topic;$('hostQuestionNumber').textContent=`ข้อ ${q.index} / ${q.total}${q.multiplier>1?' · ⚡ BONUS ×2':''}`;
   $('hostExplain').textContent=s.status==='reveal'?'💡 '+(q.explanation||'')+'  ·  '+(q.source||''):'';show('hostExplain',s.status==='reveal');
   $('hostQuestionText').textContent=q.text;
   const grid=$('hostOptions');grid.replaceChildren();q.choices.forEach((v,i)=>{
     const el=document.createElement('div');el.className='option'+((s.status==='reveal'&&q.correct===i)?' correct':'');el.dataset.n=i;
     const shape=document.createElement('span');shape.textContent=shapes[i];const t=document.createElement('span');t.textContent=v;el.append(shape,t);grid.append(el);
   });
 }
 if(s.status==='finished'){$('winnerBanner').textContent=s.leaderboard.length?`🥇 ผู้ชนะ: ${s.leaderboard[0].name}`:'ไม่มีผู้แข่งขัน';drawFinalTopFive(s.leaderboard);}
 drawLeaderboard(s.leaderboard);tick();
}
function drawLeaderboard(items){const el=$('hostLeaderboard');el.replaceChildren();if(!items.length){const p=document.createElement('p');p.className='small-muted';p.textContent='คะแนนจะแสดงหลังเฉลยคำถาม';el.append(p);return;}
 items.forEach(p=>{const row=document.createElement('div');row.className='leader-row';const badge=document.createElement('span');badge.className='rank';badge.textContent=p.rank;const name=document.createElement('span');name.className='leader-name';name.textContent=p.name;const points=document.createElement('span');points.className='leader-score';points.textContent=p.score.toLocaleString('th-TH');row.append(badge,name,points);el.append(row);});
}
function drawFinalTopFive(items){
 const el=$('finalTopFive');el.replaceChildren();
 if(!items?.length){const msg=document.createElement('p');msg.textContent='ยังไม่มีผู้เล่นที่ทำคะแนน';el.append(msg);return;}
 items.slice(0,5).forEach((p,i)=>{
  const row=document.createElement('div');row.className='final-rank-row rank-pos-'+(i+1);
  const place=document.createElement('span');place.className='final-rank-badge';place.textContent=['🥇','🥈','🥉','4','5'][i];
  const name=document.createElement('strong');name.className='final-rank-name';name.textContent=p.name;
  const score=document.createElement('strong');score.className='final-rank-score';score.textContent=p.score.toLocaleString('th-TH')+' คะแนน';
  row.append(place,name,score);el.append(row);
 });
}
function tick(){
 if(!state||!['question','reveal'].includes(state.status)){
  $('hostCountdown').textContent=state?.status==='finished'?'จบเกม':'--';$('hostTimerFill').style.width='100%';return;
 }
 const left=Math.max(0,state.question.endAt-(Date.now()-clockSkew));
 $('hostCountdown').textContent=Math.ceil(left/1000)+'s';
 const total=state.status==='question'?state.question.seconds*1000:6000;
 $('hostTimerFill').style.width=Math.max(0,100*left/total)+'%';
 if(state.status==='reveal')$('autoAdvanceMessage').textContent=state.question.index===state.question.total
   ?'จบเกมและแสดง TOP 5 อัตโนมัติใน '+Math.ceil(left/1000)+' วินาที'
   :'ไปข้อ '+(state.question.index+1)+' อัตโนมัติใน '+Math.ceil(left/1000)+' วินาที';
}
setInterval(tick,160);setInterval(()=>{if(socket?.readyState===WebSocket.OPEN)socket.send('ping')},25000);
$('copyPin').onclick=()=>copy(room);
$('copyLink').onclick=()=>copy(location.origin+'/?pin='+room);
async function copy(str){try{await navigator.clipboard.writeText(str);message('คัดลอกแล้ว ✓')}catch{message('คัดลอกไม่สำเร็จ','error')}}
$('startBtn').onclick=()=>command('start');$('revealBtn').onclick=()=>command('reveal');$('nextBtn').onclick=()=>command('next');
$('resetBtn').onclick=()=>{if(confirm('เริ่มรอบใหม่? คะแนนเดิมจะถูกรีเซ็ต แต่คำถามและผู้เล่นยังอยู่'))command('reset')};
$('fullscreenBtn').onclick=()=>{if(!document.fullscreenElement)document.querySelector('.stage').requestFullscreen?.();else document.exitFullscreen?.()};
$('exportBtn').onclick=()=>{if(!room)return;const a=document.createElement('a');a.href=`/api/rooms/${room}/export?token=${encodeURIComponent(token)}`;a.download=`qshe-results-${room}.csv`;document.body.append(a);a.click();a.remove()};
function drawQuestions(){const list=$('questionList');list.replaceChildren();questions.forEach((q,i)=>{const b=document.createElement('button');b.className='q-list-btn';b.disabled=state?.status!=='lobby';const n=document.createElement('b');n.textContent=String(i+1).padStart(2,'0');const text=document.createElement('span');text.textContent=q.text;b.append(n,text);b.onclick=()=>openEditor(i);list.append(b);});$('totalQuestions').textContent='10 จาก '+questions.length;}
$('addQ').onclick=()=>{if(!state||state.status!=='lobby'||questions.length>=30)return message('เพิ่มได้สูงสุด 30 ข้อ','error');questions.push({text:'คำถามใหม่',choices:['ตัวเลือกที่ 1','ตัวเลือกที่ 2','ตัวเลือกที่ 3','ตัวเลือกที่ 4'],correct:0,seconds:25,topic:'Climate Change'});dirty=true;drawQuestions();openEditor(questions.length-1);};
$('saveQ').onclick=()=>{if(state?.status==='lobby'){command('questions',{questions});$('editMessage').textContent='กำลังบันทึก…';setTimeout(()=>$('editMessage').textContent='',2500);}};
function openEditor(i){if(state?.status!=='lobby')return;editAt=i;const q=questions[i];$('editTitle').textContent=`แก้ไขคำถามข้อ ${i+1}`;$('editTopic').value=q.topic;$('editText').value=q.text;$('editSource').value=q.source||'';$('editExplain').value=q.explanation||'';$('editCorrect').value=q.correct;$('editSeconds').value=q.seconds;
 const box=$('choiceInputs');box.replaceChildren();q.choices.forEach((v,j)=>{const label=document.createElement('label');label.textContent=`ตัวเลือกที่ ${j+1}`;label.htmlFor='choice'+j;const input=document.createElement('input');input.value=v;input.required=true;input.maxLength=125;input.id='choice'+j;box.append(label,input);});$('editorDialog').showModal();}
$('closeEditor').onclick=()=>$('editorDialog').close();
$('editForm').addEventListener('submit',e=>{e.preventDefault();if(editAt<0)return;const q=questions[editAt];q.topic=$('editTopic').value.trim()||'Climate Change';q.text=$('editText').value.trim();q.source=$('editSource').value.trim();q.explanation=$('editExplain').value.trim();q.correct=Number($('editCorrect').value);q.seconds=Number($('editSeconds').value);q.choices=[0,1,2,3].map(j=>$('choice'+j).value.trim());dirty=true;drawQuestions();$('editorDialog').close();message('แก้ไขแล้ว อย่าลืมกดบันทึกชุดคำถาม');});
$('deleteQ').onclick=()=>{if(questions.length<=1)return alert('ต้องมีคำถามอย่างน้อย 1 ข้อ');if(!confirm('ลบคำถามข้อนี้?'))return;questions.splice(editAt,1);dirty=true;drawQuestions();$('editorDialog').close();message('ลบแล้ว อย่าลืมกดบันทึกชุดคำถาม');};

// Import and export compatible question packs from the standalone preview.
$('exportQ').onclick=()=>{
  const payload=JSON.stringify({title:'Envi QSHE Day 2026',questions},null,2);
  const blob=new Blob([payload],{type:'application/json;charset=utf-8'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='Envi-QSHE-Day-2026-Questions.json';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
};
$('importQ').onclick=()=>{if(state?.status==='lobby')$('questionsFile').click();};
$('questionsFile').onchange=async e=>{
  const file=e.target.files?.[0];if(!file)return;
  try{
    const obj=JSON.parse(await file.text());const data=Array.isArray(obj)?obj:obj.questions;
    if(!Array.isArray(data)||data.length<10||data.length>30)throw Error('คลังคำถามต้องมี 10–30 ข้อ');
    const incoming=data.map((q,i)=>{
      const text=String(q.text||q.question||'').trim(),choices=Array.isArray(q.choices||q.options)?(q.choices||q.options).map(x=>String(x||'').trim()):[];
      const correct=Number(q.correct),seconds=Number(q.seconds||q.time||25),topic=String(q.topic||(q.category?`${q.category} · ป้าย ${q.vinyl||''}`:'Climate Change')).slice(0,40);
      if(!text||text.length>240||choices.length!==4||choices.some(x=>!x||x.length>125)||!Number.isInteger(correct)||correct<0||correct>3||!Number.isInteger(seconds)||seconds<10||seconds>60)throw Error('ข้อมูลข้อ '+(i+1)+' ไม่ถูกต้อง');
      return {text,choices,correct,seconds,topic,source:String(q.source||(q.vinyl?`ไวนิลแผ่นที่ ${q.vinyl}`:'')).slice(0,60),explanation:String(q.explanation||'').slice(0,350)};
    });
    if(state?.status!=='lobby')throw Error('แก้ไขได้ก่อนเริ่มเกมเท่านั้น');
    if(!confirm(`นำเข้าชุดคำถาม ${incoming.length} ข้อแทนชุดเดิมใช่ไหม?`))return;
    questions=incoming;dirty=true;drawQuestions();
    $('editMessage').textContent='นำเข้าข้อมูลแล้ว — กด “บันทึกชุดคำถาม” อีกครั้งก่อนเริ่มเกม';
  }catch(err){$('editMessage').textContent='นำเข้าไม่ได้: '+err.message;}
  finally{$('questionsFile').value='';}
};
