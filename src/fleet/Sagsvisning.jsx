/* src/fleet/Sagsvisning.jsx
 * Sagsvisning med faner. BESLUTNING 20/112 — SKIVE 3C: RIGTIGE DATA, RIGTIGE
 * HANDLINGER, INGEN MAILTRANSPORT.
 *
 * Ligger i fleet/ og ikke i et modul, fordi Fleet og Facility skal bruge
 * NØJAGTIG samme skærm. Forskellen på FLT og FAC er præfiks, counter og hvad
 * knappen hedder — alt det står i SAG_ART i sager.js. Byggede hvert modul sin
 * egen sagsvisning, ville de drive fra hinanden præcis som de to
 * værkstedsskærme gjorde før beslutning 12. Vaerkstedskalender.jsx havde
 * netop sådan en parallelkopi (PANEL_FANER/Kommunikation/Filer) — den er
 * fjernet i denne skive til fordel for denne fil.
 *
 * ⚠ TO EKSPORTER, ÉT ANSVAR HVER.
 *   SagsvisningIndhold  ren visning — tager en FÆRDIGT SAMLET sag og tegner
 *                        den. Ingen Firebase, ingen kaldFunktion.
 *   Sagsvisning         (default) henter sagen (usePost), henter det
 *                        klassificerede (usePost, gated på sag.sensitiveLaes),
 *                        og binder de rigtige Cloud Functions til knapperne.
 * Adskillelsen er den samme som ForslagOgReservation/Forslag fra Skive 3A:
 * den rene del kan testes og genbruges uden en emulator.
 *
 * Fire ting skærmen gør, som er kontroller og ikke pynt:
 *
 *  1. Karantæne står ALDRIG i tråden. Den har sit eget afsnit med sin egen
 *     ramme. Gråtonet inline ville blive læst og handlet på, og så er
 *     karantænen dekoration.
 *  2. En vedhæftning der ikke er scannet ren, får INTET downloadlink. Et link
 *     der findes i DOM'en, bliver klikket.
 *  3. Aftaleforslaget vises ved siden af den sætning det blev læst ud af, og
 *     tidspunktet er aldrig forudfyldt i et felt der kan bekræftes i ét klik.
 *  4. Brødtekst rendereres som TEKST. Ingen dangerouslySetInnerHTML, ingen
 *     fjernbilleder. HTML fra en fremmed er aktivt indhold, og et fjernbillede
 *     er en sporingspixel der fortæller afsenderen at sagen blev åbnet.
 *
 * ⚠ SKIVE 3C — FEMTE KONTROL: INGEN MAILAFSENDELSE LOVES. `sagBeskedSkriv`
 * REGISTRERER en besked internt — retning er altid "udgaaende", fordi der
 * ikke findes en modtagevej. Knappen hedder derfor "Tilføj besked til sagen",
 * aldrig "Send besked" eller "Send mail". 3D bygger den rigtige transport.
 *
 * ⚠ SJETTE KONTROL: KARANTÆNE- OG AFTALEHANDLINGER ER USYNLIGE, IKKE
 * DEAKTIVEREDE, når der ikke er nogen data der gør dem relevante. Der findes
 * i dag ingen indgående mailvej, så sensitive/sager/<id>/karantaene og
 * .../aftaleforslag er reelt altid tomme på en rigtig sag — men skulle en
 * fremtidig kanal (3D) skrive til dem, virker knapperne allerede.
 */
import { useEffect, useState } from "react";
import { useFleet } from "./FleetContext.jsx";
import { usePost } from "./usePost.js";
import { db } from "../firebase.js";
import { harPerm, PERM } from "./permissions.js";
import {
  SAG_ART, SAG_TILSTAND, RETNING, RETNING_LABEL, FANER,
  AFSENDER_TONE, AFSENDER_LABEL, AFTALE_TILSTAND,
  VEDHAEFTNING_TONE, VEDHAEFTNING_LABEL, maaHentes,
} from "./sager.js";
import { opretSag, tilfoejBesked, frigivFraKarantaene, bekraeftAftale, afslutSag } from "./sagplan.js";
import { DEMO_SAGER } from "./demo-sag.js";
import { datoTid, filstoerrelse } from "./format.js";
import {
  Kort, Tabel, Pille, Tom, Knap, MiniLinje, Raekke, Dialog, Felt, Formular,
  Formularsvar, Henter,
} from "./ui.jsx";

/* ---- Fanerne ---------------------------------------------------------- */

