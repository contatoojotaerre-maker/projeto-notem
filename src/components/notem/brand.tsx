export function Brand({ icon = false }: { icon?: boolean }) {
  if (icon) return <img src="/brand/notem-icone-512.png" width={36} height={36} alt="notem" className="brand-icon" />;
  return <span className="brand-logo" aria-label="notem">
    <img src="/brand/notem-logo-fundo-escuro.png" width={1527} height={357} alt="notem" className="brand-dark" />
    <img src="/brand/notem-logo-fundo-claro.png" width={1920} height={430} alt="notem" className="brand-light" />
  </span>;
}