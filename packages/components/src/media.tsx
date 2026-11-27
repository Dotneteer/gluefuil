// Media components (step 32; design: .ai/plan/poc-32-remaining.md): QRCode
// (uqr's module matrix drawn as one SVG path, so the prerender has it), IFrame
// and MediaPlayer (the native elements). Script never receives a DOM node, a
// window or a DOM event (the sandbox invariant): IFrame has no
// getContentWindow/getContentDocument, and MediaPlayer's events carry frozen
// snapshots of the playback state.
import { signal, useComponentApi, type RegisterApi } from "@gluefuil/runtime";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type SyntheticEvent } from "react";
import { encode } from "uqr";
import { useLayout, type LayoutProps } from "./layout";
import { mergeStyles } from "./text";

const isTrue = (value: unknown) => value === true || value === "true";
const isFalse = (value: unknown) => value === false || value === "false";
const text = (value: unknown) => (value === undefined || value === null || value === "" ? undefined : String(value));

function toNumber(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

/** Runs `handler` once, after the first commit (XMLUI's `init` event). */
function useInit(handler: unknown) {
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current || typeof handler !== "function") return;
    ran.current = true;
    void (handler as () => unknown)();
  });
}

// --- QRCode -----------------------------------------------------------------

export const QR_LEVELS = ["L", "M", "Q", "H"] as const;
type QrLevel = (typeof QR_LEVELS)[number];

/**
 * A QR code as one SVG path in module units: each horizontal run of dark
 * modules is one rectangle (`M x y h w v 1 h -w z`). No quiet zone: the
 * component's padding and background give it (XMLUI's `padding-QRCode`).
 */
export function qrPath(value: string, level: QrLevel): { d: string; size: number } {
  const { data, size } = encode(value, { ecc: level, border: 0 });
  let d = "";
  for (let y = 0; y < size; y++) {
    const row = data[y]!;
    for (let x = 0; x < size; ) {
      if (!row[x]) {
        x++;
        continue;
      }
      let w = 1;
      while (x + w < size && row[x + w]) w++;
      d += `M${x} ${y}h${w}v1h-${w}z`;
      x += w;
    }
  }
  return { d, size };
}

type QRCodeProps = LayoutProps & {
  value?: unknown;
  size?: unknown;
  level?: unknown;
  color?: unknown;
  backgroundColor?: unknown;
  title?: unknown;
  onInit?: () => unknown;
};

/** `QRCode`: `value` encoded at `level` (default L), `size` px wide (default the `size-QRCode` theme variable, 256). */
export function QRCode(props: QRCodeProps) {
  const { value, size, level, color, backgroundColor, title, onInit } = props;
  const layout = useLayout(props);
  useInit(onInit);
  const ecc: QrLevel = (QR_LEVELS as readonly unknown[]).includes(level) ? (level as QrLevel) : "L";
  const content = value === undefined || value === null ? "" : String(value);
  const path = useMemo(() => {
    try {
      return qrPath(content, ecc);
    } catch {
      return undefined; // too long for a QR code (more than 2,953 bytes at L)
    }
  }, [content, ecc]);
  const px = toNumber(size);
  const own: CSSProperties = {
    ...(px !== undefined && px > 0 ? { "--gfui-qr-size": `${px}px` } : {}),
    ...(text(color) ? { "--gfui-qr-color": String(color) } : {}),
    ...(text(backgroundColor) ? { "--gfui-qr-bg": String(backgroundColor) } : {}),
  } as CSSProperties;
  const label = text(title);
  return (
    <div className="gfui-QRCode" {...layout.attributes} style={mergeStyles(layout.style, own)}>
      {path ? (
        <svg
          viewBox={`0 0 ${path.size} ${path.size}`}
          shapeRendering="crispEdges"
          role="img"
          aria-label={label ?? "QR code"}
          data-modules={path.size}
        >
          {label ? <title>{label}</title> : null}
          <path d={path.d} fill="currentColor" />
        </svg>
      ) : (
        <div className="gfui-QRCode-error" role="img" aria-label="The value is too long for a QR code" />
      )}
    </div>
  );
}

// --- IFrame -----------------------------------------------------------------

export const REFERRER_POLICIES = [
  "no-referrer",
  "no-referrer-when-downgrade",
  "origin",
  "origin-when-cross-origin",
  "same-origin",
  "strict-origin",
  "strict-origin-when-cross-origin",
  "unsafe-url",
] as const;

type IFrameProps = LayoutProps & {
  src?: unknown;
  srcdoc?: unknown;
  allow?: unknown;
  name?: unknown;
  referrerPolicy?: unknown;
  sandbox?: unknown;
  onLoad?: () => unknown;
  registerApi?: RegisterApi;
};

/**
 * `IFrame`: a native iframe. Its API is `postMessage(message, targetOrigin = "*")`;
 * XMLUI's `getContentWindow` and `getContentDocument` are left out: they would
 * hand script a window and a document (the sandbox invariant).
 */