function Oversigt({ sag, arten, maaAfslutte, maaBekraefteAftale, onAfsluttet }) {
  const [afslutter, saetAfslutter] = useState(false);
  return (
    <div className="fc-grid" style={{ gap: 14 }}>
      <Kort titel="Sagen">
        <MiniLinje label="Sagsnummer" vaerdi={<b>{sag.nummer}</b>} />
        <MiniLinje label="Art" vaerdi={arten.label} />
        <MiniLinje label="Emne" vaerdi={sag.emne} />
        <MiniLinje label={arten.modpart === "værksted" ? "Værksted" : "Leverandør"} vaerdi={sag.modpartNavn || "—"} />
        <MiniLinje label="Vedrører" vaerdi={sag.objektLabel || "—"} />
        <MiniLinje
          label="Tilstand"
          vaerdi={<Pille tone={SAG_TILSTAND[sag.tilstand]?.pill}>{SAG_TILSTAND[sag.tilstand]?.label}</Pille>}
        />
        <MiniLinje label="Beskeder" vaerdi={sag.antalBeskeder} />
        <MiniLinje label="Oprettet" vaerdi={datoTid(sag.oprettetMs)} />
        {sag.tilstand === "afsluttet" && sag.afslutningsAarsag && (
          <MiniLinje label="Afslutningsårsag" vaerdi={sag.afslutningsAarsag} />
        )}
      </Kort>

      {sag.tilstand !== "afsluttet" && (
        <Kort titel="Afslut sagen">
          <p className="fc-hint" style={{ marginBottom: 10 }}>
            Er sagen løst — eller skal den lukkes uden videre — afslutter du den
            her. En afsluttet sag genåbnes ikke; skal arbejdet fortsætte, er det
            en ny sag.
          </p>
          <Knap variant="primaer" disabled={!maaAfslutte}
                title={maaAfslutte ? undefined : "Kræver sag.skriv."}
                onClick={() => saetAfslutter(true)}>
            Afslut sag
          </Knap>
        </Kort>
      )}

      <Aftale sag={sag} maaBekraefte={maaBekraefteAftale} onBekraeftet={onAfsluttet} />

      <Kort titel="Parter på sagen">
        {/* Parterne er ikke kontaktinfo — de er ADGANGSLISTEN. En mail fra en
            adresse der ikke står her, kommer i karantæne. Derfor står de på
            Oversigt og ikke gemt i en opsætning. */}
        <p className="fc-hint" style={{ marginBottom: 10 }}>
          Kun mails fra disse adresser lægges på tråden. Alt andet med et gyldigt
          sagsnummer havner i karantæne.
        </p>
        {sag.parter.length
          ? sag.parter.map((p) => (
              <MiniLinje key={p} label={p} vaerdi={<Pille tone="ok">Kendt</Pille>} />
            ))
          : <Tom>Ingen parter registreret endnu.</Tom>}
      </Kort>

      {afslutter && (
        <AfslutDialog sagId={sag.id} onLuk={() => saetAfslutter(false)}
          onAfsluttet={() => { saetAfslutter(false); onAfsluttet?.(); }} />
      )}
    </div>
  );
}

function AfslutDialog({ sagId, onLuk, onAfsluttet }) {
  const [aarsag, saetAarsag] = useState("");
  const [gemmer, saetGemmer] = useState(false);
  const [svar, saetSvar] = useState(null);

  const gem = async () => {
    saetGemmer(true);
    saetSvar(null);
    const r = await afslutSag({ sagId, afslutningsAarsag: aarsag });
    saetGemmer(false);
    saetSvar(r);
    if (r.ok) onAfsluttet();
  };

  return (
    <Dialog titel="Afslut sag" under="Sagen genåbnes ikke — en fortsættelse er en ny sag." onLuk={onLuk}>
      <Formular onGem={gem} gemmer={gemmer} gemLabel="Afslut sag" onAnnuller={onLuk} svar={svar}>
        <Felt id="sag-aarsag" label="Afslutningsårsag" kraevet
              vaerdi={aarsag} saet={saetAarsag}
              placeholder="Fx: løst, arbejdet udført. Eller: kunden svarede aldrig."
              maxLength={300}
              hint="Kort og administrativ — ikke tråden, som allerede står i beskederne." />
      </Formular>
    </Dialog>
  );
}

