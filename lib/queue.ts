type Listener = (count: number, items?: any[]) => void;

let listeners: Listener[] = [];
let queueItems: any[] = [];
let queueVersion = 0;
let hasQueueSnapshot = false;

function notifyQueueListeners() {
  listeners.forEach((listener) => {
    try {
      listener(queueItems.length, queueItems);
    } catch (e) {
      // ignore
    }
  });
}

export function subscribe(listener: Listener) {
  listeners.push(listener);

  if (hasQueueSnapshot) {
    try {
      listener(queueItems.length, queueItems);
    } catch (e) {
      // ignore
    }
  }

  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

export function setQueueState(items: any[]) {
  queueItems = Array.isArray(items) ? items : [];
  hasQueueSnapshot = true;
  queueVersion += 1;
  notifyQueueListeners();
}

export function getQueueState() {
  return queueItems;
}

export function hasQueueState() {
  return hasQueueSnapshot;
}

export function getQueueVersion() {
  return queueVersion;
}

export function emit(count: number, items?: any[]) {
  if (items) {
    setQueueState(items);
    return;
  }

  queueVersion += 1;
  listeners.forEach((listener) => {
    try {
      listener(count, queueItems);
    } catch (e) {
      // ignore
    }
  });
}

// Mods listeners: for notifying mod list/detail updates
type ModsListener = (modId?: string) => void;
let modsListeners: ModsListener[] = [];

export function subscribeMods(listener: ModsListener) {
  modsListeners.push(listener);
  return () => {
    modsListeners = modsListeners.filter((l) => l !== listener);
  };
}

export function emitMods(modId?: string) {
  modsListeners.forEach((l) => {
    try {
      l(modId);
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
