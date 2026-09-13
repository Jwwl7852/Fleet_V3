import { Kort, Pille } from "../../fleet/ui.jsx";

export default function EjerIkkeImplementeret({ titel, etape, blokering }) {
  return (
    <Kort titel={titel}>
      <div className="fc-empty fc-empty-info">
        <Pille tone="warn">Ikke implementeret</Pille>
        <p style={{ marginTop: 14 }}>
          Området hører til <b>{etape}</b>. Der er ingen handlinger på denne side,
          som foregiver at sende, bogføre eller synkronisere data.
        </p>
        {blokering && <p className="fc-hint">Ekstern blokering: {blokering}</p>}
      </div>
    </Kort>
  );
}

