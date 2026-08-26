/* functions/mail/adapters/mailgun.js
 * Mailgun (EU-region) -- den valgte udbyder for Skive 3D. Se
 * docs/security-compliance/08_EMAIL_SECURITY_GATE.md paragraf 8 for
 * beslutningsnotatet og begrundelsen.
 *
 * HEMMELIGHEDEN KOMMER FRA FIREBASE SECRET MANAGER, ALDRIG FRA EN
 * VITE_*-KLIENTVARIABEL -- se transport.js. functions/index.js binder
 * MAILGUN_API_KEY (og MAILGUN_DOMAIN, MAILGUN_AFSENDER) til sagMailSend via
 * defineSecret(); denne fil laeser dem kun via process.env, som Secret
 * Manager fylder ind ved koersel. Filen ser aldrig en raa noegle andre
 * steder end her.
 *
 * EU-REGIONEN ER api.eu.mailgun.net, IKKE api.mailgun.net (US). Valgt
 * eksplicit for data-residency -- det var netop grunden til valget.
 *
 * INGEN SDK-AFHAENGIGHED. Mailguns API er et enkelt form-encoded POST-kald;
 * Node 20's indbyggede fetch er nok, og functions/package.json forbliver
 * minimal (kun firebase-admin/firebase-functions), samme disciplin som
 * resten af dette repo.
 */

const MAILGUN_API_BASE = "https://api.eu.mailgun.net/v3";

export const mailgunAdapter = {
  async send({ til, emne, tekst }) {
    const apiKey = process.env.MAILGUN_API_KEY;
    const domaene = process.env.MAILGUN_DOMAIN;
    if (!apiKey || !domaene) {
      throw new Error("Mailgun er ikke konfigureret (MAILGUN_API_KEY/MAILGUN_DOMAIN mangler).");
    }
    const afsender = process.env.MAILGUN_AFSENDER || `FleetControl <postmaster@${domaene}>`;

    const form = new URLSearchParams({ from: afsender, to: til, subject: emne, text: tekst });
    const res = await fetch(`${MAILGUN_API_BASE}/${domaene}/messages`, {
      method: "POST",
      headers: {
        "Authorization": "Basic " + Buffer.from(`api:${apiKey}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
    });

    let data = {};
    try { data = await res.json(); } catch { /* Mailgun svarer altid JSON ved fejl -- et tomt svar haandteres som "ukendt fejl" nedenfor. */ }

    if (!res.ok) {
      throw new Error(data?.message || `Mailgun svarede ${res.status}.`);
    }
    return { providerId: data?.id || null };
  },
};
