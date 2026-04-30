export const saleAlertSoundPath = "/sounds/sale-alert.wav";

export const playSaleAlertSound = async (
  volume: number,
  audioFactory: (src: string) => HTMLAudioElement = (src) => new Audio(src),
): Promise<boolean> => {
  try {
    const audio = audioFactory(saleAlertSoundPath);
    audio.volume = Math.min(1, Math.max(0, volume));
    await audio.play();
    return true;
  } catch {
    return false;
  }
};
