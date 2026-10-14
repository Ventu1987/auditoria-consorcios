import type { ReactNode } from "react";
import type { Sev } from "../domain/types";
import { htmlSeguro } from "../domain/format";

export const Chip = ({ s, children, dot }: { s: Sev; children: ReactNode; dot?: boolean }) => (
  <span className={`chip ${s}`}>{dot && <i className={`dot ${s}`} />}{children}</span>
);
export const Dot = ({ s, style }: { s: Sev; style?: React.CSSProperties }) => <i className={`dot ${s}`} style={style} aria-hidden="true" />;

export const Kpi = ({ k, v, s }: { k: ReactNode; v: ReactNode; s?: ReactNode }) => (
  <div className="kpi"><span className="k">{k}</span><span className="v">{v}</span>{s && <span className="s">{s}</span>}</div>
);

/** Recuadro "En simple": la explicación para cualquier propietario. */
export const Simple = ({ children, tag = "En simple", warn }: { children: ReactNode; tag?: string; warn?: boolean }) => (
  <div className={`simple${warn ? " warnbox" : ""}`}><b className="tag">{tag}</b>{typeof children === "string" ? <p>{children}</p> : children}</div>
);

export const Card = ({ title, aside, children, className = "", id }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string; id?: string }) => (
  <section className={`card ${className}`} id={id}>
    {(title || aside) && <div className="head">{typeof title === "string" ? <h2>{title}</h2> : title}{aside && (typeof aside === "string" ? <span className="small muted">{aside}</span> : aside)}</div>}
    {children}
  </section>
);

export const Hero = ({ eyebrow, title, lead, children }: { eyebrow: ReactNode; title: ReactNode; lead?: ReactNode; children?: ReactNode }) => (
  <section className="hero"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{lead && <p className="lead">{lead}</p>}{children}</section>
);

/** Texto del motor de auditoría (solo admite negrita). */
export const Rich = ({ html, as = "span", className }: { html: string; as?: "span" | "p"; className?: string }) => {
  const T = as;
  return <T className={className} dangerouslySetInnerHTML={{ __html: htmlSeguro(html) }} />;
};

export const Foot = ({ children }: { children: ReactNode }) => <p className="foot">{children}</p>;

export function Dialog({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="overlay" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`dialog${wide ? " wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="head"><h2>{title}</h2><button className="btn ghost sm" type="button" onClick={onClose} aria-label="Cerrar">Cerrar</button></div>
        {children}
      </div>
    </div>
  );
}

export const Empty = ({ children }: { children: ReactNode }) => <div className="card empty">{children}</div>;

/** Agrupa un número de severidad en etiqueta de estado del semáforo. */
export const sevColor: Record<Sev, string> = { ok: "var(--ok)", warn: "var(--warn)", bad: "var(--bad)", nd: "var(--faint)", new: "var(--accent)" };
