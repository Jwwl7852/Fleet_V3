import logoUrl from "../assets/veyro/veyro-systems-logo.png";

export default function VeyroLogo({ variant = "header", className = "", alt = "Veyro Systems" }) {
  const classes = ["veyro-logo", `veyro-logo--${variant}`, className].filter(Boolean).join(" ");
  return <img className={classes} src={logoUrl} alt={alt} draggable="false" />;
}
