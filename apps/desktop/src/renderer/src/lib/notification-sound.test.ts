import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  playSaleAlertSound,
  saleAlertSoundPath,
  type NotificationAudioContext,
  type NotificationGainNode,
  type NotificationOscillator
} from "./notification-sound";

const currentDir = dirname(fileURLToPath(import.meta.url));

describe("notification sound", () => {
  it("keeps the bundled sound in Vite public assets", () => {
    expect(saleAlertSoundPath).toBe("/sounds/sale-alert.wav");
    expect(existsSync(resolve(currentDir, "../../public/sounds/sale-alert.wav"))).toBe(true);
  });

  it("plays the bundled sale alert with clamped volume", async () => {
    const play = vi.fn(async () => undefined);
    const audio = { volume: 0, play };
    const factory = vi.fn(() => audio);
    const audioContextFactory = vi.fn(() => null);

    const result = await playSaleAlertSound(2, {
      audioFactory: factory,
      audioContextFactory
    });

    expect(result).toMatchObject({
      ok: true,
      mode: "file",
      message: "Som testado com sucesso."
    });
    expect(factory).toHaveBeenCalledWith(saleAlertSoundPath);
    expect(audio.volume).toBe(1);
    expect(play).toHaveBeenCalledTimes(1);
    expect(audioContextFactory).not.toHaveBeenCalled();
  });

  it("uses a Web Audio beep fallback when the bundled sound fails", async () => {
    const play = vi.fn(async () => {
      throw new Error("file missing");
    });
    const audio = { volume: 0, play };
    const gainSetValueAtTime = vi.fn();
    const gainLinearRampToValueAtTime = vi.fn();
    const gain: NotificationGainNode = {
      gain: {
        setValueAtTime: gainSetValueAtTime,
        linearRampToValueAtTime: gainLinearRampToValueAtTime
      },
      connect: vi.fn()
    };
    const oscillator: NotificationOscillator = {
      type: "square",
      frequency: {
        setValueAtTime: vi.fn()
      },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn()
    };
    const audioContext: NotificationAudioContext = {
      currentTime: 4,
      destination: {},
      createOscillator: vi.fn(() => oscillator),
      createGain: vi.fn(() => gain),
      close: vi.fn(async () => undefined)
    };

    const result = await playSaleAlertSound(0.5, {
      audioFactory: vi.fn(() => audio),
      audioContextFactory: vi.fn(() => audioContext),
      fallbackDurationMs: 0
    });

    expect(result).toMatchObject({
      ok: true,
      mode: "fallback",
      message: "Arquivo de som não encontrado; usando beep de fallback."
    });
    expect(audio.volume).toBe(0.5);
    expect(oscillator.type).toBe("sine");
    expect(oscillator.frequency.setValueAtTime).toHaveBeenCalledWith(880, 4);
    expect(gainLinearRampToValueAtTime).toHaveBeenCalledWith(0.1, 4.015);
    expect(oscillator.start).toHaveBeenCalledWith(4);
    expect(oscillator.stop).toHaveBeenCalledWith(4.14);
  });

  it("returns a clear failure without throwing when all audio paths fail", async () => {
    const result = await playSaleAlertSound(0.5, {
      audioFactory: () => {
        throw new Error("audio unavailable");
      },
      audioContextFactory: () => null,
      fallbackDurationMs: 0
    });

    expect(result.ok).toBe(false);
    expect(result.mode).toBe("none");
    expect(result.message).toContain("Falha ao tocar som: Web Audio API indisponível.");
    expect(result.message).toContain("audio unavailable");
  });
});
