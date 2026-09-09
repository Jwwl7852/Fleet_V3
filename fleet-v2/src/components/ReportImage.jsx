import { useEffect, useState } from "react";

export function ReportImage({ image, alt, onClick, className = "" }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!image?.blob) { setUrl(""); return undefined; }
    const next = URL.createObjectURL(image.blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [image]);
  if (!url) return null;
  const picture = <img alt={alt} className={className} src={url} />;
  return onClick ? <button className="report-image-button" type="button" onClick={() => onClick(image)}>{picture}</button> : picture;
}
