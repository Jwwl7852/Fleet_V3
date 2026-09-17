import { useFleet } from "../fleet/FleetContext.jsx";
import { harModul } from "../fleet/moduler.js";
import { harPerm } from "../fleet/permissions.js";
import RessourceOmraadeTabel from "./RessourceOmraadeTabel.jsx";
import { RessourceRegister, RessourceSide } from "./RessourceLayout.jsx";

const RESSOURCER = [
  {
    key: "enheder", label: "Enheder", ikon: "lastbil", til: "/ressourcer/enheder",
    moduler: ["flaade", "booking"], perm: "koeretoejer.laes",
    tekst: "Køretøjer, maskiner og udstyr til drift og planlægning.",
  },
  {
    key: "ejendomme", label: "Ejendomme", ikon: "bygning", til: "/facility-v2/ejendomme",
    moduler: ["facility"], perm: "facility.skriv",
    tekst: "Ejendomme og anlæg med installationer og åbne opgaver.",
  },
  {
    key: "medarbejdere", label: "Medarbejdere", ikon: "personer", til: "/ressourcer/medarbejdere",
    moduler: ["bemanding", "booking"], perm: "personale.laes",
    tekst: "Medarbejdere, funktioner, afdelinger og kontaktoplysninger.",
  },
  {
    key: "units", label: "Units", ikon: "kasse", til: "/ressourcer/units",
    moduler: ["unitbooking", "warehouse"],
    tekst: "Bookbare units med type, status, mål og placering.",
  },
  {
    key: "varekatalog", label: "Varekatalog", ikon: "vogn", til: "/ressourcer/varekatalog",
    moduler: ["indkoeb", "warehouse"], perm: "indkoeb.laes",
    tekst: "Varer, leverandører, pakninger og aftalepriser.",
  },
  {
    key: "lagerlokationer", label: "Lagerlokationer", ikon: "stednaal", til: "/ressourcer/lagerlokationer",
    moduler: ["warehouse", "unitbooking"],
    tekst: "Lagerpladser, zoner og aktuelt indhold.",
  },
  {
    key: "certifikater", label: "Certifikater", ikon: "skjold", til: "/ressourcer/certifikater",
    moduler: ["bemanding", "flaade"],
    tekst: "Medarbejdercertifikater, gyldighed og kommende udløb.",
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
    <RessourceSide titel="Ressourcer">
      <RessourceRegister>
        <RessourceOmraadeTabel poster={poster} visKilde={false} />
      </RessourceRegister>
    </RessourceSide>
  );
}
