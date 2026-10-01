type Listener = () => void;

let listeners: Listener[] = [];

export function onAuthExpired(fn: Listener) {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}

export function emitAuthExpired() {
  listeners.slice().forEach((fn) => {
    try {
      fn();
    } catch (e) {
      // ignore listener errors
    }
  });
}
