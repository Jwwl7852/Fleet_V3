/* src/moduler/turtlebooking/Reolpladser.jsx
 * Turtlebooking – reolpladser og kassetyper.
 *
 * ⚠ PLADSEN ER ET ID MED FELTER. Prototypen brugte strengen
 * "Hal 1 - Reol 2 - Fag 1 - Hylde 10 - Plads 1" både som nøgle og som
 * visningsnavn, og den stod to gange på hver kasse. Omdøbtes en hal, pegede
 * hver eneste kasse på en plads der ikke fandtes.
 *
 * Navnet UDLEDES af `pladsnavn()`, og reglerne afviser et gemt `navn`-felt.
 * Samme rettelse som `steder.js` lavede for hjemsted.
 *
 * ⚠ EN PLADS SLETTES IKKE. Der kan stå en kasse på den, og en kasses
 * `hjemPladsId` peger på den for altid. Den kan omdøbes; skal en reol væk,
 * flyttes kasserne først. Der er derfor ingen slet-knap — samme begrundelse
 * som at `skriv.js` ikke har en `slet()`.
 */
import { useState } from "react";
import { useListe } from "../../fleet/useListe.js";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { num } from "../../fleet/format.js";
import { harPerm, PERM } from "../../fleet/permissions.js";
import {
  Kort, Tabel, Knap, Felt, Feltraekke, Formular, Formularsvar,
  Henter, Datatilstand, Tom, Gitter, Ikon,
} from "../../fleet/ui.jsx";
import { pladsnavn, haller, valideReolplads } from "../../fleet/turtlebooking.js";
import { gem, nyId } from "../../fleet/skriv.js";
import { AUDIT } from "../../fleet/audit.js";
import { DEMO_KASSETYPER, DEMO_KASSER } from "../../fleet/demo-turtlebooking.js";
import { DEMO_REOLPLADSER } from "../../fleet/demo-lager.js";

const tomPlads = () => ({ hal: "", reol: "", fag: "", hylde: "", plads: "" });

function Pladsformular({ plads, sti, paaGemt, paaLuk }) {
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

  const fejl = valideReolplads(f);
  const vis = (felt) => (visAlle || roert[felt] ? fejl[felt] : null);
  const kanGemme = Object.keys(fejl).length === 0;

  const gemNu = async () => {
    saetVisAlle(true);
    if (!kanGemme) return;
    saetGemmer(true);
    const id = plads?.id || nyId("p");
    /* ⚠ KUN FELTERNE. Navnet udledes; sendes det med, afviser reglerne det. */
    const data = {
      hal: f.hal.trim(), reol: String(f.reol).trim(), fag: String(f.fag).trim(),
      hylde: String(f.hylde).trim(), plads: String(f.plads).trim(),
    };
    const r = await gem({
      sti: sti(`reolpladser/${id}`), data, foer: plads || null,
      /* ⚠ FLET, IKKE OVERSKRIV. Noden deles med Warehouse, som har sine egne
         felter paa den samme plads (zone, type, status, temperatur). Med en
         hel skrivning ville en rettelse af hyldenummeret slette dem i
         tavshed — og tage hylden ud af karantaene uden at nogen vidste det. */
      flet: true,
      objekt: "reolpladser", objektId: id,
      handling: nyt ? AUDIT.opret : AUDIT.aendre,
    });
    saetGemmer(false);
    saetSvar(r);
    if (r.ok) paaGemt();
  };

  return (
    <Kort titel={nyt ? "Ny reolplads" : `Redigér ${pladsnavn(plads)}`}>
      <Formular onGem={gemNu} gemmer={gemmer} kanGemme={kanGemme}
                gemLabel={nyt ? "Opret plads" : "Gem ændringer"}
                onAnnuller={paaLuk} svar={svar}>
        <Feltraekke>
          <Felt id="rp-hal" label="Hal" kraevet vaerdi={f.hal} saet={saet("hal")}
                fejl={vis("hal")} hint="Fx Hal 1." />
          <Felt id="rp-reol" label="Reol" kraevet vaerdi={f.reol} saet={saet("reol")}
                fejl={vis("reol")} />
          <Felt id="rp-fag" label="Fag" kraevet vaerdi={f.fag} saet={saet("fag")}
                fejl={vis("fag")} />
          <Felt id="rp-hylde" label="Hylde" kraevet vaerdi={f.hylde} saet={saet("hylde")}
                fejl={vis("hylde")} />
          <Felt id="rp-plads" label="Plads" kraevet vaerdi={f.plads} saet={saet("plads")}
                fejl={vis("plads")} />
        </Feltraekke>
        <p className="fc-hint">
          Bliver til <b>{pladsnavn(f) || "—"}</b>. Navnet <b>gemmes ikke</b> —
          det regnes af felterne, så en omdøbt hal ikke efterlader kasser der
          peger på en plads der ikke findes.
        </p>
      </Formular>
    </Kort>
  );
}

