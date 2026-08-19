/* src/moduler/booking/Bookingopsaetning.jsx
 * Satsarket + eksempelberegning.
 *
 * Eksemplet kalder beregnBooking() — SAMME funktion som Booking bruger til
 * "Estimeret beløb". I mockuppen var de to tal beregnet hver for sig, og
 * eksemplet viste 11.585 kr hvor satserne gav 11.677 kr.
 *
 * ⚠ SATSARKET ER FLYTTET UD AF FILEN (PRISER.md etape 5). Det stod som en
 * `const` her, og skærmen viste altså et satsark ingen kunne rette. Det
 * ligger nu i `omkostninger`-noden.
 *
 * ⚠ OG DET ER OMKOSTNINGER, IKKE PRISER. Fanerne hedder "Omkostninger &
 * satser" og "Bilomkostninger", fordi det er hvad turen koster OS — ikke hvad
 * kunden betaler. Kundens priser bor i Kunder & Priser. Beslutning 11 findes
 * for den forskel: driftsomkostning pr. km er ikke kalkulationspris pr. km.
 *
 * Tre fejl fra mockuppen er rettet her:
 *  1. Eurotunnel lå på ruten København–Hamburg. Eurotunnel er Calais–
 *     Folkestone. Femern (Rødby–Puttgarden) er tilføjet i stedet.
 *  2. Storebælt stod til 750 kr. Erhvervstaksten for lastbiler 10–20 m er
 *     887 kr med grøn rabat / 1.020 kr uden (2026). Verificér mod din egen
 *     Storebælt Erhvervsaftale — rabatten er progressiv på månedsbasis.
 *  3. Valutakolonnen sagde "kr" for agenter i Hamburg, Paris, Milano og
 *     Bruxelles. Satser er nu eksplicit DKK, og EUR-agenter skal have kurs
 *     og kursdato på bookingen (se ARKITEKTUR.md).
 */
import { useMemo, useState } from "react";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { useListe } from "../../fleet/useListe.js";
import { beregnBooking, METODER, satsPaa } from "../../fleet/pricing.js";
import { omkostningsark } from "../../fleet/omkostninger.js";
import { samletLaengdeMm } from "../../fleet/flaade.js";
import { harModul } from "../../fleet/moduler.js";
import { kr, num, dato, INTET } from "../../fleet/format.js";
import { Kort, Tabel, Pille, Knap, Gitter, Tom, Henter, Datatilstand } from "../../fleet/ui.jsx";
import { blokerer } from "../../fleet/datatilstand.js";
import { DEMO_OMKOSTNINGER } from "../../fleet/demo-omkostninger.js";
import { DEMO_KOERETOEJER } from "../../fleet/demo-flaade.js";

const FANER = [
  { key: "generelt", label: "Generelt" },
  { key: "satser", label: "Omkostninger & satser" },
  { key: "agenter", label: "Agenter" },
  { key: "regler", label: "Prisregler" },
  { key: "biler", label: "Bilomkostninger" },
];

/* ⚠ SATSARKET LÅ HER SOM EN `const`, og det var den vigtigste linje i
   PRISER.md's tabel over hvad der gjorde ondt: skærmen viste et satsark ingen
   kunne rette, og der fandtes ingen omkostningssatser i databasen.

   Det ligger nu i `omkostninger`-noden, med demo-sættet i
   `demo-omkostninger.js`. Tallene er de samme — flytningen skal kunne
   efterprøves, og giver eksempelberegningen et andet resultat, er det
   flytningen der er gået galt frem for prismotoren. */

/* Eksempelbooking pr. division. Femern — ikke Eurotunnel, og ikke Storebælt
   oveni.

   ⚠ PASSAGER KAN VÆRE GEOGRAFISK UMULIGE, OG PRISMOTOREN BROKKER SIG IKKE.
   beregnForloeb() lægger sammen hvad den får. Står der både Storebælt og
   Femern på en tur mod syd, bliver det til en pris ingen kan forklare — og
   det er ikke en beregningsfejl, men en datafejl ingen kontrol fanger.

   Om ruteopslaget skal validere geografien, eller om der skal være et katalog
   over gensidigt udelukkende passager, er et ÅBENT SPØRGSMÅL. Det hører
   sammen med HERE-integrationen — se ARKITEKTUR. Indtil da findes listen kun
   som UDELUKKER_HINANDEN i demo-etaper.js, hvor selvkontrollen bruger den. */
