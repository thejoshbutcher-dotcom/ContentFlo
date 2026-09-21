"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { ReviewSource } from "@/lib/review";

/**
 * One player, three engines. Whatever is playing, the review tab only needs to
 * ask "where are we?", say "go there", and "hold on" — so that's the whole
 * interface, and the YouTube / Vimeo / <video> differences stay in here.
 */
export interface ReviewPlayerHandle {
  getTime: () => Promise<number>;
  seek: (seconds: number) => void;
  pause: () => void;
}

interface Props {
  source: ReviewSource;
  /** Fires about twice a second while the position changes. */
  onTime: (seconds: number) => void;
  onDuration: (seconds: number) => void;
  onError: (message: string) => void;
}

// ————— Minimal typings for the two third-party player SDKs —————

interface YTPlayer {
  getCurrentTime(): number;
  getDuration(): number;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  pauseVideo(): void;
  destroy(): void;
}
interface YTNamespace {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId: string;
      width?: string;
      height?: string;
      playerVars?: Record<string, number | string>;
      events?: {
        onReady?: () => void;
        onError?: (e: { data: number }) => void;
      };
    }
  ) => YTPlayer;
}
interface VimeoPlayer {
  getCurrentTime(): Promise<number>;
  getDuration(): Promise<number>;
  setCurrentTime(seconds: number): Promise<number>;
  pause(): Promise<void>;
  on(
    event: "timeupdate" | "seeked",
    cb: (d: { seconds: number; duration: number }) => void
  ): void;
  on(event: "error", cb: (e: { message?: string }) => void): void;
  ready(): Promise<void>;
  destroy(): Promise<void>;
}
interface VimeoNamespace {
  Player: new (el: HTMLIFrameElement) => VimeoPlayer;
}
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
    Vimeo?: VimeoNamespace;
  }
}

// Each SDK is fetched once per page, the first time a cut from that host opens.
const loading = new Map<string, Promise<void>>();

function loadScript(src: string, ready: () => boolean, hook?: (done: () => void) => void) {
  if (ready()) return Promise.resolve();
  let p = loading.get(src);
  if (!p) {
    p = new Promise<void>((resolve, reject) => {
      const el = document.createElement("script");
      el.src = src;
      el.async = true;
      el.onerror = () => {
        loading.delete(src);
        reject(new Error("blocked"));
      };
      // YouTube signals readiness through a global callback, not onload.
      if (hook) hook(resolve);
      else el.onload = () => resolve();
      document.head.appendChild(el);
    });
    loading.set(src, p);
  }
  return p;
}

const loadYouTube = () =>
  loadScript(
    "https://www.youtube.com/iframe_api",
    () => Boolean(window.YT?.Player),
    (done) => {
      const prior = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prior?.();
        done();
      };
    }
  );

const loadVimeo = () =>
  loadScript("https://player.vimeo.com/api/player.js", () => Boolean(window.Vimeo?.Player));

const YT_ERRORS: Record<number, string> = {
  2: "That doesn't look like a valid YouTube video.",
  5: "YouTube couldn't play this video here.",
  100: "That video is private or has been removed. Set it to Unlisted so it can play here.",
  101: "The owner has turned off embedding for this video (YouTube Studio → Details → Allow embedding).",
  150: "The owner has turned off embedding for this video (YouTube Studio → Details → Allow embedding).",
};