const tomType = () => ({ navn: "", beskrivelse: "" });

function Typeformular({ sti, paaGemt, paaLuk }) {
  const [f, saetF] = useState(tomType);
  const [id, saetId] = useState("");
  const [gemmer, saetGemmer] = useState(false);
  const [svar, saetSvar] = useState(null);

  /* ⚠ TYPEKODEN ER NØGLEN, og den står på kassen: "AL" for alukasse. Et
     genereret id ville betyde at koden på kassen og koden i systemet var to
     ting — samme grund som kassens eget id. */
  const gyldigId = /^[A-Za-z0-9]{1,10}$/.test(id.trim());
  const kanGemme = gyldigId && f.navn.trim().length > 0;

  const gemNu = async () => {
    saetGemmer(true);
    const r = await gem({
      sti: sti(`kassetyper/${id.trim().toUpperCase()}`),
      data: { navn: f.navn.trim(), beskrivelse: f.beskrivelse.trim() || null },
      objekt: "kassetyper", objektId: id.trim().toUpperCase(),
      handling: AUDIT.opret,
    });
    saetGemmer(false);
    saetSvar(r);
    if (r.ok) paaGemt();
  };

  return (
    <Formular onGem={gemNu} gemmer={gemmer} kanGemme={kanGemme}
              gemLabel="Opret type" onAnnuller={paaLuk} svar={svar}>
      <Feltraekke>
        <Felt id="kt-id" label="Kode" kraevet vaerdi={id}
              saet={(v) => { saetId(v); saetSvar(null); }}
              fejl={id && !gyldigId ? "Bogstaver og tal, højst ti tegn." : null}
              hint="Står på kassen. Fx AL." />
        <Felt id="kt-navn" label="Navn" kraevet vaerdi={f.navn}
              saet={(v) => { saetF((x) => ({ ...x, navn: v })); saetSvar(null); }} />
        <Felt id="kt-besk" label="Beskrivelse" vaerdi={f.beskrivelse}
              saet={(v) => saetF((x) => ({ ...x, beskrivelse: v }))} />
      </Feltraekke>
    </Formular>
  );
}

