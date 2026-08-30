import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  questionBankManifestSchema,
  questionShardSchema,
  type BrowserQuestion,
} from "../../src/data/schema";

function checksum(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

export async function loadQuestionBank(
  directory: string,
): Promise<BrowserQuestion[]> {
  const manifest = questionBankManifestSchema.parse(
    JSON.parse(
      await readFile(join(directory, "manifest.json"), "utf8"),
    ) as unknown,
  );
  const questions: BrowserQuestion[] = [];
  for (const category of manifest.categories) {
    for (const shardEntry of category.shards) {
      const content = await readFile(
        join(directory, shardEntry.path),
        "utf8",
      );
      if (checksum(content) !== shardEntry.sha256) {
        throw new Error(`题库分片 ${shardEntry.path} 校验值不匹配。`);
      }
      const shard = questionShardSchema.parse(
        JSON.parse(content) as unknown,
      );
      if (
        shard.bankVersion !== manifest.bankVersion ||
        shard.categoryId !== category.categoryId ||
        shard.questions.length !== shardEntry.questionCount
      ) {
        throw new Error(`题库分片 ${shardEntry.path} 与清单不一致。`);
      }
      questions.push(...shard.questions);
    }
  }
  return questions;
}
