// Original placeholder artwork for each class (flat-color SVG, no external
// assets). NOT official Axie art -- see README for how to swap in real
// portraits once available.
const OUTLINE = {
  Beast: '#8a5222', Aqua: '#2e5f78', Plant: '#24402c',
  Bird: '#a9791f', Bug: '#4f3a6b', Reptile: '#5c6038',
};

const BODIES = {
  Beast: (fill, outline) => `
    <ellipse cx="50" cy="60" rx="32" ry="28" fill="${fill}" stroke="${outline}" stroke-width="3"/>
    <ellipse cx="42" cy="50" rx="12" ry="9" fill="#ffffff30"/>
    <path d="M30 36 L21 15 L37 32 Z" fill="${outline}"/>
    <path d="M70 36 L79 15 L63 32 Z" fill="${outline}"/>
    <circle cx="39" cy="58" r="4.5" fill="#1c1710"/>
    <circle cx="61" cy="58" r="4.5" fill="#1c1710"/>
    <path d="M40 72 Q50 79 60 72" stroke="${outline}" stroke-width="3" fill="none" stroke-linecap="round"/>
  `,
  Aqua: (fill, outline) => `
    <path d="M20 60 Q22 30 55 26 Q85 28 88 58 Q85 88 55 92 Q22 88 20 60 Z" fill="${fill}" stroke="${outline}" stroke-width="3"/>
    <path d="M78 44 L96 34 L88 56 Z" fill="${outline}"/>
    <ellipse cx="42" cy="46" rx="11" ry="8" fill="#ffffff30"/>
    <circle cx="46" cy="52" r="5" fill="#1c1710"/>
    <path d="M30 70 Q45 78 60 70" stroke="${outline}" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M26 58 Q40 62 26 66" stroke="${outline}" stroke-width="2" fill="none"/>
  `,
  Plant: (fill, outline) => `
    <ellipse cx="50" cy="62" rx="30" ry="27" fill="${fill}" stroke="${outline}" stroke-width="3"/>
    <path d="M50 34 Q40 10 26 16 Q34 30 50 34 Z" fill="${outline}"/>
    <path d="M50 34 Q60 8 76 14 Q68 30 50 34 Z" fill="${outline}"/>
    <ellipse cx="42" cy="54" rx="10" ry="8" fill="#ffffff30"/>
    <circle cx="40" cy="60" r="4.5" fill="#1c1710"/>
    <circle cx="60" cy="60" r="4.5" fill="#1c1710"/>
    <path d="M40 74 Q50 80 60 74" stroke="${outline}" stroke-width="3" fill="none" stroke-linecap="round"/>
  `,
  Bird: (fill, outline) => `
    <ellipse cx="50" cy="60" rx="30" ry="27" fill="${fill}" stroke="${outline}" stroke-width="3"/>
    <path d="M50 32 L58 12 L62 34 Z" fill="${outline}"/>
    <path d="M18 55 Q6 60 18 72 Q22 62 18 55 Z" fill="${outline}"/>
    <path d="M82 55 Q94 60 82 72 Q78 62 82 55 Z" fill="${outline}"/>
    <ellipse cx="42" cy="54" rx="10" ry="8" fill="#ffffff30"/>
    <circle cx="40" cy="60" r="4.5" fill="#1c1710"/>
    <circle cx="60" cy="60" r="4.5" fill="#1c1710"/>
    <path d="M46 68 L54 68 L50 76 Z" fill="${outline}"/>
  `,
  Bug: (fill, outline) => `
    <ellipse cx="50" cy="64" rx="26" ry="24" fill="${fill}" stroke="${outline}" stroke-width="3"/>
    <path d="M40 40 Q32 20 22 16" stroke="${outline}" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M60 40 Q68 20 78 16" stroke="${outline}" stroke-width="3" fill="none" stroke-linecap="round"/>
    <circle cx="22" cy="16" r="3.5" fill="${outline}"/>
    <circle cx="78" cy="16" r="3.5" fill="${outline}"/>
    <ellipse cx="39" cy="58" rx="8" ry="10" fill="#1c1710"/>
    <ellipse cx="61" cy="58" rx="8" ry="10" fill="#1c1710"/>
    <ellipse cx="41" cy="55" rx="3" ry="4" fill="#ffffff60"/>
    <ellipse cx="63" cy="55" rx="3" ry="4" fill="#ffffff60"/>
    <path d="M28 78 L18 86 M72 78 L82 86 M30 84 L22 92 M70 84 L78 92" stroke="${outline}" stroke-width="3" stroke-linecap="round"/>
  `,
  Reptile: (fill, outline) => `
    <ellipse cx="50" cy="62" rx="31" ry="26" fill="${fill}" stroke="${outline}" stroke-width="3"/>
    <path d="M50 38 L64 48 L58 64 L42 64 L36 48 Z" fill="${outline}" opacity="0.55"/>
    <circle cx="50" cy="51" r="4" fill="${outline}" opacity="0.7"/>
    <ellipse cx="42" cy="56" rx="9" ry="7" fill="#ffffff25"/>
    <circle cx="38" cy="62" r="4" fill="#1c1710"/>
    <circle cx="62" cy="62" r="4" fill="#1c1710"/>
    <path d="M40 76 Q50 81 60 76" stroke="${outline}" stroke-width="3" fill="none" stroke-linecap="round"/>
    <ellipse cx="28" cy="82" rx="6" ry="4" fill="${fill}" stroke="${outline}" stroke-width="2"/>
    <ellipse cx="72" cy="82" rx="6" ry="4" fill="${fill}" stroke="${outline}" stroke-width="2"/>
  `,
};

export function portraitSVG(classId, fill){
  const outline = OUTLINE[classId] || '#333';
  const body = BODIES[classId] ? BODIES[classId](fill, outline) : '';
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${classId}">${body}</svg>`;
}

// Renders a portrait box: real asset image on top (if present at
// /assets/axies/<classId-lowercase>.png), original SVG placeholder
// underneath as automatic fallback (img.onerror removes itself).
export function portraitHTML(classId, fill, extraClass){
  const src = `${import.meta.env.BASE_URL}assets/axies/${classId.toLowerCase()}.png`;
  return `
    <div class="portrait ${extraClass||''}">
      <div class="portrait-svg">${portraitSVG(classId, fill)}</div>
      <img class="portrait-img" src="${src}" alt="${classId}" onerror="this.remove()">
    </div>
  `;
}
