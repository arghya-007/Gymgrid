import "expo-sqlite/localStorage/install";

import { createClient } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";

const configuredUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const configuredPublishableKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

export const isSupabaseConfigured = Boolean(
  configuredUrl && configuredPublishableKey,
);

// A valid inert URL keeps the app renderable before local environment values are
// supplied. Auth actions remain disabled until both public values are configured.
const supabaseUrl = configuredUrl ?? "https://example.supabase.co";
const supabasePublishableKey =
  configuredPublishableKey ?? "public-development-placeholder";

const sessionStorage =
  typeof globalThis.localStorage === "undefined"
    ? {
        getItem: () => null,
        removeItem: () => undefined,
        setItem: () => undefined,
      }
    : globalThis.localStorage;

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    // Expo Router renders web routes in Node during static export, where browser
    // storage does not exist. Native and browser runtimes still use persisted
    // localStorage installed by Expo SQLite or supplied by the browser.
    storage: sessionStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

if (Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
