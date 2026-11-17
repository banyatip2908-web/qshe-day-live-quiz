// QSHE Day 2026 original high-energy Arcade/EDM game-show soundtrack.
// All music and sound effects are generated in the host browser with Web Audio.
// No copyrighted recordings, network audio requests, or external files.
export function createGameAudio(){
 const AudioCtor=window.AudioContext||window.webkitAudioContext;
 const BPM=136, STEP=60/BPM/4;
 let ctx=null,master=null,noiseBuffer=null,playing=false,phase='lobby',volume=.45;
 let intervalId=null,stepIndex=0,nextStepTime=0;

 // An original four-bar melody in E minor with varied rhythmic rests.
 const melody=[
  659.25,null,783.99,null,659.25,587.33,493.88,null,659.25,null,783.99,880,783.99,null,659.25,null,
  783.99,null,659.25,587.33,523.25,null,659.25,null,783.99,null,880,null,783.99,659.25,587.33,null,
  659.25,null,783.99,987.77,783.99,null,659.25,null,587.33,null,659.25,783.99,659.25,null,493.88,null,
  587.33,null,659.25,783.99,659.25,null,587.33,null,493.88,null,587.33,659.25,493.88,null,440,null
 ];
 const roots=[164.81,130.81,196.00,146.83]; // Em - C - G - D
 const chords=[
  [164.81,196.00,246.94],
  [130.81,164.81,196.00],
  [146.83,196.00,246.94],
  [146.83,185.00,220.00]
 ];

 function voice(freq,when,duration,type='triangle',level=.12,cutoff=2600){
  if(!ctx||!master)return;
  const osc=ctx.createOscillator(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
  const attack=Math.min(.012,duration*.18);
  osc.type=type;osc.frequency.setValueAtTime(freq,when);
  filter.type='lowpass';filter.frequency.setValueAtTime(cutoff,when);
  gain.gain.setValueAtTime(.0001,when);
  gain.gain.exponentialRampToValueAtTime(level,when+Math.max(.006,attack));
  gain.gain.exponentialRampToValueAtTime(.0001,when+duration);
  osc.connect(filter);filter.connect(gain);gain.connect(master);
  osc.start(when);osc.stop(when+duration+.025);
 }

 function noise(when,duration,level,highpass=1700){
  if(!ctx||!noiseBuffer)return;
  const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
  source.buffer=noiseBuffer;filter.type='highpass';filter.frequency.value=highpass;
  gain.gain.setValueAtTime(Math.max(.0001,level),when);
  gain.gain.exponentialRampToValueAtTime(.0001,when+duration);
  source.connect(filter);filter.connect(gain);gain.connect(master);
  source.start(when);source.stop(when+duration+.005);
 }
 function kick(when){
  const osc=ctx.createOscillator(),gain=ctx.createGain();
  osc.type='sine';
  osc.frequency.setValueAtTime(145,when);
  osc.frequency.exponentialRampToValueAtTime(47,when+.14);
  gain.gain.setValueAtTime(.44,when);
  gain.gain.exponentialRampToValueAtTime(.0001,when+.20);
  osc.connect(gain);gain.connect(master);osc.start(when);osc.stop(when+.21);
 }
 function snare(when){
  noise(when,.115,.13,1300);
  voice(175,when,.07,'triangle',.035,700);
 }
 function hat(when,accent=false){noise(when,.042,accent?.052:.028,5500);}

 function scheduleStep(index,when){
  const bar=Math.floor(index/16)%4,beat=index%16;
  // Club-style four-on-the-floor drums, snare on beats two and four.
  if(beat%4===0)kick(when);
  if(beat===4||beat===12)snare(when);
  if(beat%2===0)hat(when,beat%4===2);
  if(beat>=12&&bar===3&&beat%2===1)hat(when);
  // Syncopated bass and bright arcade lead, with original chord accents.
  if(beat%4===0)voice(roots[bar],when,.30,'sawtooth',.105,480);
  if(beat===0||beat===8)chords[bar].forEach(f=>voice(f,when,.31,'triangle',.028,1200));
  const f=melody[index%melody.length];
  if(f){
   voice(f,when,beat%2===0?.19:.12,'square',.042,1900);
   voice(f,when,beat%2===0?.21:.13,'triangle',.072,3400);
  }
  if(phase==='reveal'&&(beat===0||beat===8))voice(987.77,when,.12,'sine',.07,3600);
 }

 function scheduler(){
  if(!playing||!ctx||phase==='finished')return;
  while(nextStepTime<ctx.currentTime+.12){
   scheduleStep(stepIndex,nextStepTime);
   stepIndex++;nextStepTime+=STEP;
  }
 }
 function stopLoop(){
  if(intervalId!==null){clearInterval(intervalId);intervalId=null;}
 }
 function startLoop(){
  if(!playing||!ctx||phase==='finished'||intervalId!==null)return;
  nextStepTime=ctx.currentTime+.055;
  scheduler();
  intervalId=setInterval(scheduler,25);
 }
 function cue(reveal=false){
  if(!ctx||!playing)return;
  const t=ctx.currentTime+.035;
  const ns=reveal?[783.99,1046.50]:[659.25,880.00];
  ns.forEach((f,i)=>voice(f,t+i*.10,.22,'triangle',.17,3200));
 }
 function fanfare(){
  if(!ctx||!playing)return;
  const t=ctx.currentTime+.06;
  const notes=[659.25,783.99,987.77,1174.66,1318.51,1174.66,1567.98];
  notes.forEach((f,i)=>voice(f,t+i*.115,i===notes.length-1?.90:.27,'triangle',.20,3800));
  [0,.22,.44,.66].forEach(offset=>kick(t+offset));
  [0.14,.36,.58,.8].forEach(offset=>noise(t+offset,.085,.13,1700));
 }
 function setVolume(v){
  volume=Math.max(0,Math.min(1,Number(v)||0));
  if(master)master.gain.setTargetAtTime(volume*.56,ctx.currentTime,.012);
 }
 async function toggle(){
  if(playing){
   playing=false;stopLoop();
   if(ctx)await ctx.suspend();
   return false;
  }
  if(!AudioCtor)throw new Error('เบราว์เซอร์นี้ไม่รองรับการเล่นเสียง');
  if(!ctx){
   ctx=new AudioCtor();
   const limiter=ctx.createDynamicsCompressor();
   limiter.threshold.value=-18;limiter.knee.value=13;limiter.ratio.value=7;
   limiter.attack.value=.003;limiter.release.value=.20;
   master=ctx.createGain();master.connect(limiter);limiter.connect(ctx.destination);
   noiseBuffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*.36),ctx.sampleRate);
   const data=noiseBuffer.getChannelData(0);
   for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
  }
  setVolume(volume);
  await ctx.resume();playing=true;
  if(phase==='finished')fanfare();else startLoop();
  return true;
 }
 function setPhase(next){
  if(phase===next)return;
  const previous=phase;phase=next;
  if(!playing)return;
  if(next==='finished'){stopLoop();fanfare();}
  else{
   if(previous==='finished'){stepIndex=0;startLoop();}
   if(next==='question'&&previous==='lobby')cue();
   if(next==='reveal')cue(true);
  }
 }
 return {toggle,setVolume,setPhase};
}
