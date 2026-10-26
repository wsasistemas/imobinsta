import { Bookmark, Heart, MessageCircle, Send, UserPlus } from "lucide-react";

/**
 * Cena da entrada: o objetivo do estúdio numa imagem só.
 * Post da WSA publicado → alguém comenta "QUERO" → a DM automática chega → novos seguidores.
 * Desenhada em HTML/CSS (classes .ins-* em entrada.css), sem foto de terceiros. Dados fictícios.
 */
export function CenaInstagram({ className }: { className?: string }) {
  return (
    <div className={`ins-cena ${className ?? ""}`} aria-hidden="true">
      <div className="ins-base" />

      {/* Reels ao fundo, desfocado */}
      <div className="ins-celular ins-celular--fundo">
        <div className="ins-reel">VOCÊ FAZ O MELHOR DOCE DA CIDADE.</div>
      </div>

      {/* Post da WSA no feed */}
      <div className="ins-celular ins-celular--frente">
        <div className="ins-topo">
          <span className="ins-avatar"><i>WSA</i></span>
          wsasistemas.ia
        </div>
        <div className="ins-post">
          <b>WSA SISTEMAS IA</b>
          <strong>
            Pare de remendar o seu ERP. <em>Lucro real.</em>
          </strong>
          <div className="ins-grade">
            <span /><span /><span /><span /><span /><span />
          </div>
          <div className="ins-cta">COMENTE “QUERO” E RECEBA NO DIRECT</div>
        </div>
        <div className="ins-acoes">
          <Heart fill="#ff375f" color="#ff375f" />
          <MessageCircle />
          <Send />
          <Bookmark style={{ marginLeft: "auto" }} />
        </div>
        <div className="ins-legenda">
          <b>wsasistemas.ia</b> O ecossistema com IA para a sua empresa… <span>#WSASistemas</span>
        </div>
      </div>

      <div className="ins-balao ins-balao--comentario">
        <span className="ins-avatar"><i>AN</i></span>
        <span>
          <b>ana.imoveis</b> QUERO 🔥
          <small>comentou agora</small>
        </span>
      </div>

      <div className="ins-balao ins-balao--dm">
        <span className="ins-ico ins-dm"><Send /></span>
        <span>
          <b>Direct automático</b>
          <small>Te mandei o ecossistema 📩</small>
        </span>
      </div>

      <div className="ins-balao ins-balao--seguidores">
        <span className="ins-ico" style={{ background: "#0a84ff" }}><UserPlus /></span>
        <span>
          <b>+ novos seguidores</b>
          <small>vindos do post de hoje</small>
        </span>
      </div>

      <span className="ins-coracao ins-coracao--1"><Heart fill="currentColor" /></span>
      <span className="ins-coracao ins-coracao--2"><Heart fill="currentColor" /></span>
    </div>
  );
}
