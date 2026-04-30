import { describe, expect, it, vi } from "vitest";
import { playSaleAlertSound, saleAlertSoundPath } from "./notification-sound";

describe("notification sound", () => {
  it("plays the bundled sale alert with clamped volume", async () => {
    const play = vi.fn(async () => undefined);
    const audio = { volume: 0, play } as unknown as HTMLAudioElement;
    const factory = vi.fn(() => audio);

    const played = await playSaleAlertSound(2, factory);

    expect(played).toBe(true);
    expect(factory).toHaveBeenCalledWith(saleAlertSoundPath);
    expect(audio.volume).toBe(1);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("fails silently when the sound file or audio backend is unavailable", async () => {
    const played = await playSaleAlertSound(0.5, () => {
      throw new Error("audio unavailable");
    });

    expect(played).toBe(false);
  });
});
