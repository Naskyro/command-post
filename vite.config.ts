import vinext from "vinext";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";

// D1 database binding is defined in wrangler.toml so `wrangler d1 migrations apply`
// works directly. The @cloudflare/vite-plugin merges wrangler.toml into the build
// output, so DB is available in production without duplicating it here.

const { r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const localBindingConfig = {
  name: "command-post",
  main: "./worker/index.ts",
  // global_fetch_strictly_public: the Worker calls the gateway at gtcommand.com
  // (a Cloudflare-proxied zone on this account). Without it, that fetch skips
  // Cloudflare's front door, goes straight to the origin, and fails.
  // cache_option_enabled: server fetches pass cache:'no-store'; before this flag
  // the runtime throws on it, which silently broke reset links and deactivation.
  compatibility_flags: ["nodejs_compat_v2", "enable_weak_ref", "global_fetch_strictly_public", "cache_option_enabled"],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: {
      host: "0.0.0.0",
      allowedHosts: ["terminal.local"],
      ...(isCodexSeatbeltSandbox
        ? { watch: { useFsEvents: false, usePolling: true } }
        : {}),
    },
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        config: localBindingConfig,
      }),
    ],
  };
});
