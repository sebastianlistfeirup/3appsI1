/** Framework-independent serialization of one local document. Browser hooks may mount twice;
 * reads and writes still belong to one controller and never silently replace newer edits. */
export interface LocalEnvelope<T> {
  schemaVersion: 1;
  key: string;
  revision: number;
  updatedAt: string;
  data: T;
}
export type SaveState = "loading" | "saving" | "saved" | "error" | "conflict";
export interface PersistenceSnapshot<T> {
  data: T;
  ready: boolean;
  saveState: SaveState;
  savedAt: string | null;
  error: string | null;
}
export interface DocumentStore<T> {
  load: () => Promise<LocalEnvelope<T> | undefined>;
  save: (data: T, expectedRevision: number) => Promise<LocalEnvelope<T>>;
}
export class RevisionConflict extends Error {
  constructor(
    message = "En nyere version er gemt i en anden fane. Hent den nye version, eller eksportér dine ændringer som en kopi.",
  ) {
    super(message);
    this.name = "RevisionConflict";
  }
}
function storageMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "QuotaExceededError")
      return "Browserens lager er fuldt. Dine seneste ændringer er bevaret her. Eksportér en lokal kopi, før du lukker siden.";
    if (["SecurityError", "NotAllowedError"].includes(error.name))
      return "Browseren blokerer lokal lagring. Tillad lagring for denne side, eller eksportér en lokal kopi af dit arbejde.";
    return error.message;
  }
  return "Lokal lagring er ikke tilgængelig. Eksportér en kopi af dit arbejde.";
}
export class DocumentController<T> {
  private snapshot: PersistenceSnapshot<T>;
  private listeners = new Set<() => void>();
  private revision = 0;
  private observedRevision = 0;
  private blocked = false;
  private mutations = 0;
  private pending = 0;
  private queue: Promise<void> = Promise.resolve();
  private loading: Promise<void> | null = null;
  private reloading = false;
  constructor(
    private store: DocumentStore<T>,
    private initial: () => T,
    private validate?: (value: unknown) => T,
    private committed?: (revision: number) => void,
  ) {
    this.snapshot = {
      data: initial(),
      ready: false,
      saveState: "loading",
      savedAt: null,
      error: null,
    };
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<PersistenceSnapshot<T>>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }
  private fail(error: unknown) {
    this.blocked = true;
    this.publish({
      saveState: error instanceof RevisionConflict ? "conflict" : "error",
      error: storageMessage(error),
    });
  }
  reload = (): Promise<void> => {
    if (this.loading) return this.loading;
    const generation = this.mutations;
    this.reloading = true;
    const operation = Promise.resolve().then(async () => {
      await this.queue;
      try {
        let envelope = await this.store.load();
        if (!envelope) {
          try {
            envelope = await this.store.save(this.initial(), 0);
          } catch (error) {
            if (!(error instanceof RevisionConflict)) throw error;
            envelope = await this.store.load();
          }
        }
        if (!envelope) throw new Error("Projektet kunne ikke åbnes.");
        if (
          envelope.schemaVersion !== 1 ||
          !Number.isSafeInteger(envelope.revision) ||
          envelope.revision < 1
        )
          throw new Error("Denne filversion understøttes ikke.");
        const next = this.validate
          ? this.validate(envelope.data)
          : envelope.data;
        if (generation !== this.mutations)
          throw new RevisionConflict(
            "Du ændrede projektet, mens en genindlæsning var i gang. Dine ændringer er bevaret her. Eksportér en kopi, eller genindlæs igen.",
          );
        if (envelope.revision < this.observedRevision)
          throw new RevisionConflict();
        this.revision = envelope.revision;
        this.observedRevision = envelope.revision;
        this.blocked = false;
        // An immediate effect may edit the loaded document as soon as ready is published.
        this.reloading = false;
        this.publish({
          data: next,
          ready: true,
          savedAt: envelope.updatedAt,
          error: null,
          saveState: "saved",
        });
      } catch (error) {
        this.fail(error);
      } finally {
        this.reloading = false;
      }
    });
    this.loading = operation;
    this.publish({ saveState: "loading" });
    void operation.finally(() => {
      if (this.loading === operation) this.loading = null;
    });
    return operation;
  };
  setData = (update: T | ((previous: T) => T)): void => {
    const next =
      typeof update === "function"
        ? (update as (previous: T) => T)(this.snapshot.data)
        : update;
    const checked = this.validate ? this.validate(next) : next;
    this.mutations++;
    if (this.reloading) {
      this.publish({ data: checked });
      this.fail(
        new RevisionConflict(
          "Du ændrede projektet under genindlæsning. Dine ændringer er bevaret; eksportér en kopi eller genindlæs igen.",
        ),
      );
      return;
    }
    if (this.blocked) {
      this.publish({ data: checked });
      return;
    }
    if (!this.snapshot.ready) {
      this.publish({ data: checked });
      this.fail(
        new Error(
          "Projektet er ikke indlæst endnu. Dine lokale ændringer er bevaret.",
        ),
      );
      return;
    }
    this.pending++;
    this.queue = this.queue.then(async () => {
      try {
        if (this.blocked) return;
        const envelope = await this.store.save(checked, this.revision);
        this.revision = envelope.revision;
        this.observedRevision = Math.max(
          this.observedRevision,
          envelope.revision,
        );
        this.publish({ savedAt: envelope.updatedAt });
        this.committed?.(envelope.revision);
      } catch (error) {
        this.fail(error);
      } finally {
        this.pending--;
        if (!this.blocked)
          this.publish({
            saveState: this.pending ? "saving" : "saved",
            error: null,
          });
      }
    });
    this.publish({ data: checked, saveState: "saving" });
  };
  notifyRevision = (revision: number) => {
    if (Number.isSafeInteger(revision) && revision > this.revision) {
      this.observedRevision = Math.max(this.observedRevision, revision);
      this.fail(new RevisionConflict());
    }
  };
  flush = async (): Promise<void> => {
    await this.loading;
    let tail: Promise<void>;
    do {
      tail = this.queue;
      await tail;
    } while (tail !== this.queue);
    if (this.blocked)
      throw new Error(this.snapshot.error ?? "Dine ændringer er ikke gemt.");
  };
}
