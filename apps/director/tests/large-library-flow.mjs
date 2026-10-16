import { chromiumExecutable, directorUrl } from "./browser.mjs";
import {
  chromium,
  firefox,
  webkit,
  expect as baseExpect,
} from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const expect = baseExpect.configure({ timeout: 20000 });
const engine = process.env.LIBRARY_ENGINE ?? "chromium";
const report = {
  engine,
  checks: [],
  phases: [],
  verifiedAt: new Date().toISOString(),
};
const reportPath = `reports/director/${engine}-large-library.json`;
const phase = async (name) => {
  report.phases.push({ name, at: new Date().toISOString() });
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log("Large Director library:", engine, name);
};
const watchdog = setTimeout(() => {
  console.error("Large library exceeded 180 seconds");
  process.exit(1);
}, 180000);
const browser = await { chromium, firefox, webkit }[engine].launch(
  engine === "chromium"
    ? {
        headless: true,
        executablePath: chromiumExecutable,
        args: [
          "--no-sandbox",
          "--use-gl=angle",
          "--use-angle=swiftshader",
          "--enable-unsafe-swiftshader",
        ],
      }
    : { headless: true },
);
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(20000);
page.setDefaultNavigationTimeout(30000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.addInitScript(() => {
  const create = URL.createObjectURL.bind(URL),
    revoke = URL.revokeObjectURL.bind(URL);
  const src = Object.getOwnPropertyDescriptor(
    HTMLImageElement.prototype,
    "src",
  );
  window.libraryProbe = {
    tracking: false,
    pause: false,
    live: new Set(),
    maxLive: 0,
    created: 0,
    revoked: 0,
  };
  URL.createObjectURL = (blob) => {
    const url = create(blob),
      probe = window.libraryProbe;
    if (
      probe.tracking &&
      blob instanceof Blob &&
      blob.type.startsWith("image/")
    ) {
      probe.live.add(url);
      probe.created++;
      probe.maxLive = Math.max(probe.maxLive, probe.live.size);
    }
    return url;
  };
  URL.revokeObjectURL = (url) => {
    if (window.libraryProbe.live.delete(url)) window.libraryProbe.revoked++;
    revoke(url);
  };
  Object.defineProperty(HTMLImageElement.prototype, "src", {
    ...src,
    set(value) {
      if (window.libraryProbe.pause && window.libraryProbe.live.has(value))
        return;
      src.set.call(this, value);
    },
  });
});
const storedDigests = () =>
  page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const open = indexedDB.open("tre-apps-director-v1", 1);
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const result = [];
    for (const digit of ["a", "b", "c", "d"]) {
      const value = await new Promise((resolve, reject) => {
        const request = db
          .transaction("documents")
          .objectStore("documents")
          .get("production_" + digit.repeat(32));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const hash = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(value)),
      );
      result.push(
        [...new Uint8Array(hash)]
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join(""),
      );
    }
    db.close();
    return result;
  });
const probe = () =>
  page.evaluate(() => ({
    ...window.libraryProbe,
    live: window.libraryProbe.live.size,
  }));
