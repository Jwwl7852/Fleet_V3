/* functions/mail/adapters/ikkeKonfigureret.js
 * Standardadapteren indtil en udbyder er valgt og konfigureret. Se
 * docs/security-compliance/08_EMAIL_SECURITY_GATE.md paragraf 8 -- valget
 * er IKKE truffet endnu, og denne fil er beviset paa at ingen har genvej
 * uden om den beslutning.
 *
 * Den kaster ALTID, med en tydelig besked, i stedet for at lade en mail se
 * sendt ud uden at vaere det. Skiftes denne adapter aldrig ud, skal
 * sagMailSend fejle hoejlydt, ikke stille lykkes uden at noget forlod
 * FleetControl -- samme lov som Skive 3C's "ingen post gemmes som sendt
 * naar intet er sendt", nu haandhaevet paa den rigtige transport.
 */
export const ikkeKonfigureretAdapter = {
  async send() {
    throw new Error(
      "Ingen udgaaende mail-udbyder er valgt endnu. Se " +
      "docs/security-compliance/08_EMAIL_SECURITY_GATE.md paragraf 8."
    );
  },
};
