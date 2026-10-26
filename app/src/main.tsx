import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AcessoProvider } from "@/features/auth/acesso";
import { router } from "@/app/router";
import "@/styles/index.css";

// Aplica o tema salvo antes do primeiro render (evita piscar claro/escuro).
try {
  document.documentElement.dataset.theme = localStorage.getItem("imobinsta-tema") === "light" ? "light" : "dark";
} catch {
  document.documentElement.dataset.theme = "dark";
}

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AcessoProvider>
        <RouterProvider router={router} />
      </AcessoProvider>
    </QueryClientProvider>
  </StrictMode>,
);
