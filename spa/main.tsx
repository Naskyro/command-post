import { createRoot } from "react-dom/client";
import CommandPost from "@/app/page";
import WorkspaceTheme from "@/components/preferences/WorkspaceTheme";
import type { Viewer } from "@/lib/finance/model";
import "@/app/globals.css";

// Demo shell: /api/session has no backend here, so answer it with an owner
// viewer — renders the full workspace without a sign-in round-trip.
const demoViewer: Viewer = {
  id: "demo",
  name: "Demo Manager",
  email: "demo@galindostowing.example",
  person: "jerson",
  role: "Owner",
  department: "Operations",
  owner: true,
  canManage: true,
  canRelease: true,
};

const realFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.replace(/^https?:\/\/[^/]+/, "").startsWith("/api/session")) {
    return Promise.resolve(new Response(JSON.stringify({ viewer: demoViewer }), {
      status: 200, headers: { "Content-Type": "application/json" },
    }));
  }
  return realFetch(input, init);
};

createRoot(document.getElementById("root")!).render(
  <WorkspaceTheme>
    <CommandPost />
  </WorkspaceTheme>,
);
