import type { BrowserQuestion } from "../data/schema";

export interface ChallengeQuestion extends BrowserQuestion {
  categoryLabel: string;
}

export interface PreparedChallenge {
  bankVersion: string;
  questions: ChallengeQuestion[];
}

export type PrepareChallenge = () => Promise<PreparedChallenge>;
