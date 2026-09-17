import { useNavigate } from "react-router-dom";
import { Ikon, Pille, Tabel } from "../fleet/ui.jsx";

/**
 * Fælles indgangsliste for Ressourcer og Opsætning → Ressourcer.
 *
 * Hele rækken er indgangen. Det følger Enheder-katalogets mønster og betyder,
 * at mus, Enter og mellemrum åbner samme mål, mens eventuelle indre knapper
 * fortsat kan have deres egen handling gennem Tabel-komponenten.
 */
export default function RessourceOmraadeTabel({ poster, kildeLabel = "Autoritativ kilde" }) {
  const navigate = useNavigate();

  return (
    <Tabel
      kolonner={[
        {
          key: "label",
          label: "Register",
          render: (post) => (
            <span className="fc-med-ikon">
              <Ikon navn={post.ikon} />
              <b>{post.label}</b>
            </span>
          ),
        },
        { key: "tekst", label: "Indhold" },
        {
          key: "kilde",
          label: kildeLabel,
          render: (post) => <Pille tone="info">{post.kilde}</Pille>,
        },
        {
          key: "aabn",
          label: "",
          render: () => <span className="fc-a" aria-hidden="true">Åbn ›</span>,
        },
      ]}
      raekker={poster}
      noegle={(post) => post.key}
      paaRaekke={(post) => navigate(post.til)}
      tom="Der er ingen ressourceregistre tilgængelige for denne bruger."
    />
  );
}
