/* src/moduler/warehouse/Lokationer.jsx
 * Warehouse – lokationer: zoner, hylder, belægning og status.
 *
 * ⚠ DET ER DEN SAMME NODE SOM TURTLEBOOKINGS REOLPLADSER. `reolpladser` blev
 * UDVIDET frem for kopieret, fordi transportkasser og kundegods står på de
 * samme hylder. To reolnoder ville betyde at "Hal 1 · Reol 2" fandtes to
 * steder der kunne blive uenige, og at en vognmand med begge moduler
 * vedligeholdt sit lager to gange.
 *
 * ⚠ DERFOR SKRIVER SKÆRMEN MED `flet: true`. Den rører kun de fire felter den
 * ejer (zone, type, status, temperatur) plus adressen. Med en hel skrivning
 * ville den slette det Turtlebooking havde sat — og omvendt. Se noten ved
 * `flet` i skriv.js.
 *
 * ⚠ BELÆGNINGEN ER UDLEDT. Den regnes af det der står på pladsen; der findes
 * ikke et gemt belægningstal. Et gemt tal ville drive fra posterne, og en
 * hylde der ser fri ud men ikke er det, sender nogen op ad stigen forgæves.
 *
 * ⚠ OG DEN TÆLLER NU TRE KILDER: beholdningsposter, transportkasser og
 * carriers. Skærmen talte før kun beholdningen og var dermed allerede blind
 * for Turtlebookings kasser på de samme hylder; med carrieren ville den være
 * blind for to ting. Opgørelsen ligger i `belaegningPrPlads()` —
 * ét sted, fordi to opgørelser af samme hylde bliver uenige uden at nogen
 * kan se det.
 *
 * ⚠ `kasser` LÆSES KUN HVIS TENANTEN HAR TURTLEBOOKING. Noden er spærret af
 * det modul, og en forespørgsel ville give `permission-denied` hos en kunde
 * der kun har Warehouse. Den tomme liste er dér det rigtige svar: der ER
 * ingen kasser. Se `hent` i useListe.js.
 */
import { useState } from "react";
import { useListe } from "../../fleet/useListe.js";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { num } from "../../fleet/format.js";
import { harPerm, PERM } from "../../fleet/permissions.js";
import {
  Kort, Tabel, Pille, Knap, Felt, Feltraekke, Formular,
  Henter, Datatilstand, Tom, Ikon, Sider, KpiKort, KpiRaekke,
} from "../../fleet/ui.jsx";
import { pladsnavn, haller, valideReolplads } from "../../fleet/turtlebooking.js";
import {
  PLADS_TYPE, ALLE_PLADS_TYPER, PLADS_STATUS, ALLE_PLADS_STATUS,
  kanPlukkesFra, valideLagerfelter, talFraMaengde, beholdningPaaPlads,
} from "../../fleet/warehouse.js";
import { belaegningPrPlads } from "../../fleet/reolplads.js";
import { harModul } from "../../fleet/moduler.js";
import { gem, nyId } from "../../fleet/skriv.js";
import { AUDIT } from "../../fleet/audit.js";
import {
  DEMO_REOLPLADSER, DEMO_VARER, DEMO_BEHOLDNING, DEMO_CARRIERS,
} from "../../fleet/demo-lager.js";
import { DEMO_KASSER } from "../../fleet/demo-turtlebooking.js";

const PR_SIDE = 14;

const tomPlads = () => ({
  hal: "", reol: "", fag: "", hylde: "", plads: "",
  zone: "", type: "hylde", status: "aktiv", temperatur: "",
});

