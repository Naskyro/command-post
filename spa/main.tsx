import { createRoot } from "react-dom/client";
import CommandPost from "@/app/page";
import WorkspaceTheme from "@/components/preferences/WorkspaceTheme";
import { installDemoFetch } from "./demo-data";
import "@/app/globals.css";

// Demo shell: /api/session + /api/finance + /api/accounts?surface=orders are
// answered with static data so the workspace renders without a backend.
installDemoFetch();

createRoot(document.getElementById("root")!).render(
  <WorkspaceTheme>
    <CommandPost />
  </WorkspaceTheme>,
);
