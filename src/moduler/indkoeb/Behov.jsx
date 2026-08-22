/* src/moduler/indkoeb/Behov.jsx
 * Indkøbsbehov — trin 1 af fem (beslutning 78, etape 2).
 *
 * Plancherne: "Indmeldte behov", grupperet på kilde, med indmeldingen ved
 * siden af. På en telefon står de over hinanden — samme rute, samme kode.
 *
 * ⚠ INDMELDINGEN ER RESPONSIV, IKKE EN APP. Planchen viser den som en
 * mobilskærm, og kunden valgte web frem for at vente på en app: en medarbejder
 * åbner den på telefonen uden at installere noget, og den virker med det
 * samme. Én rute, én kode.
 *
 * ⚠ GRUPPERINGEN ER PÅ KILDEN, OG KILDEN ER ET KATALOG. Fire værdier i
 * `procure.js`, håndhævet af reglen. En femte stavemåde ville lave en gruppe
 * mere som ingen har besluttet og ingen overskrift tegner.
 *
 * ⚠ OG EN TOM GRUPPE VISES IKKE — men det SIGES. En kilde uden behov er et
 * svar; en kilde der bare mangler, er en fejl. Forskellen skal kunne ses, og
 * derfor står antallet på hvert filter.
 */
import { useState } from "react";
import { useListe } from "../../fleet/useListe.js";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { dato, klokke, num } from "../../fleet/format.js";
import {
  Kort, Tom, Tabel, Pille, Henter, Datatilstand, Knap, Felt, Feltraekke,
  Formular, Formularsvar, Ikon,
} from "../../fleet/ui.jsx";
import { blokerer } from "../../fleet/datatilstand.js";
import { harPerm, PERM } from "../../fleet/permissions.js";
import {
  BEHOVKILDE, ALLE_BEHOVKILDER, BEHOVSTATUS, PRIORITET,
} from "../../fleet/procure.js";
import { meldBehov, afvisBehov } from "../../fleet/behov.js";
import { DEMO_INDKOEBSBEHOV } from "../../fleet/demo-procure.js";
import { DEMO_PERSONALE } from "../../fleet/demo-personale.js";

const IKON_FOR_KILDE = {
  snedkeri: "skruenoegle", lager: "kasse", kontor: "bygning", kontantkoeb: "seddel",
};

/* ⚠ ÉN TOM FORM, ÉT STED. To formularer med hver sit udgangspunkt driver — og
   den ene glemmer et felt den anden har. */
const TOM = { vare: "", kilde: "snedkeri", antal: "", enhed: "stk", prioritet: "", note: "" };

