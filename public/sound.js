// QSHE Day 2026 — ORIGINAL Isan molam-inspired game music.
// Synthesized locally: khaen-like layered reeds, pong lang-like mallet tones,
// rhythmic long-drum-inspired percussion, and short answer-feedback effects.
// No copyrighted recording, audio assets, or external music dependencies.
const AudioCtor=typeof window!=='undefined'&&(window.AudioContext||window.webkitAudioContext);

export function createGameAudio(){
 const BPM=148, STEP=60/BPM/4, SCHEDULE_AHEAD=.13;
 let ctx=null,bus=null,noiseBuffer=null,enabled=false,phase='lobby',volume=.45;
 let interval=null,step=0,nextAt=0;
 // Four original phrases in the G-A-B-D-E pentatonic palette (4 x 16 steps).
 const tune=[
  587.33,null,659.25,783.99,659.25,null,587.33,493.88,440,null,493.88,587.33,659.25,null,587.33,null,
  659.25,783.99,null,880,783.99,null,659.25,587.33,493.88,null,587.33,659.25,587.33,null,493.88,null,
  587.33,null,493.88,440,392,null,440,493.88,587.33,null,659.25,587.33,493.88,null,440,null,
  392,440,493.88,null,587.33,659.25,783.99,null,659.25,587.33,493.88,440,392,null,587.33,null
 ];
 const bass=[98,130.81,146.83,98],drones=[[196,293.66],[261.63,392],[293.66,440],[196,293.66]];
 function note(freq,at,dur,type='triangle',peak=.1,filter=3000,detune=0,attack=.012){
  if(!ctx||!bus)return;
  const osc=ctx.createOscillator(),lp=ctx.createBiquadFilter(),env=ctx.createGain();
  osc.type=type;osc.frequency.setValueAtTime(freq,at);osc.detune.value=detune;
  lp.type='lowpass';lp.frequency.value=filter;
  const a=Math.min(attack,dur/3);
  env.gain.setValueAtTime(.0001,at);
  env.gain.exponentialRampToValueAtTime(Math.max(.0002,peak),at+a);
  env.gain.exponentialRampToValueAtTime(.0001,at+dur);
  osc.connect(lp);lp.connect(env);env.connect(bus);
  osc.start(at);osc.stop(at+dur+.025);
 }
 function reed(freq,at,dur,peak=.060){
  // Layered, slightly detuned reedy timbre recalling a khaen (not a sample).
  note(freq,at,dur,'sawtooth',peak*.42,1350,-5,.024);
  note(freq,at,dur,'triangle',peak,2650,5,.021);
  note(freq*.5,at,dur,'sine',peak*.22,900,0,.03);
 }
 function pong(freq,at,dur=.24){
  // Percussive resonant xylophone-like melody.
  note(freq,at,dur,'sine',.145,2800,0,.005);
  note(freq*2,at,dur*.55,'triangle',.040,4200,0,.004);
 }
 function burst(at,dur,level,highpass=1800){
  if(!ctx||!noiseBuffer)return;
  const src=ctx.createBufferSource(),hp=ctx.createBiquadFilter(),g=ctx.createGain();
  src.buffer=noiseBuffer;hp.type='highpass';hp.frequency.value=highpass;
  g.gain.setValueAtTime(Math.max(.0001,level),at);
  g.gain.exponentialRampToValueAtTime(.0001,at+dur);
  src.connect(hp);hp.connect(g);g.connect(bus);
  src.start(at);src.stop(at+dur+.005);
 }
 function drum(at,accent=false){
  const osc=ctx.createOscillator(),gain=ctx.createGain();
  osc.type='sine';
  osc.frequency.setValueAtTime(accent?180:125,at);
  osc.frequency.exponentialRampToValueAtTime(accent?57:77,at+.13);
  gain.gain.setValueAtTime(accent?.39:.25,at);
  gain.gain.exponentialRampToValueAtTime(.0001,at+.18);
  osc.connect(gain);gain.connect(bus);osc.start(at);osc.stop(at+.19);
 }
 function pattern(i,at){
  const beat=i%16,bar=Math.floor(i/16)%4;
  if(beat===0||beat===8)drum(at,true);
  if(beat===4||beat===12){drum(at);burst(at,.09,.105,900);}
  if(beat%2===0)burst(at,.026,beat%4===2?.046:.021,5100);
  if(beat===7||beat===15)burst(at,.040,.034,3600);
  if(beat===0||beat===8)note(bass[bar],at,.36,'triangle',.092,650);
  if(beat===2||beat===10)note(bass[bar]*2,at,.13,'sawtooth',.038,1000);
  if(beat===0||beat===8)drones[bar].forEach(f=>reed(f,at,.44,.019));
  const freq=tune[i%tune.length];
  if(freq){
   reed(freq,at,beat%2===0?.21:.14,.079);
   if(beat%2===0)pong(freq*2,at,.22);
  }
  if(phase==='reveal'&&(beat===0||beat===8))pong(987.77,at,.19);
 }
 function scheduler(){
  if(!enabled||!ctx||phase==='finished')return;
  while(nextAt<ctx.currentTime+SCHEDULE_AHEAD){
   pattern(step++,nextAt);
   nextAt+=STEP;
  }
 }
 function stopLoop(){if(interval!==null){clearInterval(interval);interval=null;}}
 function startLoop(){
  if(!enabled||phase==='finished'||interval!==null||!ctx)return;
  nextAt=ctx.currentTime+.05;
  scheduler();interval=setInterval(scheduler,25);
 }
 function cue(reveal=false){
  if(!enabled||!ctx)return;
  const t=ctx.currentTime+.05;
  (reveal?[587.33,783.99,987.77]:[392,493.88,587.33]).forEach((f,i)=>pong(f,t+i*.11,.23));
 }
 function fanfare(){
  if(!enabled||!ctx)return;
  const t=ctx.currentTime+.06;
  [587.33,659.25,783.99,987.77,1174.66].forEach((f,i)=>{
   reed(f,t+i*.15,i===4?.85:.25,.14);
   pong(f,t+i*.15,.26);
  });
  [0,.22,.44,.66,.88].forEach((n,i)=>drum(t+n,i===4));
 }
 function setVolume(v){
  volume=Math.max(0,Math.min(1,Number(v)||0));
  if(bus)bus.gain.setTargetAtTime(volume*.50,ctx.currentTime,.016);
 }
 async function toggle(){
  if(enabled){enabled=false;stopLoop();if(ctx)await ctx.suspend();return false;}
  if(!AudioCtor)throw new Error('อุปกรณ์นี้ไม่รองรับ Web Audio');
  if(!ctx){
   ctx=new AudioCtor();
   bus=ctx.createGain();
   const compressor=ctx.createDynamicsCompressor();
   compressor.threshold.value=-20;compressor.ratio.value=6;compressor.attack.value=.005;compressor.release.value=.2;
   bus.connect(compressor);compressor.connect(ctx.destination);
   noiseBuffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*.3),ctx.sampleRate);
   const data=noiseBuffer.getChannelData(0);
   for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
  }
  setVolume(volume);await ctx.resume();enabled=true;
  if(phase==='finished')fanfare();else startLoop();
  return true;
 }
 function setPhase(next){
  if(phase===next)return;
  const prev=phase;phase=next;
  if(!enabled)return;
  if(next==='finished'){stopLoop();fanfare();return;}
  if(prev==='finished'){step=0;startLoop();}
  if(next==='question'&&prev==='lobby')cue();
  if(next==='reveal')cue(true);
 }
 return {toggle,setVolume,setPhase};
}