export default function Reolpladser() {
  const { path, bruger } = useFleet();
  const [nyPlads, saetNyPlads] = useState(false);
  const [redigerer, saetRedigerer] = useState(null);
  const [nyType, saetNyType] = useState(false);
  const [hal, saetHal] = useState("");

  const maaSkrive = harPerm(bruger?.perms, PERM.kasserSkriv);

  /* ⚠ INGEN DIVISION. En reolplads hører til en hal, ikke til gods eller bus.
     `division: "alle"` står eksplicit, så det ikke ser ud som om skærmen bare
     var heldig — samme begrundelse som i Flåde. */
  const { data: pladser, tilstand, genindlaes, henter } = useListe("reolpladser", {
    division: "alle", graense: 500, demo: DEMO_REOLPLADSER,
    sorter: (a, b) => pladsnavn(a).localeCompare(pladsnavn(b), "da"),
  });
  const { data: typer } = useListe("kassetyper", {
    division: "alle", graense: 100, demo: DEMO_KASSETYPER,
    sorter: (a, b) => (a.navn || "").localeCompare(b.navn || "", "da"),
  });
  const { data: kasser } = useListe("kasser", {
    division: "alle", graense: 1000, demo: DEMO_KASSER,
  });

  if (henter) return <Henter hvad="reolpladserne" />;

  const somMap = Object.fromEntries(pladser.map((p) => [p.id, p]));
  const alleHaller = haller(somMap);
  const viste = hal ? pladser.filter((p) => p.hal === hal) : pladser;

  /* Hvor mange kasser står der lige nu? ⚠ AFLEDT, ikke gemt: et tælletal på
     pladsen ville drive fra kasserne i det sekund én blev flyttet. */
  const antalPaa = (pladsId) => kasser.filter((k) => k.pladsId === pladsId).length;

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <Datatilstand tilstand={tilstand} genprov={genindlaes} />

      {nyPlads && (
        <Pladsformular sti={path} paaLuk={() => saetNyPlads(false)}
                       paaGemt={() => { saetNyPlads(false); genindlaes(); }} />
      )}
      {redigerer && (
        <Pladsformular plads={redigerer} sti={path} paaLuk={() => saetRedigerer(null)}
                       paaGemt={() => { saetRedigerer(null); genindlaes(); }} />
      )}

      <Gitter kolonner="minmax(0,2fr) minmax(0,1fr)">
        <Kort
          titel={<span className="fc-med-ikon"><Ikon navn="bygning" />Reolpladser ({num(pladser.length)})</span>}
          handling={
            <span className="fc-med-ikon" style={{ gap: 8 }}>
              {alleHaller.length > 1 && (
                <select value={hal} onChange={(e) => saetHal(e.target.value)}>
                  <option value="">Alle haller</option>
                  {alleHaller.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              )}
              <Knap variant="primaer" disabled={!maaSkrive} onClick={() => saetNyPlads(true)}
                    title={maaSkrive ? "Opret en reolplads."
                                     : `Kræver ${PERM.kasserSkriv} — reglerne afviser.`}>
                Ny plads
              </Knap>
            </span>
          }
        >
          <Tabel
            kolonner={[
              { key: "navn", label: "Plads", render: (p) => <b>{pladsnavn(p)}</b> },
              { key: "hal", label: "Hal" },
              { key: "antal", label: "Kasser", num: true, render: (p) => num(antalPaa(p.id)) },
              { key: "handling", label: "", render: (p) => (
                  <Knap disabled={!maaSkrive} onClick={() => saetRedigerer(p)}>Redigér</Knap>
                ) },
            ]}
            raekker={viste}
            tom={hal ? `Ingen pladser i ${hal}.` : "Ingen reolpladser endnu. Opret den første."}
          />
          <p className="fc-hint" style={{ marginTop: 10 }}>
            ⚠ <b>En plads kan ikke slettes.</b> Der kan stå en kasse på den, og
            en kasses hjemplads peger på den. Skal en reol væk, flyttes kasserne
            først — og pladsen kan omdøbes.
          </p>
        </Kort>

        <Kort
          titel={<span className="fc-med-ikon"><Ikon navn="kasse" />Kassetyper ({num(typer.length)})</span>}
          handling={
            <Knap disabled={!maaSkrive} onClick={() => saetNyType((v) => !v)}>
              {nyType ? "Luk" : "Ny type"}
            </Knap>
          }
        >
          {nyType && (
            <Typeformular sti={path} paaLuk={() => saetNyType(false)}
                          paaGemt={() => { saetNyType(false); genindlaes(); }} />
          )}
          {!typer.length ? (
            <Tom>
              Ingen kassetyper endnu. En kasse skal have en type, så den skal
              oprettes først.
            </Tom>
          ) : (
            <Tabel
              kolonner={[
                { key: "id", label: "Kode", render: (t) => <b>{t.id}</b> },
                { key: "navn", label: "Navn" },
                { key: "antal", label: "Kasser", num: true,
                  render: (t) => num(kasser.filter((k) => k.type === t.id).length) },
              ]}
              raekker={typer}
              tom="Ingen kassetyper."
            />
          )}
          <p className="fc-hint" style={{ marginTop: 10 }}>
            Koden står <b>på kassen</b>. Den er nøglen, så koden på kassen og
            koden i systemet ikke kan blive to ting.
          </p>
        </Kort>
      </Gitter>
    </div>
  );
}
