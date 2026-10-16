export type RenderCapability = {
  available: boolean;
  profile: "local-only";
  cloudConnected: false;
  reason: string;
  checkedAt?: string;
  checks?: string[];
  ffmpeg?: string;
  ffprobe?: string;
  fontSha256?: string;
};
