import { decryptConnectionKey, encryptConnectionKey } from "./connection-key.server";

export async function saveConnectionKey(userId: string, value: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("app_user_connections").upsert({
    user_id: userId,
    connector_id: "github",
    connection_key_ciphertext: encryptConnectionKey(value),
    reconnect_required: false,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,connector_id" });
  if (error) throw error;
}

export async function loadConnectionKey(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("app_user_connections")
    .select("connection_key_ciphertext")
    .eq("user_id", userId)
    .eq("connector_id", "github")
    .maybeSingle();
  if (error) throw error;
  return data ? decryptConnectionKey(data.connection_key_ciphertext) : null;
}
