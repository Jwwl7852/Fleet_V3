/* src/fleet/Sagsvisning.jsx
 * Sagsvisning med faner. BESLUTNING 20, fase 0 — VISNING, INGEN AFSENDELSE.
 *
 * Ligger i fleet/ og ikke i et modul, fordi Fleet og Facility skal bruge
 * NØJAGTIG samme skærm. Forskellen på FLT og FAC er præfiks, counter og hvad
 * knappen hedder — alt det står i SAG_ART i sager.js. Byggede hvert modul sin
 * egen sagsvisning, ville de drive fra hinanden præcis som de to
 * værkstedsskærme gjorde før beslutning 12.
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
 */
import { useState } from "react";
import {
  SAG_ART, SAG_TILSTAND, RETNING, RETNING_LABEL, FANER,
  AFSENDER_TONE, AFSENDER_LABEL, AFTALE_TILSTAND,
  VEDHAEFTNING_TONE, VEDHAEFTNING_LABEL, maaHentes,
} from "./sager.js";
import { datoTid, filstoerrelse } from "./format.js";
import { Kort, Tabel, Pille, Tom, Knap, MiniLinje, Raekke } from "./ui.jsx";

/* ---- Fanerne -------------------------------------------------------- */

function Oversigt({ sag, arten }) {
  return (
    <div className="fc-grid" style={{ gap: 14 }}>
      <Kort titel="Sagen">
        <MiniLinje label="Sagsnummer" vaerdi={<b>{sag.nummer}</b>} />
        <MiniLinje label="Art" vaerdi={arten.label} />
        <MiniLinje label="Emne" vaerdi={sag.emne} />
        <MiniLinje label={arten.modpart === "værksted" ? "Værksted" : "Leverandør"} vaerdi={sag.modpartNavn} />
        <MiniLinje label="Vedrører" vaerdi={sag.objektLabel} />
        <MiniLinje
          label="Tilstand"
          vaerdi={<Pille tone={SAG_TILSTAND[sag.tilstand]?.pill}>{SAG_TILSTAND[sag.tilstand]?.label}</Pille>}
        />
        <MiniLinje label="Beskeder" vaerdi={sag.antalBeskeder} />
      </Kort>

      <Aftale sag={sag} />

      <Kort titel="Parter på sagen">
        {/* Parterne er ikke kontaktinfo — de er ADGANGSLISTEN. En mail fra en
            adresse der ikke står her, kommer i karantæne. Derfor står de på
            Oversigt og ikke gemt i en opsætning. */}
        <p className="fc-hint" style={{ marginBottom: 10 }}>
          Kun mails fra disse adresser lægges på tråden. Alt andet med et gyldigt
          sagsnummer havner i karantæne.
        </p>
        {sag.parter.map((p) => (
          <MiniLinje key={p} label={p} vaerdi={<Pille tone="ok">Kendt</Pille>} />
        ))}
      </Kort>
    </div>
  );
}

