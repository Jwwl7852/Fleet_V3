/* src/fleet/Indberetningtriage.jsx
 * Knapperne der flytter en indberetning gennem FORLOEB — Skive 3B.
 *
 * ⚠ SAMME SNIT SOM Statusskifte.jsx. KNAPPERNE TEGNES AF MASKINEN, IKKE AF EN
 * LISTE HER. `FORLOEB[i.forloeb].naeste` siger hvad der kan lade sig gøre, og
 * `indberetningTriage` afviser med den SAMME `kanSkifteTil()`. En knap der
 * ikke svarer til en overgang, er en pæn knap; en overgang uden en knap er en
 * vej ingen kan finde.
 *
 * ⚠ "planlagt" ER IKKE EN AF DENNE FILS KNAPPER. Det skift opretter samtidig
 * en driftsopgave — det er `Planlaegdialog`, gennem `planlaegOpgave()`. Ser
 * maskinen at "planlagt" er en lovlig næste tilstand, tegnes der en knap der
 * kalder `onPlanlaeg()` i stedet for at skrive selv.
 *
 * ⚠ INGEN BEGRUNDELSE VED "Markér som vurderet" — samme begrundelse som
 * Statusskifte.jsx: dagens model har intet felt til den, og en begrundelse
 * uden et sted at stå ville enten blive fritekst på vej mod auditloggen
 * (forbudt, se audit-regler.js) eller gå tabt. "Afslut" har derimod
 * `ingenOmkostning.begrundelse` — et felt modellen allerede bærer.
 *
 * ⚠ SKIVE 3B.1 — KNAPPEN HED "Sæt på afvent". Det er IKKE et sandt
 * brugerbegreb: "afvent" antyder at noget er sat i BERO, mens den gemte
 * tilstand er `FORLOEB.vurderet` — "nogen har SET og VURDERET meldingen".
 * De to er ikke det samme, og en tekst der lover det ene og gemmer det
 * andet, er den slags forskel en bruger opdager for sent. Statusmaskinen
 * er uændret; kun ordet på knappen er rettet.
 */
import { useState } from "react";
import { Knap, Pille, Raekke, Dialog, Felt, Formular, Formularsvar } from "./ui.jsx";
import { FORLOEB, kanAfslutte } from "./indberetninger.js";
import { PRIORITET, ALLE_PRIORITETER } from "./prioritet.js";
import { trigeIndberetning } from "./indberetningplan.js";

