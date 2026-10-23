/* Public browser code. Never put a secret or service_role key here. */
(function (global) {
  'use strict';
  const cfg = global.SHENKENG_CLOUD_CONFIG || {};
  const configured = !!(cfg.url && cfg.publishableKey);
  const missions = ['river','people','student','workshop','culture','impact'];
  function validConfig() {
    if (!configured) throw Error('尚未設定 Supabase Project URL 與公開金鑰。');
    const url = new URL(cfg.url);
    if (url.protocol !== 'https:') throw Error('Supabase URL 必須使用 HTTPS。');
    if (cfg.publishableKey.startsWith('sb_secret_')) throw Error('不可在前端使用 secret 金鑰。');
    if (cfg.publishableKey.startsWith('eyJ')) {
      try { if (JSON.parse(atob(cfg.publishableKey.split('.')[1])).role === 'service_role') throw Error('SERVICE_ROLE'); }
      catch(e) { if(e.message === 'SERVICE_ROLE') throw Error('不可在前端使用 service_role 金鑰。'); }
    }
  }
  let sdkPromise;
  async function createClient(storageKey) {
    validConfig();
    sdkPromise ||= import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.8/+esm');
    const {createClient} = await Promise.race([sdkPromise,new Promise((_,r)=>setTimeout(()=>r(Error('登入元件載入逾時')),12000))]);
    return createClient(cfg.url,cfg.publishableKey,{
      auth:{storageKey,persistSession:true,autoRefreshToken:true,detectSessionInUrl:false},
      global:{fetch:async (url,options={})=>{
        const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
        const original=options.signal;
        const abort=()=>controller.abort(); original?.addEventListener('abort',abort,{once:true});
        try { return await fetch(url,{...options,signal:controller.signal}); }
        finally { clearTimeout(timer);original?.removeEventListener('abort',abort); }
      }}
    });
  }
  function clean(raw) {
    return {visited:[...new Set((Array.isArray(raw?.visited)?raw.visited:[]).filter(x=>typeof x==='string'&&x.length<=100))].slice(0,500),
      completed:[...new Set((Array.isArray(raw?.completed)?raw.completed:[]).filter(x=>missions.includes(x)))],
      active:missions.includes(raw?.active)?raw.active:null};
  }
  function merge(a,b) {
    a=clean(a);b=clean(b);
    return clean({visited:[...a.visited,...b.visited],completed:[...a.completed,...b.completed],active:b.active});
  }
  function read(key,fallback) {try{return JSON.parse(localStorage.getItem(key)||'null')??fallback}catch{return fallback}}
  function put(key,value) {try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}}
  function csv(rows,headers) {
    const escape=x=>{let t=String(x??'');if(/^[\s]*[=+\-@]/.test(t))t="'"+t;return '"'+t.replace(/"/g,'""')+'"'};
    return '\uFEFF'+[headers,...rows].map(row=>row.map(escape).join(',')).join('\r\n');
  }
  class PlayerStore {
    constructor(profile,profileID,onStatus,onState) {
      this.profile={...profile};this.key='shenkeng-cloud-v1:'+profileID;
      const saved=read(this.key,{});this.epoch=saved.epoch;this.queue=Array.isArray(saved.queue)?saved.queue:[];
      this.resetPending=!!saved.resetPending;this.state=clean(saved.state);this.uid=saved.uid||null;
      this.onStatus=onStatus;this.onState=onState;this.dirty=false;this.closed=false;this.timer=null;
    }
    status(message){this.onStatus?.(message)}
    persist(){if(!put(this.key,{epoch:this.epoch,uid:this.uid,queue:this.queue,state:this.state,resetPending:this.resetPending}))this.status('本機空間不足；待同步紀錄僅暫存在此頁面。')}
    async connect(localState) {
      this.state=clean(localState);this.status('正在連接匿名雲端帳號…');
      this.client=await createClient('shenkeng-auth-v1:'+this.key);
      let {data,error}=await this.client.auth.getSession();if(error)throw error;
      let user=data.session?.user;
      if(!user){const signed=await this.client.auth.signInAnonymously();if(signed.error)throw signed.error;user=signed.data.user;}
      if(!user?.is_anonymous)throw Error('此玩家登入槽不是匿名帳號，請使用獨立玩家檔案。');
      const result=await this.client.from('learning_players').select('progress,epoch').eq('user_id',user.id).maybeSingle();
      if(result.error)throw result.error;
      if(this.uid && this.uid!==user.id){this.queue=[];this.resetPending=false;this.epoch=undefined;}
      this.uid=user.id;
      if(result.data){
        if(this.epoch!==result.data.epoch){this.state=clean(result.data.progress);this.queue=[];this.resetPending=false;}
        else if(!this.resetPending)this.state=merge(result.data.progress,this.state);
        this.epoch=result.data.epoch;
      }else this.epoch=0;
      this.connected=true;this.onState?.(this.state,true);this.event('login',this.profile.role,{department:this.profile.role==='student'?this.profile.department||null:null});
      await this.flush();
      this.retry=setInterval(()=>{if(!this.closed&&(this.dirty||this.queue.length||this.resetPending))this.flush()},30000);
      return this;
    }
    update(state){if(this.closed)return;this.state=clean(state);this.dirty=true;this.persist();this.schedule()}
    event(type,target,payload={}) {
      if(this.closed)return;
      this.queue.push({id:crypto.randomUUID(),event_type:type,target,payload,occurred_at:new Date().toISOString()});
      this.dirty=true;this.persist();this.schedule();
    }
    reset(){this.state=clean(null);this.queue=[];this.resetPending=true;this.event('reset','progress',{});this.onState?.(this.state,true)}
    schedule(){clearTimeout(this.timer);this.timer=setTimeout(()=>this.flush(),800)}
    async flush(){
      if(!this.connected||this.closed||this.busy)return;
      this.busy=true;clearTimeout(this.timer);const batch=this.queue.slice(0,50),reset=this.resetPending;
      this.dirty=false;this.status('同步中…');
      try{
        const {data,error}=await this.client.rpc('sync_learning',{p_nickname:this.profile.name,p_role:this.profile.role,
          p_consent:cfg.consentVersion||'2026-10-23-v1',p_progress:clean(this.state),p_events:batch,p_epoch:this.epoch,p_reset:reset});
        if(error)throw error;
        if(data.reset_detected){this.queue=[];this.resetPending=false;this.state=clean(data.progress);this.dirty=false;}
        else{
          const ids=new Set(batch.map(x=>x.id));this.queue=this.queue.filter(x=>!ids.has(x.id));
          // A reset requested while this request was in flight must not be overwritten.
          if(!this.resetPending||reset)this.state=this.dirty?merge(data.progress,this.state):clean(data.progress);
          if(reset)this.resetPending=false;
        }
        this.epoch=data.epoch;this.persist();this.onState?.(this.state,!!data.reset_detected||reset);
        this.status(data.reset_detected?'已採用雲端重設後進度；舊分頁未覆蓋資料。':`已同步 · ${new Date().toLocaleTimeString('zh-TW')} · 待送 ${this.queue.length} 筆`);
      }catch(e){this.dirty=true;this.persist();this.status('尚未同步：'+(e.message||'連線失敗')+'。進度仍保存在本機，可按重試。');}
      finally{this.busy=false;}
      if(this.queue.length&&!this.dirty&&!this.closed)this.schedule();
    }
    async remove(){
      if(!this.connected)throw Error('雲端尚未連接，無法刪除雲端紀錄。');
      // Wait for an existing write before deleting, so it cannot recreate the row.
      this.closed=true;clearTimeout(this.timer);clearInterval(this.retry);
      while(this.busy)await new Promise(r=>setTimeout(r,50));
      const {error}=await this.client.rpc('delete_my_learning');if(error){this.closed=false;throw error}
      const signed=await this.client.auth.signOut({scope:'local'});if(signed.error)throw signed.error;
      this.client.auth.stopAutoRefresh();try{localStorage.removeItem(this.key)}catch{}
    }
    close(){this.closed=true;clearTimeout(this.timer);clearInterval(this.retry);this.persist();this.client?.auth.stopAutoRefresh()}
  }
  global.ShenkengCloud={configured,createClient,PlayerStore,clean,merge,csv};
})(globalThis);
