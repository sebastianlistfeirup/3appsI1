import type { Project, Shot } from "@tre/scene-format";
import { dataUrlBytes } from "./project-files";
import { withDecodedImage } from "./media-lifecycle";

export interface ShotPoster {
  bytes: Uint8Array;
  source: "camera" | "image" | "video";
  sourceFrame: number | null;
  decodedMediaTime?: number;
  presentationOffset?: number;
}

function drawPoster(source: CanvasImageSource, width: number, height: number) {
  if (!width || !height || width > 8192 || height > 8192)
    throw Error("Kildens billedstørrelse kan ikke bruges til storyboardet");
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 720;
  try {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw Error("Browseren kan ikke tegne storyboardets billeder");
    ctx.fillStyle = "#161a22";
    ctx.fillRect(0, 0, 1280, 720);
    const scale = Math.min(1280 / width, 720 / height);
    ctx.drawImage(
      source,
      (1280 - width * scale) / 2,
      (720 - height * scale) / 2,
      width * scale,
      height * scale,
    );
    return dataUrlBytes(canvas.toDataURL("image/jpeg", 0.9));
  } finally {
    canvas.width = canvas.height = 0;
  }
}

/** A video poster always comes from the actual source at its trim, never a prior camera frame. */
export async function shotPoster(
  project: Project,
  shot: Shot,
): Promise<ShotPoster | null> {
  const media = project.media.find((m) => m.id === shot.mediaId);
  if (media?.kind === "video") {
    return new Promise((resolve, reject) => {
      const video = document.createElement("video"),
        url = URL.createObjectURL(
          new Blob([dataUrlBytes(media.dataUrl)], { type: media.mime }),
        );
      const targetTime = shot.sourceIn / project.fps;
      let finished = false,
        positioned = false,
        frameReady = false,
        callbackId: number | undefined,
        initialMediaTime: number | undefined,
        decodedMediaTime: number | undefined;
      const cleanup = () => {
        clearTimeout(timer);
        if (callbackId !== undefined)
          video.cancelVideoFrameCallback(callbackId);
        video.onloadedmetadata =
          video.onloadeddata =
          video.onseeked =
          video.onerror =
            null;
        video.pause();
        video.removeAttribute("src");
        video.load();
        video.remove();
        URL.revokeObjectURL(url);
      };
      const done = (error?: Error) => {
        if (finished) return;
        if (
          !error &&
          (!positioned || !frameReady || video.seeking || video.readyState < 2)
        )
          return;
        finished = true;
        try {
          if (error) throw error;
          resolve({
            bytes: drawPoster(video, video.videoWidth, video.videoHeight),
            source: "video",
            sourceFrame: shot.sourceIn,
            decodedMediaTime,
            presentationOffset: initialMediaTime,
          });
        } catch (e) {
          reject(e);
        } finally {
          cleanup();
        }
      };
      const timer = setTimeout(
        () =>
          done(
            Error(
              `Klipframe fra ${media.name} kunne ikke læses inden 15 sekunder`,
            ),
          ),
        15000,
      );
      video.preload = "auto";
      video.muted = true;
      video.playsInline = true;
      // WebKit can report decoded/seeked on a detached video while drawImage
      // still reads transparent pixels. A tiny, noninteractive DOM attachment
      // initializes its actual presentation surface without playing the clip.
      video.style.cssText =
        "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none";
      video.setAttribute("aria-hidden", "true");
      video.tabIndex = -1;
      document.body.append(video);
      const presented: VideoFrameRequestCallback = (_, metadata) => {
        if (finished) return;
        callbackId = undefined;
        if (initialMediaTime === undefined) {
          // Some WebKit/GStreamer H264 builds report the composition offset
          // (e.g. two B-frames) in mediaTime. Anchor to the actual first frame
          // before seeking, rather than trusting currentTime or seeked alone.
          initialMediaTime = metadata.mediaTime;
          positioned = true;
          if (targetTime === 0) {
            decodedMediaTime = metadata.mediaTime;
            frameReady = true;
            done();
            return;
          }
          callbackId = video.requestVideoFrameCallback(presented);
          video.currentTime = targetTime;
          return;
        }
        if (
          Math.abs(metadata.mediaTime - initialMediaTime - targetTime) <=
          1 / project.fps
        ) {
          decodedMediaTime = metadata.mediaTime;
          frameReady = true;
          done();
        } else callbackId = video.requestVideoFrameCallback(presented);
      };
      video.onloadedmetadata = () => {
        if (!Number.isFinite(video.duration) || targetTime >= video.duration)
          return done(Error(`Kliptrim ligger uden for ${media.name}`));
      };
      video.onseeked = () => done();
      video.onloadeddata = () => done();
      video.onerror = () =>
        done(Error(`Browseren kan ikke læse klipframe fra ${media.name}`));
      if (typeof video.requestVideoFrameCallback !== "function")
        return done(
          Error("Browseren kan ikke bekræfte det afkodede klipframe"),
        );
      // Register before src: a warm cache can present frame zero before the
      // loadedmetadata handler runs, and a paused video will not repeat it.
      callbackId = video.requestVideoFrameCallback(presented);
      video.src = url;
    });
  }
  const frame = media?.kind === "image" ? media.dataUrl : shot.frame;
  if (!frame) return null;
  return withDecodedImage(frame, (image) => ({
    bytes: drawPoster(image, image.naturalWidth, image.naturalHeight),
    source: media ? "image" : "camera",
    sourceFrame: null,
  }));
}
