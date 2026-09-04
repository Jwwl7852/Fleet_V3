/* src/moduler/flaade/Servicebog.jsx
 * Fleet → Servicebog. §9.10 i masterbriefen, fuldført i completion-slicen
 * (produktejer-review 2026-09-01): "Rigtig konfigurerbar serviceplan pr.
 * enhed med fx syn, service, dæk, lovpligtige eftersyn og egne
 * kontrolpunkter; dato/km-intervaller, næste forfald, senest udført og
 * historik."
 *
 * ⚠ INGEN NY NODE, INGEN NY CLOUD FUNCTION. Punkterne bor på
 * koeretoejer/$id/servicepunkter/$id — se fleet/servicepunkter.js's eget
 * hoved for hvorfor. Skrivningen går derfor gennem den almindelige
 * `gem()`/`skriv.js`-vej med den eksisterende koeretoejer.skriv-rettighed,
 * ligesom resten af enhedens stamdata (Oversigt.jsx). "Genbrug eksisterende
 * enheder [...], ingen parallel serviceopgavemodel" — dette ER den
 * genbrugsvej.
 *
 * ⚠ "MELD UDFØRT" SKRIVER TO FELTER I ÉT update() — senestUdfoert{Ms,Km} PÅ
 * PUNKTET, og en NY historikpost via den flade nøgle "historik/<id>". Det er
 * ikke en bekvemmelighed: sender vi historik som et nested objekt i data,
 * SÆTTER update() hele historik-noden og tømmer alt tidligere udført. Se
 * test/rules.servicepunkter.test.mjs's "søskende overlever"-test.
 */
import { useState } from "react";
import { useListe } from "../../fleet/useListe.js";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { harPerm, PERM } from "../../fleet/permissions.js";
import { num, dato, km as kmFmt } from "../../fleet/format.js";
import {
  Kort, Tabel, Pille, Knap, Henter, Datatilstand, ModulNav,
  Dialog, Formular, Felt, Feltraekke,
} from "../../fleet/ui.jsx";
import { blokerer } from "../../fleet/datatilstand.js";
import { gem, nyId } from "../../fleet/skriv.js";
import { AUDIT } from "../../fleet/audit.js";
import { DEMO_KOERETOEJER } from "../../fleet/demo-flaade.js";
import { FLEET_FANER } from "../../fleet/modulfaner.js";
import {
  SERVICEPUNKT_TYPE, ALLE_SERVICEPUNKT_TYPER, SERVICEPUNKT_STATUS,
  valideServicepunkt, byggUdfoerelse, alleServicepunkter, sorterServicepunkter,
} from "../../fleet/servicepunkter.js";

