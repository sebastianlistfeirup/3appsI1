"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, Film } from "lucide-react";
import type { Project, Shot } from "@tre/scene-format";

/** A paused clip thumbnail follows the selected source trim. Camera frames never stand in for clips. */
export function ShotFrame({ project, shot }: { project: Project; shot: Shot }) {
  const media = project.media.find((m) => m.id === shot.mediaId),
    ref = useRef<HTMLVideoElement>(null),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
    const video = ref.current;
    if (!video || media?.kind !== "video") return;
    const position = () => {
      if (Number.isFinite(video.duration)) {
        video.pause();
        video.currentTime = Math.min(
          shot.sourceIn / project.fps,
          Math.max(0, video.duration - 1 / project.fps),
        );
      }
    };
    video.addEventListener("loadedmetadata", position);
    if (video.readyState >= 1) position();
    return () => video.removeEventListener("loadedmetadata", position);
  }, [media?.id, shot.sourceIn, project.fps]);
  if (media?.kind === "video")
    return failed ? (
      <div className="frame-placeholder">
        <Film size={24} />
        <span>Klippreview kan ikke vises</span>
      </div>
    ) : (
      <video
        ref={ref}
        src={media.dataUrl}
        muted
        playsInline
        preload="metadata"
        onLoadedMetadata={(event) => {
          event.currentTarget.currentTime = shot.sourceIn / project.fps;
        }}
        onError={() => setFailed(true)}
        aria-label={`Klipframe: ${shot.name} fra ${(shot.sourceIn / project.fps).toLocaleString("da-DK")} sekunder`}
      />
    );
  if (media?.kind === "image" || shot.frame)
    return (
      <img
        src={media?.kind === "image" ? media.dataUrl : shot.frame!}
        alt={`${media ? "Eget billede" : shot.frameMode === "plan" ? "2D-plan" : "Kameraframe"}: ${shot.name}`}
        draggable={false}
      />
    );
  return (
    <div className="frame-placeholder">
      <Camera size={24} />
      <span>Tag kameraframe</span>
    </div>
  );
}