const ReviewPlayer = forwardRef<ReviewPlayerHandle, Props>(function ReviewPlayer(
  { source, onTime, onDuration, onError },
  ref
) {
  const mount = useRef<HTMLDivElement | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const yt = useRef<YTPlayer | null>(null);
  const vimeo = useRef<VimeoPlayer | null>(null);

  // Latest callbacks without re-creating the player when a parent re-renders.
  const cb = useRef({ onTime, onDuration, onError });
  useEffect(() => {
    cb.current = { onTime, onDuration, onError };
  });

  useImperativeHandle(ref, () => ({
    getTime: async () => {
      if (yt.current) return yt.current.getCurrentTime();
      if (vimeo.current) return vimeo.current.getCurrentTime();
      return video.current?.currentTime ?? 0;
    },
    seek: (s) => {
      if (yt.current) yt.current.seekTo(s, true);
      else if (vimeo.current) {
        void vimeo.current
          .setCurrentTime(s)
          .then((actual) => cb.current.onTime(actual))
          .catch(() => {});
      }
      else if (video.current) video.current.currentTime = s;
    },
    pause: () => {
      if (yt.current) yt.current.pauseVideo();
      else if (vimeo.current) void vimeo.current.pause().catch(() => {});
      else video.current?.pause();
    },
  }));

  const key =
    source.provider === "dropbox" ? source.src : `${source.provider}:${source.videoId}`;

  useEffect(() => {
    if (source.provider === "dropbox") return;
    const host = mount.current;
    if (!host) return;

    let dead = false;
    let poll: ReturnType<typeof setInterval> | null = null;

    if (source.provider === "youtube") {
      // YT.Player REPLACES the element it's given, so hand it a throwaway
      // child — never the node React owns.
      const slot = document.createElement("div");
      host.appendChild(slot);
      loadYouTube()
        .then(() => {
          if (dead || !window.YT) return;
          const player = new window.YT.Player(slot, {
            videoId: source.videoId,
            width: "100%",
            height: "100%",
            playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
            events: {
              onReady: () => {
                if (dead) return;
                yt.current = player;
                cb.current.onDuration(player.getDuration());
                poll = setInterval(() => {
                  cb.current.onTime(player.getCurrentTime());
                  // Live/just-processed videos report 0 at first.
                  cb.current.onDuration(player.getDuration());
                }, 500);
              },
              onError: (e) =>
                cb.current.onError(YT_ERRORS[e.data] ?? "YouTube couldn't play this video."),
            },
          });
        })
        .catch(() =>
          cb.current.onError("Couldn't load the YouTube player — a blocker may be stopping it.")
        );
    } else {
      const frame = document.createElement("iframe");
      frame.src =
        `https://player.vimeo.com/video/${source.videoId}?dnt=1` +
        (source.hash ? `&h=${source.hash}` : "");
      frame.allow = "autoplay; fullscreen; picture-in-picture";
      frame.allowFullscreen = true;
      host.appendChild(frame);
      loadVimeo()
        .then(() => {
          if (dead || !window.Vimeo) return;
          const player = new window.Vimeo.Player(frame);
          player.on("timeupdate", (d) => {
            cb.current.onTime(d.seconds);
            cb.current.onDuration(d.duration);
          });
          // A seek while paused fires no timeupdate; without this the marker
          // strip's playhead would sit still.
          player.on("seeked", (d) => cb.current.onTime(d.seconds));
          player.on("error", () =>
            cb.current.onError(
              "Vimeo couldn't play this. If the video is private, change its privacy to Unlisted."
            )
          );
          player
            .ready()
            .then(() => {
              if (dead) return;
              vimeo.current = player;
              // Polled like YouTube rather than trusting the event stream:
              // Vimeo sends no timeupdate for a seek made while paused.
              poll = setInterval(() => {
                void player
                  .getCurrentTime()
                  .then((s) => !dead && cb.current.onTime(s))
                  .catch(() => {});
              }, 500);
              return player.getDuration().then((d) => cb.current.onDuration(d));
            })
            .catch(() =>
              cb.current.onError(
                "Vimeo couldn't play this. If the video is private, change its privacy to Unlisted."
              )
            );
        })
        .catch(() =>
          cb.current.onError("Couldn't load the Vimeo player — a blocker may be stopping it.")
        );
    }

    return () => {
      dead = true;
      if (poll) clearInterval(poll);
      try {
        yt.current?.destroy();
      } catch {
        /* already gone */
      }
      void vimeo.current?.destroy().catch(() => {});
      yt.current = null;
      vimeo.current = null;
      host.replaceChildren();
    };
    // `key` captures everything about the source that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (source.provider === "dropbox") {
    return (
      <div className="review-stage">
        <video
          key={source.src}
          ref={video}
          src={source.src}
          controls
          playsInline
          preload="metadata"
          onTimeUpdate={(e) => onTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => onDuration(e.currentTarget.duration)}
          onError={() =>
            onError(
              "Dropbox couldn't stream this file. Check the link is to a single video (not a folder), that anyone with the link can view it, and that it's an MP4 or MOV."
            )
          }
        />
      </div>
    );
  }

  return <div className="review-stage" ref={mount} />;
});

export default ReviewPlayer;