const EKSEMPLER = {
  gods: {
    /* ⚠ KØRETØJETS ID, ikke et navn fra et satsark. Satsen nøgles på
       bilen, og navnet står kun ét sted — i `koeretoejer`. */
    bilId: "kt-012",
    rute: "København → Hamburg",
    kmEstimeret: 780,
    doegnParkering: 1,
    agentId: "hthHamburg",
    /* ⚠ FEMERN-RUTEN, IKKE BEGGE. Eksemplet havde både bro:storebaelt og
       faerge:femern, og det er geografisk umuligt: København → Hamburg går
       ENTEN over Storebælt + Jylland + Padborg ELLER over Femern
       (Rødby–Puttgarden). Man kører den ene vej eller den anden.
       Fejlen kom da Eurotunnel blev rettet til Femern under beslutning 17 —
       Storebælt blev ikke taget ud samtidig. Femern er den korte rute.
       En vognmand med Hamburg-kørsel ser den slags på tre sekunder. */
    passager: { "faerge:femern": 1, "parkering:europa": 1 },
  },
  bus: {
    bilId: "kt-b12",
    rute: "København → Berlin",
    kmEstimeret: 620,
    doegnParkering: 1,
    agentId: "berlinBusPark",
    /* Samme rettelse. Berlin nås også over Femern. */
    passager: { "faerge:femern": 1, "parkering:europa": 1 },
  },
};

/* ⚠ SKÆRMENS EGEN KOPI AF DIVISIONSFILTERET ER VÆK. Den manglede leddet om
   at en post UDEN division vises i BEGGE — og den fejl ville have tømt
   biltabellen i både Gods og Bus, uden at nogen havde slettet en bil.
   useListe ejer reglen nu, som filens gamle kommentar selv bad om. */