export default function Indberetningtriage({ indberetning: i, maaSkrive = false, onPlanlaeg, onSkiftet }) {
  const [svar, saetSvar] = useState(null);
  const [gemmer, saetGemmer] = useState(false);
  const [spoerger, saetSpoerger] = useState(false);

  if (!i) return null;

  /* ⚠ UDGIFTSREGISTRERINGER HAR INTET FORLOEB — beslutning 106. En tankning
     starter ikke et arbejde nogen skal følge; den skal bare bogføres. Denne
     fil tegner derfor ingenting for dem, frem for en maskine der altid siger
     "ingen skift". */
  if (!i.forloeb) return null;

  const maal = FORLOEB[i.forloeb]?.naeste;

  /* ⚠ EN ENDESTATION FÅR EN SÆTNING, IKKE EN TOM RÆKKE — se Statusskifte. */
  if (!maal) {
    return (
      <p className="fc-hint" style={{ marginTop: 10 }}>
        Indberetningen har et forløb triagen ikke kender (<code>{String(i.forloeb)}</code>),
        så der er ingen skift at tilbyde.
      </p>
    );
  }
  if (!maal.length) {
    return (
      <p className="fc-hint" style={{ marginTop: 10 }}>
        <b>{FORLOEB[i.forloeb]?.label}</b> er en endestation — en afsluttet
        indberetning genåbnes ikke.
      </p>
    );
  }

  const afslut = kanAfslutte(i);

  const skift = async (handling, begrundelse, prioritet) => {
    saetGemmer(true);
    saetSvar(null);
    const r = await trigeIndberetning({ id: i.id, handling, begrundelse, prioritet });
    saetGemmer(false);
    saetSvar(r);
    saetSpoerger(false);
    if (r.ok) onSkiftet?.(handling);
  };

  return (
    <>
      <Raekke>
        {maal.map((status) => {
          if (status === "planlagt") {
            return (
              <Knap key={status} variant="primaer"
                disabled={!maaSkrive}
                title={maaSkrive ? "Åbner Planlæg aktivitet, forudfyldt fra indberetningen."
                                  : "Kræver indberetninger.skrivAlle."}
                onClick={onPlanlaeg}>
                Planlæg aktivitet
              </Knap>
            );
          }
          if (status === "afsluttet") {
            /* ⚠ ÉN AD GANGEN. Er "afsluttet" den ENESTE overgang tilbage
               (efter planlagt/vurderet er brugt), er den den primære — samme
               logik som PRIMAER i Statusskifte, udledt frem for tabuleret. */
            const primaer = maal.length === 1;
            return (
              <Knap key={status} variant={primaer ? "primaer" : "sekundaer"}
                disabled={!maaSkrive || gemmer}
                title={!maaSkrive ? "Kræver indberetninger.skrivAlle."
                                   : afslut.ok ? "Luk indberetningen — pengesiden er afklaret."
                                               : afslut.aarsager[0]}
                onClick={() => (afslut.ok ? skift("afsluttet") : saetSpoerger(true))}>
                Afslut
              </Knap>
            );
          }
          /* ⚠ "vurderet" ER TRE KNAPPER, IKKE ÉN — TILFØJET 2026-09-05.
             Produktejerens triageflow: prioritering ER vurderet-skiftet.
             Rækkefølgen er ALLE_PRIORITETER's egen (lav→normal→hoej,
             prioritet.js), ikke "mest akut først" — samme begrundelse som
             kataloget selv giver for ikke at vende den om. */
          return (
            <span key={status} className="fc-row" style={{ display: "inline-flex", gap: 6 }}>
              {ALLE_PRIORITETER.map((p) => (
                <Knap key={p} variant="sekundaer"
                  disabled={!maaSkrive || gemmer}
                  title={maaSkrive
                    ? `Prioritér "${PRIORITET[p].label}" og markér som vurderet af driften.`
                    : "Kræver indberetninger.skrivAlle."}
                  onClick={() => skift(status, undefined, p)}>
                  <Pille tone={PRIORITET[p].pill}>{PRIORITET[p].label}</Pille>
                </Knap>
              ))}
            </span>
          );
        })}
      </Raekke>

      <Formularsvar svar={svar} okTekst="Forløbet er opdateret." />

      {spoerger && (
        <AfslutDialog
          i={i} afslut={afslut} gemmer={gemmer}
          onLuk={() => saetSpoerger(false)}
          onAfslut={(begrundelse) => skift("afsluttet", begrundelse)}
        />
      )}
    </>
  );
}

/**
 * ⚠ SAMME BEGRUNDELSE SOM kanAfslutte() KRÆVER, og INGEN ANDEN. Uden den kan
 * "dækket af garantien" ikke skelnes fra "vi glemte fakturaen" — se
 * kanAfslutte()'s eget hoved i indberetninger.js. Serveren er den
 * autoritative dommer; dialogen her genbruger blot den samme funktion for at
 * kunne svare med det samme.
 */
function AfslutDialog({ i, afslut, gemmer, onLuk, onAfslut }) {
  const [begrundelse, saetBegrundelse] = useState("");

  return (
    <Dialog titel="Afslut indberetning"
            under="Pengesiden skal være afklaret, før forløbet kan lukkes."
            onLuk={onLuk}>
      <Formular
        onGem={() => onAfslut(begrundelse)}
        gemmer={gemmer}
        gemLabel="Afslut"
        onAnnuller={onLuk}
      >
        {!afslut.ok && (
          <ul style={{ margin: "0 0 8px 18px" }}>
            {afslut.aarsager.map((a, n) => <li key={n} className="fc-hint">{a}</li>)}
          </ul>
        )}
        <Felt id="tri-begrundelse" label="Begrundelse — ingen omkostning"
              vaerdi={begrundelse} saet={saetBegrundelse}
              placeholder="Fx: dækket af garantien, kørt på eget værksted"
              maxLength={500}
              hint="Kun nødvendig når der hverken er registreret et beløb eller et indkøb." />
        {i.omkostningOere > 0 && (
          <p className="fc-hint" style={{ marginTop: 6 }}>
            Der står allerede en registreret omkostning — begrundelsen er ikke nødvendig.
          </p>
        )}
      </Formular>
    </Dialog>
  );
}
