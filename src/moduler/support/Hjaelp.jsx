/* src/moduler/support/Hjaelp.jsx
 * Hjælp & Support — kundens skærm
 *
 * FleetControl V1: siden var tidligere en supportsags-formular og en liste
 * af "jeres sager" der begge byggede på permanente demo-datasæt
 * (`demo-support.js`) — Support-modulet har ingen reel læse-/skrivevej
 * endnu (fase 0, se beslutning 23/24). I stedet for at love en sag der ikke
 * kan oprettes, viser siden nu kun det der rent faktisk er sandt: en kort,
 * statisk guide og hvordan man i dag får fat i FleetControl, uden en
 * oprettelsesformular og uden opdigtede sagsnumre. Se Skive 1 i
 * docs/product-redesign-v1/05_IMPLEMENTATION_SLICES.md.
 */
import { Kort } from "../../fleet/ui.jsx";

const GUIDE = [
  {
    titel: "Find en opgave eller booking",
    tekst: "Alle opgaver samles under Planning. Brug søgning og filtrene øverst på listen til at finde en bestemt opgave, kunde eller status.",
  },
  {
    titel: "Se nøgletal for driften",
    tekst: "Dashboard viser et samlet overblik. Vælg et enkelt modul i dropdown'en øverst for at se nøgletal for kun det modul.",
  },
  {
    titel: "Ret adgang og roller",
    tekst: "Opsætning → Brugere & roller viser hvem der har login, og hvilken rolle de har. Kun en administrator kan ændre det.",
  },
  {
    titel: "Fakturaer og bilag",
    tekst: "Fakturaer der skal godkendes findes i Økonomi & Rapporter → Fakturacenter. Det I selv skal sende ud, findes under Fakturering.",
  },
];

export default function Hjaelp() {
  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <Kort titel="Kom videre selv">
        <div className="fc-grid" style={{ gap: 12 }}>
          {GUIDE.map((g) => (
            <div key={g.titel}>
              <b>{g.titel}</b>
              <p className="fc-hint" style={{ marginTop: 2 }}>{g.tekst}</p>
            </div>
          ))}
        </div>
      </Kort>

      <Kort titel="Har du brug for hjælp fra FleetControl?">
        <p className="fc-hint">
          En indbygget support-sagsstyring er endnu ikke bygget i FleetControl
          V1 — der findes derfor ingen formular her til at oprette en sag, og
          ingen liste over tidligere sager.
        </p>
        <p className="fc-hint" style={{ marginTop: 8 }}>
          Kontakt indtil videre jeres sædvanlige FleetControl-kontaktperson
          direkte, som I plejer.
        </p>
      </Kort>
    </div>
  );
}
