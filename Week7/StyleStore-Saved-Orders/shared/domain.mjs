import { CATALOG } from './catalog.mjs';

export class DomainError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export const badRequest = (message = 'Invalid request.') => new DomainError(400, 'BAD_REQUEST', message);
export const notFound = () => new DomainError(404, 'NOT_FOUND', 'Order or item not found.');
export const conflict = (message = 'Order limit or duplicate item conflict.') => new DomainError(409, 'CONFLICT', message);
export const unavailable = () => new DomainError(503, 'UNAVAILABLE', 'Storage is temporarily unavailable.');
export const isUuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function fields(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
      Object.keys(value).length !== keys.length || !keys.every(k => Object.hasOwn(value, k))) throw badRequest();
}
export function validateMutation(op, body) {
  const label = value => {
    if (typeof value !== 'string') throw badRequest('Label must contain 1–80 characters.');
    const clean = value.trim();
    if ([...clean].length < 1 || [...clean].length > 80 || /[\u0000-\u001f\u007f\ud800-\udfff]/u.test(clean)) throw badRequest('Label must contain 1–80 printable characters.');
    return clean;
  };
  const quantity = value => {
    if (!Number.isInteger(value) || value < 1 || value > 9) throw badRequest('Quantity must be an integer from 1 to 9.');
    return value;
  };
  const item = value => {
    fields(value, ['productId','quantity']);
    if (typeof value.productId !== 'string' || !CATALOG.some(p => p.id === value.productId)) throw badRequest('Unknown product.');
    return { productId: value.productId, quantity: quantity(value.quantity) };
  };
  switch (op) {
    case 'createOrder': {
      fields(body, ['label','items']);
      if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 4) throw badRequest('Create an order with 1–4 distinct items.');
      const items = body.items.map(item);
      if (new Set(items.map(i => i.productId)).size !== items.length) throw badRequest('Products must be distinct.');
      return { label: label(body.label), items };
    }
    case 'renameOrder': fields(body,['label']); return { label: label(body.label) };
    case 'addItem': return item(body);
    case 'updateItem': fields(body,['quantity']); return { quantity: quantity(body.quantity) };
    default: if (body !== null && body !== undefined) throw badRequest('This operation does not accept a body.'); return null;
  }
}
export function createItem(input, { uuid = () => crypto.randomUUID() } = {}) {
  const product = CATALOG.find(p => p.id === input.productId);
  if (!product) throw badRequest('Unknown product.');
  return { id: uuid(), productId: product.id, name: product.name, unitPriceCents: product.unitPriceCents, quantity: input.quantity };
}
export function createOrder(ownerId, input, { uuid = () => crypto.randomUUID(), now = () => new Date().toISOString() } = {}) {
  const timestamp = now();
  return { id: uuid(), ownerId, label: input.label, items: input.items.map(item => createItem(item,{uuid})), createdAt: timestamp, updatedAt: timestamp };
}
export function normalizeOrder(order) {
  const items = order.items.map(({ id, productId, name, unitPriceCents, quantity }) => ({ id, productId, name, unitPriceCents, quantity }));
  return { id: order.id, label: order.label, items, totalCents: items.reduce((n,i) => n + i.unitPriceCents * i.quantity,0), createdAt: order.createdAt, updatedAt: order.updatedAt };
}
export function summarizeOrder(order) {
  const out = normalizeOrder(order);
  return { id: out.id, label: out.label, itemCount: out.items.length, totalCents: out.totalCents, updatedAt: out.updatedAt };
}
