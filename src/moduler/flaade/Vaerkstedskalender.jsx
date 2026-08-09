/* src/moduler/flaade/Vaerkstedskalender.jsx
 * Flåde – service, reservationer & fakturaer
 *
 * SKELET. Mockup findes — kalenderen og fakturaformularen er ikke bygget.
 * Sagsbaseret mail (beslutning 20) er bygget som VISNING, se nedenfor.
 *
 * SAMMENLAGT af to mockups ('Flåde – service, reservationer & fakturaer' og
 * 'Flådeopsætning & værkstedskalender'). De havde hver sin fakturaformular med
 * næsten samme felter — to steder at uploade samme faktura.
 *
 * Værkstedsbesøg skal skrive en reservation med kilde 'vaerksted', som har
 * HØJERE prioritet end booking: en bil på værksted kan ikke køre, uanset hvad
 * disponenten har lovet. Det er 'Bookingblokeringer'-kortet i mockuppen.
 *
 * Fakturabeløb gemmes ekskl. moms + momsOere separat. Mockuppen viste inkl.
 *
 * BESLUTNING 20 — fase 0: sagsvisningen med faner og en demo-tråd.
 * VISNING, INGEN AFSENDELSE. Der er ingen modtagevej, ingen parsing og ingen
 * Cloud Function endnu. Sagen kommer fra demo-sag.js, som har nodens form —
 * skærmen skal ikke laves om, når der ligger rigtige data.
 *
 * Den aftale der står på sagen (18-08-2026 kl. 08.00) er IKKE en reservation
 * endnu. Den bliver det først, når en Cloud Function skriver den med kilde
 * 'vaerksted' og prioritet 40 — og først efter et menneske har bekræftet
 * tidspunktet. Se sager.js/reservationFraAftale().
 */
import { useState } from "react";
import { useKpi } from "../../fleet/useKpi.js";
import { num, datoTid } from "../../fleet/format.js";
import { Kort, Tom, KpiKort, KpiRaekke, Tabel, Pille, Knap } from "../../fleet/ui.jsx";
import { Henter, Fejl } from "../../fleet/ui.jsx";
import Sagsvisning from "../../fleet/Sagsvisning.jsx";
import { SAG_TILSTAND } from "../../fleet/sager.js";
import { demoSagerFor } from "../../fleet/demo-sag.js";

export default function Vaerkstedskalender() {
  const { kpi: k, henter, fejl, genindlaes } = useKpi();

  /* Sagerne er endnu demo-data. Når noden findes, hentes general-delen med
     useListe() — beskederne ligger i sensitive/ og hentes først når en sag
     åbnes. En liste må aldrig trække brødtekst med. */
  const sager = demoSagerFor("flaade");
  const [valgt, setValgt] = useState(sager[0]?.id ?? null);
  const sag = sager.find((s) => s.id === valgt) || null;

  if (henter) return <Henter hvad="nøgletal" />;
  if (!k) return <Fejl genprov={genindlaes}>Nøgletallene kunne ikke hentes.</Fejl>;

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <KpiRaekke>
        <KpiKort label="Aktive køretøjer" vaerdi={num(k.flaade.aktive)} />
        <KpiKort label="Reserveret til værksted" vaerdi={num(k.flaade.paaVaerksted)} />
        <KpiKort label="Service inden 30 dage" vaerdi={num(k.flaade.serviceInden30)} />
        {/* ⚠ HÅRDKODET. flaade.ikkeLinkedeFakturaer findes ikke i kpi/ endnu,
            og det her er derfor beslutning 6 brudt — tallet kan modsige Indkøb
            uden at nogen ser det. Står på KPI-efterslæbet i README sammen med
            bemanding.medarbejdereAktive og bemanding.ledig. Erstat med
            k.flaade.ikkeLinkedeFakturaer, når aggregeringen skrives. */}
        <KpiKort label="Ikke-linkede fakturaer" vaerdi={num(5)} />
      </KpiRaekke>
      {fejl && <Fejl genprov={genindlaes}>Viser demo-data — ingen forbindelse til databasen.</Fejl>}

      <Kort titel="Værkstedssager">
        <Tabel
          kolonner={[
            { key: "nummer", label: "Sagsnr.", render: (r) => <b>{r.nummer}</b> },
            { key: "emne", label: "Emne" },
            { key: "objektLabel", label: "Køretøj" },
            { key: "modpartNavn", label: "Værksted" },
            {
              key: "harAftale", label: "Aftale",
              /* Tallet kommer fra general-delen. Sætningen aftalen blev læst
                 ud af, ligger i sensitive/ og hentes ikke til en liste. */
              render: (r) => (r.harAftale ? datoTid(r.aftaleFraMs) : <span className="fc-neutral">—</span>),
            },
            {
              key: "antalKarantaene", label: "Karantæne", num: true,
              render: (r) => (r.antalKarantaene > 0
                ? <Pille tone="bad">{r.antalKarantaene}</Pille>
                : <span className="fc-neutral">0</span>),
            },
            {
              key: "tilstand", label: "Status",
              render: (r) => <Pille tone={SAG_TILSTAND[r.tilstand]?.pill}>{SAG_TILSTAND[r.tilstand]?.label}</Pille>,
            },
            {
              key: "aabn", label: "",
              render: (r) => (
                <Knap onClick={() => setValgt(r.id)} disabled={r.id === valgt}>
                  {r.id === valgt ? "Vist" : "Åbn"}
                </Knap>
              ),
            },
          ]}
          raekker={sager}
          tom="Ingen værkstedssager."
        />
        <p className="fc-hint" style={{ marginTop: 12 }}>
          Sagsnummeret sættes i emnefeltet, når der sendes mail til værkstedet.
          Værkstedet svarer normalt i Outlook, og <b>Re:</b> bevarer nummeret.
          Ingen integration hos modtageren.
        </p>
      </Kort>

      {sag ? (
        <Kort>
          <Sagsvisning sag={sag} />
        </Kort>
      ) : (
        <Kort titel="Sag">
          <Tom>Vælg en sag i listen ovenfor.</Tom>
        </Kort>
      )}

      <Kort titel="Værkstedskalender, reservationer & fakturaer">
        <Tom>
          Kalenderen, bookingblokeringerne og fakturaformularen er ikke bygget
          endnu. Nøgletallene ovenfor kommer fra den fælles KPI-node, så de
          matcher Dashboard.
        </Tom>
      </Kort>
    </div>
  );
}
