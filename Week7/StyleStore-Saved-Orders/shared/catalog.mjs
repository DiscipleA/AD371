// Trusted catalog shared by the browser and server. Never accept client price fields.
export const CATALOG = Object.freeze([
  { id: 'retro-sneakers', name: 'Retro Sneakers', unitPriceCents: 8500, image: 'assets/sneakers.svg' },
  { id: 'classic-tee', name: 'Classic Tee', unitPriceCents: 2800, image: 'assets/tee.svg' },
  { id: 'everyday-hoodie', name: 'Everyday Hoodie', unitPriceCents: 6400, image: 'assets/hoodie.svg' },
  { id: 'city-backpack', name: 'City Backpack', unitPriceCents: 5200, image: 'assets/backpack.svg' },
].map(Object.freeze));
