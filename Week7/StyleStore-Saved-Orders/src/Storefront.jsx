import {useState} from 'react';
import {CATALOG,money,draftTotal,validLabel} from './orders-client.mjs';
const descriptions={
  'retro-sneakers':{eyebrow:'THE EVERYDAY ORIGINAL',text:'Classic running lines. A sculpted cream sole. Your next everyday favorite.',alt:'Red retro running sneakers with a sculpted cream sole'},
  'classic-tee':{eyebrow:'THE PERFECT FOUNDATION',text:'An easy crew neck in warm cream. Clean lines made for your everyday rotation.',alt:'Cream classic crew-neck T-shirt with a small woven label'},
  'everyday-hoodie':{eyebrow:'AN EXTRA LAYER OF COMFORT',text:'A relaxed sage layer with a generous hood and a classic kangaroo pocket.',alt:'Sage green pullover hoodie with drawstrings and a kangaroo pocket'},
  'city-backpack':{eyebrow:'TAKE THE LONG WAY HOME',text:'A navy everyday carry with warm tan details and space for the essentials.',alt:'Navy city backpack with tan straps and a front zip pocket'}
};
export default function Storefront({config,authReady,session,engine,draft,label,orders,selected,busy,connected,notice,observation,onEngine,onStart,onSignOut,onAdd,onQuantity,onRemove,onLabel,onSave,onRename,onNew,onSelect,onDelete,onRefresh}){
  const [active,setActive]=useState(CATALOG[0].id);
  const product=CATALOG.find(item=>item.id===active),description=descriptions[active];
  const items=selected?selected.items:draft.map(item=>({...CATALOG.find(product=>product.id===item.productId),...item}));
  const total=selected?selected.totalCents:draftTotal(draft);
  const unavailable=!session||!config.configured||!authReady;
  return <div className="saved-orders-app stylestore-lab">
    <section className="ss-storefront" aria-label="StyleStore saved orders">
      <header className="ss-site-header">
        <div className="ss-header-utility"><span>THE CLASSICS, RECONNECTED.</span><span>Saved orders · No checkout</span></div>
        <div className="ss-header-main"><span className="ss-logo">StyleStore<span aria-hidden="true">.</span></span><span className="ss-header-caption">Four essentials. Two ways to save.</span></div>
      </header>
      <div className="ss-session-bar">
        <div className="ss-engine-control"><label htmlFor="sso-engine">Save in</label><select id="sso-engine" value={engine} onChange={event=>onEngine(event.target.value)}><option value="sql">PostgreSQL · SQL</option><option value="mongo">MongoDB · Documents</option></select></div>
        <div className="ss-session-actions"><span className="ss-session-label">{session?'Anonymous demo session':config.configured?'No session yet':'Not configured'}</span>{session?<button className="ss-button" disabled={busy} onClick={onSignOut}>Sign out</button>:<button className="ss-button ss-button--primary" disabled={!config.configured||!authReady||busy} onClick={onStart}>{authReady?'Start demo session':'Checking session…'}</button>}</div>
        <p className="ss-session-hint">{session?'This browser keeps your session. Signing out or clearing browser data loses access to anonymous orders.':'Browse and build a local draft. Start a session explicitly to save real records; no email needed.'}</p>
      </div>
      <div className="ss-commerce-layout">
        <div className="ss-product-container">
          <div className="ss-product-picker" role="group" aria-label="Choose a product">
            {CATALOG.map(item=><button type="button" key={item.id} className="ss-product-option" aria-pressed={active===item.id} onClick={()=>setActive(item.id)}><img src={`./${item.image}`} width="120" height="84" alt=""/><strong>{item.name}</strong><span>{money(item.unitPriceCents)}</span></button>)}
          </div>
          <article className="ss-adaptive-card adaptive-card" aria-labelledby="sso-product-title">
            <div className="ss-product-image-box"><img src={`./${product.image}`} alt={description.alt} className="ss-product-image" width="640" height="440" decoding="async"/></div>
            <div className="ss-product-content"><span className="ss-eyebrow">{description.eyebrow}</span><h3 id="sso-product-title" className="ss-product-title">{product.name}</h3><p className="ss-product-description">{description.text}</p><p className="ss-unit-price">{money(product.unitPriceCents)} <span>USD / item</span></p><button className="ss-button ss-button--primary" disabled={busy||Boolean(selected&&unavailable)} onClick={()=>onAdd(product.id)}>{selected?'Add to saved order':'Add to draft'} <span aria-hidden="true">+</span></button><p className="ss-field-hint">{selected?'Sends an update to this saved order.':'Local only until you choose Save order.'} Quantity 1–9.</p></div>
          </article>
          <div className="ss-saved-orders" aria-labelledby="sso-orders-title">
            <div className="ss-saved-heading"><div><span className="ss-eyebrow">{engine==='sql'?'POSTGRESQL':'MONGODB'}</span><h3 id="sso-orders-title">Your saved orders</h3></div><button className="ss-button" disabled={busy||unavailable} onClick={onRefresh}>Refresh orders</button></div>
            {!orders.length?<p className="ss-empty">{unavailable?'Start a configured demo session to read your saved orders.':connected?'No saved orders in this engine yet. Save your first draft.':'No saved records loaded. Refresh to try the API again.'}</p>:<ul className="ss-order-list">{orders.map(order=><li key={order.id}><button className="ss-order-button" aria-pressed={selected?.id===order.id} disabled={busy} onClick={()=>onSelect(order.id)}><span><strong>{order.label}</strong><small>{order.itemCount} {order.itemCount===1?'item':'items'} · {new Date(order.updatedAt).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</small></span><span>{money(order.totalCents)}</span></button></li>)}</ul>}
            <p className="ss-field-hint">Each engine has its own records. Switching does not copy or synchronize orders.</p>
          </div>
        </div>
        <aside className="ss-summary" aria-labelledby="sso-summary-title">
          <div className="ss-summary-heading"><h3 id="sso-summary-title">Order Summary</h3><span className="ss-summary-badge">{selected?'Saved record':'Local draft'}</span></div>
          <form className="ss-label-form" onSubmit={event=>{event.preventDefault();selected?onRename():onSave();}}>
            <label htmlFor="sso-label">Order label</label><input id="sso-label" type="text" value={label} required disabled={busy} onChange={event=>onLabel(event.target.value)} aria-describedby="sso-label-hint"/><p id="sso-label-hint" className="ss-field-hint">1–80 characters (Unicode code points). No personal information needed.</p>
            {selected&&<button className="ss-button" type="submit" disabled={busy||unavailable||!validLabel(label)||label.trim()===selected.label}>Rename saved order</button>}
          </form>
          {!items.length?<p className="ss-empty">{selected?'This saved order is empty. Add a product to keep building.':'Your draft is empty. Choose an essential and add it here.'}</p>:<ul className="ss-summary-items">{items.map(item=><li className="ss-summary-item" key={item.productId}>
            <img src={`./${CATALOG.find(product=>product.id===item.productId).image}`} alt="" width="64" height="64" className="ss-summary-image"/><div className="ss-summary-details"><strong>{item.name}</strong><span>{money(item.unitPriceCents)} each</span><div className="ss-item-actions"><label>Qty <select aria-label={`Quantity for ${item.name}`} value={item.quantity} disabled={busy||Boolean(selected&&unavailable)} onChange={event=>onQuantity(item,event.target.value)}>{Array.from({length:9},(_,index)=><option key={index+1} value={index+1}>{index+1}</option>)}</select></label><button className="ss-remove" disabled={busy||Boolean(selected&&unavailable)} aria-label={`Remove ${item.name}`} onClick={()=>onRemove(item)}>Remove</button></div></div><strong className="ss-line-total">{money(item.unitPriceCents*item.quantity)}</strong>
          </li>)}</ul>}
          <dl className="ss-summary-totals"><div className="ss-grand-total"><dt>{selected?'Saved total':'Draft total'}</dt><dd>{money(total)}</dd></div></dl>
          <p className="ss-summary-note">{selected?'Server-calculated total from the saved record. Item changes save immediately through the API.':'An estimate from the bundled catalog. Save validates prices and calculates the total on the server.'}</p>
          <div className="ss-summary-actions">{selected?<><button className="ss-button" disabled={busy} onClick={onNew}>New local draft</button><button className="ss-button ss-button--danger" disabled={busy||unavailable} onClick={onDelete}>Delete saved order</button></>:<button className="ss-button ss-button--primary" disabled={busy||unavailable||!items.length||!validLabel(label)} onClick={onSave}>{busy?'Waiting for API…':'Save order'}</button>}</div>
          <p className="ss-quote-disclaimer">{selected?'Saved order, not a purchase.':'Unsaved draft lives only in this page; reloading discards it.'} No payment, inventory, tax or shipping. Do not enter personal data.</p>
        </aside>
      </div>
      <div className={`ss-status${notice.error?' ss-status--error':''}`} role="status" aria-live="polite" aria-atomic="true">{busy&&<span className="ss-busy-dot" aria-hidden="true"/>}{notice.text}</div>
      {observation&&<details className="ss-response"><summary>Last verified response · {observation.method} {observation.path} · HTTP {observation.status}</summary><pre tabIndex="0" aria-label="Last verified response JSON">{JSON.stringify({engine:observation.engine,status:observation.status,data:observation.data},null,2)}</pre><p className="ss-field-hint">Actual HTTP result for this session. A past response is not a current availability guarantee.</p></details>}
    </section>
  </div>;
}
