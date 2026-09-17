import { Link } from "react-router-dom";
import { useFleet } from "../fleet/FleetContext.jsx";
import { harModul } from "../fleet/moduler.js";
import { harPerm } from "../fleet/permissions.js";
import { Gitter, Ikon, Kort, Pille } from "../fleet/ui.jsx";

const RESSOURCER = [
  {
    key: "enheder", label: "Enheder", ikon: "lastbil", til: "/ressourcer/enheder",
    moduler: ["flaade", "booking"], perm: "koeretoejer.laes",
    tekst: "Det fælles køretøjs- og maskinregister, som FLEET og PLANNING læser fra.",
    kilde: "koeretoejer",
  },
  {
    key: "ejendomme", label: "Ejendomme", ikon: "bygning", til: "/facility-v2/ejendomme",
    moduler: ["facility"], perm: "facility.skriv",
    tekst: "Ejendomme og anlæg, som FACILITY bruger i den daglige drift.",
    kilde: "FACILITY-register",
  },
  {
    key: "medarbejdere", label: "Medarbejdere", ikon: "personer", til: "/ressourcer/medarbejdere",
    moduler: ["bemanding", "booking"], perm: "personale.laes",
    tekst: "Fælles medarbejderstamdata. Login, roller og følsomme personaledata ligger fortsat separat.",
    kilde: "personale",
  },
  {
    key: "units", label: "Units", ikon: "kasse", til: "/ressourcer/units",
    moduler: ["unitbooking", "warehouse"],
    tekst: "Konkrete bookbare units med stabile ID'er, mål, status og placering.",
    kilde: "kasser",
  },
  {
    key: "varekatalog", label: "Varekatalog", ikon: "vogn", til: "/ressourcer/varekatalog",
    moduler: ["indkoeb", "warehouse"], perm: "indkoeb.laes",
    tekst: "Fælles varedefinitioner til PROCURE og relevante WAREHOUSE-forløb. Warehouses kundegods forbliver en særskilt fysisk datatype.",
    kilde: "forbrugsvarer",
  },
  {
    key: "lagerlokationer", label: "Lagerlokationer", ikon: "stednaal", til: "/ressourcer/lagerlokationer",
    moduler: ["warehouse", "unitbooking"],
    tekst: "Det fælles lokationsregister med QR-opslag og indhold efter gældende adgang.",
    kilde: "reolpladser",
  },
  {
    key: "certifikater", label: "Certifikater", ikon: "skjold", til: "/ressourcer/certifikater",
    moduler: ["bemanding", "flaade"],
    tekst: "Kompetencer, certifikater og udløb uden adgang til løn eller øvrige beskyttede personaledata.",
    kilde: "kompetencer",
  },
];

export function synligeRessourcer({ moduler, perms }) {
  return RESSOURCER.filter((post) => (
    post.moduler.some((modul) => harModul(moduler, modul))
    && (!post.perm || harPerm(perms, post.perm))
  ));
}

export default function Ressourcer() {
  const { bruger, moduler } = useFleet();
  const poster = synligeRessourcer({ moduler, perms: bruger?.perms });
  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <Kort titel="Ressourcer">
        <p className="fc-hint" style={{ marginTop: 0 }}>
          Her vedligeholdes virksomhedens konkrete ressourcer. Kategorier,
          hardware og administrative valgmuligheder ligger under{" "}
          <Link className="fc-a" to="/opsaetning/ressourcer">Opsætning → Ressourcer</Link>.
        </p>
      </Kort>
      <Gitter kolonner="repeat(auto-fit, minmax(270px, 1fr))">
        {poster.map((post) => (
          <Kort key={post.key} titel={(
            <span className="fc-med-ikon"><Ikon navn={post.ikon} />{post.label}</span>
          )} handling={<Link className="fc-a" to={post.til}>Åbn →</Link>}>
            <p>{post.tekst}</p>
            <p className="fc-hint" style={{ marginBottom: 0 }}>
              Autoritativ kilde: <Pille tone="info">{post.kilde}</Pille>
            </p>
          </Kort>
        ))}
      </Gitter>
    </div>
  );
}