export default function Behov() {
  const { bruger } = useFleet();
  const maaSkrive = harPerm(bruger?.perms, PERM.indkoebSkriv);

  const [valgtKilde, setValgtKilde] = useState("alle");
  const [post, setPost] = useState(TOM);
  const [svar, setSvar] = useState(null);
  const [gemmer, setGemmer] = useState(false);
  const [afviser, setAfviser] = useState(null);
  const [grund, setGrund] = useState("");

  const behovListe = useListe("indkoebsbehov", {
    ordnPaa: "oprettetMs", vindue: "alle", graense: 500,
    demo: DEMO_INDKOEBSBEHOV,
  });
  const folk = useListe("personale", {
    vindue: "alle", graense: 500, demo: DEMO_PERSONALE,
  });

  if (behovListe.henter) return <Henter hvad="indkøbsbehov" />;
  if (blokerer(behovListe.tilstand)) {
    return <Datatilstand tilstand={behovListe.tilstand} genprov={behovListe.genindlaes} />;
  }

  const alle = behovListe.data;
  const navnFor = (id) => folk.data.find((p) => p.id === id)?.navn || id || "—";

  /* ⚠ ET AFVIST BEHOV LIGGER IKKE I INDBAKKEN. Det er taget stilling til —
     men det SLETTES ikke, så det kan slås op. Se `afvisBehov()`. */
  const aabne = alle.filter((b) => b.status !== "afvist" && b.status !== "bestilt");
  const iKilden = (k) => aabne.filter((b) => b.kilde === k);
  const viste = valgtKilde === "alle" ? aabne : iKilden(valgtKilde);

  const saet = (felt) => (v) => setPost((p) => ({ ...p, [felt]: v }));

  const gem = async () => {
    setGemmer(true);
    const r = await meldBehov({
      ...post,
      /* ⚠ TOM STRENG ER IKKE ET TAL. `Number("")` er 0, og et behov på
         "0 stk." ville blive taget imod som et svar. Feltet er valgfrit —
         tomt betyder ubesvaret, ikke nul. */
      antal: post.antal === "" ? undefined : Number(post.antal),
    });
    setSvar(r);
    setGemmer(false);
    if (r.ok) {
      setPost(TOM);
      behovListe.genindlaes();
    }
  };

  const afvis = async () => {
    const r = await afvisBehov(afviser?.id, grund);
    setSvar(r);
    if (r.ok) {
      setAfviser(null);
      setGrund("");
      behovListe.genindlaes();
    }
  };

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <Datatilstand tilstand={behovListe.tilstand} genprov={behovListe.genindlaes} />

      {/* ⚠ FILTRENE BÆRER DERES ANTAL. "Snedkeri 4" er en oplysning; "Snedkeri"
          alene er en knap man skal klikke på for at finde ud af om der er
          noget. Og en kilde med nul står stadig — så kan man se at den findes
          og er tom, frem for at tro at grupperingen mangler. */}
      <Kort>
        <div className="fc-filtre" role="group" aria-label="Kilde">
          <Knap variant={valgtKilde === "alle" ? "primaer" : "sekundaer"}
                onClick={() => setValgtKilde("alle")}>
            Alle kilder {num(aabne.length)}
          </Knap>
          {ALLE_BEHOVKILDER.map((k) => (
            <Knap key={k} variant={valgtKilde === k ? "primaer" : "sekundaer"}
                  onClick={() => setValgtKilde(k)}>
              {BEHOVKILDE[k]} {num(iKilden(k).length)}
            </Knap>
          ))}
        </div>
      </Kort>

      {/* ⚠ TO SPALTER DER KLAPPER SAMMEN AF SIG SELV. `auto-fit` med et
          minimum er samme greb som `.fc-kpis` og `.fc-feltraekke` bruger —
          ingen media query, og indmeldingen lander UNDER indbakken på en
          telefon frem for at blive presset. Det er hele grunden til at den
          kunne bygges responsivt frem for som en app. */}
      <div className="fc-grid"
           style={{ gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16 }}>
        {/* ---- Indbakken ------------------------------------------------ */}
        <div className="fc-grid" style={{ gap: 16 }}>
          {(valgtKilde === "alle" ? ALLE_BEHOVKILDER : [valgtKilde]).map((k) => {
            const raekker = iKilden(k);
            /* ⚠ EN TOM GRUPPE TEGNES IKKE — antallet står på filteret ovenfor,
               så udeladelsen kan ses. En overskrift uden rækker ser ud som om
               noget mangler at blive hentet. */
            if (!raekker.length) return null;
            return (
              <Kort key={k}
                    titel={<span className="fc-med-ikon">
                      <Ikon navn={IKON_FOR_KILDE[k]} /> {BEHOVKILDE[k]} ({num(raekker.length)})
                    </span>}>
                <Tabel
                  raekker={raekker}
                  kolonner={[
                    { key: "vare", label: "Vare", render: (r) => (
                        <>
                          <b>{r.vare}</b>
                          {r.varenummer && <div className="fc-hint">{r.varenummer}</div>}
                        </>
                      ) },
                    { key: "anmoder", label: "Anmoder", render: (r) => navnFor(r.anmoderId) },
                    { key: "tid", label: "Tidspunkt", render: (r) => (
                        <>{dato(r.oprettetMs)} <span className="fc-hint">{klokke(r.oprettetMs)}</span></>
                      ) },
                    { key: "prioritet", label: "Prioritet", render: (r) => (
                        r.prioritet
                          ? <Pille tone={r.prioritet === "hoej" ? "bad"
                              : r.prioritet === "mellem" ? "warn" : "ok"}>
                              {PRIORITET[r.prioritet]}
                            </Pille>
                          : <span className="fc-hint">—</span>
                      ) },
                    /* ⚠ ET MANGLENDE ANTAL SKRIVER — OG IKKE 0. Feltet er
                       valgfrit med vilje: den der melder ind, ved hvad han
                       mangler, ikke hvor meget der er i en pakke. Et nul ville
                       være en påstand om at der ikke skal bestilles noget. */
                    { key: "antal", label: "Antal", num: true, render: (r) => (
                        Number.isFinite(r.antal)
                          ? `${num(r.antal)} ${r.enhed || ""}`.trim()
                          : <span className="fc-hint" title="Antallet er ikke oplyst — det sættes ved bestilling.">—</span>
                      ) },
                    { key: "note", label: "Notat", render: (r) => r.note || <span className="fc-hint">—</span> },
                    { key: "status", label: "Status", render: (r) => (
                        <Pille tone={BEHOVSTATUS[r.status]?.tone || "info"}>
                          {BEHOVSTATUS[r.status]?.label || r.status}
                        </Pille>
                      ) },
                    { key: "handling", label: "", render: (r) => (
                        maaSkrive
                          ? <Knap onClick={() => { setAfviser(r); setGrund(""); }}>Afvis</Knap>
                          : null
                      ) },
                  ]}
                />
              </Kort>
            );
          })}

          {!viste.length && (
            <Kort titel="Indbakke">
              <Tom>
                Ingen åbne behov{valgtKilde !== "alle" && ` fra ${BEHOVKILDE[valgtKilde]}`}.
                Et behov er en medarbejder der siger hvad han mangler — det
                bliver til en bestilling i næste trin.
              </Tom>
            </Kort>
          )}
        </div>

        {/* ---- Indmeldingen --------------------------------------------- */}
        <Kort titel="Rapportér behov">
          <p className="fc-hint" style={{ marginTop: 0 }}>
            Fortæl hvad du mangler — så klarer vi resten.
          </p>

          {!maaSkrive ? (
            <Tom>
              Du må ikke melde behov ind. Det kræver <code>indkoeb.skriv</code>.
            </Tom>
          ) : (
            <Formular onGem={gem} gemmer={gemmer} gemLabel="Send melding"
                      kanGemme={Boolean(post.vare.trim())}>
              <Felt id="b-kilde" label="Vælg kilde" kraevet
                    vaerdi={post.kilde} saet={saet("kilde")}
                    valgmuligheder={ALLE_BEHOVKILDER.map((k) => ({ vaerdi: k, label: BEHOVKILDE[k] }))} />
              <Felt id="b-vare" label="Vare" kraevet
                    vaerdi={post.vare} saet={saet("vare")}
                    hint="Skriv det du mangler — det behøver ikke være et varenummer." />
              <Feltraekke>
                {/* ⚠ ANTALLET ER VALGFRIT, og hintet siger hvorfor. Et krævet
                    felt ville blive udfyldt med et gæt af den der ikke ved
                    det — og gættet ville gå med i en bestilling. */}
                <Felt id="b-antal" label="Antal" type="number"
                      vaerdi={post.antal} saet={saet("antal")}
                      hint="Valgfrit — sættes ved bestilling hvis du ikke ved det." />
                <Felt id="b-enhed" label="Enhed"
                      vaerdi={post.enhed} saet={saet("enhed")} />
              </Feltraekke>
              <Felt id="b-prioritet" label="Prioritet"
                    vaerdi={post.prioritet} saet={saet("prioritet")}
                    valgmuligheder={[{ vaerdi: "", label: "Ikke angivet" },
                      ...Object.entries(PRIORITET).map(([v, l]) => ({ vaerdi: v, label: l }))]} />
              {/* ⚠ RÅ textarea I .fc-felt — der er ingen `flerlinjet` på
                  `Felt`, og CSS'en styler `.fc-felt textarea` i forvejen.
                  Samme mønster som Forslag.jsx og Hjælp. */}
              <div className="fc-felt">
                <label htmlFor="b-note">Notat</label>
                <textarea id="b-note" rows={3} maxLength={250} value={post.note}
                          onChange={(e) => saet("note")(e.target.value)} />
                <p className="fc-hint" id="b-note-hint">
                  Valgfrit. {num(post.note.length)} / 250 tegn.
                </p>
              </div>

              {/* ⚠ BILLEDE OG LYD ER IKKE BYGGET, og knapperne står ikke her
                  som attrapper. Planchen viser dem; der er ingen Storage sat
                  op, og en fil ligger uden for databasereglerne og har sine
                  egne. Det står på skærmen frem for at se ud som om det
                  virker — samme mønster som Opsætning → Generelt. */}
              <p className="fc-hint">
                <b>Billede og taleoptagelse er ikke bygget endnu.</b> De kræver
                fillagring med sine egne adgangsregler pr. virksomhed, og det er
                sin egen opgave. Skriv det i notatet indtil da.
              </p>
            </Formular>
          )}

          <Formularsvar svar={svar} okTekst="Behovet er meldt ind." />
        </Kort>
      </div>

      {/* ---- Afvisning ------------------------------------------------- */}
      {afviser && (
        <Kort titel={`Afvis "${afviser.vare}"`}>
          {/* ⚠ EN AFVISNING KRÆVER EN GRUND, og behovet slettes ikke. Uden
              grunden er afvisningen en tavshed, og den samme mangel bliver
              meldt ind igen i næste uge. */}
          <div className="fc-felt">
            <label htmlFor="b-grund">Begrundelse *</label>
            <textarea id="b-grund" rows={2} maxLength={250} value={grund}
                      onChange={(e) => setGrund(e.target.value)} />
            <p className="fc-hint">Den der meldte ind, skal kunne se hvorfor.</p>
          </div>
          <div className="fc-med-ikon" style={{ gap: 8, marginTop: 8 }}>
            <Knap variant="primaer" onClick={afvis} disabled={!grund.trim()}>Afvis behovet</Knap>
            <Knap onClick={() => { setAfviser(null); setGrund(""); }}>Fortryd</Knap>
          </div>
        </Kort>
      )}
    </div>
  );
}
