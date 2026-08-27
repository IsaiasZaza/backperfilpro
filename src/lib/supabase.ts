import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../config/env";
import { badRequest } from "./errors";

let client: SupabaseClient | null = null;

export function isSupabaseConfigured() {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

function isPublishableOrAnonKey(key: string) {
  if (key.startsWith("sb_secret_")) return false;
  if (key.startsWith("sb_publishable_")) return true;

  const parts = key.split(".");
  if (parts.length !== 3) return false;

  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as {
      role?: string;
    };
    return payload.role === "anon" || payload.role === "authenticated";
  } catch {
    return false;
  }
}

/**
 * Cliente do Supabase no backend, com a service role.
 * Nunca exponha SUPABASE_SERVICE_ROLE_KEY no frontend.
 */
export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw badRequest(
      "Storage nao configurado. Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no backend (Railway), nao no frontend.",
      "STORAGE_NOT_CONFIGURED",
    );
  }

  if (isPublishableOrAnonKey(env.SUPABASE_SERVICE_ROLE_KEY)) {
    throw badRequest(
      "SUPABASE_SERVICE_ROLE_KEY esta com a chave publica. Use a service_role secreta do Dashboard (Settings → API).",
      "STORAGE_INVALID_KEY",
    );
  }

  if (!client) {
    client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  return client;
}
