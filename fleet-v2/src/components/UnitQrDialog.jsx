import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { unitCode } from "../data/mobileReporting";
import { modelLabel, typeLabel } from "../data/unitSelectors";
import { Icon } from "./Icon";

export function UnitQrDialog({ unit, onClose }) {
  const [src,setSrc]=useState(""); const [error,setError]=useState(""); const payload=unitCode(unit.id);
  useEffect(()=>{let active=true;QRCode.toDataURL(payload,{errorCorrectionLevel:"M",margin:2,width:280,color:{dark:"#061A2A",light:"#FFFFFF"}}).then((value)=>{if(active)setSrc(value);}).catch(()=>{if(active)setError("QR-koden kunne ikke genereres lokalt.");});return()=>{active=false;};},[payload]);
  return <div className="modal-layer unit-qr-layer"><section className="modal-card unit-qr-dialog" role="dialog" aria-modal="true" aria-labelledby="unit-qr-title"><header><div><small>FLEET · stabil enhedsreference</small><h2 id="unit-qr-title">QR-label for {unit.number}</h2></div><button className="icon-button" aria-label="Luk" type="button" onClick={onClose}><Icon name="close"/></button></header><div className="modal-body"><article className="unit-qr-label"><strong>VEYRO SYSTEMS</strong>{src?<img src={src} alt={`QR-kode for ${unit.number}`}/>:<span className="loading-spinner"/>}<h3>{unit.number}</h3><p>{modelLabel(unit)} · {typeLabel(unit)}</p><small>{payload}</small></article>{error?<p className="form-error">{error}</p>:null}<p className="prototype-note">Koden identificerer kun det stabile enheds-ID. Adgang kontrolleres separat, og koden indeholder ingen personoplysninger.</p></div><footer><button className="secondary-button" type="button" onClick={onClose}>Luk</button><button className="primary-button" type="button" onClick={()=>window.print()} disabled={!src}><Icon name="print"/>Udskriv label</button></footer></section></div>;
}
