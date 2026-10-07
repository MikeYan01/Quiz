export const questionsPerChallenge = 10;
export const questionDurationMs = 15_000;
export const maximumScoreWindowMs = 5_000;
export const feedbackDurationMs = 2_000;

export function scoreCorrectAnswer(elapsedMs: number) {
  if (elapsedMs >= questionDurationMs) {
    return 0;
  }
  if (elapsedMs <= maximumScoreWindowMs) {
    return 10;
  }
  return Math.max(1, 15 - Math.ceil(elapsedMs / 1_000));
}

export function formatRemainingTime(remainingMs: number) {
  return (Math.ceil(remainingMs / 100) / 10).toFixed(1);
}
