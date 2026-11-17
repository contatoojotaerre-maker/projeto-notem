/** Decorative light waves of the panel (lime/cyan). Pure SVG, no images, no animation; hidden from assistive
 *  technology and never intercepts clicks. Colors come from the --wave-a / --wave-b tokens of each theme. */
const stop = (color: string, opacity: number, offset: string) => <stop offset={offset} style={{ stopColor: `var(${color})`, stopOpacity: opacity }} />;

export function PanelAura() {
  return <div className="panel-aura" aria-hidden="true"><svg viewBox="0 0 1200 560" preserveAspectRatio="xMaxYMin slice" focusable="false">
    <defs>
      <radialGradient id="aura-glow" cx="78%" cy="8%" r="60%">{stop('--wave-a', 0.16, '0%')}{stop('--wave-a', 0, '100%')}</radialGradient>
      <linearGradient id="aura-fill" x1="0" y1="0" x2="1" y2="0">{stop('--wave-a', 0, '0%')}{stop('--wave-a', 0.10, '45%')}{stop('--wave-b', 0.16, '100%')}</linearGradient>
      <linearGradient id="aura-line" x1="0" y1="0" x2="1" y2="0">{stop('--wave-a', 0, '0%')}{stop('--wave-a', 0.85, '40%')}{stop('--wave-b', 1, '100%')}</linearGradient>
    </defs>
    <rect width="1200" height="560" fill="url(#aura-glow)" />
    <path d="M360 330 C 560 250, 700 120, 900 92 S 1130 88, 1200 150 L 1200 0 L 520 0 C 470 150, 420 260, 360 330 Z" fill="url(#aura-fill)" />
    <path d="M300 360 C 520 270, 690 130, 900 100 S 1140 98, 1220 170" fill="none" stroke="url(#aura-line)" strokeWidth="22" strokeLinecap="round" opacity="0.10" />
    <path d="M300 360 C 520 270, 690 130, 900 100 S 1140 98, 1220 170" fill="none" stroke="url(#aura-line)" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M520 300 C 700 230, 860 170, 1020 160 S 1170 175, 1220 205" fill="none" stroke="url(#aura-line)" strokeWidth="1.2" strokeLinecap="round" opacity="0.55" />
  </svg></div>;
}

export function SidebarWave() {
  return <div className="sidebar-wave" aria-hidden="true"><svg viewBox="0 0 240 190" preserveAspectRatio="none" focusable="false">
    <defs>
      <linearGradient id="side-fill" x1="0" y1="1" x2="1" y2="0">{stop('--wave-a', 0.22, '0%')}{stop('--wave-b', 0.08, '70%')}{stop('--wave-b', 0, '100%')}</linearGradient>
      <linearGradient id="side-line" x1="0" y1="1" x2="1" y2="0">{stop('--wave-a', 0.9, '0%')}{stop('--wave-b', 0.9, '60%')}{stop('--wave-b', 0, '100%')}</linearGradient>
    </defs>
    <path d="M0 170 C 60 150, 110 110, 160 70 S 220 30, 240 20 L 240 190 L 0 190 Z" fill="url(#side-fill)" />
    <path d="M0 170 C 60 150, 110 110, 160 70 S 220 30, 240 20" fill="none" stroke="url(#side-line)" strokeWidth="2" />
  </svg></div>;
}
