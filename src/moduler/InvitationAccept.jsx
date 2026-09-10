import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { auth, kaldFunktion } from "../firebase.js";
import VeyroLogo from "../fleet/VeyroLogo.jsx";
import { Knap } from "../fleet/ui.jsx";

const fejltekst = (e) => e?.message?.replace(/^Firebase:\s*/i, "") || "Handlingen kunne ikke gennemføres.";

export default function InvitationAccept({ bruger }) {
  const { id } = useParams();
  const token = useMemo(() => new URLSearchParams(window.location.hash.slice(1)).get("token") || "", []);
  const [email, setEmail] = useState("");
  const [kode, setKode] = useState("");
  const [nyKonto, setNyKonto] = useState(false);
  const [arbejder, setArbejder] = useState(false);
  const [svar, setSvar] = useState(null);

  const logInd = async (e) => {
    e.preventDefault(); setArbejder(true); setSvar(null);
    try {
      if (nyKonto) {
        const resultat = await auth.createUserWithEmailAndPassword(email.trim(), kode);
        await resultat.user.sendEmailVerification();
        setSvar({ ok: true, tekst: "Kontoen er oprettet. Bekræft e-mailen via Firebases verificeringsmail, log derefter ind igen og åbn invitationslinket." });
      } else {
        await auth.signInWithEmailAndPassword(email.trim(), kode);
        setSvar({ ok: true, tekst: "Du er logget ind. Invitationen kan nu accepteres." });
      }
    } catch (e2) { setSvar({ ok: false, tekst: fejltekst(e2) }); }
    finally { setArbejder(false); }
  };

  const accepter = async () => {
    setArbejder(true); setSvar(null);
    try {
      const resultat = await kaldFunktion("kundeinvitationaccept", { id, token });
      setSvar({ ok: true, tekst: `Invitationen er accepteret til ${resultat.data.tenantId}. Log ind igen for at hente de nye, signerede rettigheder.` });
      await auth.signOut();
    } catch (e) { setSvar({ ok: false, tekst: fejltekst(e) }); }
    finally { setArbejder(false); }
  };

  return <div className="fc-boot"><div className="fc-login">
    <VeyroLogo variant="login" />
    <div className="fc-card"><div className="fc-card-b">
      <h1>Administratorinvitation</h1>
      {!token && <p className="fc-empty-bad">Linket mangler sit invitationstoken. Bed Veyro om en genudsendelse.</p>}
      {!bruger ? <form onSubmit={logInd}>
        <p className="fc-hint">Brug den e-mailadresse invitationen er bundet til. En eksisterende konto skal logge ind; en ny konto skal først verificere sin e-mail.</p>
        <label className="fc-med-ikon"><input type="checkbox" checked={nyKonto} onChange={(e) => setNyKonto(e.target.checked)} /> Jeg har ikke en konto endnu</label>
        <div className="fc-felt"><label htmlFor="inv-email">E-mail</label><input id="inv-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" /></div>
        <div className="fc-felt"><label htmlFor="inv-kode">Adgangskode</label><input id="inv-kode" type="password" minLength={12} required value={kode} onChange={(e) => setKode(e.target.value)} autoComplete={nyKonto ? "new-password" : "current-password"} /></div>
        <Knap type="submit" variant="primaer" disabled={arbejder}>{nyKonto ? "Opret og verificér konto" : "Log ind"}</Knap>
      </form> : <>
        <p>Logget ind som <b>{bruger.email}</b>.</p>
        {bruger.udbyder ? <p className="fc-empty-bad">En ejeridentitet kan ikke acceptere en kundeadministratorinvitation.</p>
          : <Knap variant="primaer" onClick={accepter} disabled={arbejder || !token}>Acceptér invitation</Knap>}
      </>}
      {svar && <p role="status" className={svar.ok ? "fc-ok" : "fc-empty-bad"}>{svar.tekst}</p>}
    </div></div>
  </div></div>;
}
