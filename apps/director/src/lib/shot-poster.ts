import type { Project, Shot } from "@tre/scene-format";
import { dataUrlBytes } from "./project-files";

export interface ShotPoster {
  bytes: Uint8Array;
  source: "camera" | "image" | "video";
  sourceFrame: number | null;
}

function drawPoster(source: CanvasImageSource, width: number, height: number) {
  if (!width || !height || width > 8192 || height > 8192)
    throw Error("Kildens billedstørrelse kan ikke bruges til storyboardet");
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 720;
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
  const bytes = dataUrlBytes(canvas.toDataURL("image/jpeg", 0.9));
  canvas.width = canvas.height = 0;
  return bytes;
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
      let finished = false,
        positioned = false;
      const cleanup = () => {
        clearTimeout(timer);
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
        if (!error && (!positioned || video.seeking || video.readyState < 2))
          return;
        finished = true;
        try {
          if (error) throw error;
          resolve({
            bytes: drawPoster(video, video.videoWidth, video.videoHeight),
            source: "video",
            sourceFrame: shot.sourceIn,
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
      video.onloadedmetadata = () => {
        const time = shot.sourceIn / project.fps;
        if (!Number.isFinite(video.duration) || time >= video.duration)
          return done(Error(`Kliptrim ligger uden for ${media.name}`));
        positioned = true;
        if (time > 0) video.currentTime = time;
        else done();
      };
      video.onloadeddata = () => done();
      video.onseeked = () => done();
      video.onerror = () =>
        done(Error(`Browseren kan ikke læse klipframe fra ${media.name}`));
      video.src = url;
    });
  }
  const frame = media?.kind === "image" ? media.dataUrl : shot.frame;
  if (!frame) return null;
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timer = setTimeout(() => {
      image.onload = image.onerror = null;
      image.src = "";
      reject(Error("Et storyboard-billede kunne ikke læses inden 15 sekunder"));
    }, 15000);
    image.onload = () => {
      clearTimeout(timer);
      try {
        resolve({
          bytes: drawPoster(image, image.naturalWidth, image.naturalHeight),
          source: media ? "image" : "camera",
          sourceFrame: null,
        });
      } catch (e) {
        reject(e);
      }
    };
    image.onerror = () => {
      clearTimeout(timer);
      reject(Error(`Billedet til ${shot.name} kunne ikke åbnes`));
    };
    image.src = frame;
  });
}
