import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { questionBankManifestSchema } from "../../src/data/schema";
import { mainCategoryIds } from "../../src/domain/categories";
import { loadQuestionBank } from "./loadQuestionBank";

const bankDirectory = "public/data/knowledge-35000-v2";

describe("knowledge question bank", () => {
  it("is the single complete 35000-question source", async () => {
    const questions = await loadQuestionBank(bankDirectory);

    expect(questions).toHaveLength(35_000);
    expect(
      new Set(questions.map(({ questionId }) => questionId)).size,
    ).toBe(35_000);
    expect(new Set(questions.map(({ prompt }) => prompt)).size).toBe(35_000);
    for (const question of questions) {
      expect(Object.keys(question).sort()).toEqual(
        [
          "categoryId",
          "correctOptionId",
          "options",
          "prompt",
          "questionId",
          "tagIds",
        ].sort(),
      );
    }
    for (const categoryId of mainCategoryIds) {
      expect(
        questions.filter((question) => question.categoryId === categoryId),
      ).toHaveLength(3_500);
    }
    for (const removedQuestionId of [
      "question-567d03c67f261437",
      "q20k-ll-c-0115",
      "q50k-lh-b-0143",
    ]) {
      expect(
        questions.some(
          ({ questionId }) => questionId === removedQuestionId,
        ),
      ).toBe(false);
    }
  });

  it("keeps the worst-case first-round payload below 500 kB", async () => {
    const manifestContent = await readFile(
      join(bankDirectory, "manifest.json"),
      "utf8",
    );
    const manifest = questionBankManifestSchema.parse(
      JSON.parse(manifestContent) as unknown,
    );
    let worstCaseBytes = Buffer.byteLength(manifestContent);

    for (const category of manifest.categories) {
      for (const shard of category.shards) {
        expect(shard.questionCount).toBeLessThanOrEqual(50);
      }
      const shardSizes = await Promise.all(
        category.shards.map(async (shard) =>
          Buffer.byteLength(
            await readFile(join(bankDirectory, shard.path), "utf8"),
          ),
        ),
      );
      worstCaseBytes += Math.max(...shardSizes);
    }

    expect(worstCaseBytes).toBeLessThanOrEqual(500_000);
  });
});