export default function Bookingopsaetning() {
  const { periode, division, moduler } = useFleet();
  const [fane, setFane] = useState("satser");
  const [aendret, setAendret] = useState(false);

  /* ⚠ DIVISIONSFILTERET ER useListe'S — ikke skærmens eget. Kopien her
     manglede leddet om at en post UDEN division vises i BEGGE, og den fejl
     ville have tømt biltabellen i både Gods og Bus uden at nogen havde
     slettet en bil. Filens gamle kommentar bad selv om den her rettelse. */
  const { data: raekker, tilstand, genindlaes, henter } = useListe("omkostninger", {
    vindue: "alle", graense: 500, demo: DEMO_OMKOSTNINGER,
  });
  /* ⚠ NAVNET STÅR PÅ KØRETØJET. Satsen nøgles på bilen, og listen hentes kun
     hvis tenanten har Flåde — uden modulet findes noden ikke, og svaret ville
     være en afvisning frem for et tomt satsark. */
  const { data: koeretoejer } = useListe("koeretoejer", {
    division: "alle", vindue: "alle", graense: 500, demo: DEMO_KOERETOEJER,
    hent: harModul(moduler, "flaade"),
  });

  const eksempel = EKSEMPLER[division] || EKSEMPLER.gods;
  const ark = useMemo(
    () => omkostningsark(raekker, { koeretoejer }),
    [raekker, koeretoejer]
  );
  /* ⚠ LÆNGDEN ER EN INDDATA TIL PRISEN — trin 3 af beslutning 18. Færgen
     tager betaling efter kajmeter, og uden den her linje ville eksemplet få
     "længden er ikke oplyst" på hver eneste færgelinje.

     ⚠ OG DEN KOMMER FRA samletLaengdeMm(), IKKE FRA BILENS EGET FELT. Et
     eksempel med én bil ser ens ud i begge tilfælde — men et vogntog er
     trækker PLUS trailer, og med bilens eget felt ville traileren være gratis
     på færgen. Samme fejl som ét `koeretoejId` på en etape. */
  const laengdeMm = useMemo(() => {
    const bil = koeretoejer.find((k) => k.id === eksempel.bilId);
    return bil ? samletLaengdeMm([bil]) : null;
  }, [koeretoejer, eksempel.bilId]);

  const beregning = useMemo(
    () => beregnBooking({ ...eksempel, laengdeMm }, ark, { paaMs: periode.til }),
    [eksempel, laengdeMm, ark, periode.til]
  );

  if (henter) return <Henter hvad="omkostningerne" />;

  /* ⚠ SKÆRMEN HÅNDTEREDE KUN `henter`. `tilstand` blev regnet og
     `Datatilstand` importeret — og INGEN af dem blev brugt. Blev læsningen af
     `omkostninger` afvist, faldt den igennem til et TOMT satsark, og
     skærmen sagde dermed "der er ingen tillæg" hvor sandheden var "du må
     ikke se dem".

     Det er værst netop her: arket er et PRISGRUNDLAG. Et manglende
     færgetillæg er ikke en tom tabel man undrer sig over — det er et tilbud
     der er for billigt. Se beslutning 26 og noten i datatilstand.js.

     Fundet af `no-unused-vars`, ikke af et klik. */
  if (blokerer(tilstand)) return <Datatilstand tilstand={tilstand} genprov={genindlaes} />;

  /* ⚠ BILEN KAN MANGLE, og så regnes der ikke videre på et gæt. Er
     køretøjet solgt eller Flåde fravalgt, står eksemplet uden km-linje —
     et navn vi selv fandt på, ville stå i et estimat. */
  const bil = ark.biler[eksempel.bilId] || null;
  const kmSats = bil ? satsPaa(bil.kmPrisSatser, periode.til) : null;

  const poster = Object.entries(ark.poster).map(([id, p]) => ({ id, ...p }));
  const agenter = Object.entries(ark.agenter).map(([id, a]) => ({ id, ...a }));
  const biler = Object.entries(ark.biler).map(([id, b]) => ({ id, ...b }));

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <div className="fc-row">
        <div className="fc-faner" role="tablist">
          {FANER.map((f) => (
            <button key={f.key} role="tab" className="fc-fane" aria-selected={fane === f.key}
                    onClick={() => setFane(f.key)}>{f.label}</button>
          ))}
        </div>
        <Knap variant="primaer" disabled={!aendret} onClick={() => setAendret(false)}>
          Gem ændringer
        </Knap>
      </div>

      <Gitter kolonner="minmax(0,1.9fr) minmax(0,1fr)">
        <div className="fc-grid">
          {fane === "satser" && (
            <Kort titel="Standardomkostninger for booking"
                  handling={<Knap onClick={() => setAendret(true)}>Tilføj sats</Knap>}>
              <p className="fc-hint" style={{ marginBottom: 12 }}>
                Standardpriser foreslås automatisk ud fra ruten. Hvilke broer og færger en tur
                indeholder kommer fra ruteopslaget — ikke fra en antagelse om at internationale
                ture altid går gennem tunnel.
              </p>
              <Tabel
                kolonner={[
                  { key: "navn", label: "Omkostningstype" },
                  { key: "pris", label: "Standardpris", num: true,
                    render: (r) => kr(satsPaa(r.satser, periode.til)?.beloebOere, 2) },
                  { key: "valuta", label: "Valuta", render: (r) => satsPaa(r.satser, periode.til)?.valuta },
                  { key: "metode", label: "Beregningsmetode",
                    render: (r) => METODER[satsPaa(r.satser, periode.til)?.metode]?.label },
                  { key: "gyldig", label: "Gyldig fra",
                    render: (r) => dato(satsPaa(r.satser, periode.til)?.gyldigFra) },
                  { key: "aktiv", label: "Status", render: () => <Pille tone="ok">Aktiv</Pille> },
                ]}
                raekker={poster}
              />
            </Kort>
          )}

          {fane === "agenter" && (
            <Kort titel="Agentparkering"
                  handling={<Knap onClick={() => setAendret(true)}>Tilføj agent</Knap>}>
              <p className="fc-hint" style={{ marginBottom: 12 }}>
                Parkeringspriser pr. agent. Indsættes automatisk ved valg af agent i en booking.
                Fakturerer agenten i EUR, skal bookingen gemme kurs og kursdato — ellers ændrer
                gamle bookinger sig når kursen flytter.
              </p>
              <Tabel
                kolonner={[
                  { key: "navn", label: "Agent" },
                  { key: "by", label: "By" },
                  { key: "pris", label: "Pris pr. døgn", num: true,
                    render: (r) => kr(satsPaa(r.satser, periode.til)?.beloebOere, 2) },
                  { key: "valuta", label: "Valuta", render: (r) => satsPaa(r.satser, periode.til)?.valuta },
                  { key: "note", label: "Noter" },
                  { key: "aktiv", label: "Status", render: () => <Pille tone="ok">Aktiv</Pille> },
                ]}
                raekker={agenter}
              />
            </Kort>
          )}

          {fane === "biler" && (
            <Kort titel="Kalkulationspris pr. km (inkl. chauffør)"
                  handling={<Knap onClick={() => setAendret(true)}>Redigér sats</Knap>}>
              <p className="fc-hint" style={{ marginBottom: 12 }}>
                Dette er <b>kalkulationsprisen</b> — inkl. brændstof, vejafgifter, dæk,
                vedligehold og chauffør. Den er ikke det samme som{" "}
                <b>driftsomkostning pr. km</b> i Fleet, som er uden chauffør. To felter der
                begge hed "kr/km" i mockupsene.
              </p>
              <Tabel
                kolonner={[
                  { key: "navn", label: "Bil" },
                  { key: "registrering", label: "Registrering" },
                  { key: "pris", label: "Km-pris", num: true,
                    render: (r) => `${kr(satsPaa(r.kmPrisSatser, periode.til)?.beloebOere, 2)}/km` },
                  { key: "valuta", label: "Valuta",
                    render: (r) => satsPaa(r.kmPrisSatser, periode.til)?.valuta },
                  { key: "gyldig", label: "Gyldig fra",
                    render: (r) => dato(satsPaa(r.kmPrisSatser, periode.til)?.gyldigFra) },
                ]}
                raekker={biler}
              />
            </Kort>
          )}

          {(fane === "generelt" || fane === "regler") && (
            <Kort titel={fane === "generelt" ? "Generelt" : "Prisregler"}>
              <Tom>Denne fane er ikke tegnet endnu.</Tom>
            </Kort>
          )}
        </div>

        <div className="fc-grid">
          <Kort titel="Automatisk beregning – eksempel">
            {/* ⚠ BILEN KAN MANGLE — se noten hvor arket bygges. Så står der
                hvorfor, frem for et navn skærmen selv fandt på. */}
            <div style={{ fontWeight: 650, marginBottom: 2 }}>
              {bil ? `${bil.navn} – Int. Hamburg` : "Eksempel uden bil"}
            </div>
            <div className="fc-linje"><span>Rute</span><b>{eksempel.rute}</b></div>
            <div className="fc-linje"><span>Km estimeret</span><b>{num(eksempel.kmEstimeret)} km</b></div>
            {/* ⚠ "KM-OMKOSTNING", IKKE "KALKULATIONSPRIS". Beslutning 11: det
                er to forskellige tal, og de kan pege hver sin vej. Det her er
                hvad kilometeren koster os. */}
            <div className="fc-linje">
              <span>Km-omkostning</span>
              {kmSats
                ? <b>{kr(kmSats.beloebOere, 2)}/km</b>
                : <b className="fc-bad">ingen sats</b>}
            </div>

            {/* ⚠ LÆNGDEN STÅR PÅ EKSEMPLET, fordi den er en INDDATA til
                færgetaksten og ikke en oplysning om bilen. Kan man ikke se
                den, kan man heller ikke se hvorfor færgen koster det den
                gør. Trin 3 af beslutning 18. */}
            <div className="fc-linje">
              <span>Længde (kajmeter)</span>
              {Number.isFinite(laengdeMm)
                ? <b>{num(laengdeMm / 1000, 2)} m</b>
                : <b className="fc-bad">ikke oplyst</b>}
            </div>

            <div style={{ marginTop: 14 }}>
              {beregning.linjer.map((l) => (
                <div key={l.id} className="fc-linje">
                  <span>{l.navn}</span>
                  {/* ⚠ EN LINJE UDEN TAKST SKRIVER IKKE "0 kr.". kr() skelner
                      med vilje ikke — kun kalderen ved om nul er et svar, og
                      her er det ikke: færgen sejler, vi kender bare ikke
                      prisen. Se noten ved kr() i format.test.mjs. */}
                  {l.manglerSats
                    ? <b className="fc-bad">{INTET}</b>
                    : <b>{kr(l.beloebOere, 2)}</b>}
                </div>
              ))}
            </div>

            <div className="fc-sum">
              <div>
                <div style={{ fontWeight: 650 }}>Samlet estimeret bookingomkostning</div>
                <div className="fc-hint">
                  {beregning.manglerSats
                    ? "en eller flere takster mangler — summen kan ikke gøres op"
                    : "ekskl. moms"}
                </div>
              </div>
              {/* ⚠ EN SUM MED ET UBESVARET LED ER IKKE EN SUM. Skrev vi
                  kr(null), stod der "0 kr." — og en for lav total er den
                  retning ingen opdager. */}
              <div className="fc-sum-v">
                {beregning.totalOere === null ? INTET : kr(beregning.totalOere, 2)}
              </div>
            </div>
          </Kort>

          <Kort titel="Sådan bruges satserne">
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>
              <li>Vælger sagsbehandleren en agent, hentes agenttaksten automatisk.</li>
              <li>Vælges en bil, bruges bilens kalkulationspris pr. km.</li>
              <li>Broer og færger kommer fra ruteopslaget, ikke fra transporttypen.</li>
              <li>Satser kan overstyres på den enkelte booking — overstyringen gemmes
                  med bruger og begrundelse, satsen ændres ikke.</li>
              <li>Hver booking gemmer et snapshot af de satser den blev beregnet med.</li>
            </ul>
          </Kort>
        </div>
      </Gitter>
    </div>
  );
}
