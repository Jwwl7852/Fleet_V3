/* src/moduler/booking/Bookingopsaetning.jsx
 * Satsarket + eksempelberegning.
 *
 * Eksemplet kalder beregnBooking() — SAMME funktion som Booking bruger til
 * "Estimeret beløb". I mockuppen var de to tal beregnet hver for sig, og
 * eksemplet viste 11.585 kr hvor satserne gav 11.677 kr.
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
import { beregnBooking, METODER, satsPaa } from "../../fleet/pricing.js";
import { kr, num, dato } from "../../fleet/format.js";
import { Kort, Tabel, Pille, Knap, Gitter, Tom } from "../../fleet/ui.jsx";

const FANER = [
  { key: "generelt", label: "Generelt" },
  { key: "satser", label: "Omkostninger & satser" },
  { key: "agenter", label: "Agenter" },
  { key: "regler", label: "Prisregler" },
  { key: "biler", label: "Bilomkostninger" },
];

/* Satsarket. Bemærk gyldigFra på hver sats: satser overskrives ALDRIG, de
   får en ny post. Ellers ændrer en rettelse i dag prisen på en booking fra
   sidste kvartal, og så kan fakturaen ikke forklares.

   division står eksplicit på poster og agenter (beslutning 15). Broer, færger
   og vejafgifter er "faelles" — Storebælt koster det samme uanset hvilken
   afdeling der kører over den. En agent hører til én afdeling.

   BILERNE HAR INGEN DIVISION, og det er ikke en forglemmelse. Beslutning 19:
   et køretøj er defineret ved sin ART, ikke ved en afdeling, og reglerne
   afviser feltet på koeretoejer/ med .validate: false. Posterne her lå med
   division: "gods" / "bus" fra før beslutningen blev taget — de beskrev altså
   samme bil efter en anden regel end fleet/demo-flaade.js gør.

   Bilernes navne og registreringsnumre skal matche demo-flaade.js, som er
   kilden. Volvo FH 500 er DE 12 345 dér og skal være DE 12 345 her. */
const START = Date.UTC(2026, 0, 1);
const SATSARK = {
  poster: {
    "faerge:femern": { navn: "Færge: Femern (Rødby–Puttgarden)", kategori: "faerge", division: "faelles",
      satser: [{ gyldigFra: START, beloebOere: 215000, metode: "prPassage", valuta: "DKK", aktiv: true }] },
    "faerge:oevrige": { navn: "Færger (øvrige)", kategori: "faerge", division: "faelles",
      satser: [{ gyldigFra: START, beloebOere: 215000, metode: "fastPrBooking", valuta: "DKK", aktiv: true }] },
    "bro:storebaelt": { navn: "Bro: Storebælt (lastbil 10–20 m)", kategori: "bro", division: "faelles",
      satser: [{ gyldigFra: START, beloebOere: 88700, metode: "prPassage", valuta: "DKK", aktiv: true }] },
    "bro:oeresund": { navn: "Bro: Øresund", kategori: "bro", division: "faelles",
      satser: [{ gyldigFra: START, beloebOere: 91000, metode: "prPassage", valuta: "DKK", aktiv: true }] },
    "tunnel:eurotunnel": { navn: "Eurotunnel (Calais–Folkestone)", kategori: "tunnel", division: "faelles",
      satser: [{ gyldigFra: START, beloebOere: 235000, metode: "prPassageEnVej", valuta: "DKK", aktiv: true }] },
    "parkering:europa": { navn: "Parkering Europa (gennemsnit)", kategori: "parkering", division: "faelles",
      satser: [{ gyldigFra: START, beloebOere: 45000, metode: "prDoegn", valuta: "DKK", aktiv: true }] },
    "vejafgift:miljoezoner": { navn: "Vejafgifter / miljøzoner", kategori: "vejafgift", division: "faelles", altidPaaBooking: true,
      satser: [{ gyldigFra: START, beloebOere: 32500, metode: "fastPrBooking", valuta: "DKK", aktiv: true }] },
  },
  agenter: {
    hthHamburg: { navn: "HTH Logistics GmbH", by: "Hamburg", note: "Indendørs parkering", division: "gods",
      satser: [{ gyldigFra: START, beloebOere: 125000, metode: "prDoegn", valuta: "DKK", aktiv: true }] },
    transportsParis: { navn: "Transports Parisien SARL", by: "Paris", note: "Sikret område", division: "gods",
      satser: [{ gyldigFra: START, beloebOere: 105000, metode: "prDoegn", valuta: "DKK", aktiv: true }] },
    euroTransAms: { navn: "EuroTrans BV", by: "Amsterdam", note: "Parkeringsplads med overvågning", division: "gods",
      satser: [{ gyldigFra: START, beloebOere: 95000, metode: "prDoegn", valuta: "DKK", aktiv: true }] },
    bavariaMuenchen: { navn: "Bavaria Logistics GmbH", by: "München", note: "Overdækket parkering", division: "gods",
      satser: [{ gyldigFra: START, beloebOere: 115000, metode: "prDoegn", valuta: "DKK", aktiv: true }] },
    milanoCargo: { navn: "Milano Cargo SRL", by: "Milano", note: "Indhegnet areal", division: "gods",
      satser: [{ gyldigFra: START, beloebOere: 110000, metode: "prDoegn", valuta: "DKK", aktiv: true }] },
    bruxTrans: { navn: "BruxTrans SA", by: "Bruxelles", note: "Åbent område", division: "gods",
      satser: [{ gyldigFra: START, beloebOere: 90000, metode: "prDoegn", valuta: "DKK", aktiv: true }] },
    berlinBusPark: { navn: "Berlin Bus Park GmbH", by: "Berlin", note: "Buspladser med chaufførfaciliteter", division: "bus",
      satser: [{ gyldigFra: START, beloebOere: 85000, metode: "prDoegn", valuta: "DKK", aktiv: true }] },
  },
  biler: {
    volvoFH500: { navn: "Volvo FH 500", registrering: "DE 12 345",
      kmPrisSatser: [{ gyldigFra: START, beloebOere: 840, metode: "prKm", valuta: "DKK", aktiv: true }] },
    mercedesActros: { navn: "Mercedes Actros 1845", registrering: "DE 45 678",
      kmPrisSatser: [{ gyldigFra: START, beloebOere: 860, metode: "prKm", valuta: "DKK", aktiv: true }] },
    scaniaR450: { navn: "Scania R 450", registrering: "DE 78 901",
      kmPrisSatser: [{ gyldigFra: START, beloebOere: 830, metode: "prKm", valuta: "DKK", aktiv: true }] },
    manTGX: { navn: "MAN TGX 18.480", registrering: "DE 34 567",
      kmPrisSatser: [{ gyldigFra: START, beloebOere: 850, metode: "prKm", valuta: "DKK", aktiv: true }] },
    dafXF: { navn: "DAF XF 480", registrering: "DE 90 123",
      kmPrisSatser: [{ gyldigFra: START, beloebOere: 820, metode: "prKm", valuta: "DKK", aktiv: true }] },
    ivecoSWay: { navn: "Iveco S-Way 460", registrering: "DE 56 789",
      kmPrisSatser: [{ gyldigFra: START, beloebOere: 830, metode: "prKm", valuta: "DKK", aktiv: true }] },
    volvo9700: { navn: "Volvo 9700 turistbus", registrering: "DE 22 111",
      kmPrisSatser: [{ gyldigFra: START, beloebOere: 690, metode: "prKm", valuta: "DKK", aktiv: true }] },
    setraS516: { navn: "Setra S 516 HDH", registrering: "DE 33 222",
      kmPrisSatser: [{ gyldigFra: START, beloebOere: 715, metode: "prKm", valuta: "DKK", aktiv: true }] },
  },
};

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
    bilId: "volvoFH500",
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
    bilId: "volvo9700",
    rute: "København → Berlin",
    kmEstimeret: 620,
    doegnParkering: 1,
    agentId: "berlinBusPark",
    /* Samme rettelse. Berlin nås også over Femern. */
    passager: { "faerge:femern": 1, "parkering:europa": 1 },
  },
};

