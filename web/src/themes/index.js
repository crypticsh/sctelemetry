// Theme registry. Each theme is a set of CSS variables (themes.css) plus a
// manufacturer badge. Drake is complete; the others are placeholders with a
// first-pass palette so switching can be tried.
//
// Badges: the built-in ones are simple original emblems. To use official
// fan-kit artwork, drop an SVG/PNG at web/public/themes/<id>/logo.svg
// (or .png) and rebuild; it is picked up automatically.

export const THEMES = [
  {
    id: 'drake',
    name: 'Drake',
    maker: 'Drake Interplanetary',
    status: 'ready',
    badge: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><path d="M32 3 57 17v30L32 61 7 47V17Z" fill="none" stroke="currentColor" stroke-width="4"/><path d="M21 18h12c9 0 14 6 14 14s-5 14-14 14H21Zm8 7v14h4c4 0 6-3 6-7s-2-7-6-7Z" fill="currentColor"/></svg>`,
  },
  {
    id: 'crusader',
    name: 'Crusader',
    maker: 'Crusader Industries',
    status: 'placeholder',
    badge: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><path d="M32 6 40 24 60 26 44 38 50 58 32 46 14 58 20 38 4 26 24 24Z" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round"/><circle cx="32" cy="32" r="6" fill="currentColor"/></svg>`,
  },
  {
    id: 'rsi',
    name: 'RSI',
    maker: 'Roberts Space Industries',
    status: 'placeholder',
    badge: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><circle cx="32" cy="32" r="27" fill="none" stroke="currentColor" stroke-width="4"/><circle cx="32" cy="32" r="18" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="4 4"/><path d="M14 40 50 22" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>`,
  },
  {
    id: 'argo',
    name: 'ARGO',
    maker: 'ARGO Astronautics',
    status: 'placeholder',
    badge: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><rect x="5" y="5" width="54" height="54" rx="4" fill="none" stroke="currentColor" stroke-width="4"/><path d="M16 50 32 14 48 50h-9l-7-17-7 17Z" fill="currentColor"/></svg>`,
  },
];

export const themeById = (id) => THEMES.find((t) => t.id === id) || THEMES[0];

export function applyTheme(id) {
  document.documentElement.dataset.theme = themeById(id).id;
}