function Aftale({ sag }) {
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
        <p className="fc-aftale-citat">
          Læst ud af beskeden: „{a.udtrukketSaetning}“
        </p>
      </div>

      <p className="fc-hint" style={{ marginTop: 12 }}>
        En bekræftet aftale bliver til en reservation med kilde <b>værksted</b> —
        prioritet 40, så den vinder over en booking. Reservationen skrives af en
        Cloud Function, som endnu ikke findes.
      </p>
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
        <span className="fc-besked-adr">&lt;{b.afsender}&gt;</span>
        <span className="fc-besked-tid">{datoTid(b.ms)}</span>
      </header>
      {/* Brødteksten som ren tekst. white-space: pre-wrap bevarer linjeskift —
          uden at der bliver renderet en eneste tag fra afsenderen. */}
      <div className="fc-besked-b">{b.tekst}</div>
      <div className="fc-besked-emne">{b.emne}</div>
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

function Kommunikation({ sag, arten }) {
  return (
    <div className="fc-grid" style={{ gap: 14 }}>
      <Kort
        titel="Tråd"
        handling={
          /* Fase 0 er visning. Knappen står der, fordi den hører til i
             skærmbilledet — men den er slået fra, og der står hvorfor.
             En knap der ser aktiv ud og ikke gør noget, er værre end ingen. */
          <Knap variant="primaer" disabled title="Afsendelse er ikke bygget endnu (fase 0).">
            {arten.kontaktKnap}
          </Knap>
        }
      >
        <div className="fc-traad">
          {sag.beskeder.map((b) => <Besked key={b.id} b={b} />)}
        </div>
        <p className="fc-hint" style={{ marginTop: 12 }}>
          Sagsnummeret står i emnefeltet. Modtageren svarer normalt i Outlook —
          <b> Re:</b> bevarer nummeret, og svaret lander her. Ingen
          Outlook-integration, og modtageren gør ingenting anderledes.
        </p>
      </Kort>

      {sag.karantaene.length > 0 && <Karantaene sag={sag} />}
    </div>
  );
}

/* Karantæne som EGET kort under tråden — ikke som en gråtonet besked i den.
   Det er forskellen på en kontrol og en advarsel man kan klikke videre fra. */
function Karantaene({ sag }) {
  return (
    <Kort titel={`I karantæne (${sag.karantaene.length})`}>
      <p className="fc-hint" style={{ marginBottom: 12 }}>
        Disse beskeder havde et gyldigt sagsnummer, men kom fra en afsender der
        ikke står som part på sagen. De er <b>ikke</b> en del af tråden, og de
        er ikke besvaret. Et sagsnummer er en adresse, ikke en adgang.
      </p>
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
            <div className="fc-karantaene-note">
              {k.aarsag} DMARC: {k.dmarc} — afsenderen ejer sit eget domæne, men
              det er ikke sagens.
            </div>
          </article>
        ))}
      </div>
      <p className="fc-hint" style={{ marginTop: 12 }}>
        Frigivelse kræver <code>sag.karantaeneFrigiv</code> og tilføjer adressen
        til <b>denne sags</b> parter — ikke til leverandørkartoteket. Handlingen
        er ikke bygget endnu.
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
              ? <span className="fc-hint">Download bygges i fase 1</span>
              : <span className="fc-bad">Kan ikke hentes</span>),
          },
        ]}
        raekker={filer}
        noegle={(r) => r.id}
        tom="Ingen vedhæftninger på sagen."
      />
      <p className="fc-hint" style={{ marginTop: 12 }}>
        Vedhæftninger scannes, før de gemmes. En fil der ikke er scannet ren, kan
        ikke hentes — og er scanneren nede, bliver status stående på
        <b> Afventer scanning</b>. Den bliver aldrig antaget ren.
      </p>
    </Kort>
  );
}

function Aktiviteter({ sag }) {
  return (
    <Kort titel="Aktiviteter">
      <Tabel
        kolonner={[
          { key: "ms", label: "Tidspunkt", render: (r) => datoTid(r.ms) },
          { key: "handling", label: "Handling", render: (r) => <b>{r.handling}</b> },
          { key: "detalje", label: "Detalje" },
          { key: "af", label: "Af" },
        ]}
        raekker={sag.aktiviteter}
        noegle={(r, i) => `${r.ms}-${i}`}
        tom="Ingen aktiviteter på sagen."
      />
      <p className="fc-hint" style={{ marginTop: 12 }}>
        Aktiviteter er hvad <b>systemet</b> gjorde. Indholdet af en mail står
        aldrig her og aldrig i auditloggen — <code>emne</code> er fritekst udefra
        og hører ikke på feltallowlisten i <code>audit-regler.js</code>.
      </p>
    </Kort>
  );
}

/* ---- Skallen -------------------------------------------------------- */

const INDHOLD = {
  oversigt: Oversigt,
  kommunikation: Kommunikation,
  dokumenter: Dokumenter,
  aktiviteter: Aktiviteter,
};

/**
 * Sagsvisning({ sag, startFane })
 *
 * sag har formen fra demo-sag.js, som er nodens form — se ARKITEKTUR.
 * Beskeder og karantæne kommer fra sensitive/sager/<id>/ og hentes derfor
 * først når sagen åbnes. En liste henter dem aldrig.
 */
export default function Sagsvisning({ sag, startFane = "oversigt" }) {
  const [fane, setFane] = useState(startFane);
  if (!sag) return <Tom>Vælg en sag for at se tråden.</Tom>;

  const arten = SAG_ART[sag.art];
  const Indhold = INDHOLD[fane] || Oversigt;

  return (
    <div>
      <Raekke style={{ marginBottom: 12, alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-.01em" }}>
            {sag.nummer} · {sag.emne}
          </div>
          <div className="fc-hint" style={{ marginTop: 2 }}>
            {arten.label} · {sag.modpartNavn} · {sag.objektLabel}
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

      <Indhold sag={sag} arten={arten} />
    </div>
  );
}
