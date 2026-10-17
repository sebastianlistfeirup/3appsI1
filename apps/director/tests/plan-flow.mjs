import { chromiumExecutable, directorUrl } from "./browser.mjs";
import {
  chromium,
  firefox,
  webkit,
  expect as baseExpect,
} from "@playwright/test";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const engine = process.env.PLAN_ENGINE ?? "chromium",
  expect = baseExpect.configure({ timeout: 20000 });
const require = createRequire(import.meta.url),
  axe = createRequire(require.resolve("@axe-core/playwright"))(
    "axe-core",
  ).source;
const hash = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const watchdog = setTimeout(() => {
  console.error("Plan flow exceeded 180 seconds", engine);
  process.exit(1);
}, 180000);
const browser = await { chromium, firefox, webkit }[engine].launch(
  engine === "chromium"
    ? {
        headless: true,
        executablePath: chromiumExecutable,
        args: [
          "--no-sandbox",
          "--use-angle=swiftshader",
          "--enable-unsafe-swiftshader",
        ],
      }
    : { headless: true },
);
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }),
  errors = [],
  scans = [],
  stages = [];
page.setDefaultTimeout(20000);
page.setDefaultNavigationTimeout(30000);
page.on("pageerror", (error) => errors.push(error.message));
const stage = async (name) => {
  console.log("Plan", engine, name);
  stages.push({ name, at: new Date().toISOString() });
  await fs.writeFile(
    `reports/director/${engine}-plan-progress.json`,
    JSON.stringify(stages, null, 2),
  );
};
const saved = () =>
  expect(page.getByText("Gemt lokalt", { exact: true })).toBeVisible();
const read = () =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const timeout = setTimeout(
            () => reject(Error("IndexedDB read timed out")),
            10000,
          ),
          open = indexedDB.open("tre-apps-director-v1", 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result,
            request = db
              .transaction("documents")
              .objectStore("documents")
              .get("production");
          request.onsuccess = () => {
            clearTimeout(timeout);
            resolve(request.result.data);
            db.close();
          };
          request.onerror = () => reject(request.error);
        };
      }),
  );
const centre = (handle) =>
  handle.evaluate((element) => {
    const point = new DOMPoint(0, 0).matrixTransform(element.getScreenCTM());
    return { x: point.x, y: point.y };
  });
const down = async (handle) => {
  await handle.scrollIntoViewIfNeeded();
  const point = await centre(handle);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  return point;
};
const drag = async (handle, dx, dy) => {
  const point = await down(handle);
  await page.mouse.move(point.x + dx, point.y + dy, { steps: 8 });
  await page.mouse.up();
  await saved();
};
const undo = async () => {
  await page
    .getByRole("button", { name: "Fortryd (⌘/Ctrl Z)", exact: true })
    .click();
  await saved();
};
const redo = async () => {
  await page
    .getByRole("button", { name: "Gentag (⌘/Ctrl Shift Z)", exact: true })
    .click();
  await saved();
};
const unchanged = async (expected) =>
  assert.equal(
    hash(await read()),
    hash(expected),
    "gesture must preserve the complete saved project",
  );