function Aftale({ sag, maaBekraefte, onBekraeftet }) {
  const [bekraefter, saetBekraefter] = useState(false);
  const [gemmer, saetGemmer] = useState(false);
  const [svar, saetSvar] = useState(null);
  const a = sag.aftale;
  if (!a) {
    return (
      <Kort titel="Aftale">
        <Tom>
          Der er endnu ikke læst en aftale ud af tråden. Et forslag opstår, når en
          besked indeholder et tidspunkt — og det skal bekræftes af et menneske,
          før det bliver til en reservation.
        </Tom>
      </Kort>
    );
  }
  const t = AFTALE_TILSTAND[a.tilstand];

  const bekraeft = async () => {
    saetGemmer(true);
    saetSvar(null);
    const r = await bekraeftAftale({ sagId: sag.id, aftaleId: a.id });
    saetGemmer(false);
    saetSvar(r);
    if (r.ok) { saetBekraefter(false); onBekraeftet?.(); }
  };

  return (
    <Kort titel="Aftale">
      <div className="fc-aftale">
        <MiniLinje label="Aftale" vaerdi={<b>{datoTid(a.fra)}</b>} />
        <MiniLinje label="Sted" vaerdi={a.sted} />
        <MiniLinje label="Status" vaerdi={<Pille tone={t?.pill}>{t?.label}</Pille>} />
        {a.bekraeftetAf && (
          <MiniLinje label="Bekræftet af" vaerdi={`${a.bekraeftetAf} · ${datoTid(a.bekraeftetMs)}`} />
        )}

        {/* Sætningen maskinen læste tidspunktet ud af. Den står HER, ved siden
            af feltet, fordi "18/8" kan læses som 18. august og som 8. august
            afhængigt af hvem der skrev den — og fordi "næste tirsdag" ikke kan
            læses af nogen maskine med sikkerhed. Mennesket skal kunne se hvad
            der blev gættet, før det bekræftes. */}
        {a.udtrukketSaetning && (
          <p className="fc-aftale-citat">Læst ud af beskeden: „{a.udtrukketSaetning}“</p>
        )}
      </div>

      {/* ⚠ KUN NÅR DER FAKTISK ER NOGET AT BEKRÆFTE. Et forslag kan i dag kun
          opstå ved sen indsættelse i sensitive/sager — der er ingen automatik
          der læser en dato ud af en mail endnu. Knappen står klar til den dag
          det bygges, men er usynlig indtil da (Skive 3C, punkt 7). */}
      {a.tilstand === "forslag" && (
        <div style={{ marginTop: 12 }}>
          <Knap variant="primaer" disabled={!maaBekraefte || gemmer}
                title={maaBekraefte ? "Aftalen bliver til en reservation med prioritet 40."
                                     : "Kræver sag.aftaleBekraeft."}
                onClick={() => saetBekraefter(true)}>
            Bekræft aftale
          </Knap>
        </div>
      )}

      <p className="fc-hint" style={{ marginTop: 12 }}>
        En bekræftet aftale bliver til en reservation med kilde <b>værksted</b> —
        prioritet 40, så den vinder over en booking.
      </p>

      {bekraefter && (
        <Dialog titel="Bekræft aftale" onLuk={() => saetBekraefter(false)}>
          <p>Bilen/anlægget spærres <b>{datoTid(a.fra)}</b> på baggrund af det citerede tidspunkt ovenfor.</p>
          <Formularsvar svar={svar} okTekst="Aftalen er bekræftet." />
          <Raekke style={{ marginTop: 12, gap: 8 }}>
            <Knap variant="primaer" disabled={gemmer} onClick={bekraeft}>Bekræft</Knap>
            <Knap disabled={gemmer} onClick={() => saetBekraefter(false)}>Annullér</Knap>
          </Raekke>
        </Dialog>
      )}
    </Kort>
  );
}

