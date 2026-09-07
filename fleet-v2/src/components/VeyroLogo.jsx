import logoUrl from "../assets/veyro/veyro-systems-logo.png";

export function VeyroLogo({ className = "", alt = "Veyro Systems" }) {
  return <img className={`veyro-logo ${className}`.trim()} src={logoUrl} alt={alt} draggable="false" />;
}
