/**
 * One-time migration script to re-encrypt all API keys from the legacy
 * hardcoded-salt format to the new per-encryption random-salt format.
 *
 * Usage:
 *   npx tsx scripts/re-encrypt-keys.ts
 *
 * Make sure API_KEY_ENCRYPTION_SECRET and Supabase env vars are set
 * in your .env.local before running.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

// Manual .env.local parsing (avoids dotenv dependency)
const envPath = resolve(process.cwd(), ".env.local");
try {
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
} catch {
  console.error("Could not read .env.local");
}

import { createClient } from "@supabase/supabase-js";
import { decryptLegacy, encrypt } from "../src/lib/crypto";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

if (!process.env.API_KEY_ENCRYPTION_SECRET) {
  console.error("Missing API_KEY_ENCRYPTION_SECRET");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log("Fetching all API keys...");

  const { data: keys, error } = await supabase
    .from("api_keys")
    .select("id, key_alias, encrypted_key");

  if (error) {
    console.error("Failed to fetch API keys:", error.message);
    process.exit(1);
  }

  if (!keys || keys.length === 0) {
    console.log("No API keys found. Nothing to migrate.");
    return;
  }

  console.log(`Found ${keys.length} API key(s). Starting re-encryption...`);

  let migrated = 0;
  let failed = 0;

  for (const key of keys) {
    try {
      const plaintext = decryptLegacy(key.encrypted_key);
      const newEncrypted = encrypt(plaintext);

      const { error: updateError } = await supabase
        .from("api_keys")
        .update({ encrypted_key: newEncrypted })
        .eq("id", key.id);

      if (updateError) {
        console.error(`  ✗ Failed to update key "${key.key_alias}" (${key.id}): ${updateError.message}`);
        failed++;
      } else {
        console.log(`  ✓ Re-encrypted key "${key.key_alias}" (${key.id})`);
        migrated++;
      }
    } catch (err) {
      console.error(`  ✗ Failed to decrypt/re-encrypt key "${key.key_alias}" (${key.id}): ${err}`);
      failed++;
    }
  }

  console.log(`\nDone. Migrated: ${migrated}, Failed: ${failed}`);

  if (failed > 0) {
    console.error("\n⚠ Some keys failed to migrate. They may already be in the new format.");
    console.error("  Verify manually and re-run if needed.");
  }
}

main();
