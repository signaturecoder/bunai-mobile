type Listener = (count: number, items?: any[]) => void;

let listeners: Listener[] = [];

export function subscribe(listener: Listener) {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

export function emit(count: number, items?: any[]) {
  listeners.forEach((l) => {
    try {
      l(count, items);
    } catch (e) {
      // ignore
    }
  });
}

export async function computeCount(getServerCount: () => Promise<number>, getLocalCount: () => Promise<number>) {
  try {
    const sc = await getServerCount();
    if (typeof sc === 'number') return sc;
  } catch (e) {
    // ignore
  }
  try {
    const lc = await getLocalCount();
    return typeof lc === 'number' ? lc : 0;
  } catch (e) {
    return 0;
  }
}