function Lokationsformular({ plads, haller: kendteHaller, sti, paaGemt, paaLuk }) {
  const nyt = !plads;
  const [f, saetF] = useState(() => (plads ? { ...tomPlads(), ...plads } : tomPlads()));
  const [roert, saetRoert] = useState({});
  const [visAlle, saetVisAlle] = useState(false);
  const [gemmer, saetGemmer] = useState(false);
  const [svar, saetSvar] = useState(null);

  const saet = (felt) => (v) => {
    saetF((x) => ({ ...x, [felt]: v }));
    saetRoert((x) => ({ ...x, [felt]: true }));
    saetSvar(null);
  };

  const temp = f.temperatur === "" ? null : Number(f.temperatur);
  /* To valideringer, fordi noden har to ejere: adressen er Turtlebookings,
     lagerfelterne er Warehouses. Begge skal passere. */
  const fejl = {
    ...valideReolplads(f),
    ...valideLagerfelter({ ...f, temperatur: temp ?? undefined }),
  };
  const vis = (felt) => (visAlle || roert[felt] ? fejl[felt] : null);
  const kanGemme = Object.keys(fejl).length === 0;

  const gemNu = async () => {
    saetVisAlle(true);
    if (!kanGemme) return;
    saetGemmer(true);
    const id = plads?.id || nyId("p");
    const r = await gem({
      sti: sti(`reolpladser/${id}`),
      data: {
        hal: f.hal.trim(), reol: String(f.reol).trim(), fag: String(f.fag).trim(),
        hylde: String(f.hylde).trim(), plads: String(f.plads).trim(),
        zone: f.zone?.trim() || null,
        type: f.type || null,
        status: f.status || null,
        temperatur: Number.isFinite(temp) ? temp : null,
      },
      /* ⚠ FLET. Noden deles; se hovedet. */
      flet: true,
      foer: plads || null, objekt: "reolpladser", objektId: id,
      handling: nyt ? AUDIT.opret : AUDIT.aendre,
    });
    saetGemmer(false);
    saetSvar(r);
    if (r.ok) paaGemt();
  };

  return (
    <Kort titel={nyt ? "Ny lokation" : `Redigér ${pladsnavn(plads)}`}>
      <Formular onGem={gemNu} gemmer={gemmer} kanGemme={kanGemme}
                gemLabel={nyt ? "Opret lokation" : "Gem ændringer"}
                onAnnuller={paaLuk} svar={svar}>
        <Feltraekke>
          {/* ⚠ `hal` ER LAGERET. Der findes ikke et lagerId ved siden af —
              listen af lagre udledes af pladserne, som haller() gør det. Et
              felt der kan udledes, skal ikke gemmes. */}
          <Felt id="l-hal" label="Lager / hal" kraevet vaerdi={f.hal}
                saet={saet("hal")} fejl={vis("hal")}
                hint={kendteHaller.length
                  ? `Findes: ${kendteHaller.join(", ")}`
                  : "Fx Hovedlager."} />
          <Felt id="l-zone" label="Zone" vaerdi={f.zone} saet={saet("zone")}
                fejl={vis("zone")}
                hint="Fx Modtagelse, Pluk, Bulk. Valgfri." />
          <Felt id="l-type" label="Type" vaerdi={f.type} saet={saet("type")}
                fejl={vis("type")}
                valgmuligheder={ALLE_PLADS_TYPER.map((t) => ({
                  vaerdi: t, label: PLADS_TYPE[t].label,
                }))} />
        </Feltraekke>

        <Feltraekke>
          <Felt id="l-reol" label="Reol" kraevet vaerdi={f.reol} saet={saet("reol")}
                fejl={vis("reol")} />
          <Felt id="l-fag" label="Fag" kraevet vaerdi={f.fag} saet={saet("fag")}
                fejl={vis("fag")} />
          <Felt id="l-hylde" label="Hylde / niveau" kraevet vaerdi={f.hylde}
                saet={saet("hylde")} fejl={vis("hylde")} />
          <Felt id="l-plads" label="Plads" kraevet vaerdi={f.plads}
                saet={saet("plads")} fejl={vis("plads")} />
        </Feltraekke>

        <Feltraekke>
          <Felt id="l-status" label="Status" vaerdi={f.status} saet={saet("status")}
                fejl={vis("status")}
                valgmuligheder={ALLE_PLADS_STATUS.map((s) => ({
                  vaerdi: s, label: PLADS_STATUS[s].label,
                }))}
                hint="Karantæne og lukket blokerer pluk — de advarer ikke." />
          <Felt id="l-temp" label="Temperatur" type="number" suffiks="°C"
                vaerdi={f.temperatur} saet={saet("temperatur")} fejl={vis("temperatur")}
                hint="Valgfri. Til køle- og frysevarer." />
        </Feltraekke>

        {!kanPlukkesFra({ status: f.status }) && (
          <p className="fc-hint">
            ⚠ En <b>{PLADS_STATUS[f.status]?.label.toLowerCase()}</b> plads kan
            der ikke plukkes fra. Varerne dér tælles stadig med i beholdningen —
            de er bare ikke til rådighed.
          </p>
        )}

        <p className="fc-hint">
          ⚠ <b>Den her lokation deles med Turtlebooking.</b> Skærmen skriver kun
          de felter den ejer, så en rettelse her ikke sletter noget derovre — og
          omvendt.
        </p>
      </Formular>
    </Kort>
  );
}

