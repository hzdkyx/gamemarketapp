export const saleAlertSoundPath = "/sounds/sale-alert.wav";

const fallbackBeepMaxGain = 0.2;
const fallbackBeepFrequencyHz = 880;
const fallbackBeepDurationSeconds = 0.14;

type NotificationAudioElement = Pick<HTMLAudioElement, "play" | "volume">;

export interface NotificationOscillator {
  type: OscillatorType;
  frequency: {
    setValueAtTime: (value: number, startTime: number) => void;
  };
  connect: (node: NotificationGainNode) => void;
  start: (startTime?: number) => void;
  stop: (stopTime?: number) => void;
}

export interface NotificationGainNode {
  gain: {
    setValueAtTime: (value: number, startTime: number) => void;
    linearRampToValueAtTime: (value: number, endTime: number) => void;
  };
  connect: (node: unknown) => void;
}

export interface NotificationAudioContext {
  currentTime: number;
  destination: unknown;
  state?: AudioContextState;
  resume?: () => Promise<void>;
  close?: () => Promise<void>;
  createOscillator: () => NotificationOscillator;
  createGain: () => NotificationGainNode;
}

export interface NotificationSoundResult {
  ok: boolean;
  mode: "file" | "fallback" | "none";
  message: string;
  error?: string;
}

interface PlaySaleAlertSoundOptions {
  audioFactory?: (src: string) => NotificationAudioElement;
  audioContextFactory?: () => NotificationAudioContext | null;
  fallbackDurationMs?: number;
}

const clampVolume = (volume: number): number => Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : 0));

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "erro desconhecido";

const getAudioContextFactory = (): (() => NotificationAudioContext | null) => {
  const audioGlobal = globalThis as typeof globalThis & {
    webkitAudioContext?: new () => NotificationAudioContext;
  };
  const AudioContextConstructor =
    audioGlobal.AudioContext as unknown as (new () => NotificationAudioContext) | undefined;
  const WebKitAudioContextConstructor = audioGlobal.webkitAudioContext;

  return () => {
    const Constructor = AudioContextConstructor ?? WebKitAudioContextConstructor;
    return Constructor ? new Constructor() : null;
  };
};

const playFallbackBeep = async (
  volume: number,
  audioContextFactory: () => NotificationAudioContext | null,
  fallbackDurationMs: number
): Promise<void> => {
  const audioContext = audioContextFactory();
  if (!audioContext) {
    throw new Error("Web Audio API indisponível.");
  }

  if (audioContext.state === "suspended") {
    await audioContext.resume?.();
  }

  const startTime = audioContext.currentTime;
  const stopTime = startTime + fallbackBeepDurationSeconds;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const peakGain = clampVolume(volume) * fallbackBeepMaxGain;

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(fallbackBeepFrequencyHz, startTime);
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.015);
  gain.gain.linearRampToValueAtTime(0, stopTime);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(startTime);
  oscillator.stop(stopTime);

  if (fallbackDurationMs > 0) {
    await new Promise((resolve) => {
      window.setTimeout(resolve, fallbackDurationMs);
    });
  }

  await audioContext.close?.();
};

export const playSaleAlertSound = async (
  volume: number,
  options: PlaySaleAlertSoundOptions = {}
): Promise<NotificationSoundResult> => {
  const clampedVolume = clampVolume(volume);
  const audioFactory = options.audioFactory ?? ((src: string) => new Audio(src));
  const audioContextFactory = options.audioContextFactory ?? getAudioContextFactory();
  const fallbackDurationMs = options.fallbackDurationMs ?? 180;
  let fileError: unknown = null;

  try {
    const audio = audioFactory(saleAlertSoundPath);
    audio.volume = clampedVolume;
    await audio.play();
    return {
      ok: true,
      mode: "file",
      message: "Som testado com sucesso."
    };
  } catch (error) {
    fileError = error;
  }

  try {
    await playFallbackBeep(clampedVolume, audioContextFactory, fallbackDurationMs);
    return {
      ok: true,
      mode: "fallback",
      message: "Arquivo de som não encontrado; usando beep de fallback.",
      error: errorMessage(fileError)
    };
  } catch (fallbackError) {
    const fallbackMessage = errorMessage(fallbackError);
    const fileMessage = fileError ? errorMessage(fileError) : "";
    return {
      ok: false,
      mode: "none",
      message: `Falha ao tocar som: ${fallbackMessage}${fileMessage ? ` (${fileMessage})` : ""}`,
      error: fallbackMessage
    };
  }
};
