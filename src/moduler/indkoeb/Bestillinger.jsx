/* src/moduler/indkoeb/Bestillinger.jsx
 * Bestillingskladder & leverandørforslag — trin 2 af fem (beslutning 78/81).
 *
 * Planche 3: de åbne behov med et automatisk leverandørforslag, markering pr.
 * linje, og et e-mailudkast pr. leverandør med bestillingsnummeret i emnet.
 *
 * ⚠ UDKASTET HERUNDER SENDES IKKE — DET ER TIL KLADDER, FØR GODKENDELSE.
 * Skive 4D gav Procure en rigtig afsendelse (`ordreMailSend`/"Send ordre"),
 * men den kræver at ordren står i `godkendt` — en kladde kan ikke sendes
 * endnu, og udkastet her er derfor til orientering om hvad ordren kommer til
 * at bede om, ikke en kopiér-selv-vej. Se Godkendelser.jsx for den rigtige
 * afsendelse.
 *
 * ⚠ ÉN ORDRE PR. LEVERANDØR. Man sender ikke én bestilling til tre firmaer, og
 * et nummer der dækkede flere, kunne ikke bruges som reference på nogen af
 * fakturaerne. Planchen viser præcis det: flere udkast, flere numre.
 *
 * ⚠ OG SKÆRMEN AFGØR INGENTING. `ordreskriv` bygger linjerne af BEHOVENE og
 * afviser et behov der allerede er bestilt — med den samme `behovTilLinje()`
 * skærmen bruger til at vise hvad der mangler. Skærmen VISER; funktionen
 * HÅNDHÆVER.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useListe } from "../../fleet/useListe.js";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { dato, kr, num } from "../../fleet/format.js";
import {
  Kort, Tom, Tabel, Pille, Henter, Datatilstand, Knap,
  Formularsvar, KpiKort, KpiRaekke, Ikon,
} from "../../fleet/ui.jsx";
import { blokerer } from "../../fleet/datatilstand.js";
import { harPerm, PERM } from "../../fleet/permissions.js";
import {
  kladdelinjer, grupperPaaLeverandoer, mailudkast, ordreSumOere,
  linjeListe, ORDRESTATUS,
} from "../../fleet/procure.js";
import { opretBestilling } from "../../fleet/bestilling.js";
import { DEMO_INDKOEBSBEHOV, DEMO_INDKOEBSORDRER } from "../../fleet/demo-procure.js";
import { DEMO_INDKOEBSLINJER, DEMO_LEVERANDOERER } from "../../fleet/demo-indkoeb.js";

export default function Bestillinger() {
  const { bruger } = useFleet();
  const maaSkrive = harPerm(bruger?.perms, PERM.indkoebSkriv);

  const [valgte, setValgte] = useState({});
  const [antal, setAntal] = useState({});
  const [svar, setSvar] = useState(null);
  const [gemmer, setGemmer] = useState(false);
  const [kopieret, setKopieret] = useState(null);

  const behov = useListe("indkoebsbehov", {
    ordnPaa: "oprettetMs", vindue: "alle", graense: 500, demo: DEMO_INDKOEBSBEHOV,
  });
  const ordrer = useListe("indkoebsordrer", {
    ordnPaa: "oprettetMs", vindue: "alle", graense: 200, demo: DEMO_INDKOEBSORDRER,
  });
  /* ⚠ HISTORIKKEN ER GRUNDLAGET FOR FORSLAGET. `indkoeb` er linjer der ER
     købt — hvem leverede varen, og hvad kostede den. Uden den er der intet at
     foreslå, og skærmen siger det i stedet for at gætte. */
  const historik = useListe("indkoeb", {
    ordnPaa: "dato", vindueDage: 400, graense: 1000, demo: DEMO_INDKOEBSLINJER,
  });
  const lev = useListe("leverandoerer", {
    ordnPaa: "navn", vindue: "alle", graense: 500, demo: DEMO_LEVERANDOERER,
  });

  if (behov.henter) return <Henter hvad="bestillingskladder" />;
  if (blokerer(behov.tilstand)) {
    return <Datatilstand tilstand={behov.tilstand} genprov={behov.genindlaes} />;
  }

  const levFor = (id) => lev.data.find((l) => l.id === id) || null;
  const levNavn = (id) => levFor(id)?.navn || id || "—";

  /* ⚠ KUN DE ÅBNE. Et bestilt behov ligger på en ordre, og et afvist er der
     taget stilling til — begge ville kunne bestilles igen herfra, og serveren
     ville afvise med en sætning man ikke kan forstå ud fra skærmen. */
  const aabne = behov.data.filter((b) => b.status !== "bestilt" && b.status !== "afvist");
  const linjer = kladdelinjer(aabne, historik.data);
  const grupper = grupperPaaLeverandoer(linjer);

  /* ⚠ `??` OG IKKE `||`. Et antal på 0 er ikke "ikke sat" — det er et tal der
     skal afvises, og `||` ville stille og roligt erstatte det med behovets. */
  const antalFor = (l) => antal[l.behov.id] ?? l.behov.antal ?? null;
  const prisFor = (l) => l.forslag?.prisPrEnhedOere ?? null;
  const klar = (l) => Boolean(l.forslag) && Number.isInteger(prisFor(l))
    && Number.isFinite(antalFor(l)) && antalFor(l) > 0;

  const valgtIGruppe = (g) => g.linjer.filter((l) => valgte[l.behov.id]);
  const valgtIAlt = linjer.filter((l) => valgte[l.behov.id]);

  /* ⚠ "ANSLÅET" BETYDER NOGET. Prisen er den SENESTE vi betalte, ikke et
     tilbud — og linjer uden pris tæller ikke med, så summen er et minimum og
     ikke et facit. Det står i noten under tallet. */
  const anslaaet = valgtIAlt.reduce((s, l) => (
    Number.isInteger(prisFor(l)) && Number.isFinite(antalFor(l))
      ? s + prisFor(l) * antalFor(l) : s
  ), 0);
  const udenPris = valgtIAlt.filter((l) => !Number.isInteger(prisFor(l))).length;

  const bestil = async (g) => {
    setGemmer(true);
    const r = await opretBestilling({
      leverandoerId: g.leverandoerId,
      linjer: valgtIGruppe(g).map((l) => ({
        behovId: l.behov.id,
        antal: antalFor(l) ?? undefined,
        prisPrEnhedOere: prisFor(l) ?? undefined,
      })),
    });
    setSvar(r);
    setGemmer(false);
    if (r.ok) {
      setValgte({});
      behov.genindlaes();
      ordrer.genindlaes();
    }
  };

  const kopier = (o, tekst) => {
    navigator.clipboard?.writeText(tekst);
    setKopieret(o.id);
  };

  const kladder = ordrer.data.filter((o) => o.status === "kladde");

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <Datatilstand tilstand={behov.tilstand} genprov={behov.genindlaes} />

      <KpiRaekke>
        <KpiKort
          label="Åbne behov" vaerdi={num(linjer.length)}
          note={`${num(linjer.filter((l) => l.forslag).length)} med leverandørforslag`}
          ikon={<Ikon navn="kasse" />} tone="ikon-4" rund
        />
        <KpiKort
          label="Valgt til bestilling" vaerdi={num(valgtIAlt.length)}
          note={`fordelt på ${num(new Set(valgtIAlt.map((l) => l.forslag?.leverandoerId)).size)} leverandører`}
          ikon={<Ikon navn="personer" />} tone="ikon-5" rund
        />
        <KpiKort
          label="Anslået beløb" vaerdi={kr(anslaaet)}
          note={udenPris
            ? `${num(udenPris)} uden kendt pris — beløbet er et minimum`
            : "seneste kendte priser · ekskl. moms"}
          ikon={<Ikon navn="seddel" />} tone="ikon-6" rund
        />
      </KpiRaekke>

      {/* ---- Kladden, én blok pr. leverandør ---------------------------- */}
      {grupper.map((g) => {
        /* ⚠ DE UDEN FORSLAG SAMLES FOR SIG, og de SKJULES IKKE: en mangel der
           forsvinder fordi den er en mangel, får den der bestiller til at tro
           at alt er dækket. */
        const udenLev = g.leverandoerId === null;
        const valgt = valgtIGruppe(g);
        return (
          <Kort
            key={g.leverandoerId || "uden-leverandoer"}
            titel={udenLev
              ? `Leverandør mangler (${num(g.linjer.length)})`
              : `${levNavn(g.leverandoerId)} (${num(g.linjer.length)})`}
            handling={!udenLev && maaSkrive && (
              <Knap variant="primaer" disabled={!valgt.length || gemmer}
                    onClick={() => bestil(g)}>
                Bestil valgte ({num(valgt.length)})
              </Knap>
            )}
          >
            {udenLev && (
              <p className="fc-hint" style={{ marginTop: 0 }}>
                Ingen har leveret de her varer før, så der er intet at foreslå.
                <b> Et gæt ville være værre end ingenting</b> — opret
                leverandøren under Leverandører og køb varen ind én gang, så
                kommer forslaget af sig selv næste gang.
              </p>
            )}
            <Tabel
              raekker={g.linjer}
              noegle={(l) => l.behov.id}
              tom="Ingen behov i gruppen."
              kolonner={[
                ...(udenLev ? [] : [{
                  key: "valg", label: "", bredde: 40, midt: true,
                  render: (l) => (
                    <input
                      type="checkbox" aria-label={`Vælg ${l.behov.vare}`}
                      checked={Boolean(valgte[l.behov.id])}
                      disabled={!maaSkrive || !klar(l)}
                      title={klar(l) ? undefined
                        : "Linjen mangler en oplysning — se kolonnen Status."}
                      onChange={(e) => setValgte((v) => ({ ...v, [l.behov.id]: e.target.checked }))}
                    />
                  ),
                }]),
                {
                  key: "vare", label: "Vare",
                  render: (l) => (
                    <>
                      <b>{l.behov.vare}</b>
                      <div className="fc-hint">
                        {l.behov.varenummer || "uden varenummer"}
                      </div>
                    </>
                  ),
                },
                {
                  /* ⚠ FORSLAGET SIGER HVAD DET BYGGER PÅ. Et varenummertræf er
                     stærkt; et navnetræf kan være to forskellige varer med
                     samme ord. Den der bestiller, skal kunne se forskellen frem
                     for at stole lige meget på begge. */
                  key: "forslag", label: "Foreslået leverandør",
                  render: (l) => (l.forslag ? (
                    <>
                      {levNavn(l.forslag.leverandoerId)}
                      <div className="fc-hint">
                        {l.forslag.grundlag === "varenummer"
                          ? "Match på varenummer"
                          : "Match på varenavn — kontrollér at det er den rigtige vare"}
                        {l.forslag.sidstKoebtMs
                          ? ` · sidst købt ${dato(l.forslag.sidstKoebtMs)}` : ""}
                      </div>
                    </>
                  ) : (
                    /* ⚠ IKKE EN PILLE TIL. Statuskolonnen siger allerede
                       "Leverandør mangler", og den samme advarsel to gange på
                       én række læses som to forskellige problemer. Her står
                       HVORFOR der intet forslag er. */
                    <span className="fc-hint">Ingen tidligere leverance</span>
                  )),
                },
                {
                  /* ⚠ ET UBESVARET ANTAL UDFYLDES HER. Behovet må gerne være
                     uden — den der melder ind, ved hvad han mangler, ikke hvor
                     meget der er i en pakke — men en bestilling uden antal kan
                     ikke sendes. `behovTilLinje()` kaster frem for at gætte 1. */
                  key: "antal", label: "Antal", num: true, bredde: 130,
                  render: (l) => (
                    <span className="fc-tal-ind">
                      <input
                        type="number" min="1" inputMode="numeric"
                        aria-label={`Antal for ${l.behov.vare}`}
                        value={antalFor(l) ?? ""}
                        disabled={!maaSkrive}
                        onChange={(e) => setAntal((a) => ({
                          ...a,
                          /* Tom streng er ikke nul — `Number("")` er 0, og
                             "0 stk." er ikke et ubesvaret felt. */
                          [l.behov.id]: e.target.value === "" ? null : Number(e.target.value),
                        }))}
                      />
                      <span className="fc-hint">{l.behov.enhed || "stk"}</span>
                    </span>
                  ),
                },
                {
                  key: "pris", label: "Anslået", num: true,
                  render: (l) => (Number.isInteger(prisFor(l)) ? (
                    <>
                      {Number.isFinite(antalFor(l)) ? kr(prisFor(l) * antalFor(l)) : "—"}
                      <div className="fc-hint">
                        {kr(prisFor(l))} pr. {l.forslag?.enhed || l.behov.enhed || "stk"}
                      </div>
                    </>
                  ) : (
                    <span className="fc-hint">Pris ikke kendt</span>
                  )),
                },
                {
                  key: "status", label: "Status",
                  render: (l) => {
                    if (!l.forslag) return <Pille tone="warn">Leverandør mangler</Pille>;
                    if (!Number.isFinite(antalFor(l)) || antalFor(l) <= 0) {
                      return <Pille tone="warn">Sæt et antal</Pille>;
                    }
                    if (!Number.isInteger(prisFor(l))) {
                      return <Pille tone="warn">Pris mangler</Pille>;
                    }
                    return <Pille tone="ok">Klar til bestilling</Pille>;
                  },
                },
              ]}
            />
          </Kort>
        );
      })}

      {!linjer.length && (
        <Kort titel="Bestillingskladder">
          <Tom>
            Ingen åbne behov at bestille. De kommer fra Indkøbsbehov, hvor
            snedkeri, lager og kontor melder ind.
          </Tom>
        </Kort>
      )}

      <Formularsvar svar={svar} okTekst="Bestillingen er oprettet som kladde." />

      {/* ---- E-mailudkast ------------------------------------------------
          ⚠ SKIVE 4D — KUN TIL KLADDER, FØR GODKENDELSE. Bestillingen kan
          endnu ikke sendes rigtigt herfra: det kræver godkendt status, og
          udkastet her er til orientering INDEN da — fx for at se hvad ordren
          kommer til at bede om. Den rigtige afsendelse (`Send ordre`) findes
          på den godkendte ordre i Godkendelser. */}
      <Kort titel={`E-mailudkast (${num(kladder.length)})`}>
        <p className="fc-hint" style={{ marginTop: 0 }}>
          Sådan kommer ordren til at se ud, når den er godkendt. <b>Systemet
          sender den ikke herfra</b> — når ordren er godkendt, sendes den
          rigtigt fra <Link className="fc-a" to="/indkoeb/godkendelser">Godkendelser</Link>.
        </p>
        {!kladder.length ? (
          <Tom>
            Ingen bestillinger i kladde. Vælg varer ovenfor og bestil dem — så
            står udkastet her.
          </Tom>
        ) : kladder.map((o) => {
          const udkast = mailudkast(o, { leverandoer: levFor(o.leverandoerId) });
          return (
            <div key={o.id} className="fc-udkast">
              <div className="fc-row" style={{ justifyContent: "space-between" }}>
                <b>{levNavn(o.leverandoerId)}</b>
                <span className="fc-med-ikon" style={{ gap: 8 }}>
                  <Pille tone={ORDRESTATUS[o.status]?.tone}>
                    {ORDRESTATUS[o.status]?.label || o.status}
                  </Pille>
                  <code>{o.nummer}</code>
                </span>
              </div>
              <p className="fc-hint">
                {/* ⚠ EN MANGLENDE MODTAGER SIGES. En tom "Til:"-linje i et
                    udkast læses som "den er der nok" — indtil mailen ikke kan
                    sendes. */}
                Til: {udkast.tilEmail || "leverandøren har ingen mailadresse i kartoteket"}
                {" · "}Emne: {udkast.emne}
                {" · "}{num(linjeListe(o).length)} linjer
                {" · "}{kr(ordreSumOere(o))} ekskl. moms
              </p>
              <pre className="fc-udkast-tekst">{udkast.brodtekst}</pre>
              <Knap onClick={() => kopier(o, udkast.brodtekst)}>
                {kopieret === o.id ? "Kopieret" : "Kopiér udkast"}
              </Knap>
            </div>
          );
        })}
      </Kort>
    </div>
  );
}
