export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
export const mb = (bytes: number) => Math.round((bytes / 1024 / 1024) * 10) / 10;
export const round = (value: number, digits = 1) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};
