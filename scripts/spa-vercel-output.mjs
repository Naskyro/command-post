// Emit Vercel Build Output API layout from the static SPA build so the deploy
// bypasses the auto-detected Next.js preset (which requires routes-manifest).
import { cp, mkdir, rm, writeFile } from "node:fs/promises";

const out = new URL("../.vercel/output/", import.meta.url);
const dist = new URL("../dist-spa/", import.meta.url);

await rm(out, { recursive: true, force: true });
await mkdir(new URL("static/", out), { recursive: true });
await cp(dist, new URL("static/", out), { recursive: true });
await writeFile(
  new URL("config.json", out),
  JSON.stringify({
    version: 3,
    routes: [{ handle: "filesystem" }, { src: "/(.*)", dest: "/index.html" }],
  }),
);
