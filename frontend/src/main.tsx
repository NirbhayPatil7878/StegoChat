import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";
import App from "./App";
import { applyTheme, useThemeStore } from "./store/theme";
import "./styles/index.css";

// Apply persisted theme on boot.
const { theme, accent } = useThemeStore.getState();
applyTheme(theme, accent);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <Toaster
          position="top-right"
          theme="dark"
          toastOptions={{
            style: {
              background: "rgb(var(--surface))",
              border: "1px solid rgb(var(--border))",
              color: "rgb(var(--content))",
            },
          }}
        />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