export function IFrame(props: IFrameProps) {
  const { src, srcdoc, allow, name, referrerPolicy, sandbox, onLoad, registerApi } = props;
  const layout = useLayout(props);
  const ref = useRef<HTMLIFrameElement>(null);
  const api = useMemo(
    () => ({
      postMessage: (message: unknown, targetOrigin?: unknown) => {
        ref.current?.contentWindow?.postMessage(message, typeof targetOrigin === "string" && targetOrigin !== "" ? targetOrigin : "*");
      },
    }),
    [],
  );
  useComponentApi(registerApi, api);
  const policy = (REFERRER_POLICIES as readonly unknown[]).includes(referrerPolicy) ? (referrerPolicy as (typeof REFERRER_POLICIES)[number]) : undefined;
  return (
    <iframe
      ref={ref}
      className="gfui-IFrame"
      src={text(src)}
      srcDoc={text(srcdoc)}
      allow={text(allow)}
      name={text(name)}
      title={text(name)}
      referrerPolicy={policy}
      sandbox={typeof sandbox === "string" ? sandbox : undefined}
      onLoad={typeof onLoad === "function" ? () => void onLoad() : undefined}
      {...layout.attributes}
      style={layout.style}
    />
  );
}

// --- MediaPlayer ------------------------------------------------------------

type MediaHandler = (state: Readonly<Record<string, number>>) => unknown;

type MediaPlayerProps = LayoutProps & {
  src?: unknown;
  kind?: unknown;
  poster?: unknown;
  autoPlay?: unknown;
  controls?: unknown;
  loop?: unknown;
  muted?: unknown;
  playbackRate?: unknown;
  preload?: unknown;
  crossOrigin?: unknown;
  onPlay?: MediaHandler;
  onPause?: MediaHandler;
  onEnded?: MediaHandler;
  onSeeked?: MediaHandler;
  onTimeUpdate?: MediaHandler;
  onLoadedMetadata?: MediaHandler;
  registerApi?: RegisterApi;
};

/** The reactive part of a MediaPlayer's API (XMLUI: duration, paused, ended). */
interface MediaState {
  duration: number | undefined;
  paused: boolean;
  ended: boolean;
}

/**
 * `MediaPlayer`: a native `<video>` (default) or `<audio>`. Its events get a
 * frozen `{ currentTime }` (`loadedMetadata`: `{ duration }`, plus the video's
 * size), never the DOM event; `duration`, `paused` and `ended` are reactive.
 */
export function MediaPlayer(props: MediaPlayerProps) {
  const { src, kind, poster, autoPlay, controls, loop, muted, playbackRate, preload, crossOrigin, registerApi } = props;
  const layout = useLayout(props);
  const ref = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const [state] = useState(() => signal<MediaState>({ duration: undefined, paused: true, ended: false }));
  const update = (patch: Partial<MediaState>) => state.set({ ...state.get(), ...patch });
  const api = useMemo(
    () => ({
      play: () => ref.current?.play() ?? Promise.resolve(),
      pause: () => ref.current?.pause(),
      seek: (time: unknown) => {
        const t = toNumber(time);
        if (ref.current && t !== undefined) ref.current.currentTime = Math.max(0, t);
      },
      getCurrentTime: () => ref.current?.currentTime ?? 0,
      get duration() {
        return state.get().duration;
      },
      get paused() {
        return state.get().paused;
      },
      get ended() {
        return state.get().ended;
      },
    }),
    [state],
  );
  useComponentApi(registerApi, api);
  const rate = toNumber(playbackRate);
  useEffect(() => {
    if (ref.current && rate !== undefined && rate > 0) ref.current.playbackRate = rate;
  }, [rate]);
  const fire = (handler: MediaHandler | undefined, snapshot: (el: HTMLMediaElement) => Record<string, number>) =>
    typeof handler === "function" ? (event: SyntheticEvent<HTMLMediaElement>) => void handler(Object.freeze(snapshot(event.currentTarget))) : undefined;
  const at = (el: HTMLMediaElement) => ({ currentTime: el.currentTime });
  const isAudio = kind === "audio";
  const handlers = {
    onPlay: (event: SyntheticEvent<HTMLMediaElement>) => {
      update({ paused: false, ended: false });
      fire(props.onPlay, at)?.(event);
    },
    onPause: (event: SyntheticEvent<HTMLMediaElement>) => {
      update({ paused: true });
      fire(props.onPause, at)?.(event);
    },
    onEnded: (event: SyntheticEvent<HTMLMediaElement>) => {
      update({ paused: true, ended: true });
      fire(props.onEnded, at)?.(event);
    },
    onSeeked: (event: SyntheticEvent<HTMLMediaElement>) => {
      if (state.get().ended && event.currentTarget.currentTime < (event.currentTarget.duration || 0)) update({ ended: false });
      fire(props.onSeeked, at)?.(event);
    },
    onTimeUpdate: fire(props.onTimeUpdate, at),
    onLoadedMetadata: (event: SyntheticEvent<HTMLMediaElement>) => {
      update({ duration: Number.isNaN(event.currentTarget.duration) ? undefined : event.currentTarget.duration });
      fire(props.onLoadedMetadata, (el): Record<string, number> =>
        isAudio ? { duration: el.duration } : { duration: el.duration, videoWidth: (el as HTMLVideoElement).videoWidth, videoHeight: (el as HTMLVideoElement).videoHeight },
      )?.(event);
    },
  };
  const common = {
    ref,
    className: "gfui-MediaPlayer",
    "data-kind": isAudio ? "audio" : "video",
    src: text(src),
    autoPlay: isTrue(autoPlay),
    controls: !isFalse(controls),
    loop: isTrue(loop),
    muted: isTrue(muted),
    preload: preload === "none" || preload === "metadata" || preload === "auto" ? preload : undefined,
    crossOrigin: crossOrigin === "anonymous" || crossOrigin === "use-credentials" ? crossOrigin : undefined,
    ...handlers,
    ...layout.attributes,
    style: layout.style,
  } as const;
  return isAudio ? <audio {...common} /> : <video {...common} poster={text(poster)} playsInline />;
}
