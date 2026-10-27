(function(root){
  'use strict';
  const config=root.IeltsCloudConfig||{};
  let configured=typeof config.projectUrl==='string'&&/^https:\/\/[^/]+$/.test(config.projectUrl.replace(/\/$/,''))&&typeof config.publishableKey==='string'&&config.publishableKey.length>10&&root.location?.protocol!=='file:';
  const base=configured?config.projectUrl.replace(/\/$/,''):'';
  const sessionKey='ielts-cloud-session-v1';
  const listeners=new Set();
  const localStore=root.IeltsVocab;
  let adapter=null,session=null,refreshing=null,phase=configured?'signed-out':'unconfigured',inspection=null,error=null,notice=null;
  let cloudStatus={active:false,syncing:false,pending:0,online:true,lastSync:null,error:null,userId:null};

  function readSession(){try{const value=JSON.parse(root.localStorage.getItem(sessionKey)||'null');return value?.projectUrl===base&&typeof value.accessToken==='string'&&typeof value.refreshToken==='string'&&typeof value.userId==='string'&&typeof value.expiresAt==='number'?value:null;}catch{return null;}}
  function writeSession(value){session=value;try{value?root.localStorage.setItem(sessionKey,JSON.stringify(value)):root.localStorage.removeItem(sessionKey);}catch{notice='登录状态无法持久保存，请检查浏览器存储权限。';}notify();}
  function linkedKey(userId){return 'ielts-cloud-linked-v1:'+new URL(base).host+':'+userId;}
  function linked(userId){try{return root.localStorage.getItem(linkedKey(userId))==='yes';}catch{return false;}}
  function markLinked(userId){try{root.localStorage.setItem(linkedKey(userId),'yes');}catch{notice='同步已连接，但浏览器无法保存登录标记。';}}
  function state(){return {configured,phase,email:session?.email||'',userId:session?.userId||null,localWords:inspection?.localWords??null,cloudWords:inspection?.cloudWords??null,revision:inspection?.revision??null,otherAccountPending:inspection?.otherAccountPending||false,otherAccountCache:inspection?.otherAccountCache||false,pending:cloudStatus.pending,syncing:cloudStatus.syncing,online:cloudStatus.online,lastSync:cloudStatus.lastSync,error:error||cloudStatus.error,notice};}
  function notify(){const current=state();for(const listener of [...listeners]){try{listener(current);}catch{}}}
  function fail(message){throw new Error(message);}
  function cleanError(response,data){if(response.status===429)return '请求太频繁，请稍后再试。';const code=data?.error_code||data?.code||'';if(code==='email_not_confirmed')return '请先打开验证邮件，再登录。';if(code==='invalid_credentials'||response.status===400&&/invalid login/i.test(data?.msg||data?.message||''))return '邮箱或密码不正确。';if(code==='over_email_send_rate_limit')return '验证邮件发送过于频繁，请稍后再试。';return response.status>=500?'登录服务暂时不可用，请稍后重试。':'登录未完成，请检查邮箱和密码。';}
  async function authRequest(path,body,token){
    if(!configured)fail('云端尚未配置。');
    const response=await root.fetch(base+'/auth/v1/'+path,{method:'POST',headers:{apikey:config.publishableKey,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body||{}),cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)fail(cleanError(response,data));return data;
  }
  function acceptSession(data,old=session){const user=data.user||old&&{id:old.userId,email:old.email};if(typeof data.access_token!=='string'||typeof data.refresh_token!=='string'||typeof user?.id!=='string')fail('登录返回的数据不完整，请重试。');const expiresAt=Number.isFinite(data.expires_at)?data.expires_at*1000:Date.now()+Math.max(60,Number(data.expires_in)||3600)*1000;writeSession({projectUrl:base,accessToken:data.access_token,refreshToken:data.refresh_token,expiresAt,userId:user.id,email:user.email||old?.email||''});}
  async function getAccessToken(){
    if(!session)fail('请先登录云端词库。');
    if(session.expiresAt>Date.now()+60000)return session.accessToken;
    if(refreshing)return refreshing;
    const refresh=async()=>{
      const latest=readSession();if(latest&&latest.userId===session?.userId&&latest.expiresAt>Date.now()+60000){session=latest;notify();return latest.accessToken;}
      const previous=session;const data=await authRequest('token?grant_type=refresh_token',{refresh_token:(latest?.userId===previous.userId?latest:previous).refreshToken});
      if(session?.userId!==previous.userId)fail('登录账号已更换，请重试。');acceptSession(data,previous);return session.accessToken;
    };
    refreshing=(async()=>root.navigator?.locks?.request?root.navigator.locks.request('ielts-cloud-token-refresh',refresh):refresh())();
    try{return await refreshing;}finally{refreshing=null;}
  }

  if(configured){
    try{
      adapter=root.IeltsVocabCloud.create({localStore,endpoint:base+'/functions/v1/vocabulary',apiKey:config.publishableKey,getAccessToken,storage:root.localStorage});
      adapter.subscribeStatus(value=>{cloudStatus=value;if(phase==='active'&&!value.error&&!value.pending&&!value.syncing)error=null;notify();});
      root.IeltsVocab=adapter;
      session=readSession();
    }catch(cause){configured=false;phase='unconfigured';error='当前浏览器无法保存同步状态，请检查站点存储权限。';adapter=null;root.IeltsVocab=localStore;}
  }
  async function prepare(){
    if(!configured||!session)return state();phase='checking';error=null;notice=null;inspection=null;notify();
    try{
      if(linked(session.userId)){
        // activate() journals edits synchronously before its first network await.
        // Doing this before token refresh prevents offline page-load edits being
        // overwritten by a later cloud snapshot.
        await adapter.activate({userId:session.userId,initial:'resume'});phase='active';
      }else{
        await getAccessToken();inspection=await adapter.inspect(session.userId);phase='choice';
      }
      notify();return state();
    }catch(cause){
      if(adapter?.status.active&&adapter.status.userId===session?.userId){markLinked(session.userId);phase='active';error=cause?.message||'暂未同步，联网后会重试。';notify();return state();}
      phase='error';error=cause?.message||'无法连接云端，请稍后重试。';notify();throw cause;
    }
  }
  async function signIn(email,password){
    if(!configured)fail('云端尚未配置。');
    if(cloudStatus.pending>0)fail('还有未同步的修改，请联网同步后再切换账号。');
    email=String(email||'').trim();if(!email||!password)fail('请填写邮箱和密码。');
    const data=await authRequest('token?grant_type=password',{email,password});
    if(cloudStatus.pending>0)fail('登录期间产生了未同步的修改，请先完成同步再切换账号。');
    adapter.deactivate();inspection=null;error=null;notice=null;acceptSession(data);
    await prepare();return state();
  }
  async function signUp(email,password){
    if(!configured)fail('云端尚未配置。');
    if(cloudStatus.pending>0)fail('还有未同步的修改，请联网同步后再切换账号。');
    email=String(email||'').trim();if(!email||typeof password!=='string'||password.length<6)fail('请填写邮箱和至少 6 位密码。');
    const data=await authRequest('signup',{email,password});
    if(data.access_token||data.session?.access_token){if(cloudStatus.pending>0)fail('注册期间产生了未同步的修改，请先完成同步再切换账号。');adapter.deactivate();acceptSession(data.session||data);await prepare();}
    else{notice='请打开邮箱中的验证邮件，完成后回来登录。';notify();}
    return state();
  }
  async function choose(initial){
    if(phase!=='choice'||!session||!['merge-local','use-cloud'].includes(initial))fail('当前没有待选择的词库。');
    phase='checking';error=null;notify();
    try{await adapter.activate({userId:session.userId,initial});markLinked(session.userId);phase='active';notify();return state();}
    catch(cause){
      if(adapter.status.active&&adapter.status.userId===session.userId){markLinked(session.userId);phase='active';error=cause?.message||'暂未同步，联网后会重试。';notify();return state();}
      phase='choice';error=cause?.message||'同步未完成，请重试。';notify();throw cause;
    }
  }
  async function sync(){if(!configured||!session)fail('请先登录云端词库。');if(phase!=='active')return prepare();await adapter.sync();return state();}
  async function signOut(){
    if(cloudStatus.pending>0)fail('还有未同步的修改，请联网同步后再退出。');
    const token=session?.accessToken;adapter?.deactivate();writeSession(null);phase='signed-out';inspection=null;error=null;notice='已退出云端账号，本机词库仍保留。';notify();
    if(token)authRequest('logout',{},token).catch(()=>{});
    return state();
  }
  function subscribe(listener){if(typeof listener!=='function')fail('监听器不正确');listeners.add(listener);listener(state());return ()=>listeners.delete(listener);}
  root.IeltsCloudAuth=Object.freeze({configured,get ready(){return ready;},get state(){return state();},subscribe,signIn,signUp,choose,sync,signOut,retry:prepare,getAccessToken});
  root.addEventListener?.('storage',event=>{if(!configured||event.key!==sessionKey)return;const latest=readSession();if(!latest){adapter.deactivate();session=null;phase='signed-out';inspection=null;notify();return;}if(latest.userId!==session?.userId){adapter.deactivate();session=latest;prepare().catch(()=>{});}else{session=latest;notify();}});
  const ready=configured&&session?prepare().catch(()=>state()):Promise.resolve(state());
})(typeof window!=='undefined'?window:globalThis);
