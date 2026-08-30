import { z } from "zod";

import { mainCategoryIds } from "../domain/categories";

const identifierSchema = z.string().trim().min(1).max(160);
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const dateSchema = z.iso.date();
const htmlTag = /<\/?[a-z][^>]*>/iu;

function plainText(maximumLength: number) {
  return z
    .string()
    .trim()
    .min(1)
    .max(maximumLength)
    .refine((value) => !htmlTag.test(value), {
      message: "题目内容不能包含 HTML 标签。",
    });
}

const mainCategoryIdSchema = z.enum(mainCategoryIds);

const challengeOptionSchema = z.object({
  optionId: identifierSchema,
  text: plainText(60),
});

export const browserQuestionSchema = z
  .object({
    questionId: identifierSchema,
    prompt: plainText(160),
    categoryId: mainCategoryIdSchema,
    tagIds: z.array(identifierSchema).min(2).max(5),
    options: z.array(challengeOptionSchema).length(4),
    correctOptionId: identifierSchema,
  })
  .superRefine((question, context) => {
    const optionIds = question.options.map(({ optionId }) => optionId);
    if (new Set(optionIds).size !== optionIds.length) {
      context.addIssue({
        code: "custom",
        message: "选项标识必须唯一。",
        path: ["options"],
      });
    }
    if (!optionIds.includes(question.correctOptionId)) {
      context.addIssue({
        code: "custom",
        message: "正确选项标识必须指向四个选项之一。",
        path: ["correctOptionId"],
      });
    }
  });

export const questionShardSchema = z.object({
  schemaVersion: z.literal(1),
  bankVersion: identifierSchema,
  categoryId: mainCategoryIdSchema,
  questions: z.array(browserQuestionSchema).min(1),
});

export const questionBankManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    bankVersion: identifierSchema,
    knowledgeCutoff: dateSchema,
    categories: z.array(
      z
        .object({
          categoryId: mainCategoryIdSchema,
          categoryLabel: z.string().trim().min(1).max(40),
          questionCount: z.number().int().positive(),
          shards: z
            .array(
              z.object({
                path: z.string().trim().min(1),
                questionCount: z.number().int().positive(),
                sha256: sha256Schema,
              }),
            )
            .min(1),
        })
        .superRefine((category, context) => {
          const shardTotal = category.shards.reduce(
            (total, shard) => total + shard.questionCount,
            0,
          );
          if (shardTotal !== category.questionCount) {
            context.addIssue({
              code: "custom",
              message: "主类别的题目总数必须等于分片题目总数。",
              path: ["questionCount"],
            });
          }
        }),
    ),
  })
  .superRefine((manifest, context) => {
    const categoryIds = manifest.categories.map(
      ({ categoryId }) => categoryId,
    );
    if (
      categoryIds.length !== mainCategoryIds.length ||
      new Set(categoryIds).size !== mainCategoryIds.length ||
      mainCategoryIds.some((categoryId) => !categoryIds.includes(categoryId))
    ) {
      context.addIssue({
        code: "custom",
        message: "题库清单必须恰好包含十个主类别。",
        path: ["categories"],
      });
    }
  });

export type BrowserQuestion = z.infer<typeof browserQuestionSchema>;
export type QuestionBankManifest = z.infer<
  typeof questionBankManifestSchema
>;
