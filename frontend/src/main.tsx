import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./global.css";
import { setTheme, tokensToCss } from "./tokens/theme";
import { tokens } from "./tokens/tokens";

const style = document.createElement("style");
style.textContent = tokensToCss(tokens);
document.head.append(style);
setTheme("light");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={new QueryClient()}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
