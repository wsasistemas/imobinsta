import { createBrowserRouter } from "react-router";
import { AppShell } from "@/components/layout/app-shell";
import { MENU } from "@/components/layout/menu";
import { Guarda } from "@/features/auth/guarda";
import { Entrar } from "@/features/auth/entrar";
import { Conexoes } from "@/features/conexoes/conexoes";
import { ConfigurarInstagram } from "@/features/conexoes/configurar-instagram";
import { Analytics } from "@/features/instagram/analytics";
import { Automacoes } from "@/features/automacoes/automacoes";
import { Calendario } from "@/features/calendario/calendario";
import { MeusAvatares } from "@/features/avatares/avatares";
import { MarcaDna } from "@/features/marca/marca";
import { Campanhas } from "@/features/marca/campanhas";
import { VideoAvatar } from "@/features/criar/avatar";
import { Biblioteca } from "@/features/instagram/biblioteca";
import { BancoDeMidias } from "@/features/midias/midias";
import { Criar } from "@/features/criar/criar";
import { Editor } from "@/features/criar/editor";
import { Publicar } from "@/features/criar/publicar";
import { IaImagem } from "@/features/criar/ia-imagem";
import { PostComFotos } from "@/features/criar/fotos";
import { WizardImagem } from "@/features/criar/wizard";
import { Explorar } from "@/pages/explorar";
import { EmConstrucao } from "@/pages/em-construcao";

const PRONTAS: Record<string, React.ReactNode> = {
  explorar: <Explorar />,
  conexoes: <Conexoes />,
  "conectar-instagram": <ConfigurarInstagram />,
  biblioteca: <Biblioteca />,
  analytics: <Analytics />,
  midias: <BancoDeMidias />,
  criar: <Criar />,
  "criar-imagem": <WizardImagem />,
  automacoes: <Automacoes />,
  calendario: <Calendario />,
  avatares: <MeusAvatares />,
  marca: <MarcaDna />,
  campanhas: <Campanhas />,
  "criar-avatar": <VideoAvatar />,
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
      { path: "criar/editor/:id", element: <Editor /> },
      { path: "criar/publicar/:id", element: <Publicar /> },
      { path: "criar/ia-imagem", element: <IaImagem /> },
      { path: "criar/fotos", element: <PostComFotos /> },
      { path: "*", element: <EmConstrucao /> },
    ],
  },
]);