export default function Servicebog() {
  const { bruger, path } = useFleet();
  const maaSkrive = harPerm(bruger?.perms, PERM.koeretoejerSkriv);

  const enheder = useListe("koeretoejer", {
    vindue: "alle", graense: 500, demo: DEMO_KOERETOEJER,
  });

  const [enhedsfilter, setEnhedsfilter] = useState("");
  const [statusfilter, setStatusfilter] = useState("");
  const [tilfoej, setTilfoej] = useState(false);
  const [redigerer, setRedigerer] = useState(null);
  const [udfoerer, setUdfoerer] = useState(null);

  if (enheder.henter) return <Henter hvad="servicebogen" />;
  if (blokerer(enheder.tilstand)) {
    return <Datatilstand tilstand={enheder.tilstand} genprov={enheder.genindlaes} />;
  }

  const enhedNavn = (id) => enheder.data.find((k) => k.id === id)?.kaldenavn || id || "—";

  const alle = sorterServicepunkter(alleServicepunkter(enheder.data));
  const viste = alle.filter((p) =>
    (!enhedsfilter || p.koeretoejId === enhedsfilter)
    && (!statusfilter || p.status === statusfilter));

  const optaeling = { forfalden: 0, snart: 0, ok: 0, ukendt: 0 };
  for (const p of alle) optaeling[p.status] += 1;

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <ModulNav punkter={FLEET_FANER} />

      <Kort titel="Servicebog"
            handling={
              <Knap variant="primaer" disabled={!maaSkrive} onClick={() => setTilfoej(true)}
                    title={maaSkrive ? "Tilføj et servicepunkt til en enhed."
                                     : "Kræver koeretoejer.skriv — serveren afviser."}>
                + Tilføj servicepunkt
              </Knap>
            }>
        <p className="fc-hint" style={{ marginBottom: 12 }}>
          Konfigurerbare servicepunkter pr. enhed — syn, service, dæk, lovpligtige
          eftersyn og egne kontrolpunkter, med dato- og/eller km-interval. Punkterne
          bor på enheden selv, samme post som "Næste service"/"Syn" i Enheder —
          ikke en parallel node eller en ny serviceopgave.
        </p>

        <div className="fc-filterraekke" style={{ marginBottom: 12 }}>
          <Pille tone="bad">{num(optaeling.forfalden)} forfaldne</Pille>
          <Pille tone="warn">{num(optaeling.snart)} snart</Pille>
          <Pille tone="ok">{num(optaeling.ok)} ok</Pille>
          <Pille tone="info">{num(optaeling.ukendt)} ikke konfigureret færdigt</Pille>
        </div>

        <div className="fc-filtre" style={{ marginBottom: 12 }}>
          <div className="fc-felt">
            <label htmlFor="sb-enhed">Enhed</label>
            <select id="sb-enhed" value={enhedsfilter}
                    onChange={(e) => setEnhedsfilter(e.target.value)}>
              <option value="">Alle enheder</option>
              {enheder.data.map((k) => (
                <option key={k.id} value={k.id}>{k.kaldenavn || k.navn}</option>
              ))}
            </select>
          </div>
          <div className="fc-felt">
            <label htmlFor="sb-status">Status</label>
            <select id="sb-status" value={statusfilter}
                    onChange={(e) => setStatusfilter(e.target.value)}>
              <option value="">Alle</option>
              {Object.keys(SERVICEPUNKT_STATUS).map((s) => (
                <option key={s} value={s}>{SERVICEPUNKT_STATUS[s].label}</option>
              ))}
            </select>
          </div>
        </div>

        <Tabel
          kolonner={[
            { key: "enhed", label: "Enhed", render: (p) => <b>{enhedNavn(p.koeretoejId)}</b> },
            { key: "type", label: "Type", render: (p) => SERVICEPUNKT_TYPE[p.type]?.label || p.type },
            { key: "label", label: "Punkt" },
            { key: "senest", label: "Senest udført", render: (p) => (
                <>
                  {p.senestUdfoertMs ? dato(p.senestUdfoertMs) : <span className="fc-neutral">—</span>}
                  {Number.isFinite(p.senestUdfoertKm) && <> · {kmFmt(p.senestUdfoertKm)}</>}
                </>
              ) },
            { key: "naeste", label: "Næste forfald", render: (p) => (
                <>
                  {p.naesteForfaldMs != null ? dato(p.naesteForfaldMs) : <span className="fc-neutral">—</span>}
                  {p.naesteForfaldKm != null && <> · {kmFmt(p.naesteForfaldKm)}</>}
                </>
              ) },
            { key: "status", label: "Status", render: (p) => (
                <Pille tone={SERVICEPUNKT_STATUS[p.status]?.pill}>
                  {SERVICEPUNKT_STATUS[p.status]?.label}
                </Pille>
              ) },
            { key: "h", label: "", render: (p) => (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <Knap disabled={!maaSkrive}
                        onClick={() => setUdfoerer({ koeretoejId: p.koeretoejId, punktId: p.id, punkt: p })}
                        title={maaSkrive ? "Registrér at punktet er udført."
                                         : "Kræver koeretoejer.skriv."}>
                    Meld udført
                  </Knap>
                  <Knap disabled={!maaSkrive}
                        onClick={() => setRedigerer({ koeretoejId: p.koeretoejId, punktId: p.id, punkt: p })}
                        title={maaSkrive ? "Redigér punktet." : "Kræver koeretoejer.skriv."}>
                    Redigér
                  </Knap>
                </div>
              ) },
          ]}
          raekker={viste}
          noegle={(p) => `${p.koeretoejId}:${p.id}`}
          tom="Ingen servicepunkter matcher filtrene."
        />

        <p className="fc-hint" style={{ marginTop: 10 }}>
          <b>Ikke konfigureret færdigt</b> betyder et punkt uden interval, eller
          som endnu aldrig er meldt udført — det kan hverken være forfaldent
          eller til tiden, og er derfor ikke talt med som "ok".
        </p>
      </Kort>

      {tilfoej && (
        <ServicepunktDialog
          titel="Nyt servicepunkt" path={path} bruger={bruger} enheder={enheder.data}
          onLuk={() => setTilfoej(false)}
          onGemt={() => { setTilfoej(false); enheder.genindlaes(); }}
        />
      )}

      {redigerer && (
        <ServicepunktDialog
          titel={`Redigér — ${redigerer.punkt.label}`} path={path} bruger={bruger}
          enheder={enheder.data}
          koeretoejId={redigerer.koeretoejId} punktId={redigerer.punktId} punkt={redigerer.punkt}
          onLuk={() => setRedigerer(null)}
          onGemt={() => { setRedigerer(null); enheder.genindlaes(); }}
        />
      )}

      {udfoerer && (
        <UdfoerelseDialog
          path={path} bruger={bruger}
          koeretoejId={udfoerer.koeretoejId} punktId={udfoerer.punktId} punkt={udfoerer.punkt}
          onLuk={() => setUdfoerer(null)}
          onGemt={() => { setUdfoerer(null); enheder.genindlaes(); }}
        />
      )}
    </div>
  );
}

