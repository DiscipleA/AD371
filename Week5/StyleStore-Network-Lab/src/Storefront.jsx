const money = cents => new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD'}).format(cents / 100);

export default function Storefront({state, disabled, onQuantity, onQuote}) {
  const {quantity, quote} = state;
  const validQuantity = /^[1-9]$/.test(quantity);
  return <section className="ss-storefront" aria-label="StyleStore sneaker storefront">
    <header className="ss-site-header">
      <div className="ss-header-utility"><span>THE CLASSICS, RECONNECTED.</span><span>Network lab · Quote only</span></div>
      <div className="ss-header-main"><span className="ss-logo">StyleStore<span aria-hidden="true">.</span></span><span className="ss-header-caption">One classic. Two replicas.</span></div>
    </header>
    <div className="ss-commerce-layout">
      <div className="ss-product-container">
        <article className="ss-adaptive-card adaptive-card" aria-labelledby="ss-product-name">
          <div className="ss-product-image-box"><img src="./assets/sneaker.svg" alt="Red retro running sneaker with a sculpted cream sole" className="ss-product-image" width="640" height="440" decoding="async" /></div>
          <div className="ss-product-content">
            <span className="ss-eyebrow">THE EVERYDAY ORIGINAL</span>
            <h3 id="ss-product-name" className="ss-product-title">Retro Sneakers</h3>
            <p className="ss-product-description">Premium classic athletic footwear engineered with modern perceptual cushioning.</p>
            <p className="ss-unit-price">$85.00 <span>USD / pair</span></p>
            <form className="ss-product-controls" onSubmit={event => {event.preventDefault(); if (!disabled && validQuantity) onQuote();}}>
              <div className="ss-quantity-control">
                <label htmlFor="ss-quantity">Quantity</label>
                <input id="ss-quantity" name="quantity" type="number" min="1" max="9" step="1" inputMode="numeric" value={quantity} disabled={disabled} onChange={event => onQuantity(event.target.value)} aria-describedby="ss-quantity-hint" required />
              </div>
              <button type="submit" className="ss-button ss-button--primary" disabled={disabled || !validQuantity}>Get quote <span aria-hidden="true">→</span></button>
              <p id="ss-quantity-hint" className="ss-field-hint">Choose 1–9 pairs. Totals come from the API.</p>
            </form>
          </div>
        </article>
      </div>
      <aside className="ss-summary" aria-labelledby="ss-summary-title">
        <div className="ss-summary-heading"><h3 id="ss-summary-title">Order Summary</h3><span className="ss-summary-badge">Quote only</span></div>
        <div className="ss-summary-item">
          <img src="./assets/sneaker.svg" alt="" width="64" height="64" className="ss-summary-image" />
          <div><strong>Retro Sneakers</strong><span>Red · Qty: {quantity || '—'}</span></div>
        </div>
        <dl className="ss-summary-totals">
          <div><dt>Unit price</dt><dd>{quote ? money(quote.product.unitPriceCents) : '$85.00'}</dd></div>
          <div className="ss-grand-total"><dt>Quote total</dt><dd>{quote ? money(quote.totalCents) : '—'}</dd></div>
        </dl>
        <p className="ss-summary-note">{quote ? `Validated for ${quote.quantity} ${quote.quantity === 1 ? 'pair' : 'pairs'} · USD` : 'Get a quote to see the server-calculated total.'}</p>
        <p className="ss-quote-disclaimer">No purchase, payment, tax or shipping calculation. Nothing is saved.</p>
      </aside>
    </div>
  </section>;
}
