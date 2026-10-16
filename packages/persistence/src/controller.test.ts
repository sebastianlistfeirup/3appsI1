import { describe, expect, it } from "vitest";
import {
  DocumentController,
  RevisionConflict,
  type LocalEnvelope,
  type DocumentStore,
} from "./controller";
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
const envelope = (
  count: number,
  revision = 1,
): LocalEnvelope<{ count: number }> => ({
  schemaVersion: 1,
  key: "test",
  revision,
  updatedAt: "2026-10-16T20:00:00Z",
  data: { count },
});
function memory(initial = 0) {
  let disk: LocalEnvelope<{ count: number }> | undefined = initial
    ? envelope(initial)
    : undefined;
  let reads = 0,
    writes = 0;
  const store: DocumentStore<{ count: number }> = {
    async load() {
      reads++;
      return disk;
    },
    async save(data, expected) {
      if ((disk?.revision ?? 0) !== expected) throw new RevisionConflict();
      writes++;
      disk = { ...envelope(data.count, expected + 1) };
      return disk;
    },
  };
  return {
    store,
    get disk() {
      return disk;
    },
    get reads() {
      return reads;
    },
    get writes() {
      return writes;
    },
    external(count: number) {
      disk = envelope(count, (disk?.revision ?? 0) + 1);
    },
  };
}
describe("Local persistence races and recoverability", () => {
  it("coalesces StrictMode reloads and preserves an immediate first-frame edit", async () => {
    const db = memory();
    const controller = new DocumentController(db.store, () => ({ count: 0 }));
    let captured = false;
    controller.subscribe(() => {
      if (controller.getSnapshot().ready && !captured) {
        captured = true;
        controller.setData({ count: 5 });
      }
    });
    const first = controller.reload(),
      second = controller.reload();
    expect(second).toBe(first);
    await first;
    await controller.flush();
    expect(db.reads).toBe(1);
    expect(db.writes).toBe(2);
    expect(db.disk?.data.count).toBe(5);
    expect(controller.getSnapshot()).toMatchObject({
      data: { count: 5 },
      ready: true,
      saveState: "saved",
    });
  });
  it("does not replace a user edit with a delayed disk read", async () => {
    const db = memory(10);
    const controller = new DocumentController(db.store, () => ({ count: 0 }));
    await controller.reload();
    const read = deferred<LocalEnvelope<{ count: number }>>();
    db.store.load = () => read.promise;
    const loading = controller.reload();
    await Promise.resolve();
    controller.setData({ count: 20 });
    read.resolve(envelope(10));
    await loading;
    expect(controller.getSnapshot()).toMatchObject({
      data: { count: 20 },
      saveState: "conflict",
    });
    expect(db.disk?.data.count).toBe(10);
    await expect(controller.flush()).rejects.toThrow();
  });
  it("keeps status saving until the last queued write commits", async () => {
    const db = memory(1);
    const controller = new DocumentController(db.store, () => ({ count: 0 }));
    await controller.reload();
    const first = deferred<LocalEnvelope<{ count: number }>>(),
      second = deferred<LocalEnvelope<{ count: number }>>();
    let writes = 0;
    db.store.save = () => (++writes === 1 ? first.promise : second.promise);
    controller.setData({ count: 2 });
    controller.setData({ count: 3 });
    await Promise.resolve();
    first.resolve(envelope(2, 2));
    await new Promise((r) => setTimeout(r, 0));
    expect(controller.getSnapshot()).toMatchObject({
      data: { count: 3 },
      saveState: "saving",
    });
    second.resolve(envelope(3, 3));
    await controller.flush();
    expect(controller.getSnapshot().saveState).toBe("saved");
  });
  it("retains unsaved edits after a quota error and makes flush reject", async () => {
    const db = memory(1);
    const controller = new DocumentController(db.store, () => ({ count: 0 }));
    await controller.reload();
    db.store.save = async () => {
      throw new DOMException(
        "The quota has been exceeded.",
        "QuotaExceededError",
      );
    };
    controller.setData({ count: 99 });
    await expect(controller.flush()).rejects.toThrow(
      "Browserens lager er fuldt",
    );
    expect(controller.getSnapshot()).toMatchObject({
      data: { count: 99 },
      saveState: "error",
    });
    expect(db.disk?.data.count).toBe(1);
  });
  it("explains denied browser storage and preserves the current document", async () => {
    const db = memory(1),
      controller = new DocumentController(db.store, () => ({ count: 0 }));
    await controller.reload();
    db.store.save = async () => {
      throw new DOMException("Operation is insecure", "SecurityError");
    };
    controller.setData({ count: 12 });
    await expect(controller.flush()).rejects.toThrow(
      "Browseren blokerer lokal lagring",
    );
    expect(controller.getSnapshot().data.count).toBe(12);
    expect(db.disk?.data.count).toBe(1);
  });
  it("prevents stale-tab overwrite and reloads the new saved revision explicitly", async () => {
    const db = memory(1);
    const a = new DocumentController(db.store, () => ({ count: 0 })),
      b = new DocumentController(db.store, () => ({ count: 0 }));
    await Promise.all([a.reload(), b.reload()]);
    a.setData({ count: 2 });
    await a.flush();
    b.setData({ count: 3 });
    await expect(b.flush()).rejects.toThrow("nyere version");
    expect(b.getSnapshot().data.count).toBe(3);
    expect(db.disk?.data.count).toBe(2);
    await b.reload();
    expect(b.getSnapshot()).toMatchObject({
      data: { count: 2 },
      saveState: "saved",
    });
    b.setData({ count: 4 });
    await b.flush();
    expect(db.disk?.revision).toBe(3);
  });
  it("does not accept a stale read after a newer cross-tab revision was announced", async () => {
    const db = memory(1);
    const controller = new DocumentController(db.store, () => ({ count: 0 }));
    await controller.reload();
    const read = deferred<LocalEnvelope<{ count: number }>>();
    db.store.load = () => read.promise;
    const loading = controller.reload();
    await Promise.resolve();
    controller.notifyRevision(2);
    read.resolve(envelope(1));
    await loading;
    expect(controller.getSnapshot().saveState).toBe("conflict");
  });
  it("preserves local data when stored data has an unsupported version or fails validation", async () => {
    const db = memory(1);
    const controller = new DocumentController(
      db.store,
      () => ({ count: 0 }),
      (value) => {
        if (!(value as { count: number }).count)
          throw new Error("Invalid fixture");
        return value as { count: number };
      },
    );
    await controller.reload();
    db.store.load = async () =>
      ({ ...envelope(9), schemaVersion: 2 }) as unknown as LocalEnvelope<{
        count: number;
      }>;
    await controller.reload();
    expect(controller.getSnapshot()).toMatchObject({
      data: { count: 1 },
      saveState: "error",
    });
    db.store.load = async () => envelope(0);
    await controller.reload();
    expect(controller.getSnapshot()).toMatchObject({
      data: { count: 1 },
      saveState: "error",
      error: "Invalid fixture",
    });
  });
});