/* Samme visningsregel som useListe — og nu FAKTISK den samme.
 *
 * Den manglede leddet for poster UDEN division, og useListe's divisionsfilter
 * siger udtrykkeligt: "En post UDEN division vises i BEGGE — ikke i ingen."
 * Så længe hver eneste post havde et divisionsfelt, var forskellen usynlig.
 * Den blev synlig i det sekund bilerne mistede deres felt (beslutning 19):
 * uden det første led ville biltabellen stå tom i både Gods og Bus, uden at
 * nogen havde slettet en bil.
 *
 * Det er samme klasse fejl som beslutning 6 handler om — én regel skrevet to
 * steder, hvor den ene kopi driver. Den rigtige rettelse på sigt er at hente
 * satsarket gennem useListe frem for at gentage filteret her. */
const iDivision = (d) => ([, v]) =>
  v.division == null || v.division === d || v.division === "faelles";

export default function Bookingopsaetning() {
  const { periode, division } = useFleet();
  const [fane, setFane] = useState("satser");
  const [aendret, setAendret] = useState(false);

  const eksempel = EKSEMPLER[division] || EKSEMPLER.gods;
  const beregning = useMemo(
    () => beregnBooking(eksempel, SATSARK, { paaMs: periode.til }),
    [eksempel, periode.til]
  );
  const bil = SATSARK.biler[eksempel.bilId];
  const kmSats = satsPaa(bil.kmPrisSatser, periode.til);

  const poster = Object.entries(SATSARK.poster).filter(iDivision(division)).map(([id, p]) => ({ id, ...p }));
  const agenter = Object.entries(SATSARK.agenter).filter(iDivision(division)).map(([id, a]) => ({ id, ...a }));
  const biler = Object.entries(SATSARK.biler).filter(iDivision(division)).map(([id, b]) => ({ id, ...b }));

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
                <b>driftsomkostning pr. km</b> i Flåde, som er uden chauffør. To felter der
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
            <div style={{ fontWeight: 650, marginBottom: 2 }}>{bil.navn} – Int. Hamburg</div>
            <div className="fc-linje"><span>Rute</span><b>{eksempel.rute}</b></div>
            <div className="fc-linje"><span>Km estimeret</span><b>{num(eksempel.kmEstimeret)} km</b></div>
            <div className="fc-linje"><span>Kalkulationspris</span><b>{kr(kmSats.beloebOere, 2)}/km</b></div>

            <div style={{ marginTop: 14 }}>
              {beregning.linjer.map((l) => (
                <div key={l.id} className="fc-linje">
                  <span>{l.navn}</span><b>{kr(l.beloebOere, 2)}</b>
                </div>
              ))}
            </div>

            <div className="fc-sum">
              <div>
                <div style={{ fontWeight: 650 }}>Samlet estimeret bookingomkostning</div>
                <div className="fc-hint">ekskl. moms</div>
              </div>
              <div className="fc-sum-v">{kr(beregning.totalOere, 2)}</div>
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
