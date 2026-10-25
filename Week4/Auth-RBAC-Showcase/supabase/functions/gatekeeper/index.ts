import { createHandler } from '../_shared/gatekeeper.mjs';

// Public resource requires gateway JWT verification off; the shared handler
// explicitly validates every protected request through Auth and a guarded RPC.
Deno.serve(createHandler({
  env: {
    SUPABASE_URL: Deno.env.get('SUPABASE_URL'),
    SUPABASE_ANON_KEY: Deno.env.get('SUPABASE_ANON_KEY'),
    SUPABASE_PUBLISHABLE_KEY: Deno.env.get('SUPABASE_PUBLISHABLE_KEY'),
    SUPABASE_PUBLISHABLE_KEYS: Deno.env.get('SUPABASE_PUBLISHABLE_KEYS'),
    ALLOWED_ORIGINS: Deno.env.get('ALLOWED_ORIGINS'),
  },
}));
