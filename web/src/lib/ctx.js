// The object widgets read from: normalized frame + raw frame + link state.
export function makeCtx(tele) {
  return { ...(tele.n || {}), raw: tele.raw, link: { connected: !!tele.status?.connected } };
}
