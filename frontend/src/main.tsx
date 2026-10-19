import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./global.css";
import { loadTheme, setTheme, tokensToCss } from "./tokens/theme";
import { tokens } from "./tokens/tokens";

const style = document.createElement("style");
style.textContent = tokensToCss(tokens);
document.head.append(style);
setTheme(loadTheme()); // before first paint, so a dark choice never flashes light

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={new QueryClient()}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
