import { createHash } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mainCategories, mainCategoryIds } from "../domain/categories";
import {
  createHttpQuestionBankSource,
  createStaticChallengePreparer,
} from "./staticQuestionBank";
import type { questionShardSchema } from "./schema";

type QuestionShard = ReturnType<typeof questionShardSchema.parse>;

function createQuestionBankSource(
  transformShard: (shard: QuestionShard) => unknown = (shard) => shard,
) {
  const bankVersion = "test-bank";
  const shardContents = new Map<string, string>();
  const categories = mainCategories.map(
    ({ categoryId, categoryLabel }, categoryIndex) => {
      const questionId = `question-${categoryIndex}`;
      const path = `${categoryId}.json`;
      const shard: QuestionShard = {
        schemaVersion: 1,
        bankVersion,
        categoryId,
        questions: [
          {
            questionId,
            prompt: `题目 ${categoryIndex}`,
            categoryId,
            tagIds: ["subfield:test", "object:concept"],
            options: ["a", "b", "c", "d"].map((suffix) => ({
              optionId: `${questionId}-${suffix}`,
              text: `选项 ${suffix}`,
            })),
            correctOptionId: `${questionId}-a`,
          },
        ],
      };
      const content = JSON.stringify(transformShard(shard));
      shardContents.set(path, content);
      return {
        categoryId,
        categoryLabel,
        questionCount: 1,
        shards: [
          {
            path,
            questionCount: 1,
            sha256: createHash("sha256").update(content).digest("hex"),
          },
        ],
      };
    },
  );
  const manifest = {
    schemaVersion: 1,
    bankVersion,
    knowledgeCutoff: "2023-01-01",
    categories,
  };
  const readText = vi.fn(async (path: string) => {
    if (path === "manifest.json") return JSON.stringify(manifest);
    const content = shardContents.get(path);
    if (!content) throw new Error(`Missing ${path}`);
    return content;
  });

  return { readText, manifest };
}

describe("question bank contracts", () => {
  beforeEach(() => {
    vi.stubGlobal("requestIdleCallback", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("preloads and caches the first challenge while the page is idle", async () => {
    const source = createQuestionBankSource();
    let idleCallback: IdleRequestCallback | undefined;
    vi.stubGlobal(
      "requestIdleCallback",
      vi.fn((callback: IdleRequestCallback) => {
        idleCallback = callback;
        return 1;
      }),
    );

    const prepareChallenge = createStaticChallengePreparer({
      source,
      manifestPath: "manifest.json",
      randomInteger: () => 0,
    });

    expect(source.readText).toHaveBeenCalledOnce();
    expect(source.readText).toHaveBeenCalledWith("manifest.json");
    expect(idleCallback).toBeDefined();

    idleCallback?.({
      didTimeout: false,
      timeRemaining: () => 50,
    });
    await vi.waitFor(() => {
      expect(source.readText).toHaveBeenCalledTimes(11);
    });

    const firstChallenge = await prepareChallenge();
    expect(firstChallenge.questions).toHaveLength(10);
    expect(
      firstChallenge.questions.map(({ categoryId }) => categoryId).sort(),
    ).toEqual([...mainCategoryIds].sort());
    expect(
      new Set(firstChallenge.questions.map(({ questionId }) => questionId)).size,
    ).toBe(10);
    for (const question of firstChallenge.questions) {
      expect(question.options[3]?.optionId).toBe(question.correctOptionId);
    }
    expect(source.readText).toHaveBeenCalledTimes(11);

    await prepareChallenge();
    expect(
      source.readText.mock.calls.filter(([path]) => path === "manifest.json"),
    ).toHaveLength(1);
  });

  it("rejects question-bank resources outside the page origin", async () => {
    expect(() =>
      createHttpQuestionBankSource("https://third-party.example/data/"),
    ).toThrow("同源");

    const source = createHttpQuestionBankSource(document.baseURI);
    await expect(
      source.readText("https://third-party.example/shard.json"),
    ).rejects.toThrow("同源");
  });

  it.each<{
    name: string;
    transformShard: (shard: QuestionShard) => unknown;
    error: string;
  }>([
    {
      name: "HTML markup in question content",
      transformShard: (shard) => ({
        ...shard,
        questions: shard.questions.map((question) => ({
          ...question,
          prompt: "<b>木星</b>是哪类天体？",
        })),
      }),
      error: "HTML",
    },
    {
      name: "unknown question fields",
      transformShard: (shard) => ({
        ...shard,
        questions: shard.questions.map((question) => ({
          ...question,
          explanation: "This field is not part of the published format.",
        })),
      }),
      error: "Unrecognized key",
    },
    {
      name: "unknown option fields",
      transformShard: (shard) => ({
        ...shard,
        questions: shard.questions.map((question) => ({
          ...question,
          options: question.options.map((option) => ({
            ...option,
            explanation: "This field is not part of the published format.",
          })),
        })),
      }),
      error: "Unrecognized key",
    },
    {
      name: "a shard from another bank version",
      transformShard: (shard) => ({ ...shard, bankVersion: "other-bank" }),
      error: "与清单不一致",
    },
    {
      name: "a shard assigned to another category",
      transformShard: (shard) => ({ ...shard, categoryId: "history" }),
      error: "与清单不一致",
    },
    {
      name: "a shard with an incorrect question count",
      transformShard: (shard) => ({
        ...shard,
        questions: [...shard.questions, ...shard.questions],
      }),
      error: "与清单不一致",
    },
  ])("rejects $name", async ({ transformShard, error }) => {
    const prepareChallenge = createStaticChallengePreparer({
      source: createQuestionBankSource(transformShard),
      manifestPath: "manifest.json",
      randomInteger: () => 0,
    });

    await expect(prepareChallenge()).rejects.toThrow(error);
  });

  it("rejects a shard whose content does not match its checksum", async () => {
    const source = createQuestionBankSource();
    for (const category of source.manifest.categories) {
      for (const shard of category.shards) {
        shard.sha256 = "0".repeat(64);
      }
    }
    const prepareChallenge = createStaticChallengePreparer({
      source,
      manifestPath: "manifest.json",
    });

    await expect(prepareChallenge()).rejects.toThrow("校验值不匹配");
  });

  it("retries a failed manifest request", async () => {
    const source = createQuestionBankSource();
    source.readText.mockRejectedValueOnce(new Error("Manifest unavailable."));
    const prepareChallenge = createStaticChallengePreparer({
      source,
      manifestPath: "manifest.json",
    });

    await expect(prepareChallenge()).rejects.toThrow("Manifest unavailable.");
    const challenge = await prepareChallenge();
    expect(challenge.questions).toHaveLength(10);
    expect(
      source.readText.mock.calls.filter(([path]) => path === "manifest.json"),
    ).toHaveLength(2);
  });

  it("retries a failed shard request without reloading the manifest", async () => {
    const source = createQuestionBankSource();
    let failNextShard = true;
    const readText = vi.fn(async (path: string) => {
      if (path !== "manifest.json" && failNextShard) {
        failNextShard = false;
        throw new Error("Shard unavailable.");
      }
      return source.readText(path);
    });
    const prepareChallenge = createStaticChallengePreparer({
      source: { readText },
      manifestPath: "manifest.json",
    });

    await expect(prepareChallenge()).rejects.toThrow("Shard unavailable.");
    const challenge = await prepareChallenge();
    expect(challenge.questions).toHaveLength(10);
    expect(
      readText.mock.calls.filter(([path]) => path === "manifest.json"),
    ).toHaveLength(1);
  });
});
