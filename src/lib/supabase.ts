import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../config/env";
import { badRequest } from "./errors";

let client: SupabaseClient | null = null;

export function isSupabaseConfigured() {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Cliente do Supabase no backend, com a service role.
 * Nunca exponha SUPABASE_SERVICE_ROLE_KEY no frontend.
 */
export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw badRequest(
      "Storage nao configurado. Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.",
      "STORAGE_NOT_CONFIGURED",
    );
  }

  if (!client) {
    client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  return client;
}