const historical = (actual, expected) => {
  assert.deepEqual(actual.scenes, expected.scenes);
  assert.deepEqual(actual.shots, expected.shots);
  assert.deepEqual(actual.sequenceVersions, expected.sequenceVersions);
};
const scan = async (name) => {
  await page.addScriptTag({ content: axe });
  const violations = await page.evaluate(async () =>
    (
      await axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
        iframes: false,
      })
    ).violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    })),
  );
  scans.push({ name, violations });
  assert.deepEqual(violations, []);
};
try {
  await stage("load saved immutable camera frames");
  await page.goto(directorUrl);
  await expect(page.locator(".shot-thumbnail img")).toHaveCount(5, {
    timeout: 30000,
  });
  await saved();
  await page.getByRole("button", { name: "2D-plan", exact: true }).click();
  const original = await read(),
    id = original.draft.objects[0].id,
    object = page.locator(`[data-plan-object="${id}"]`),
    svg = page.locator(".plan-view > svg");
  await page.evaluate(() => {
    window.planPointers = [];
    document.addEventListener("gotpointercapture", (event) =>
      window.planPointers.push({ owner: event.target, id: event.pointerId }),
    );
  });
  await stage("native capture previews; single committed movement outside SVG");
  const start = await down(object);
  await page.mouse.move(start.x + 35, start.y + 15, { steps: 5 });
  assert.equal(
    await object.evaluate((element) => {
      const last = window.planPointers.at(-1);
      return (
        !!last &&
        last.owner === element.ownerSVGElement &&
        last.owner.hasPointerCapture(last.id)
      );
    }),
    true,
  );
  await unchanged(original);
  assert.notEqual(
    await object.getAttribute("data-position"),
    original.draft.objects[0].transform.position.join(","),
  );
  const area = await svg.boundingBox();
  await page.mouse.move(area.x + area.width + 25, start.y + 20, { steps: 6 });
  await page.mouse.up();
  await saved();
  const moved = await read();
  assert.equal(moved.revision, original.revision + 1);
  assert.equal(
    moved.draft.objects[0].assetVersion,
    original.draft.objects[0].assetVersion + 1,
  );
  assert.equal(
    moved.draft.objects[0].transform.position[1],
    original.draft.objects[0].transform.position[1],
  );
  historical(moved, original);
  assert.equal(
    await object.evaluate((element) =>
      window.planPointers
        .at(-1)
        .owner.hasPointerCapture(window.planPointers.at(-1).id),
    ),
    false,
  );
  await undo();
  await unchanged(original);
  await redo();
  await unchanged(moved);
  await undo();
  await unchanged(original);
  await stage(
    "keyboard repeat commits once; Escape and Ctrl-Z cancel active gesture",
  );
  await object.focus();
  await page.keyboard.down("ArrowRight");
  await page.keyboard.down("ArrowRight");
  await page.keyboard.down("ArrowRight");
  await unchanged(original);
  await page.keyboard.up("ArrowRight");
  await saved();
  const keyboard = await read();
  assert.equal(
    keyboard.draft.objects[0].transform.position[0],
    Math.round((original.draft.objects[0].transform.position[0] + 0.3) * 10) /
      10,
  );
  assert.equal(keyboard.revision, original.revision + 1);
  historical(keyboard, original);
  await undo();
  await unchanged(original);
  await object.focus();
  await page.keyboard.down("ArrowDown");
  await page.keyboard.press("Escape");
  await page.keyboard.up("ArrowDown");
  await unchanged(original);
  await object.focus();
  await page.keyboard.down("ArrowRight");
  await page.keyboard.press("Control+z");
  await page.keyboard.up("ArrowRight");
  await unchanged(original);
  await stage("pointercancel, capture loss and unmount discard preview");
  for (const mechanism of [
    "pointercancel",
    "returntoorigin",
    "lostcapture",
    "escape",
    "unmount",
  ]) {
    const point = await down(object);
    await page.mouse.move(point.x + 50, point.y + 25, { steps: 4 });
    if (mechanism === "pointercancel")
      await object.evaluate((element) =>
        element.dispatchEvent(
          new PointerEvent("pointercancel", {
            pointerId: window.planPointers.at(-1).id,
            bubbles: true,
          }),
        ),
      );
    else if (mechanism === "returntoorigin")
      await page.mouse.move(point.x, point.y, { steps: 5 });
    else if (mechanism === "lostcapture") {
      await object.evaluate((element) =>
        window.planPointers
          .at(-1)
          .owner.releasePointerCapture(window.planPointers.at(-1).id),
      );
      await page.mouse.move(point.x + 51, point.y + 25);
    } else if (mechanism === "escape") await page.keyboard.press("Escape");
    else {
      const storyboard = page
        .locator(".view-tabs")
        .getByRole("button", { name: "Storyboard", exact: true });
      await storyboard.focus();
      await page.keyboard.press("Enter");
      await expect(svg).toHaveCount(0);
    }
    await page.mouse.up();
    await unchanged(original);
    assert.equal(
      await page.evaluate(() => {
        const last = window.planPointers.at(-1);
        return last.owner.hasPointerCapture(last.id);
      }),
      false,
    );
    if (mechanism === "unmount") {
      await page
        .locator(".view-tabs")
        .getByRole("button", { name: "Scene", exact: true })
        .click();
      await expect(svg).toBeVisible();
    }
  }
  await stage("camera placement and aim preserve locked scenes and shots");
  await page
    .getByRole("button", { name: "Placér kamera", exact: true })
    .click();
  const cameraHandle = page.getByRole("button", {
      name: "Flyt kamera",
      exact: true,
    }),
    targetHandle = page.getByRole("button", {
      name: "Flyt kameraets sigtepunkt",
      exact: true,
    });
  await drag(cameraHandle, 45, -20);
  const cameraMoved = await read();
  historical(cameraMoved, original);
  assert.equal(cameraMoved.revision, original.revision + 1);
  assert.notDeepEqual(
    cameraMoved.draft.cameras[0].position,
    original.draft.cameras[0].position,
  );
  assert.equal(
    cameraMoved.draft.cameras[0].position[1],
    original.draft.cameras[0].position[1],
  );
  assert.deepEqual(
    cameraMoved.draft.cameras[0].target,
    original.draft.cameras[0].target,
  );
  assert.ok(
    Math.abs(Math.hypot(...cameraMoved.draft.cameras[0].quaternion) - 1) < 1e-6,
  );
  await targetHandle.focus();
  await page.keyboard.press("Shift+ArrowUp");
  await saved();
  const aimed = await read();
  historical(aimed, original);
  assert.equal(aimed.revision, original.revision + 2);
  assert.equal(
    aimed.draft.cameras[0].target[2],
    cameraMoved.draft.cameras[0].target[2] - 1,
  );
  assert.notDeepEqual(
    aimed.draft.cameras[0].quaternion,
    cameraMoved.draft.cameras[0].quaternion,
  );
  await undo();
  await unchanged(cameraMoved);
  await undo();
  await unchanged(original);
  await stage("view-only pan and zoom do not create edits");
  const box = await svg.boundingBox();
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 70, box.y + 25, { steps: 5 });
  await page.mouse.up();
  await page
    .getByRole("button", { name: "Zoom ind i sceneplan", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Zoom ud i sceneplan", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Vis hele settet", exact: true })
    .click();
  await unchanged(original);
  await page
    .getByRole("button", { name: "Flyt objekter", exact: true })
    .click();
  await stage(
    "desktop/tablet/phone readable handles, actual keyboard placement, WCAG",
  );
  for (const [name, width, height] of [
    ["desktop", 1440, 900],
    ["tablet", 1024, 768],
    ["mobile", 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await object.scrollIntoViewIfNeeded();
    await object.focus();
    await page.keyboard.press("Shift+ArrowLeft");
    await saved();
    const changed = await read();
    historical(changed, original);
    assert.equal(
      changed.draft.objects[0].transform.position[0],
      original.draft.objects[0].transform.position[0] - 1,
    );
    const hit = await object.locator(".plan-hit").boundingBox();
    assert.ok(
      hit.width >= 44 && hit.height >= 44,
      `${name}: ${JSON.stringify(hit)}`,
    );
    await scan(name);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: `reports/director/${engine}-${name}-plan.png`,
    });
    await object.focus();
    await page.keyboard.press("Control+z");
    await saved();
    await unchanged(original);
  }
  if (engine === "chromium") {
    await stage("trusted Chromium touch drag and native touchcancel");
    const protocol = await page.context().newCDPSession(page);
    await object.scrollIntoViewIfNeeded();
    for (const cancel of [true, false]) {
      const origin = await centre(object);
      await protocol.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [
          { x: origin.x, y: origin.y, id: 1, radiusX: 8, radiusY: 8 },
        ],
      });
      await protocol.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          { x: origin.x + 45, y: origin.y + 15, id: 1, radiusX: 8, radiusY: 8 },
        ],
      });
      await unchanged(original);
      await protocol.send("Input.dispatchTouchEvent", {
        type: cancel ? "touchCancel" : "touchEnd",
        touchPoints: [],
      });
      await saved();
      if (cancel) await unchanged(original);
      else {
        const touched = await read();
        assert.equal(touched.revision, original.revision + 1);
        assert.notDeepEqual(
          touched.draft.objects[0].transform.position,
          original.draft.objects[0].transform.position,
        );
        historical(touched, original);
        await object.focus();
        await page.keyboard.press("Control+z");
        await saved();
        await unchanged(original);
      }
    }
    await protocol.detach();
  }
  await stage(
    "far valid coordinates fit; new plan renderer profile keeps old frames intact",
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await object.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("spinbutton", { name: "X", exact: true }).fill("100");
  await page.getByRole("spinbutton", { name: "X", exact: true }).press("Tab");
  await saved();
  await page
    .getByRole("button", { name: "Vis hele settet", exact: true })
    .click();
  const farCentre = await centre(object),
    farBox = await svg.boundingBox();
  assert.ok(
    farCentre.x > farBox.x + 20 && farCentre.x < farBox.x + farBox.width - 20,
  );
  assert.ok(
    farCentre.y > farBox.y + 20 && farCentre.y < farBox.y + farBox.height - 20,
  );
  const beforeCapture = await read();
  await page
    .getByRole("button", { name: "Gem indstilling", exact: true })
    .click();
  await expect(page.locator(".toast.working")).toHaveCount(0, {
    timeout: 30000,
  });
  await saved();
  // A fast 2D capture can finish within one React paint. The pre-existing
  // saved label is not proof that its new IndexedDB shot version has arrived.
  await expect
    .poll(async () => (await read()).sequence[0])
    .not.toBe(beforeCapture.sequence[0]);
  const captured = await read(),
    latest = captured.shots.find((shot) => shot.id === captured.sequence[0]);
  assert.equal(
    captured.scenes.find((scene) => scene.id === latest.sceneVersionId)
      .objects[0].transform.position[0],
    100,
    "captured immutable scene contains the far object's new position",
  );
  assert.equal(latest.frameMode, "plan");
  assert.equal(latest.frameRenderer, "director-plan-2.0");
  await fs.writeFile(
    `reports/director/${engine}-plan-far-frame.jpg`,
    Buffer.from(latest.frame.split(",")[1], "base64"),
  );
  const decoded = await page.evaluate(async (frame) => {
    const image = new Image();
    image.src = frame;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(1000, 0, 280, 720).data;
    let copper = 0;
    for (let i = 0; i < pixels.length; i += 4)
      if (
        Math.abs(pixels[i] - 195) < 30 &&
        Math.abs(pixels[i + 1] - 101) < 30 &&
        Math.abs(pixels[i + 2] - 54) < 30
      )
        copper++;
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      farObjectPixels: copper,
    };
  }, latest.frame);
  assert.deepEqual([decoded.width, decoded.height], [1280, 720]);
  await fs.writeFile(
    `reports/director/${engine}-plan-frame-diagnostic.json`,
    JSON.stringify(
      {
        decoded,
        beforeCapture: beforeCapture.draft.objects.map((o) => ({
          id: o.id,
          color: o.color,
          position: o.transform.position,
        })),
        sceneVersionId: latest.sceneVersionId,
        frameRenderer: latest.frameRenderer,
      },
      null,
      2,
    ),
  );
  assert.ok(decoded.farObjectPixels > 20, JSON.stringify(decoded));
  assert.notEqual(
    latest.frame,
    original.shots.find((shot) => shot.id === original.sequence[0]).frame,
  );
  for (const old of beforeCapture.shots)
    assert.deepEqual(
      captured.shots.find((shot) => shot.id === old.id),
      old,
    );
  assert.deepEqual(errors, []);
  await fs.writeFile(
    `reports/director/${engine}-plan-flow.json`,
    JSON.stringify(
      {
        engine,
        browser: browser.version(),
        stages,
        assertions: [
          "native pointer capture outside SVG",
          "preview leaves persistence untouched",
          "single undo per gesture",
          "repeat-key coalescing",
          "Escape/Ctrl-Z/cancel/lostcapture/unmount",
          "camera position and quaternion",
          "immutable scenes/shots/sequences",
          "pan/zoom do not edit",
          "44px handles at three sizes",
          "far coordinates visible",
          "versioned new plan frame",
        ],
        scans,
        errors,
        decoded,
      },
      null,
      2,
    ),
  );
  console.log("Plan flow passed", engine);
} catch (error) {
  await page
    .screenshot({
      path: `reports/director/${engine}-plan-failure.png`,
      fullPage: true,
    })
    .catch(() => {});
  await fs.writeFile(
    `reports/director/${engine}-plan-failure.json`,
    JSON.stringify({ message: String(error), stages, errors, scans }, null, 2),
  );
  throw error;
} finally {
  let cleanupTimeout;
  await Promise.race([
    browser.close(),
    new Promise((resolve) => {
      cleanupTimeout = setTimeout(resolve, 10000);
    }),
  ]);
  clearTimeout(cleanupTimeout);
  clearTimeout(watchdog);
}
