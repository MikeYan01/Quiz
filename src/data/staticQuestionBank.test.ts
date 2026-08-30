import { createHash } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { loadQuestionBank } from "../../tools/publishing/loadQuestionBank";
import { mainCategories } from "../domain/categories";
import {
  createHttpQuestionBankSource,
  createStaticChallengePreparer,
} from "./staticQuestionBank";
import { browserQuestionSchema } from "./schema";

function createQuestionBankSource() {
  const bankVersion = "test-bank";
  const shardContents = new Map<string, string>();
  const categories = mainCategories.map(
    ({ categoryId, categoryLabel }, categoryIndex) => {
      const questionId = `question-${categoryIndex}`;
      const path = `${categoryId}.json`;
      const content = JSON.stringify({
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
      });
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
  const manifestContent = JSON.stringify({
    schemaVersion: 1,
    bankVersion,
    knowledgeCutoff: "2023-01-01",
    categories,
  });
  const readText = vi.fn(async (path: string) => {
    if (path === "manifest.json") return manifestContent;
    const content = shardContents.get(path);
    if (!content) throw new Error(`Missing ${path}`);
    return content;
  });

  return { readText };
}

describe("question bank contracts", () => {
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

  it("rejects HTML markup in otherwise plain question content", async () => {
    const [question] = await loadQuestionBank(
      "public/data/knowledge-35000-v1",
    );
    if (!question) {
      throw new Error("The question bank is empty.");
    }

    const result = browserQuestionSchema.safeParse({
      ...question,
      prompt: "<b>木星</b>是哪类天体？",
    });

    expect(result.success).toBe(false);
  });
});
