import type {
  ChallengeQuestion,
  PrepareChallenge,
} from "../challenge/types";
import {
  questionBankManifestSchema,
  questionShardSchema,
  type QuestionBankManifest,
} from "./schema";

interface QuestionBankSource {
  readText(path: string): Promise<string>;
}

interface StaticChallengePreparerOptions {
  source: QuestionBankSource;
  manifestPath: string;
  randomInteger?: (maxExclusive: number) => number;
}

function secureRandomInteger(maxExclusive: number) {
  if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0) {
    throw new Error("随机范围必须是正整数。");
  }

  const range = 2 ** 32;
  const limit = range - (range % maxExclusive);
  const sample = new Uint32Array(1);
  do {
    crypto.getRandomValues(sample);
  } while ((sample[0] ?? range) >= limit);

  return (sample[0] ?? 0) % maxExclusive;
}

function chooseIndex(
  maxExclusive: number,
  randomInteger: (maxExclusive: number) => number,
) {
  const index = randomInteger(maxExclusive);
  if (!Number.isInteger(index) || index < 0 || index >= maxExclusive) {
    throw new Error("随机源返回了范围外的索引。");
  }
  return index;
}

function shuffle<T>(
  values: readonly T[],
  randomInteger: (maxExclusive: number) => number,
) {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const otherIndex = chooseIndex(index + 1, randomInteger);
    [shuffled[index], shuffled[otherIndex]] = [
      shuffled[otherIndex] as T,
      shuffled[index] as T,
    ];
  }
  return shuffled;
}

function parseJson(content: string, description: string) {
  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new Error(`${description}不是有效的 JSON。`);
  }
}

async function sha256(content: string) {
  const bytes = new TextEncoder().encode(content);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function locateShard(
  category: QuestionBankManifest["categories"][number],
  questionIndex: number,
) {
  let remainingIndex = questionIndex;
  for (const shard of category.shards) {
    if (remainingIndex < shard.questionCount) {
      return { shard, questionIndex: remainingIndex };
    }
    remainingIndex -= shard.questionCount;
  }
  throw new Error(`主类别 ${category.categoryId} 的分片计数不一致。`);
}

function scheduleWhenIdle(task: () => void) {
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(() => task(), { timeout: 1_000 });
    return;
  }
  setTimeout(task, 0);
}

export function createStaticChallengePreparer({
  source,
  manifestPath,
  randomInteger = secureRandomInteger,
}: StaticChallengePreparerOptions): PrepareChallenge {
  let manifestPromise: Promise<QuestionBankManifest> | null = null;
  let prefetchedChallenge: ReturnType<PrepareChallenge> | null = null;

  function loadManifest() {
    if (manifestPromise) return manifestPromise;

    const currentPromise = source
      .readText(manifestPath)
      .then((manifestContent) =>
        questionBankManifestSchema.parse(
          parseJson(manifestContent, "题库清单"),
        ),
      );
    manifestPromise = currentPromise;
    void currentPromise.catch(() => {
      if (manifestPromise === currentPromise) manifestPromise = null;
    });
    return currentPromise;
  }

  async function loadChallenge() {
    const manifest = await loadManifest();
    const categories = shuffle(manifest.categories, randomInteger);

    const questions = await Promise.all(
      categories.map(async (category): Promise<ChallengeQuestion> => {
        const selectedIndex = chooseIndex(
          category.questionCount,
          randomInteger,
        );
        const { shard, questionIndex } = locateShard(
          category,
          selectedIndex,
        );
        const shardContent = await source.readText(shard.path);
        if ((await sha256(shardContent)) !== shard.sha256) {
          throw new Error(`题库分片 ${shard.path} 的校验值不匹配。`);
        }

        const parsedShard = questionShardSchema.parse(
          parseJson(shardContent, `题库分片 ${shard.path}`),
        );
        if (
          parsedShard.bankVersion !== manifest.bankVersion ||
          parsedShard.categoryId !== category.categoryId ||
          parsedShard.questions.length !== shard.questionCount
        ) {
          throw new Error(`题库分片 ${shard.path} 与清单不一致。`);
        }

        const question = parsedShard.questions[questionIndex];
        if (!question) {
          throw new Error(`题库分片 ${shard.path} 缺少已抽中的题目。`);
        }

        return {
          ...question,
          categoryLabel: category.categoryLabel,
          options: shuffle(question.options, randomInteger),
        };
      }),
    );

    return {
      bankVersion: manifest.bankVersion,
      questions,
    };
  }

  function preloadChallenge() {
    if (prefetchedChallenge) return prefetchedChallenge;

    const currentPromise = loadChallenge();
    prefetchedChallenge = currentPromise;
    void currentPromise.catch(() => {
      if (prefetchedChallenge === currentPromise) {
        prefetchedChallenge = null;
      }
    });
    return currentPromise;
  }

  void loadManifest();
  scheduleWhenIdle(() => {
    void preloadChallenge();
  });

  return async () => {
    const currentPromise = preloadChallenge();
    try {
      return await currentPromise;
    } finally {
      if (prefetchedChallenge === currentPromise) {
        prefetchedChallenge = null;
      }
    }
  };
}

export function createHttpQuestionBankSource(
  baseUrl: string | URL,
): QuestionBankSource {
  const base = new URL(baseUrl, document.baseURI);
  const pageOrigin = new URL(document.baseURI).origin;
  if (base.origin !== pageOrigin) {
    throw new Error("题库资源必须与应用同源。");
  }

  return {
    async readText(path) {
      const resourceUrl = new URL(path, base);
      if (resourceUrl.origin !== pageOrigin) {
        throw new Error("题库资源必须与应用同源。");
      }
      const response = await fetch(resourceUrl, {
        credentials: "same-origin",
      });
      if (!response.ok) {
        throw new Error(`无法读取题库资源 ${path}（${response.status}）。`);
      }
      return response.text();
    },
  };
}