export default function Lokationer() {
  const { path, bruger, moduler } = useFleet();
  const [ny, saetNy] = useState(false);
  const [redigerer, saetRedigerer] = useState(null);
  const [soeg, saetSoeg] = useState("");
  const [zone, saetZone] = useState("");
  const [status, saetStatus] = useState("");
  const [side, saetSide] = useState(1);

  const maaSkrive = harPerm(bruger?.perms, PERM.reolpladserSkriv);

  const { data: pladser, tilstand, genindlaes, henter } = useListe("reolpladser", {
    division: "alle", graense: 2000, demo: DEMO_REOLPLADSER,
    sorter: (a, b) => pladsnavn(a).localeCompare(pladsnavn(b), "da"),
  });
  const { data: beholdning } = useListe("beholdning", {
    division: "alle", graense: 5000, demo: DEMO_BEHOLDNING,
  });
  const { data: varer } = useListe("varer", {
    division: "alle", graense: 2000, demo: DEMO_VARER,
  });
  const { data: carriers } = useListe("carriers", {
    division: "alle", graense: 2000, demo: DEMO_CARRIERS,
  });
  /* ⚠ KUN HVIS TENANTEN HAR TURTLEBOOKING. Se noten i hovedet: uden modulet
     findes noden ikke, og svaret ville være en afvisning frem for et tomt
     lager. */
  const { data: kasser } = useListe("kasser", {
    division: "alle", graense: 2000, demo: DEMO_KASSER,
    hent: harModul(moduler, "turtlebooking"),
  });

  if (henter) return <Henter hvad="lokationerne" />;

  const vareNr = (id) => varer.find((v) => v.id === id)?.varenummer || id;
  const kendteHaller = haller(Object.fromEntries(pladser.map((p) => [p.id, p])));
  const zoner = [...new Set(pladser.map((p) => p.zone).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "da"));

  /* ⚠ UDLEDT. Der findes ikke et gemt belægningstal, og der skal ikke komme
     et. `paaPlads` er varelinjerne — det er dem "Indhold" viser. */
  const paaPlads = (id) => beholdningPaaPlads(beholdning, id);

  /* ⚠ OG DET ER HER HYLDEN FÅR ÉN SANDHED. Beholdning, kasser og carriers
     opgøres samme sted, i ét gennemløb pr. kilde. Talte skærmen selv, ville
     den næste skærm tælle lidt anderledes — og de to ville aldrig kunne
     opdage at de var uenige. */
  const belaeg = belaegningPrPlads({ beholdning, kasser, carriers });
  const paaPladsIalt = (id) => belaeg[id]?.ialt || 0;
  const beholdere = (id) => (belaeg[id]?.kasser || 0) + (belaeg[id]?.carriers || 0);

  const q = soeg.trim().toLowerCase();
  const viste = pladser.filter((p) =>
    (!zone || p.zone === zone) &&
    (!status || (p.status || "aktiv") === status) &&
    (!q || pladsnavn(p).toLowerCase().includes(q) ||
      (p.zone || "").toLowerCase().includes(q)));

  const sider = Math.max(1, Math.ceil(viste.length / PR_SIDE));
  const nuSide = Math.min(side, sider);
  const paaSiden = viste.slice((nuSide - 1) * PR_SIDE, nuSide * PR_SIDE);

  const optagne = pladser.filter((p) => paaPladsIalt(p.id) > 0).length;
  const spaerrede = pladser.filter((p) => !kanPlukkesFra(p)).length;

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <KpiRaekke>
        <KpiKort label="Lokationer" vaerdi={num(pladser.length)}
                 ikon={<Ikon navn="bygning" />} tone="ikon-5" rund
                 note={`i ${num(kendteHaller.length)} lagre`} />
        {/* ⚠ "OPTAGET" OG IKKE "MED VARER PÅ". Kortet talte før kun
            beholdningen, og en hylde med en transportkasse på stod som fri.
            Nu tæller det alt tre kilder — se noten i hovedet. */}
        <KpiKort label="Optaget" vaerdi={num(optagne)}
                 note={pladser.length
                   ? `${Math.round((optagne / pladser.length) * 100)} % af pladserne`
                   : "ingen pladser endnu"} />
        <KpiKort label="Frie" vaerdi={num(pladser.length - optagne)}
                 note="hverken varer, kasser eller carriers" />
        {/* ⚠ SPÆRREDE SKAL STÅ FOR SIG. En hylde i karantæne ser fri ud i en
            belægningsopgørelse, men der må ikke plukkes fra den. */}
        <KpiKort label="Spærrede" vaerdi={num(spaerrede)}
                 note="karantæne eller lukket — der kan ikke plukkes" />
      </KpiRaekke>

      <Datatilstand tilstand={tilstand} genprov={genindlaes} />

      {ny && (
        <Lokationsformular haller={kendteHaller} sti={path}
                           paaLuk={() => saetNy(false)}
                           paaGemt={() => { saetNy(false); genindlaes(); }} />
      )}
      {redigerer && (
        <Lokationsformular plads={redigerer} haller={kendteHaller} sti={path}
                           paaLuk={() => saetRedigerer(null)}
                           paaGemt={() => { saetRedigerer(null); genindlaes(); }} />
      )}

      <Kort
        titel={`Lokationer (${num(viste.length)} af ${num(pladser.length)})`}
        handling={
          <Knap variant="primaer" disabled={!maaSkrive}
                onClick={() => saetNy(true)}
                title={maaSkrive ? "Opret en lokation."
                  : `Kræver ${PERM.reolpladserSkriv} — reglerne afviser.`}>
            Ny lokation
          </Knap>
        }
      >
        <div className="fc-filtre">
          <div className="fc-felt">
            <label htmlFor="lf-soeg">Søg</label>
            <input id="lf-soeg" type="search" value={soeg}
                   placeholder="Lokation eller zone"
                   onChange={(e) => { saetSoeg(e.target.value); saetSide(1); }} />
          </div>
          <div className="fc-felt">
            <label htmlFor="lf-zone">Zone</label>
            <select id="lf-zone" value={zone}
                    onChange={(e) => { saetZone(e.target.value); saetSide(1); }}>
              <option value="">Alle zoner</option>
              {zoner.map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
          </div>
          <div className="fc-felt">
            <label htmlFor="lf-status">Status</label>
            <select id="lf-status" value={status}
                    onChange={(e) => { saetStatus(e.target.value); saetSide(1); }}>
              <option value="">Alle statusser</option>
              {ALLE_PLADS_STATUS.map((s) => (
                <option key={s} value={s}>{PLADS_STATUS[s].label}</option>
              ))}
            </select>
          </div>
        </div>

        {!pladser.length ? (
          <Tom>
            Der er ingen lokationer endnu. En vare skal stå et sted, før den kan
            modtages — opret den første hylde her.
          </Tom>
        ) : (
          <>
            <Tabel
              kolonner={[
                { key: "navn", label: "Lokation", render: (p) => <b>{pladsnavn(p)}</b> },
                { key: "zone", label: "Zone",
                  render: (p) => p.zone || <span className="fc-neutral">—</span> },
                { key: "type", label: "Type", render: (p) => (
                    p.type
                      ? PLADS_TYPE[p.type]?.label || p.type
                      : <span className="fc-neutral">—</span>
                  ) },
                /* ⚠ UDLEDT AF BEHOLDNINGEN. Se noten i hovedet. */
                { key: "indhold", label: "Indhold", render: (p) => {
                    const b = paaPlads(p.id);
                    /* ⚠ "TOM" MÅ IKKE STÅ PÅ EN PLADS DER BÆRER EN BEHOLDER.
                       Den har ingen varelinjer, men den er ikke fri — og det
                       er præcis den forskel der sendte nogen op ad stigen. */
                    if (!b.length) {
                      return beholdere(p.id)
                        ? <span className="fc-hint">ingen varelinjer — bærer en beholder</span>
                        : <span className="fc-neutral">tom</span>;
                    }
                    return (
                      <span className="fc-hint">
                        {b.map((x) => `${vareNr(x.vareId)} · ${num(talFraMaengde(x.antal), 0)}`)
                          .join(" · ")}
                      </span>
                    );
                  } },
                { key: "antal", label: "Varelinjer", num: true,
                  render: (p) => num(paaPlads(p.id).length) },
                /* ⚠ BEHOLDERNE STÅR FOR SIG. En hylde kan bære en
                   transportkasse eller en carrier UDEN at have en eneste
                   varelinje — og så er den optaget, selv om "Indhold" siger
                   tom. Lagt sammen i ét tal ville man ikke kunne se hvad der
                   fylder. */
                { key: "beholdere", label: "Kasser/carriers", num: true,
                  render: (p) => (beholdere(p.id)
                    ? num(beholdere(p.id))
                    : <span className="fc-neutral">—</span>) },
                { key: "temp", label: "Temp.", num: true,
                  render: (p) => (Number.isFinite(p.temperatur)
                    ? `${p.temperatur} °C`
                    : <span className="fc-neutral">—</span>) },
                { key: "status", label: "Status", render: (p) => (
                    <Pille tone={PLADS_STATUS[p.status || "aktiv"]?.pill || "ok"}>
                      {PLADS_STATUS[p.status || "aktiv"]?.label || p.status}
                    </Pille>
                  ) },
                { key: "handling", label: "", render: (p) => (
                    <Knap disabled={!maaSkrive} onClick={() => saetRedigerer(p)}>
                      Redigér
                    </Knap>
                  ) },
              ]}
              raekker={paaSiden}
              tom="Ingen lokationer matcher filteret."
            />
            <Sider side={nuSide} antal={viste.length} prSide={PR_SIDE} saet={saetSide} />
          </>
        )}

        <p className="fc-hint" style={{ marginTop: 10 }}>
          ⚠ <b>Lokationerne deles med Turtlebooking.</b> De pladser der bærer
          transportkasser, står også her — uden zone og temperatur, fordi de
          felter er valgfrie. Det er med vilje: én reolstruktur i huset, så
          "Hal 1 · Reol 2" ikke findes to steder der kan blive uenige.
        </p>
      </Kort>
    </div>
  );
}
