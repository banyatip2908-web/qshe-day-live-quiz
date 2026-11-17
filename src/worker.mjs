import { DurableObject } from 'cloudflare:workers';
import {DEFAULT_QUESTIONS, validateQuestions, calculatePoints, getRanking, cleanName, shuffledOrder, selectRoundQuestions} from './logic.mjs';

const json = (value, status=200) => new Response(JSON.stringify(value), {status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const digits = s => /^\d{6}$/.test(s || '');
const auth = (request, env) => Boolean(env.CREATE_KEY) && request.headers.get('X-Create-Key') === env.CREATE_KEY;
const roomStub = (env,pin) => env.ROOMS.get(env.ROOMS.idFromName(pin));
const secret = () => crypto.randomUUID()+'-'+crypto.randomUUID();
const REVEAL_DURATION_MS = 6000; // Show the answer before advancing automatically

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/api/rooms' && request.method === 'POST') {
        if (!env.CREATE_KEY) return json({error:'ผู้จัดงานยังไม่ได้ตั้งรหัส CREATE_KEY บนเซิร์ฟเวอร์'},503);
        if (!auth(request,env)) return json({error:'รหัสผู้จัดงานไม่ถูกต้อง'},403);
        for (let attempt=0; attempt<15; attempt++) {
          const pin = String(Math.floor(100000+Math.random()*900000));
          const token = secret();
          const res = await roomStub(env,pin).fetch(new Request('https://room.internal/init',{method:'POST',body:JSON.stringify({pin,hostToken:token})}));
          if (res.status === 201) return json({pin,hostToken:token});
        }
        return json({error:'ไม่สามารถสร้างห้องได้ กรุณาลองอีกครั้ง'},503);
      }
      const match = url.pathname.match(/^\/api\/rooms\/(\d{6})\/(join|ws|export)$/);
      if (match) {
        const [,pin,action] = match;
        const to = new URL(`https://room.internal/${action}`);
        if (action==='ws') {
          if (request.method!=='GET') return json({error:'Method not allowed'},405);
          to.search = url.search;
          return roomStub(env,pin).fetch(new Request(to,request));
        }
        if (action==='join' && request.method==='POST') return roomStub(env,pin).fetch(new Request(to,{method:'POST',body:await request.text(),headers:{'content-type':'application/json'}}));
        if (action==='export' && request.method==='GET') {
          to.search = url.search;
          return roomStub(env,pin).fetch(new Request(to));
        }
        return json({error:'Method not allowed'},405);
      }
      if (url.pathname.startsWith('/api/')) return json({error:'ไม่พบเส้นทาง API'},404);
      return env.ASSETS.fetch(request);
    } catch(e) {
      console.error('API error', String(e));
      return json({error:'ระบบขัดข้องชั่วคราว กรุณาลองใหม่'},500);
    }
  }
};

