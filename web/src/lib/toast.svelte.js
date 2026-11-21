export const toasts = $state([]);
let n = 0;
export function toast(text, kind = 'info', ms = 3500) {
  const id = ++n;
  toasts.push({ id, text, kind });
  setTimeout(() => {
    const i = toasts.findIndex((t) => t.id === id);
    if (i >= 0) toasts.splice(i, 1);
  }, ms);
}
