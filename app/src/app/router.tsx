import { createBrowserRouter } from "react-router";
import { AppShell } from "@/components/layout/app-shell";
import { MENU } from "@/components/layout/menu";
import { Guarda } from "@/features/auth/guarda";
import { Entrar } from "@/features/auth/entrar";
import { Conexoes } from "@/features/conexoes/conexoes";
import { ConfigurarInstagram } from "@/features/conexoes/configurar-instagram";
import { Explorar } from "@/pages/explorar";
import { EmConstrucao } from "@/pages/em-construcao";

const PRONTAS: Record<string, React.ReactNode> = {
  explorar: <Explorar />,
  conexoes: <Conexoes />,
  "conectar-instagram": <ConfigurarInstagram />,
};

export const router = createBrowserRouter([
  { path: "/entrar", element: <Entrar /> },
  {
    element: (
      <Guarda>
        <AppShell />
      </Guarda>
    ),
    children: [
      ...MENU.map((item) =>
        item.caminho === "/"
          ? { index: true, element: PRONTAS[item.id] ?? <EmConstrucao /> }
          : { path: item.caminho.slice(1), element: PRONTAS[item.id] ?? <EmConstrucao /> },
      ),
      { path: "*", element: <EmConstrucao /> },
    ],
  },
]);
