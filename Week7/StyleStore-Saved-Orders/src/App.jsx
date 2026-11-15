import {useEffect,useMemo,useRef,useState} from 'react';
import {createClient} from '@supabase/supabase-js';
import Storefront from './Storefront.jsx';
import {readConfig,createOrdersApi,addDraftItem,setDraftQuantity,validLabel,validQuantity} from './orders-client.mjs';
const config=readConfig(window.SavedOrdersConfig);
const client=config.configured?createClient(config.supabaseUrl,config.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'saved-orders-auth'}}):null;
export default function App(){
  const [session,setSession]=useState(null),[authReady,setAuthReady]=useState(!client),[engine,setEngine]=useState('sql');
  const [draft,setDraft]=useState([]),[label,setLabel]=useState('Weekend essentials'),[orders,setOrders]=useState([]),[selected,setSelected]=useState(null),[busy,setBusy]=useState(false),[connected,setConnected]=useState(false);
  const [notice,setNotice]=useState({text:config.configured?'Checking this showcase’s saved session…':'Not configured. The catalog is a local preview; no database requests or saved orders are available.'}),[observation,setObservation]=useState(null);
  const epoch=useRef(0),locked=useRef(false),identity=useRef(null);
  const api=useMemo(()=>client?createOrdersApi(config,async()=>{const {data,error}=await client.auth.getSession();if(error)throw new Error('Session unavailable. Start a demo session again.');return data.session?.access_token;}):null,[]);
  const resetWork=()=>{epoch.current++;api?.cancel();locked.current=false;setBusy(false);setOrders([]);setSelected(null);setConnected(false);setObservation(null);};
  useEffect(()=>{
    if(!client)return;
    let active=true;
    const apply=value=>{if(!active)return;const id=value?.user?.id||null;if(identity.current!==id){const previous=identity.current;identity.current=id;resetWork();if(previous!==null){setDraft([]);setLabel('Weekend essentials');}}setSession(value);setAuthReady(true);};
    const {data:{subscription}}=client.auth.onAuthStateChange((_event,value)=>apply(value));
    client.auth.getSession().then(({data,error})=>{if(!active)return;if(error){setNotice({error:true,text:'Could not restore the demo session. Start a new session explicitly.'});setAuthReady(true);}else apply(data.session);});
    return()=>{active=false;subscription.unsubscribe();api?.cancel();};
  },[]);
  async function run(action,{needsSession=true}={}){
    if(locked.current || (needsSession&&!session))return;
    locked.current=true;setBusy(true);const current=epoch.current;
    const isCurrent=()=>current===epoch.current;
    try{await action(isCurrent);}catch(error){if(isCurrent())setNotice({error:true,text:error.message||'Request failed. No local result was substituted.'});}
    finally{if(isCurrent()){locked.current=false;setBusy(false);}}
  }
  async function readOrders(currentEngine,isCurrent){
    const response=await api.request(currentEngine,'/orders',{kind:'list'});
    if(isCurrent())setOrders(response.data);return response;
  }
  async function refresh(currentEngine=engine){
    await run(async isCurrent=>{
      setNotice({text:`Reading ${currentEngine==='sql'?'PostgreSQL':'MongoDB'} saved orders…`});
      await api.request(currentEngine,'/catalog',{kind:'catalog'});
      const response=await readOrders(currentEngine,isCurrent);
      if(isCurrent()){setConnected(true);setObservation({status:response.status,method:'GET',path:'/orders',engine:currentEngine,data:response.data});setNotice({text:`HTTP ${response.status} · ${response.data.length} saved ${response.data.length===1?'order':'orders'} read from ${currentEngine==='sql'?'PostgreSQL':'MongoDB'}.`});}
    });
  }
  useEffect(()=>{
    if(!authReady)return;
    if(session)void refresh(engine);
    else if(config.configured)setNotice({text:'Start a demo session to save real orders. No email or password is needed.'});
  },[session?.user?.id,engine,authReady]);
  const changeEngine=value=>{
    if(value===engine)return;
    resetWork();setEngine(value);
    setNotice({text:'Storage engine changed. Orders are separate; the unsaved local draft stays in this page.'});
  };
  const start=()=>run(async isCurrent=>{
    setNotice({text:'Starting an anonymous Supabase Auth session…'});
    const {data,error}=await client.auth.signInAnonymously();
    if(error)throw new Error('Demo session could not start. Check anonymous Auth, connectivity and any rate limit.');
    if(!data.session)throw new Error('Auth did not return a session.');
    if(isCurrent())setSession(data.session);
  },{needsSession:false});
  const signOut=()=>{
    if(!window.confirm('Sign out of this anonymous session? You will lose access to its saved orders on this browser. The records are not deleted.'))return;
    void run(async()=>{
      const {error}=await client.auth.signOut({scope:'local'});
      if(error)throw new Error('Sign out failed. Your current session has not been cleared.');
      resetWork();setSession(null);setDraft([]);setLabel('Weekend essentials');setNotice({text:'Signed out. The page is cleared; the anonymous session’s saved records were not deleted.'});
    });
  };
  const newDraft=()=>{if(busy)return;setSelected(null);setNotice({text:'New local draft. Nothing is stored until Save order succeeds.'});};
  const add=productId=>{
    if(selected){
      const existing=selected.items.find(item=>item.productId===productId);
      if(existing&&existing.quantity>=9){setNotice({error:true,text:'This product already has the maximum quantity of 9.'});return;}
      void mutate(`/orders/${selected.id}/items${existing?`/${existing.id}`:''}`,existing?'PATCH':'POST',existing?{quantity:existing.quantity+1}:{productId,quantity:1});
    }else{try{setDraft(addDraftItem(draft,productId));setNotice({text:'Added to the local draft. Save order to persist it.'});}catch(error){setNotice({error:true,text:error.message});}}
  };
  const quantity=(item,value)=>{
    const number=Number(value);
    if(!validQuantity(number)){setNotice({error:true,text:'Quantity must be a whole number from 1 to 9.'});return;}
    if(selected)void mutate(`/orders/${selected.id}/items/${item.id}`,'PATCH',{quantity:number});
    else setDraft(setDraftQuantity(draft,item.productId,number));
  };
  const remove=item=>selected?void mutate(`/orders/${selected.id}/items/${item.id}`,'DELETE'):setDraft(draft.filter(i=>i.productId!==item.productId));
  async function mutate(path,method,body,{isCreate=false,isDelete=false}={}){
    await run(async isCurrent=>{
      const selectedId=selected?.id,currentEngine=engine;
      setNotice({text:'Saving through the API. Waiting for a database read-back…'});
      const response=await api.request(currentEngine,path,{method,body,kind:isDelete?'deleted':'order',expectedId:isCreate?undefined:selectedId});
      try{
        if(isDelete){
          const list=await readOrders(currentEngine,isCurrent);
          if(list.data.some(order=>order.id===selectedId))throw new Error('Deleted order still appears in saved records.');
          if(isCurrent()){setSelected(null);setLabel('Weekend essentials');setObservation({...response,data:response.data});setNotice({text:`HTTP ${response.status} · Order deleted; absence verified by a new read.`});}
        }else{
          const read=await api.request(currentEngine,`/orders/${response.data.id}`,{kind:'order',expectedId:response.data.id});
          await readOrders(currentEngine,isCurrent);
          if(isCurrent()){setSelected(read.data);setLabel(read.data.label);if(isCreate)setDraft([]);setObservation({...response,data:read.data});setNotice({text:`HTTP ${response.status} · ${isCreate?'Order saved':'Saved order updated'} in ${currentEngine==='sql'?'PostgreSQL':'MongoDB'}; verified by GET.`});}
        }
        if(isCurrent())setConnected(true);
      }catch(error){if(isCurrent())throw new Error('The write was accepted, but verification failed. Refresh saved orders before repeating it. Your draft has been preserved.');}
    });
  }
  const save=()=>{
    if(!validLabel(label)){setNotice({error:true,text:'Give the order a label from 1 to 80 characters.'});return;}
    if(!draft.length){setNotice({error:true,text:'Add at least one product to the draft.'});return;}
    void mutate('/orders','POST',{label:label.trim(),items:draft},{isCreate:true});
  };
  const rename=()=>{if(!validLabel(label)){setNotice({error:true,text:'Give the order a label from 1 to 80 characters.'});return;}void mutate(`/orders/${selected.id}`,'PATCH',{label:label.trim()});};
  const select=id=>run(async isCurrent=>{
    const response=await api.request(engine,`/orders/${id}`,{kind:'order',expectedId:id});
    if(isCurrent()){setSelected(response.data);setLabel(response.data.label);setObservation(response);setNotice({text:`HTTP ${response.status} · Saved order read from ${engine==='sql'?'PostgreSQL':'MongoDB'}.`});}
  });
  const deleteOrder=()=>{if(window.confirm(`Delete “${selected.label}” and all its items from ${engine==='sql'?'PostgreSQL':'MongoDB'}? This cannot be undone.`))void mutate(`/orders/${selected.id}`,'DELETE',undefined,{isDelete:true});};
  return <Storefront {...{config,authReady,session,engine,draft,label,orders,selected,busy,connected,notice,observation}} onEngine={changeEngine} onStart={start} onSignOut={signOut} onAdd={add} onQuantity={quantity} onRemove={remove} onLabel={setLabel} onSave={save} onRename={rename} onNew={newDraft} onSelect={select} onDelete={deleteOrder} onRefresh={()=>refresh()} />;
}
