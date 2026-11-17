// Original QSHE quiz theme, synthesized entirely in the host browser.
// No external audio files, third-party music, or device installation required.
export function createGameAudio(){
 const AudioCtor=window.AudioContext||window.webkitAudioContext;
 let ctx=null,master=null,playing=false,phase='lobby',volume=0.45,timer=null,stepIndex=0;
 const lead=[392,440,523.25,587.33,659.25,587.33,523.25,440,392,329.63,392,440,523.25,440,392,329.63];
 const bass=[130.81,146.83,164.81,146.83];
 function note(f,when,duration,type='triangle',level=0.2){
  if(!ctx||!master)return;
  const osc=ctx.createOscillator(),env=ctx.createGain();
  osc.type=type;osc.frequency.setValueAtTime(f,when);
  env.gain.setValueAtTime(0.0001,when);
  env.gain.exponentialRampToValueAtTime(level,when+0.018);
  env.gain.exponentialRampToValueAtTime(0.0001,when+duration);
  osc.connect(env);env.connect(master);
  osc.start(when);osc.stop(when+duration+0.02);
 }
 function musicStep(){
  if(!playing||!ctx||phase==='finished')return;
  const now=ctx.currentTime+0.02;
  note(lead[stepIndex%lead.length],now,0.17,'triangle',0.17);
  if(stepIndex%4===0)note(bass[Math.floor(stepIndex/4)%bass.length],now,0.70,'sine',0.15);
  stepIndex++;
 }
 function stop(){if(timer!==null){clearInterval(timer);timer=null;}}
 function start(){if(!playing||phase==='finished'||timer!==null)return;musicStep();timer=setInterval(musicStep,225);}
 function fanfare(){
  if(!ctx||!playing)return;
  const notes=[523.25,659.25,783.99,1046.50,987.77,1046.50];
  notes.forEach((f,i)=>note(f,ctx.currentTime+0.13*i,i===notes.length-1?0.9:0.32,'triangle',0.30));
 }
 function setVolume(v){volume=Math.max(0,Math.min(1,Number(v)||0));if(master)master.gain.value=volume*0.45;}
 async function toggle(){
  if(playing){playing=false;stop();if(ctx)await ctx.suspend();return false;}
  if(!AudioCtor)throw Error('Audio not supported');
  if(!ctx){ctx=new AudioCtor();master=ctx.createGain();master.connect(ctx.destination);}
  setVolume(volume);await ctx.resume();playing=true;
  if(phase==='finished')fanfare();else start();
  return true;
 }
 function setPhase(next){if(phase===next)return;phase=next;if(!playing)return;if(next==='finished'){stop();fanfare();}else{start();}}
 return {toggle,setVolume,setPhase};
}
