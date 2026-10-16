import { describe, it, expect } from "vitest";
import { boundedMediaStep, checkMediaAbort } from "./media-lifecycle";

describe("abandoned native model work", () => {
  it("disposes a late parser result after cancellation instead of committing it", async () => {
    const controller = new AbortController();
    let finish!: (value: { bitmap: string }) => void;
    const disposed: string[] = [];
    const pending = new Promise<{ bitmap: string }>((resolve) => {
      finish = resolve;
    });
    const result = boundedMediaStep(pending, controller.signal, (value) =>
      disposed.push(value.bitmap),
    );
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    finish({ bitmap: "actual decoded bitmap ownership" });
    await pending;
    expect(disposed).toEqual(["actual decoded bitmap ownership"]);
  });
  it("also disposes results from a parser which exceeds its deadline", async () => {
    let finish!: (value: number) => void;
    let freed = 0;
    const pending = new Promise<number>((resolve) => {
      finish = resolve;
    });
    const result = boundedMediaStep(
      pending,
      undefined,
      (count) => {
        freed += count;
      },
      5,
    );
    await expect(result).rejects.toThrow(/15 sekunder/);
    finish(3);
    await pending;
    expect(freed).toBe(3);
  });
  it("transfers a successful result to its caller; later abort cannot dispose live resources", async () => {
    const controller = new AbortController();
    let freed = false;
    expect(
      await boundedMediaStep(Promise.resolve(42), controller.signal, () => {
        freed = true;
      }),
    ).toBe(42);
    controller.abort();
    expect(freed).toBe(false);
    expect(() => checkMediaAbort(controller.signal)).toThrow();
  });
});
