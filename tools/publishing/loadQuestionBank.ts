import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  questionBankManifestSchema,
  type BrowserQuestion,
} from "../../src/data/schema";
import { parseQuestionShard } from "../../src/data/staticQuestionBank";

export function createFileQuestionBankSource(directory: string) {
  return {
    readText: (path: string) => readFile(join(directory, path), "utf8"),
  };
}

export async function loadQuestionBank(
  directory: string,
): Promise<BrowserQuestion[]> {
  const source = createFileQuestionBankSource(directory);
  const manifest = questionBankManifestSchema.parse(
    JSON.parse(await source.readText("manifest.json")) as unknown,
  );
  const questions: BrowserQuestion[] = [];
  for (const category of manifest.categories) {
    for (const shardEntry of category.shards) {
      const shard = await parseQuestionShard(
        await source.readText(shardEntry.path),
        manifest.bankVersion,
        category.categoryId,
        shardEntry,
      );
      questions.push(...shard.questions);
    }
  }
  return questions;
}
