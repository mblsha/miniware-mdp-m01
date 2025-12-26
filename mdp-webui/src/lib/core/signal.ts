export type Unsubscribe = () => void;

export type Signal<T> = {
  subscribe: (handler: (value: T) => void) => Unsubscribe;
  emit: (value: T) => void;
};

export function createSignal<T>(): Signal<T> {
  const subscribers = new Set<(value: T) => void>();

  return {
    subscribe(handler) {
      subscribers.add(handler);
      return () => {
        subscribers.delete(handler);
      };
    },
    emit(value) {
      subscribers.forEach((handler) => {
        handler(value);
      });
    }
  };
}