/* ---- Opret/redigér servicepunkt ---------------------------------------- */

function ServicepunktDialog({
  titel, path, bruger, enheder, koeretoejId: fastKoeretoejId, punktId, punkt, onLuk, onGemt,
}) {
  const nyt = !punktId;
  const [koeretoejId, setKoeretoejId] = useState(fastKoeretoejId || enheder[0]?.id || "");
  const [type, setType] = useState(punkt?.type || "service");
  const [label, setLabel] = useState(punkt?.label || "");
  const [intervalMaaneder, setIntervalMaaneder] = useState(punkt?.intervalMaaneder ?? "");
  const [intervalKm, setIntervalKm] = useState(punkt?.intervalKm ?? "");
  const [roert, setRoert] = useState({});
  const [visAlle, setVisAlle] = useState(false);
  const [gemmer, setGemmer] = useState(false);
  const [svar, setSvar] = useState(null);

  const roer = (felt, saetter) => (v) => {
    saetter(v);
    setRoert((x) => ({ ...x, [felt]: true }));
    setSvar(null);
  };

  const post = {
    type, label,
    intervalMaaneder: intervalMaaneder === "" ? null : Number(intervalMaaneder),
    intervalKm: intervalKm === "" ? null : Number(intervalKm),
  };
  const fejl = valideServicepunkt(post);
  const vis = (felt) => (visAlle || roert[felt] ? fejl[felt] : null);
  const kanGemme = Object.keys(fejl).length === 0 && Boolean(koeretoejId);

  const gemNu = async () => {
    setVisAlle(true);
    if (!kanGemme) return;
    setGemmer(true);
    const id = punktId || nyId("sp");
    const data = {
      type: post.type,
      label: post.label,
      aktiv: true,
      ...(post.intervalMaaneder != null ? { intervalMaaneder: post.intervalMaaneder } : {}),
      ...(post.intervalKm != null ? { intervalKm: post.intervalKm } : {}),
      ...(nyt ? { oprettetMs: Date.now(), oprettetAf: bruger?.navn || bruger?.email || "" } : {}),
    };
    const r = await gem({
      sti: path(`koeretoejer/${koeretoejId}/servicepunkter/${id}`),
      data, flet: true,
      foer: punkt || null,
      objekt: "koeretoejer", objektId: koeretoejId,
      handling: nyt ? AUDIT.opret : AUDIT.aendre,
    });
    setGemmer(false);
    setSvar(r);
    if (r.ok) onGemt();
  };

  return (
    <Dialog titel={titel} onLuk={onLuk}>
      <Formular onGem={gemNu} gemmer={gemmer} kanGemme={kanGemme}
                gemLabel={nyt ? "Opret punkt" : "Gem ændringer"} onAnnuller={onLuk} svar={svar}>
        {fastKoeretoejId ? (
          <p className="fc-hint">
            Enhed: <b>{enheder.find((k) => k.id === fastKoeretoejId)?.kaldenavn || fastKoeretoejId}</b>
          </p>
        ) : (
          <Felt id="sp-enhed" label="Enhed" kraevet vaerdi={koeretoejId} saet={setKoeretoejId}
                valgmuligheder={enheder.map((k) => ({ vaerdi: k.id, label: k.kaldenavn || k.navn }))} />
        )}
        <Felt id="sp-type" label="Type" kraevet vaerdi={type} saet={roer("type", setType)}
              fejl={vis("type")}
              valgmuligheder={ALLE_SERVICEPUNKT_TYPER.map((t) => (
                { vaerdi: t, label: SERVICEPUNKT_TYPE[t].label }))} />
        <Felt id="sp-label" label="Navn på punktet" kraevet vaerdi={label}
              saet={roer("label", setLabel)} fejl={vis("label")}
              hint="F.eks. 'Lovpligtigt bremseeftersyn' eller 'Kranbevis-eftersyn'." />
        <Feltraekke>
          <Felt id="sp-mdr" label="Interval" type="number" suffiks="måneder"
                vaerdi={intervalMaaneder} saet={roer("intervalMaaneder", setIntervalMaaneder)}
                fejl={vis("intervalMaaneder")} />
          <Felt id="sp-km" label="Interval" type="number" suffiks="km"
                vaerdi={intervalKm} saet={roer("intervalKm", setIntervalKm)}
                fejl={vis("intervalKm")} />
        </Feltraekke>
        {fejl.interval && (visAlle || roert.intervalMaaneder || roert.intervalKm) && (
          <p className="fc-hint fc-bad" style={{ marginTop: -6, marginBottom: 10 }}>{fejl.interval}</p>
        )}
        <p className="fc-hint">
          Angiv mindst ét interval — dato, km, eller begge. Et punkt der forfalder
          på det FØRSTE af de to, skal have begge udfyldt.
        </p>
      </Formular>
    </Dialog>
  );
}

