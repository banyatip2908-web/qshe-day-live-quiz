const $=id=>document.getElementById(id);
const show=(id,yes)=>$(id).classList.toggle('hidden',!yes);
const shapes=['▲','◆','●','■'];
const qs=new URLSearchParams(location.search);
if(qs.get('pin'))$('pin').value=qs.get('pin');
let socket=null,pin='',identity=null,state=null,reconnect=null,clock=null,answered=null,clockSkew=0;
const api=async (path,body)=>{const res=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await res.json();if(!res.ok)throw new Error(d.error||'เชื่อมต่อไม่สำเร็จ');return d;};
const savedSession=k=>{try{return JSON.parse(localStorage.getItem('qshe-session-'+k)||'null')}catch{return null}};
$('joinForm').addEventListener('submit',async ev=>{
 ev.preventDefault();const k=$('pin').value.trim(),name=$('nick').value.trim();$('joinError').textContent='';$('joinButton').disabled=true;$('joinButton').textContent='กำลังเข้าร่วม…';
 try{const prev=savedSession(k);identity=await api('/api/rooms/'+k+'/join',{name,playerId:prev?.playerId,token:prev?.token});pin=k;localStorage.setItem('qshe-session-'+k,JSON.stringify(identity));history.replaceState(null,'','/?pin='+pin);show('joinView',false);show('gameView',true);$('roomNum').textContent=pin;$('displayName').textContent=identity.name;connect();}
 catch(e){$('joinError').textContent=e.message;}
 finally{$('joinButton').disabled=false;$('joinButton').textContent='เข้าร่วมเกม ➜';}
});
function connect(){
 if(!identity)return;
 clearTimeout(reconnect);const scheme=location.protocol==='https:'?'wss:':'ws:';
 const params=new URLSearchParams({role:'player',id:identity.playerId,token:identity.token});
 socket=new WebSocket(`${scheme}//${location.host}/api/rooms/${pin}/ws?${params}`);
 socket.onopen=()=>{show('connectionWarn',false);};
 socket.onmessage=ev=>{if(ev.data==='pong')return;let msg;try{msg=JSON.parse(ev.data)}catch{return;}if(msg.type==='state')render(msg);if(msg.type==='answerAck'){answered=msg.selected;updateAnswers();}if(msg.type==='error'){$('connectionWarn').textContent=msg.error;show('connectionWarn',true);}};
 socket.onclose=()=>{show('connectionWarn',true);$('connectionWarn').textContent='การเชื่อมต่อขาดหาย กำลังเชื่อมต่อใหม่…';reconnect=setTimeout(connect,1800);};
 socket.onerror=()=>socket.close();
}
function render(s){
 state=s;clockSkew=Date.now()-(s.serverNow||Date.now());
 $('myScore').textContent=s.yourScore.toLocaleString('th-TH');
 $('displayName').textContent=s.yourName||identity.name;
 ['lobby','question','results','finished'].forEach(n=>show(n, s.status===({results:'reveal'}[n]||n)));
 if(s.status==='question'){
   answered=s.yourAnswer;
   const q=s.question;
   $('topic').textContent=(q.multiplier>1?'⚡ โบนัส ×2 · ':'')+(q.topic||'CLIMATE CHANGE');$('questionCount').textContent=`ข้อ ${q.index} / ${q.total}`;
   $('questionText').textContent=q.text;
   const area=$('options');area.replaceChildren();
   q.choices.forEach((choice,i)=>{const b=document.createElement('button');b.className='option';b.dataset.n=i;
     const icon=document.createElement('span');icon.textContent=shapes[i];const t=document.createElement('span');t.textContent=choice;b.append(icon,t);
     b.addEventListener('click',()=>sendAnswer(i));area.append(b);});
   updateAnswers();tick();
 }
 if(s.status==='reveal'){
   const q=s.question;
   $('resultEyebrow').textContent=`เฉลยข้อ ${q.index} / ${q.total}`;
   $('resultHeadline').textContent=s.yourAnswer===null?'หมดเวลาตอบ!':s.yourAnswer===q.correct?'ตอบถูกต้อง! 🎉':'ลุ้นข้อถัดไปกันต่อ!';
   $('correctText').textContent='คำตอบที่ถูกต้อง: '+q.choices[q.correct];
   $('explainText').textContent=(q.explanation||'')+(q.source?' · '+q.source:'');
   $('revealScore').textContent=s.yourScore.toLocaleString('th-TH');
   $('revealRank').textContent=s.yourRank?`อันดับปัจจุบัน ${s.yourRank} จาก ${s.players} คน`:'';
 }
 if(s.status==='finished'){
   $('finishScore').textContent=s.yourScore.toLocaleString('th-TH')+' คะแนน';$('finishRank').textContent=`อันดับ ${s.yourRank||'-'} จาก ${s.players} คน`;
   renderLeaderboard('playerLeaderboard',s.leaderboard);
 }
}
function updateAnswers(){if(!state||state.status!=='question')return;
 const submit=answered!==null;
 $('options').querySelectorAll('button').forEach((b,i)=>{b.disabled=submit||remaining()<=0;b.classList.toggle('selected',submit&&answered===i)});
 show('answeredMessage',submit); if(submit)show('options',false);else show('options',true);
}
function remaining(){return state?.question?Math.max(0,state.question.endAt-(Date.now()-clockSkew)):0;}
function tick(){if(!state || state.status!=='question')return;
 const rem=remaining(),sec=Math.ceil(rem/1000),duration=state.question.seconds*1000;
 $('timerText').textContent=sec+'s';$('timerFill').style.width=Math.max(0,100*rem/duration)+'%';
 if(rem===0 && answered===null)$('options').querySelectorAll('button').forEach(b=>b.disabled=true);
}
async function sendAnswer(choice){if(!state||state.status!=='question'||answered!==null||remaining()<=0)return;
 if(socket?.readyState!==WebSocket.OPEN){show('connectionWarn',true);$('connectionWarn').textContent='ยังไม่เชื่อมต่อ กรุณารอสักครู่';return;}
 answered=choice;updateAnswers();socket.send(JSON.stringify({type:'answer',choice}));
}
function renderLeaderboard(id,items){const target=$(id);target.replaceChildren();items.forEach(p=>{const row=document.createElement('div');row.className='leader-row';for(const [cls,value] of [['rank',p.rank],['leader-name',p.name],['leader-score',p.score.toLocaleString('th-TH')]]){const el=document.createElement('span');el.className=cls;el.textContent=value;row.append(el);}target.append(row);});}
setInterval(()=>{tick();if(socket?.readyState===WebSocket.OPEN){}},170);
setInterval(()=>{if(socket?.readyState===WebSocket.OPEN)socket.send('ping')},25000);
const prevPin=$('pin').value.trim();const prev=savedSession(prevPin);
if(prev?.name){$('nick').value=prev.name;}
