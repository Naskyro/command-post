import { createRoot } from "react-dom/client";
import CommandPost from "@/app/page";
import WorkspaceTheme from "@/components/preferences/WorkspaceTheme";
import "@/app/globals.css";

createRoot(document.getElementById("root")!).render(
  <WorkspaceTheme>
    <CommandPost />
  </WorkspaceTheme>,
);