const openLibrary = async () => {
  await page
    .getByRole("button", { name: "Director · produktioner", exact: true })
    .click();
  await expect(page.locator(".production-library")).toBeVisible();
};
try {
  await phase("load and create original film");
  await page.goto(directorUrl);
  await expect(page.locator(".shot-thumbnail img")).toHaveCount(5, {
    timeout: 30000,
  });
  await expect(page.getByText("Gemt lokalt", { exact: true })).toBeVisible();
  await phase(
    "seed three real full-resolution PNG films and one broken local image",
  );
  report.sources = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const open = indexedDB.open("tre-apps-director-v1", 1);
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const original = await new Promise((resolve, reject) => {
      const request = db
        .transaction("documents")
        .objectStore("documents")
        .get("production");
      request.onsuccess = () => resolve(request.result.data);
      request.onerror = () => reject(request.error);
    });
    const stats = [];
    for (const [index, digit] of ["a", "b", "c", "d"].entries()) {
      let dataUrl;
      if (digit !== "d") {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1536;
        const context = canvas.getContext("2d"),
          pixels = context.createImageData(canvas.width, canvas.height);
        let seed = 0x12345678 + index;
        for (let at = 0; at < pixels.data.length; at++) {
          seed ^= seed << 13;
          seed ^= seed >>> 17;
          seed ^= seed << 5;
          pixels.data[at] = at % 4 === 3 ? 255 : seed & 255;
        }
        context.putImageData(pixels, 0, 0);
        dataUrl = canvas.toDataURL("image/png");
        canvas.width = canvas.height = 0;
      } else dataUrl = "data:image/png;base64,AA==";
      const binary = atob(dataUrl.split(",")[1]),
        bytes = new Uint8Array(binary.length);
      for (let at = 0; at < binary.length; at++)
        bytes[at] = binary.charCodeAt(at);
      const sha256 = [
        ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      ]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const project = structuredClone(original),
        key = "production_" + digit.repeat(32);
      project.id = "film_" + digit.repeat(32);
      project.title =
        digit === "d"
          ? "Beskadiget omslag · bevaret film"
          : `Stor original ${index + 1}`;
      project.shots = [
        {
          ...project.shots[0],
          previousShotId: null,
          mediaId: "large_image",
          frame: null,
          frameRenderer: null,
          durationFrames: 48,
          transitionFrames: 0,
        },
      ];
      project.sequence = [project.shots[0].id];
      project.sequenceVersions = [];
      project.media = [
        {
          id: "large_image",
          kind: "image",
          name: `Original ${digit}.png`,
          mime: "image/png",
          dataUrl,
          bytes: bytes.length,
          sha256,
          source: "Original test pattern",
          rights: "owned",
        },
      ];
      project.voice = project.music = null;
      await new Promise((resolve, reject) => {
        const tx = db.transaction("documents", "readwrite");
        tx.objectStore("documents").put({
          schemaVersion: 1,
          key,
          revision: 1,
          updatedAt: new Date().toISOString(),
          data: project,
        });
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      stats.push({ key, bytes: bytes.length, sha256 });
    }
    db.close();
    window.libraryProbe.tracking = true;
    return stats;
  });
  assert.ok(
    report.sources.reduce((sum, item) => sum + item.bytes, 0) > 20_000_000,
  );
  const originalDigests = await storedDigests();
  await phase("read bounded derivatives sequentially");
  await openLibrary();
  await expect(page.locator(".production-card")).toHaveCount(5);
  await expect(page.locator(".library-main")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  report.covers = await page
    .locator(".production-cover img")
    .evaluateAll((images) =>
      images.map((img) => ({
        chars: img.src.length,
        width: img.naturalWidth,
        height: img.naturalHeight,
      })),
    );
  assert.equal(report.covers.length, 4);
  for (const image of report.covers) {
    assert.ok(image.chars <= 64 * 1024);
    assert.equal(image.width, 384);
    assert.equal(image.height, 216);
  }
  await expect(
    page.getByRole("button", {
      name: "Åbn Beskadiget omslag · bevaret film",
      exact: true,
    }),
  ).toBeEnabled();
  assert.equal(
    await page
      .locator('[data-production-key="production_' + "d".repeat(32) + '"] img')
      .count(),
    0,
  );
  assert.equal((await probe()).maxLive, 1);
  assert.equal((await probe()).live, 0);
  assert.deepEqual(await storedDigests(), originalDigests);
  report.checks.push(
    "More than 20 MB of real source PNGs produce only 384×216 JPEG derivatives, each <=64 KiB; one source decode at a time; original document hashes unchanged",
  );
  await phase(
    "cancel pending decode on navigation with and without BroadcastChannel",
  );
  for (const broadcast of [true, false]) {
    if (broadcast) {
      await page.evaluate(() => {
        window.libraryProbe.pause = true;
      });
      await page
        .getByRole("button", {
          name: "Opdatér produktionsbibliotek",
          exact: true,
        })
        .click();
    } else {
      await page.evaluate(() => {
        window.BroadcastChannel = undefined;
        window.libraryProbe.pause = true;
      });
      await openLibrary();
    }
    await expect.poll(async () => (await probe()).live).toBe(1);
    await page
      .getByRole("button", { name: "Åbn Stor original 1", exact: true })
      .click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Stor original 1",
    );
    await expect.poll(async () => (await probe()).live).toBe(0);
    await page.evaluate(() => {
      window.libraryProbe.pause = false;
    });
    await expect(page.getByText("Gemt lokalt", { exact: true })).toBeVisible();
  }
  report.checks.push(
    "Navigation cancels an intentionally pending native image decode and revokes its URL, also when BroadcastChannel is unavailable",
  );
  await phase("rescan and recover exact original bytes");
  await openLibrary();
  await expect(page.locator(".library-main")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(page.locator(".library-error")).toHaveCount(0);
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", {
      name: "Hent sikkerhedskopi af Stor original 1",
      exact: true,
    })
    .click();
  const backup = JSON.parse(
    await fs.readFile(await (await download).path(), "utf8"),
  );
  const { createHash } = await import("node:crypto");
  assert.equal(
    createHash("sha256")
      .update(Buffer.from(backup.media[0].dataUrl.split(",")[1], "base64"))
      .digest("hex"),
    report.sources[0].sha256,
  );
  assert.deepEqual(await storedDigests(), originalDigests);
  report.probe = await probe();
  assert.equal(report.probe.live, 0);
  assert.equal(report.probe.created, report.probe.revoked);
  assert.equal(report.probe.maxLive, 1);
  assert.deepEqual(errors, []);
  report.checks.push(
    "Recovery download preserves the exact full-resolution source hash after repeated scans and cancellation; corrupted image does not hide its film",
  );
  report.pageErrors = errors;
  await phase("passed");
  await fs.rm(`reports/director/${engine}-large-library-failure.png`, {
    force: true,
  });
} catch (error) {
  report.error = String(error);
  report.pageErrors = errors;
  await phase("failed");
  await page
    .screenshot({
      path: `reports/director/${engine}-large-library-failure.png`,
      fullPage: true,
    })
    .catch(() => {});
  throw error;
} finally {
  await Promise.race([
    browser.close(),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(Error("Browser cleanup exceeded 5 seconds")),
        5000,
      ),
    ),
  ]);
  clearTimeout(watchdog);
}