export class QuizRoom extends DurableObject {
  constructor(ctx,env) {
    super(ctx,env);
    this.game = null;
    this.players = new Map();
    this.ready = ctx.blockConcurrencyWhile(async () => {
      this.game = await ctx.storage.get('game') || null;
      const values = await ctx.storage.list({prefix:'p:'});
      this.players = new Map([...values.values()].map(p=>[p.id,p]));
    });
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping','pong'));
  }
  async fetch(request) {
    await this.ready;
    const u = new URL(request.url);
    if (u.pathname==='/init' && request.method==='POST') {
      if (this.game) return json({error:'Room already exists'},409);
      const {pin,hostToken} = await request.json();
      if (!digits(pin) || !hostToken) return json({error:'Invalid room'},400);
      this.game = {pin,hostToken,questions:DEFAULT_QUESTIONS,order:[],optionOrders:[],index:-1,status:'lobby',endAt:0,roundId:1,createdAt:Date.now()};
      await this.saveGame();
      return json({ok:true},201);
    }
    if (!this.game) return json({error:'ไม่พบห้องเกม กรุณาตรวจสอบ PIN'},404);
    if (u.pathname==='/join' && request.method==='POST') {
      let data={};
      try{data=await request.json();}catch{return json({error:'ข้อมูลไม่ถูกต้อง'},400);}
      const name = cleanName(data.name);
      if (!name) return json({error:'กรุณาใส่ชื่อผู้เล่น'},400);
      let p=null;
      if (typeof data.playerId==='string' && data.playerId.length<80 && typeof data.token==='string') {
        const existing=this.players.get(data.playerId);
        if (existing && existing.token===data.token) p=existing;
      }
      if (!p) {
        if (this.game.status==='finished') return json({error:'เกมนี้จบแล้ว ไม่สามารถเข้าร่วมใหม่'},409);
        if (this.players.size >= 100) return json({error:'ห้องเต็มแล้ว (100 คน)'},429);
        p={id:crypto.randomUUID(),token:secret(),name,score:0,roundId:this.game.roundId,answers:{},joinedAt:Date.now()};
        this.players.set(p.id,p);
      } else p.name=name;
      await this.ctx.storage.put('p:'+p.id,p);
      this.broadcastHosts({type:'stats',players:this.players.size,answered:this.answerCount()});
      return json({pin:this.game.pin,playerId:p.id,token:p.token,name:p.name});
    }
    if (u.pathname==='/export' && request.method==='GET') {
      if (u.searchParams.get('token')!==this.game.hostToken) return json({error:'Unauthorized'},403);
      const table = getRanking(this.players,this.game.roundId);
      const lines=[['อันดับ','ชื่อผู้เล่น','คะแนน'].join(','),...table.map(p=>[p.rank,`"${p.name.replace(/"/g,'""')}"`,p.score].join(','))];
      return new Response('\ufeff'+lines.join('\r\n'),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="qshe-results-${this.game.pin}.csv"`,'Cache-Control':'no-store'}});
    }
    if (u.pathname==='/ws' && request.method==='GET') {
      if (request.headers.get('Upgrade')?.toLowerCase()!=='websocket') return json({error:'WebSocket required'},426);
      const role=u.searchParams.get('role');
      let attachment=null;
      if (role==='host' && u.searchParams.get('token')===this.game.hostToken) attachment={role:'host'};
      if (role==='player') {
        const id=u.searchParams.get('id');const p=this.players.get(id);
        if (p && p.token===u.searchParams.get('token')) attachment={role:'player',id};
      }
      if (!attachment) return json({error:'Unauthorized'},403);
      const pair=new WebSocketPair();
      const [client,server]=Object.values(pair);
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment(attachment);
      this.sendState(server);
      if (role==='host') this.safeSend(server,{type:'stats',players:this.players.size,answered:this.answerCount()});
      return new Response(null,{status:101,webSocket:client});
    }
    return json({error:'Not found'},404);
  }
  async saveGame(){await this.ctx.storage.put('game',this.game);}
  answerCount(){let count=0;for(const p of this.players.values())if(p.roundId===this.game.roundId && p.answers[this.game.index]!==undefined)count++;return count;}
  ranking(){return getRanking(this.players,this.game.roundId);}
  roundQuestion(){
    const index=this.game.index;
    const original=this.game.questions[this.game.order[index]];
    const optionOrder=this.game.optionOrders?.[index] || [0,1,2,3];
    return {...original,choices:optionOrder.map(i=>original.choices[i]),correct:optionOrder.indexOf(original.correct)};
  }
  questionPublic(){
    const {index,questions,status,endAt}=this.game;
    if (index<0 || index>=this.game.order.length) return null;
    const q=this.roundQuestion();
    const reveal=status==='reveal'||status==='finished';
    return {index:index+1,total:this.game.order.length,text:q.text,choices:q.choices,topic:q.topic,seconds:q.seconds,endAt,multiplier:index===this.game.order.length-1?2:1,correct:reveal?q.correct:undefined,source:reveal?q.source:undefined,explanation:reveal?q.explanation:undefined};
  }
  stateFor(a){
    const {pin,status,index,questions}=this.game;
    const host=a.role==='host';
    const p=host?null:this.players.get(a.id);
    const ranking=this.ranking();
    const place=p?ranking.find(r=>r.id===p.id):null;
    const answered=p?.roundId===this.game.roundId?p.answers[index]:undefined;
    const showRanking=status==='reveal'||status==='finished';
    return {type:'state',pin,status,serverNow:Date.now(),question:this.questionPublic(),players:this.players.size,answered:this.answerCount(),
      yourName:p?.name, yourScore:place?.score||0, yourRank:showRanking?place?.rank:null, yourAnswer:answered===undefined?null:answered.selected,
      leaderboard:showRanking?ranking.slice(0,5).map(({name,score,rank})=>({name,score,rank})):[],
      ...(host?{questions, host:true}: {})};
  }
  safeSend(ws,msg){try{ws.send(JSON.stringify(msg));}catch{}}
  sendState(ws){const a=ws.deserializeAttachment();if(a)this.safeSend(ws,this.stateFor(a));}
  broadcastAll(){for(const ws of this.ctx.getWebSockets())this.sendState(ws);}
  broadcastHosts(msg){for(const ws of this.ctx.getWebSockets())if(ws.deserializeAttachment()?.role==='host')this.safeSend(ws,msg);}
  async command(type,data){
    if(type==='questions'){
      if (this.game.status!=='lobby') throw new Error('แก้ไขคำถามได้ก่อนเริ่มเกมเท่านั้น');
      this.game.questions=validateQuestions(data.questions);
      await this.saveGame();this.broadcastAll();return;
    }
    if(type==='start'){
      if(this.game.status!=='lobby') throw new Error('เริ่มเกมได้เมื่ออยู่หน้าเตรียมตัวเท่านั้น');
      this.game.order=selectRoundQuestions(this.game.questions);
      this.game.optionOrders=this.game.order.map(()=>shuffledOrder(4));
      this.game.index=0;await this.startQuestion();return;
    }
    if(type==='reveal'){
      if(this.game.status!=='question') throw new Error('ยังไม่ถึงเวลาที่จะเฉลย');
      await this.reveal();return;
    }
    if(type==='next'){
      if(this.game.status!=='reveal') throw new Error('กรุณาเฉลยคำถามก่อน');
      await this.advanceQuestion();return;
    }
    if(type==='reset'){
      this.game.status='lobby';this.game.index=-1;this.game.order=[];this.game.optionOrders=[];this.game.endAt=0;this.game.roundId++;
      await this.ctx.storage.deleteAlarm();await this.saveGame();this.broadcastAll();return;
    }
    throw new Error('ไม่รองรับคำสั่งนี้');
  }
  async advanceQuestion(){
    if(this.game.status!=='reveal')return;
    if(this.game.index>=this.game.order.length-1){
      this.game.status='finished';this.game.endAt=0;
      await this.ctx.storage.deleteAlarm();await this.saveGame();this.broadcastAll();return;
    }
    this.game.index+=1;await this.startQuestion();
  }
  async startQuestion(){
    const q=this.roundQuestion();
    this.game.status='question';this.game.endAt=Date.now()+q.seconds*1000;
    await this.saveGame();await this.ctx.storage.setAlarm(this.game.endAt);this.broadcastAll();
  }
  async reveal(){
    if(this.game.status!=='question')return;
    this.game.status='reveal';this.game.endAt=Date.now()+REVEAL_DURATION_MS;
    await this.saveGame();await this.ctx.storage.setAlarm(this.game.endAt);this.broadcastAll();
  }
  async alarm(){
    await this.ready;
    if(!this.game||!this.game.endAt||Date.now()<this.game.endAt)return;
    if(this.game.status==='question')await this.reveal();
    else if(this.game.status==='reveal')await this.advanceQuestion();
  }
  async webSocketMessage(ws,raw){
    await this.ready;
    const a=ws.deserializeAttachment();if(!a)return;
    if(raw==='ping')return;
    if(typeof raw!=='string' || raw.length>30000)return;
    let msg;try{msg=JSON.parse(raw);}catch{return;}
    if(a.role==='host'){
      try{await this.command(msg.type,msg);}
      catch(e){this.safeSend(ws,{type:'error',error:String(e?.message||'ดำเนินการไม่สำเร็จ')});}
    } else if(a.role==='player' && msg.type==='answer') {
      if(this.game.status==='question' && Date.now()>this.game.endAt){await this.reveal();}
      if(this.game.status!=='question') return this.safeSend(ws,{type:'error',error:'หมดเวลาตอบแล้ว'});
      const p=this.players.get(a.id);if(!p)return;
      const selected=Number(msg.choice);
      if(!Number.isInteger(selected)||selected<0||selected>3)return;
      if(p.roundId!==this.game.roundId){p.score=0;p.answers={};p.roundId=this.game.roundId;}
      if(p.answers[this.game.index]!==undefined)return this.safeSend(ws,{type:'error',error:'ตอบข้อนี้ไปแล้ว'});
      const q=this.roundQuestion();
      const multiplier=this.game.index===this.game.order.length-1?2:1;
      const gain=calculatePoints(q.correct,selected,q.seconds,this.game.endAt-Date.now(),multiplier);
      p.score+=gain;p.answers[this.game.index]={selected,gain};
      await this.ctx.storage.put('p:'+p.id,p);
      this.safeSend(ws,{type:'answerAck',selected});
      this.broadcastHosts({type:'stats',players:this.players.size,answered:this.answerCount()});
    }
  }
  webSocketClose(ws){try{ws.close(1000,'closed');}catch{}}
  webSocketError(ws){try{ws.close(1011,'error');}catch{}}
}
