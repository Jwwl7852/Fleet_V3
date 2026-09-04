/* src/moduler/flaade/Kontakter.jsx
 * Fleet → Kontakter — masterbrief §9.11 (produktejer-review 2026-09-01):
 * "Kompakt Fleet-kontaktbog baseret på eksisterende masterdata: værksteder,
 * leverandører, chauffører og relevante medarbejdere. Ingen parallel
 * kontaktdatabase."
 *
 * ⚠ RENT NY VISNING, INGEN NY DATAMODEL. Begge lister er data appen allerede
 * har: `personale` (samme node Bemanding/Medarbejdere bruger) og
 * `leverandoerer` (samme node Procure og Planlaegdialog bruger, her filtreret
 * til de kategorier der reelt er relevante for Fleet — værksted og dæk,
 * samme filter som Planlaegdialog.jsx's "Udføres af"-vælger). En parallel
 * kontaktbog med sin egen node ville være den samme kendsgerning to steder —
 * netop det kravet selv advarer imod.
 */
import { useState } from "react";
import { useListe } from "../../fleet/useListe.js";
import { Kort, Tabel, ModulNav } from "../../fleet/ui.jsx";
import { FLEET_FANER } from "../../fleet/modulfaner.js";
import { DEMO_PERSONALE } from "../../fleet/demo-personale.js";
import { DEMO_LEVERANDOERER } from "../../fleet/demo-indkoeb.js";

export default function Kontakter() {
  const [soeg, setSoeg] = useState("");

  const personale = useListe("personale", {
    vindue: "alle", graense: 500, demo: DEMO_PERSONALE,
  });
  const leverandoerer = useListe("leverandoerer", {
    ordnPaa: "navn", vindue: "alle", graense: 500, demo: DEMO_LEVERANDOERER,
  });

  const s = soeg.trim().toLowerCase();
  const matcher = (tekst) => !s || String(tekst || "").toLowerCase().includes(s);

  const chauffoerer = personale.data
    .filter((p) => p.funktioner?.chauffoer && p.status === "aktiv")
    .filter((p) => matcher(p.navn) || matcher(p.telefon) || matcher(p.email))
    .sort((a, b) => (a.navn || "").localeCompare(b.navn || ""));

  /* ⚠ SAMME FILTER SOM Planlaegdialog.jsx's "Udføres af"-vælger — det er
     præcis de leverandører en Fleet-disponent reelt ringer til. Et bredere
     filter ville blande Procures kontorartikel-leverandører ind i en
     kontaktbog der handler om at få en bil repareret. */
  const vaerksteder = leverandoerer.data
    .filter((l) => l.kategori === "vaerksted" || l.kategori === "daek")
    .filter((l) => l.aktiv !== false)
    .filter((l) => matcher(l.navn) || matcher(l.kontaktperson)
      || matcher(l.kontaktTelefon) || matcher(l.kontaktEmail))
    .sort((a, b) => (a.navn || "").localeCompare(b.navn || ""));

  return (
    <div className="fc-grid" style={{ gap: 11 }}>
      <ModulNav punkter={FLEET_FANER} />

      <Kort titel="Søg">
        <input
          type="search" value={soeg} onChange={(e) => setSoeg(e.target.value)}
          placeholder="Navn, telefon eller e-mail…" aria-label="Søg i kontakter"
          style={{
            width: "100%", padding: "8px 10px", borderRadius: "var(--fc-r)",
            border: "1px solid var(--bc-line)", background: "var(--bc-card)",
            color: "inherit", font: "inherit",
          }}
        />
      </Kort>

      <Kort titel={`Chauffører (${chauffoerer.length})`}>
        <Tabel
          kolonner={[
            { key: "navn", label: "Navn", render: (p) => <b>{p.navn}</b> },
            { key: "telefon", label: "Telefon", render: (p) => (
                p.telefon ? <a className="fc-a" href={`tel:${p.telefon}`}>{p.telefon}</a> : "—") },
            { key: "email", label: "E-mail", render: (p) => (
                p.email ? <a className="fc-a" href={`mailto:${p.email}`}>{p.email}</a> : "—") },
          ]}
          raekker={chauffoerer}
          noegle={(p) => p.id}
          tom="Ingen aktive chauffører matcher søgningen."
        />
      </Kort>

      <Kort titel={`Værksteder & dækcentre (${vaerksteder.length})`}>
        <Tabel
          kolonner={[
            { key: "navn", label: "Navn", render: (l) => <b>{l.navn}</b> },
            { key: "kontaktperson", label: "Kontakt", render: (l) => l.kontaktperson || "—" },
            { key: "kontaktTelefon", label: "Telefon", render: (l) => (
                l.kontaktTelefon
                  ? <a className="fc-a" href={`tel:${l.kontaktTelefon}`}>{l.kontaktTelefon}</a>
                  : "—") },
            { key: "kontaktEmail", label: "E-mail", render: (l) => (
                l.kontaktEmail
                  ? <a className="fc-a" href={`mailto:${l.kontaktEmail}`}>{l.kontaktEmail}</a>
                  : "—") },
          ]}
          raekker={vaerksteder}
          noegle={(l) => l.id}
          tom="Ingen aktive værksteder eller dækcentre matcher søgningen."
        />
      </Kort>

      <p className="fc-hint">
        Kartoteket vedligeholdes i Administration → Leverandører og
        Opsætning → Medarbejdere — denne fane er en <b>samlet linse</b> på
        den samme masterdata, ikke en egen kontaktdatabase.
      </p>
    </div>
  );
}