/* ---- Meld udført -------------------------------------------------------- */

const iDag = () => new Date().toISOString().slice(0, 10);

function UdfoerelseDialog({ path, bruger, koeretoejId, punktId, punkt, onLuk, onGemt }) {
  const [datoStreng, setDatoStreng] = useState(iDag());
  const [kmVaerdi, setKmVaerdi] = useState("");
  const [kommentar, setKommentar] = useState("");
  const [gemmer, setGemmer] = useState(false);
  const [svar, setSvar] = useState(null);

  const gemNu = async () => {
    setGemmer(true);
    const udfoertMs = new Date(`${datoStreng}T12:00:00`).getTime();
    const historikId = nyId("u");
    const udfoerelse = byggUdfoerelse({
      ms: udfoertMs,
      km: kmVaerdi === "" ? null : Number(kmVaerdi),
      kommentar,
      udfoertAf: bruger?.navn || bruger?.email || "",
    });
    /* ⚠ TO PATHS, ÉT update(). "historik/<id>" er en FLAD nøgle — se filens
       eget hoved og test/rules.servicepunkter.test.mjs. */
    const data = { senestUdfoertMs: udfoertMs, [`historik/${historikId}`]: udfoerelse };
    if (Number.isFinite(udfoerelse.udfoertKm)) data.senestUdfoertKm = udfoerelse.udfoertKm;

    const r = await gem({
      sti: path(`koeretoejer/${koeretoejId}/servicepunkter/${punktId}`),
      data, flet: true,
      foer: punkt,
      objekt: "koeretoejer", objektId: koeretoejId,
      handling: AUDIT.aendre,
    });
    setGemmer(false);
    setSvar(r);
    if (r.ok) onGemt();
  };

  return (
    <Dialog titel={`Meld udført — ${punkt.label}`} onLuk={onLuk}>
      <Formular onGem={gemNu} gemmer={gemmer} kanGemme gemLabel="Registrér" onAnnuller={onLuk} svar={svar}>
        <Feltraekke>
          <Felt id="u-dato" label="Udført dato" kraevet type="date"
                vaerdi={datoStreng} saet={setDatoStreng} />
          <Felt id="u-km" label="Kilometerstand" type="number" suffiks="km"
                vaerdi={kmVaerdi} saet={setKmVaerdi}
                hint="Valgfri — udfyld hvis punktet er km-baseret." />
        </Feltraekke>
        <Felt id="u-kommentar" label="Kommentar" vaerdi={kommentar} saet={setKommentar} hint="Valgfri." />
        <p className="fc-hint">
          En tidligere udførelse overskrives ikke — den her bliver en NY post i
          punktets historik, og "senest udført" flytter sig til den.
        </p>
      </Formular>
    </Dialog>
  );
}