function Besked({ b }) {
  const ud = b.retning === RETNING.udgaaende;
  return (
    <article className={`fc-besked ${ud ? "fc-besked-ud" : "fc-besked-ind"}`}>
      <header className="fc-besked-h">
        {/* Retningen står som TEKST, ikke kun som farve. En bruger der ikke
            skelner de to flader, skal stadig kunne se hvad der er sendt og
            hvad der er modtaget. */}
        <Pille tone={ud ? "info" : "ok"}>{RETNING_LABEL[b.retning]}</Pille>
        <span className="fc-besked-hvem">{b.afsenderNavn}</span>
        {b.afsender && <span className="fc-besked-adr">&lt;{b.afsender}&gt;</span>}
        <span className="fc-besked-tid">{datoTid(b.ms)}</span>
      </header>
      {/* Brødteksten som ren tekst. white-space: pre-wrap bevarer linjeskift —
          uden at der bliver renderet en eneste tag fra afsenderen. */}
      <div className="fc-besked-b">{b.tekst}</div>
      {b.emne && <div className="fc-besked-emne">{b.emne}</div>}
      {b.vedhaeftninger?.length > 0 && (
        <div className="fc-besked-emne">
          {b.vedhaeftninger.map((v) => (
            <span key={v.id} style={{ marginRight: 10 }}>
              📎 {v.filnavn} <Pille tone={VEDHAEFTNING_TONE[v.status]}>{VEDHAEFTNING_LABEL[v.status]}</Pille>
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

/**
 * ⚠ SKIVE 3C — "Tilføj besked til sagen", ALDRIG "Send besked". sagBeskedSkriv
 * REGISTRERER — den sender intet. Teksten forklarer hvad der rent faktisk sker:
 * en note på sagen, ikke en mail fra FleetControl. Kommunikationen med
 * modparten sker stadig i telefonen eller i Outlook, som Planlaegdialog selv
 * siger det.
 */
function TilfoejBeskedDialog({ sagId, onLuk, onSkrevet }) {
  const [tekst, saetTekst] = useState("");
  const [gemmer, saetGemmer] = useState(false);
  const [svar, saetSvar] = useState(null);

  const gem = async () => {
    saetGemmer(true);
    saetSvar(null);
    const r = await tilfoejBesked({ sagId, tekst });
    saetGemmer(false);
    saetSvar(r);
    if (r.ok) onSkrevet();
  };

  return (
    <Dialog titel="Tilføj besked til sagen"
            under="Registrerer hvad der blev sagt til modparten — sender ikke selv noget."
            onLuk={onLuk}>
      <Formular onGem={gem} gemmer={gemmer} gemLabel="Tilføj besked" onAnnuller={onLuk} svar={svar}>
        <Felt id="sag-besked" label="Besked" kraevet
              vaerdi={tekst} saet={saetTekst}
              placeholder="Hvad blev sagt eller aftalt — pr. telefon, Outlook eller på stedet?"
              maxLength={10000} />
        <p className="fc-hint" style={{ marginTop: 10 }}>
          ⚠ <b>Der sendes ingen mail herfra.</b> FleetControl har endnu ingen
          udgående mailtransport — dette er en intern note på sagens tråd, ikke
          en afsendelse. Aftalen laves stadig i telefonen eller i Outlook.
        </p>
      </Formular>
    </Dialog>
  );
}

function Kommunikation({ sag, arten, maaSkriveBesked, maaFrigiveKarantaene, onSkrevet }) {
  const [skriver, saetSkriver] = useState(false);
  return (
    <div className="fc-grid" style={{ gap: 14 }}>
      <Kort
        titel="Tråd"
        handling={
          <Knap variant="primaer" disabled={!maaSkriveBesked}
                title={maaSkriveBesked ? undefined : "Kræver sag.skriv og sag.sensitiveLaes."}
                onClick={() => saetSkriver(true)}>
            Tilføj besked til sagen
          </Knap>
        }
      >
        <div className="fc-traad">
          {sag.beskeder.length
            ? sag.beskeder.map((b) => <Besked key={b.id} b={b} />)
            : <Tom>Ingen beskeder på sagen endnu.</Tom>}
        </div>
        <p className="fc-hint" style={{ marginTop: 12 }}>
          Sagsnummeret står i emnefeltet på en udgående mail. Modtageren svarer
          normalt i Outlook — <b>Re:</b> bevarer nummeret. Der er endnu ingen
          modtagevej i FleetControl (det er 3D); indtil da registreres
          kommunikation manuelt med knappen ovenfor.
        </p>
      </Kort>

      {sag.karantaene.length > 0 && <Karantaene sag={sag} maaFrigive={maaFrigiveKarantaene} />}

      {skriver && (
        <TilfoejBeskedDialog sagId={sag.id} onLuk={() => saetSkriver(false)}
          onSkrevet={() => { saetSkriver(false); onSkrevet?.(); }} />
      )}
    </div>
  );
}

/* Karantæne som EGET kort under tråden — ikke som en gråtonet besked i den.
   Det er forskellen på en kontrol og en advarsel man kan klikke videre fra. */
function Karantaene({ sag, maaFrigive }) {
  const [gemmer, saetGemmer] = useState(false);
  const [svar, saetSvar] = useState(null);

  const frigiv = async (adresse) => {
    saetGemmer(true);
    saetSvar(null);
    const r = await frigivFraKarantaene({ sagId: sag.id, adresse });
    saetGemmer(false);
    saetSvar(r);
  };

  return (
    <Kort titel={`I karantæne (${sag.karantaene.length})`}>
      <p className="fc-hint" style={{ marginBottom: 12 }}>
        Disse beskeder havde et gyldigt sagsnummer, men kom fra en afsender der
        ikke står som part på sagen. De er <b>ikke</b> en del af tråden, og de
        er ikke besvaret. Et sagsnummer er en adresse, ikke en adgang.
      </p>
      <Formularsvar svar={svar} okTekst="Adressen er frigivet til sagens parter." />
      <div className="fc-traad">
        {sag.karantaene.map((k) => (
          <article key={k.id} className="fc-karantaene">
            <header className="fc-besked-h">
              <Pille tone={AFSENDER_TONE[k.afsenderStatus]}>{AFSENDER_LABEL[k.afsenderStatus]}</Pille>
              <span className="fc-besked-hvem">{k.afsenderNavn}</span>
              <span className="fc-besked-adr">&lt;{k.afsender}&gt;</span>
              <span className="fc-besked-tid">{datoTid(k.ms)}</span>
            </header>
            <div className="fc-besked-b">{k.tekst}</div>
            <div className="fc-karantaene-note">{k.aarsag}</div>
            <div style={{ marginTop: 8 }}>
              <Knap disabled={!maaFrigive || gemmer}
                    title={maaFrigive ? "Tilføjer adressen til DENNE sags parter." : "Kræver sag.karantaeneFrigiv."}
                    onClick={() => frigiv(k.afsender)}>
                Frigiv fra karantæne
              </Knap>
            </div>
          </article>
        ))}
      </div>
      <p className="fc-hint" style={{ marginTop: 12 }}>
        Frigivelse tilføjer adressen til <b>denne sags</b> parter — ikke til
        leverandørkartoteket, og ikke til andre sager.
      </p>
    </Kort>
  );
}

function Dokumenter({ sag }) {
  /* Vedhæftninger fra tråden. Karantænens filer står IKKE her: beskeden er
     ikke accepteret, og så er filen det heller ikke. */
  const filer = sag.beskeder.flatMap((b) =>
    (b.vedhaeftninger || []).map((v) => ({ ...v, ms: b.ms, fra: b.afsenderNavn }))
  );

  return (
    <Kort titel="Dokumenter">
      <Tabel
        kolonner={[
          { key: "filnavn", label: "Fil", render: (r) => <b>{r.filnavn}</b> },
          { key: "fra", label: "Modtaget fra" },
          { key: "ms", label: "Tidspunkt", render: (r) => datoTid(r.ms) },
          { key: "stoerrelse", label: "Størrelse", num: true, render: (r) => filstoerrelse(r.stoerrelse) },
          {
            key: "status", label: "Scanning",
            render: (r) => <Pille tone={VEDHAEFTNING_TONE[r.status]}>{VEDHAEFTNING_LABEL[r.status]}</Pille>,
          },
          {
            key: "hent", label: "",
            /* INTET link før filen er scannet ren. Ikke et gråt link, ikke et
               link med en advarsel — intet element. Se maaHentes(). */
            render: (r) => (maaHentes(r)
              ? <span className="fc-hint">Download bygges i en senere skive</span>
              : <span className="fc-bad">Kan ikke hentes</span>),
          },
        ]}
        raekker={filer}
        noegle={(r) => r.id}
        tom="Ingen vedhæftninger på sagen. Filupload er ikke bygget i denne skive."
      />
      <p className="fc-hint" style={{ marginTop: 12 }}>
        Vedhæftninger scannes, før de gemmes. En fil der ikke er scannet ren, kan
        ikke hentes — og er scanneren nede, bliver status stående på
        <b> Afventer scanning</b>. Den bliver aldrig antaget ren.
      </p>
    </Kort>
  );
}

/**
 * ⚠ SKIVE 3C — LÆSER DET RIGTIGE audit/, GATET PÅ audit.laes, IKKE sag.skriv.
 * Ingen driftsrolle har begge i dag (kun revisor og admin har audit.laes) —
 * det er med vilje, samme regel som i CLAUDE.md: "en log over hvem der har
 * gjort hvad, er selv følsom", og adgangen til den er ikke en del af
 * sagsarbejdet. Se Historik.jsx i unitbooking for samme skel.
 */
function useSagAktiviteter(sagId, maaLaese) {
  const { path, tenantId } = useFleet();
  const [data, saetData] = useState([]);
  const [henter, saetHenter] = useState(false);

  useEffect(() => {
    if (!sagId || !maaLaese || !db) { saetData([]); return; }
    let aktiv = true;
    saetHenter(true);
    (async () => {
      const nu = new Date();
      const maaneder = [0, 1].map((tilbage) => {
        const d = new Date(nu.getFullYear(), nu.getMonth() - tilbage, 1);
        return { aar: d.getFullYear(), maaned: String(d.getMonth() + 1).padStart(2, "0") };
      });
      const fund = [];
      for (const { aar, maaned } of maaneder) {
        const snap = await db.ref(path(`audit/drift/${aar}/${maaned}`)).once("value");
        snap.forEach((barn) => {
          const v = barn.val();
          if (v.objekt === "sager" && v.objektId === sagId) fund.push(v);
        });
      }
      if (!aktiv) return;
      fund.sort((a, b) => b.ms - a.ms);
      saetData(fund);
      saetHenter(false);
    })().catch(() => { if (aktiv) { saetData([]); saetHenter(false); } });
    return () => { aktiv = false; };
  }, [sagId, maaLaese, path, tenantId]);

  return { data, henter };
}

const HANDLING_LABEL = { opret: "Oprettet", aendre: "Ændret", tilstandsskift: "Statusskift" };

function Aktiviteter({ sag, maaLaeseAudit }) {
  const { data, henter } = useSagAktiviteter(sag.id, maaLaeseAudit);

  if (!maaLaeseAudit) {
    return (
      <Kort titel="Aktiviteter">
        <Tom>
          Denne fane kræver <code>audit.laes</code>. Det er en bevidst
          adskillelse — en log over hvem der har gjort hvad på sagen, er ikke
          en del af det daglige sagsarbejde.
        </Tom>
      </Kort>
    );
  }

  return (
    <Kort titel="Aktiviteter">
      {henter ? <Henter hvad="aktiviteterne" /> : (
        <Tabel
          kolonner={[
            { key: "ms", label: "Tidspunkt", render: (r) => datoTid(r.ms) },
            { key: "handling", label: "Handling",
              render: (r) => <b>{HANDLING_LABEL[r.handling] || r.handling}</b> },
            { key: "detalje", label: "Detalje", render: (r) => r.note || r.aendrede?.join(", ") || "—" },
          ]}
          raekker={data}
          noegle={(r, i) => `${r.ms}-${i}`}
          tom="Ingen aktiviteter i de seneste to måneder."
        />
      )}
      <p className="fc-hint" style={{ marginTop: 12 }}>
        Aktiviteter er hvad <b>systemet</b> gjorde, hentet fra auditloggen for
        de seneste to måneder. Indholdet af en besked står aldrig her — kun
        allowlistede felter som <b>tilstand</b> logges, se audit-regler.js.
      </p>
    </Kort>
  );
}

/* ---- Skallen ------------------------------------------------------------ */

const INDHOLD = {
  oversigt: Oversigt,
  kommunikation: Kommunikation,
  dokumenter: Dokumenter,
  aktiviteter: Aktiviteter,
};

/**
 * SagsvisningIndhold({ sag, bruger, onGenindlaes })
 *
 * Ren visning. `sag` har den SAMLEDE form — general fra `sager/<id>` plus
 * `beskeder`/`karantaene`/`aftale` slået sammen fra `sensitive/sager/<id>`,
 * `parter` som et array (ikke det nøglede RTDB-objekt) og `objektLabel`
 * sat af kalderen (Sagsvisning nedenfor, eller en fremtidig test).
 */
export function SagsvisningIndhold({ sag, bruger, startFane = "oversigt", onGenindlaes }) {
  const [fane, setFane] = useState(startFane);
  if (!sag) return <Tom>Vælg en sag for at se tråden.</Tom>;

  const arten = SAG_ART[sag.art];
  const Indhold = INDHOLD[fane] || Oversigt;
  /* ⚠ FIRE SEPARATE TJEK, IKKE ÉT SAMLET. sag.skriv+sag.sensitiveLaes åbner
     for at SKRIVE EN BESKED — det er ikke det samme som at måtte frigive en
     karantæne eller bekræfte en aftale, som hver har sin egen, smallere
     permission. casehandler har de to første, ikke de sidste to; en fælles
     "maaTriagere" ville have tegnet begge knapper aktive for ham, og
     serveren ville have afvist dem. */
  const maaSkriveBesked = harPerm(bruger?.perms, PERM.sagSkriv) && harPerm(bruger?.perms, PERM.sagSensitiveLaes);
  const maaFrigiveKarantaene = harPerm(bruger?.perms, PERM.sagKarantaeneFrigiv);
  const maaBekraefteAftale = harPerm(bruger?.perms, PERM.sagAftaleBekraeft);
  const maaAfslutte = harPerm(bruger?.perms, PERM.sagSkriv);
  const maaLaeseAudit = harPerm(bruger?.perms, PERM.auditLaes);

  return (
    <div>
      <Raekke style={{ marginBottom: 12, alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-.01em" }}>
            {sag.nummer} · {sag.emne}
          </div>
          <div className="fc-hint" style={{ marginTop: 2 }}>
            {arten.label} · {sag.modpartNavn || "ingen modpart"} · {sag.objektLabel || "—"}
          </div>
        </div>
        <Pille tone={SAG_TILSTAND[sag.tilstand]?.pill}>{SAG_TILSTAND[sag.tilstand]?.label}</Pille>
      </Raekke>

      <div className="fc-faner" role="tablist" aria-label="Sagsvisning">
        {FANER.map((f) => {
          /* Karantænetallet står PÅ fanen. Ligger der en besked i karantæne,
             skal man ikke først klikke ind for at opdage det. */
          const badge = f.key === "kommunikation" && sag.antalKarantaene > 0
            ? ` (${sag.antalKarantaene} i karantæne)` : "";
          return (
            <button
              key={f.key} type="button" role="tab" className="fc-fane"
              aria-selected={fane === f.key} onClick={() => setFane(f.key)}
            >
              {f.label}{badge}
            </button>
          );
        })}
      </div>

      <Indhold sag={sag} arten={arten}
                maaSkriveBesked={maaSkriveBesked} maaFrigiveKarantaene={maaFrigiveKarantaene}
                maaBekraefteAftale={maaBekraefteAftale} maaAfslutte={maaAfslutte}
                maaLaeseAudit={maaLaeseAudit}
                onSkrevet={onGenindlaes} onAfsluttet={onGenindlaes} />
    </div>
  );
}

/**
 * OpretSagKort({ art, objektType, objektId, emneForslag, modpartNavnForslag, maaOprette, onOprettet })
 *
 * ⚠ SKIVE 3C, PUNKT 4 — BEVIDST ARBEJDSGANG. Der oprettes INTET automatisk.
 * Knappen findes, permission-gated, og et menneske skal udfylde emnet og
 * trykke — præcis som "Planlæg aktivitet" ikke opretter sig selv.
 */
function OpretSagDialog({ art, objektType, objektId, emneForslag, modpartNavnForslag, onLuk, onOprettet }) {
  const [emne, saetEmne] = useState(emneForslag || "");
  const [modpartNavn, saetModpartNavn] = useState(modpartNavnForslag || "");
  const [modpartEmail, saetModpartEmail] = useState("");
  const [gemmer, saetGemmer] = useState(false);
  const [svar, saetSvar] = useState(null);
  const arten = SAG_ART[art];

  const gem = async () => {
    saetGemmer(true);
    saetSvar(null);
    const r = await opretSag({ art, emne, objektType, objektId, modpartNavn, modpartEmail });
    saetGemmer(false);
    saetSvar(r);
    if (r.ok) onOprettet(r.data);
  };

  return (
    <Dialog titel="Opret sag" under={`${arten.label} — nummeret tildeles af serveren.`} onLuk={onLuk}>
      <Formular onGem={gem} gemmer={gemmer} gemLabel="Opret sag" onAnnuller={onLuk} svar={svar}>
        <Felt id="nysag-emne" label="Emne" kraevet
              vaerdi={emne} saet={saetEmne}
              placeholder="Hvad handler sagen om?" maxLength={200} />
        <Felt id="nysag-modpart" label={arten.modpart === "værksted" ? "Værksted" : "Leverandør"}
              vaerdi={modpartNavn} saet={saetModpartNavn}
              placeholder="Navn på modparten" maxLength={120} />
        <Felt id="nysag-email" label="Modpartens e-mail" type="email"
              vaerdi={modpartEmail} saet={saetModpartEmail}
              placeholder="fx service@vaerksted.dk"
              hint="Lægges på sagens parter — kun mails herfra havner på tråden." />
      </Formular>
    </Dialog>
  );
}

/**
 * Sagsvisning({ sagId, objektType, objektId, art, objektLabel,
 *               emneForslag, modpartNavnForslag, onGenindlaes })
 *
 * ⚠ HENTER RIGTIGE DATA. sagId=null betyder "objektet har endnu ingen sag" —
 * ærlig tomtilstand med et bevidst "Opret sag", IKKE en tom fane der ligner
 * en fejl. sagId sat betyder en rigtig sag; usePost henter den, uden demo
 * medmindre der slet ingen database er.
 */
export default function Sagsvisning({
  sagId, objektType, objektId, art, objektLabel, emneForslag, modpartNavnForslag, onGenindlaes,
}) {
  const { bruger } = useFleet();
  const [opretter, saetOpretter] = useState(false);

  const maaLaese = harPerm(bruger?.perms, PERM.sagLaes);
  const maaSensitivt = harPerm(bruger?.perms, PERM.sagSensitiveLaes);

  const generel = usePost("sager", maaLaese ? sagId : null, {
    demo: (id) => DEMO_SAGER.find((s) => s.id === id) || null,
  });
  /* ⚠ SATELLITTEN HENTES KUN NÅR BRUGEREN MÅ LÆSE DEN — samme mønster som
     sensitive/indberetninger i Indberetninger.jsx (Skive 3B). */
  const sensitiv = usePost("sensitive/sager", maaSensitivt ? sagId : null, {
    auditerSom: "sagSensitive",
    demo: (id) => {
      const s = DEMO_SAGER.find((x) => x.id === id);
      if (!s) return null;
      return {
        beskeder: Object.fromEntries(s.beskeder.map((b) => [b.id, b])),
        karantaene: Object.fromEntries(s.karantaene.map((k) => [k.id, k])),
        aftaleforslag: s.aftale ? { [s.aftale.id]: s.aftale } : {},
      };
    },
  });

  if (!sagId) {
    const maaOprette = harPerm(bruger?.perms, PERM.sagSkriv)
      && (objektType !== "opgave" || harPerm(bruger?.perms, PERM.opgaverSkriv));
    return (
      <div>
        <Tom>
          {objektType && objektId
            ? "Der er endnu ikke oprettet en sag på denne."
            : "Vælg en sag for at se tråden."}
        </Tom>
        {objektType && objektId && art && (
          <div style={{ marginTop: 12 }}>
            <Knap variant="primaer" disabled={!maaOprette}
                  title={maaOprette ? undefined
                    : `Kræver sag.skriv${objektType === "opgave" ? " og opgaver.skriv" : ""}.`}
                  onClick={() => saetOpretter(true)}>
              Opret sag
            </Knap>
          </div>
        )}
        {opretter && (
          <OpretSagDialog art={art} objektType={objektType} objektId={objektId}
            emneForslag={emneForslag} modpartNavnForslag={modpartNavnForslag}
            onLuk={() => saetOpretter(false)}
            onOprettet={() => { saetOpretter(false); onGenindlaes?.(); }} />
        )}
      </div>
    );
  }

  if (!maaLaese) {
    return <Tom>Du kan ikke se denne sag. Det kræver <code>sag.laes</code>.</Tom>;
  }
  if (generel.henter) return <Henter hvad="sagen" />;
  if (!generel.post) return <Tom>Sagen findes ikke længere, eller kunne ikke hentes.</Tom>;

  const sensitivPost = sensitiv.post || {};
  const beskeder = Object.entries(sensitivPost.beskeder || {})
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => a.ms - b.ms);
  const karantaene = Object.entries(sensitivPost.karantaene || {})
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => a.ms - b.ms);
  const aftaleforslag = Object.entries(sensitivPost.aftaleforslag || {})
    .map(([id, v]) => ({ id, ...v }));
  const aftale = aftaleforslag.find((a) => a.tilstand === "forslag") || aftaleforslag[0] || null;

  const sag = {
    id: sagId,
    ...generel.post,
    objektLabel: objektLabel || generel.post.objektLabel,
    parter: Object.values(generel.post.parter || {}),
    beskeder,
    karantaene,
    aftale,
  };

  return (
    <SagsvisningIndhold sag={sag} bruger={bruger}
      onGenindlaes={() => { generel.genindlaes(); sensitiv.genindlaes(); onGenindlaes?.(); }} />
  );
}
