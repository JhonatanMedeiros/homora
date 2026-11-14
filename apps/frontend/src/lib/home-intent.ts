/**
 * A request to the Home from elsewhere (a shortcut): "show only what is offline". The Home may not
 * be mounted yet when the key is pressed, so the request is remembered until it takes it.
 */
const EVENT = 'homora:show-problems';
let pending = false;

export function requestProblemsView() {
  pending = true;
  window.dispatchEvent(new Event(EVENT));
}

export function takeProblemsRequest(): boolean {
  const was = pending;
  pending = false;
  return was;
}

export function onProblemsRequest(listener: () => void) {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
