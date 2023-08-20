export class Awaiter<T, E> {
  public promise: Promise<T>;
  private _resolve: (val: T) => void;
  private _reject: (val: E) => void;

  public constructor() {
    this.promise = new Promise((res, rej) => {
      this._resolve = (val) => res(val);
      this._reject = (val) => rej(val);
    });
  }

  public resolve(val: T) {
    this._resolve(val);
  }

  public reject(val: E) {
    console.error("REJ");
    this._reject(val);
  }
}

export const sendEvent = async (
  to: number,
  from: number,
  type: string,
  data: string
) =>
  fetch("/api/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: type,
      to: to,
      from: from,
      data: data,
    }),
  });

/**
 * deep merges two objects by mutating a
 */
export const deepMerge = <T extends object = Record<string, unknown>>(
  a: T,
  b: T
): T => {
  for (const key in b) {
    if (typeof a[key] === "object" && typeof b[key] === "object") {
      // @ts-ignore
      a[key] = deepMerge(a[key], b[key]);
    } else {
      a[key] = b[key];
    }
  }
  return a;
};