// Optional per-player effects. Browser audio starts only after the player taps
// the sound toggle, avoiding an unexpected sound from 100 phones at the event.
export function createAnswerEffects(){
 let ctx=null,gain=null,enabled=false;
 function tone(freq,at,dur,type='sine',level=.14){
  if(!ctx||!gain)return;
  const osc=ctx.createOscillator(),env=ctx.createGain();
  osc.type=type;osc.frequency.setValueAtTime(freq,at);
  env.gain.setValueAtTime(.0001,at);
  env.gain.exponentialRampToValueAtTime(level,at+.009);
  env.gain.exponentialRampToValueAtTime(.0001,at+dur);
  osc.connect(env);env.connect(gain);osc.start(at);osc.stop(at+dur+.01);
 }
 async function toggle(){
  if(enabled){enabled=false;if(ctx)await ctx.suspend();return false;}
  if(!AudioCtor)throw new Error('อุปกรณ์นี้ไม่รองรับเสียง');
  if(!ctx){ctx=new AudioCtor();gain=ctx.createGain();gain.gain.value=.26;gain.connect(ctx.destination);}
  await ctx.resume();enabled=true;return true;
 }
 function play(result){
  if(!enabled||!ctx||ctx.state!=='running')return;
  const t=ctx.currentTime+.03;
  if(result==='correct'){
   // Bright upbeat "yay" stinger, three ascending notes.
   [587.33,783.99,1174.66].forEach((f,i)=>{
    tone(f,t+i*.12,i===2?.42:.19,'triangle',.20);
    tone(f*2,t+i*.12,.10,'sine',.065);
   });
  }else if(result==='wrong'){
   // Lighthearted descending two-note "oops" cue.
   tone(392,t,.22,'triangle',.17);
   tone(293.66,t+.20,.37,'triangle',.15);
   tone(246.94,t+.40,.25,'sine',.08);
  }else{
   // Gentle timeout cue, less judgmental than a wrong-answer sound.
   tone(392,t,.16,'sine',.10);
   tone(349.23,t+.20,.19,'sine',.08);
  }
 }
 return {toggle,play};
}
