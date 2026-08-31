import { expect, test, type Page } from "@playwright/test";

import { loadQuestionBank } from "../tools/publishing/loadQuestionBank";

let answersByPrompt: Map<string, string>;

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test.beforeAll(async () => {
  const questions = await loadQuestionBank(
    "public/data/knowledge-35000-v2",
  );
  answersByPrompt = new Map(
    questions.map((question) => {
      const correctOption = question.options.find(
        ({ optionId }) => optionId === question.correctOptionId,
      );
      if (!correctOption) {
        throw new Error(`Missing correct option for ${question.questionId}.`);
      }
      return [question.prompt, correctOption.text];
    }),
  );
});

async function startChallenge(page: Page) {
  await page.goto("./");
  const startButton = page.getByRole("button", { name: "开始挑战" });
  await expect(page.getByRole("heading", { name: "知识挑战" })).toBeVisible();
  await expect(startButton).toBeEnabled();
  const shellReadyMs = await page.evaluate(() => performance.now());
  expect(shellReadyMs).toBeLessThan(2_000);

  const challengeReadyMs = await page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const button = Array.from(document.querySelectorAll("button")).find(
          (element) => element.textContent?.trim() === "开始挑战",
        );
        if (!button) {
          reject(new Error("Missing start button."));
          return;
        }
        const startedAt = performance.now();
        const observer = new MutationObserver(() => {
          if (document.querySelector(".question-card h1")) {
            observer.disconnect();
            resolve(performance.now() - startedAt);
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        button.click();
      }),
  );
  await expect(page.locator(".question-card h1")).toBeVisible();
  expect(challengeReadyMs).toBeLessThan(1_000);
}

test("completes a ten-category challenge and prints the challenge review", async ({
  page,
}) => {
  await startChallenge(page);
  const seenCategories = new Set<string>();

  for (let index = 0; index < 10; index += 1) {
    const category = (await page.locator(".category-badge").innerText()).trim();
    const prompt = (await page.locator(".question-card h1").innerText()).trim();
    const answer = answersByPrompt.get(prompt);
    if (!answer) {
      throw new Error(`Missing bank answer for category: ${category}`);
    }
    seenCategories.add(category);

    const answerButton = page.getByRole("button", {
      name: answer,
      exact: true,
    });
    await expect(answerButton).toBeEnabled();
    await answerButton.click();
    await expect(page.locator(".option-correct")).toContainText("✓");

    if (index < 9) {
      await expect(page.getByText(`第 ${index + 2} / 10 题`)).toBeVisible({
        timeout: 4_000,
      });
    }
  }

  await expect(page.getByText("挑战得分：100")).toBeVisible({
    timeout: 4_000,
  });
  await expect(page.getByRole("heading", { name: "挑战复盘" })).toBeVisible();
  await expect(page.locator("article.review-item")).toHaveCount(10);
  await expect(page.locator(".question-id")).toHaveCount(0);
  const finalScoreFontSize = await page
    .locator(".final-score")
    .evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(finalScoreFontSize).toBeLessThanOrEqual(64);
  expect(seenCategories.size).toBe(10);
});

test("marks a wrong choice and the correct choice before advancing", async ({
  page,
}) => {
  await startChallenge(page);
  const optionBoxes = await page.locator(".option-button").evaluateAll(
    (options) =>
      options.map((option) => {
        const box = option.getBoundingClientRect();
        return { x: box.x, y: box.y };
      }),
  );
  expect(new Set(optionBoxes.map(({ x }) => Math.round(x))).size).toBe(1);
  for (let index = 1; index < optionBoxes.length; index += 1) {
    expect(optionBoxes[index]?.y).toBeGreaterThan(
      optionBoxes[index - 1]?.y ?? Number.POSITIVE_INFINITY,
    );
  }

  const category = (await page.locator(".category-badge").innerText()).trim();
  const prompt = (await page.locator(".question-card h1").innerText()).trim();
  const correctAnswer = answersByPrompt.get(prompt);
  if (!correctAnswer) {
    throw new Error(`Missing bank answer for category: ${category}`);
  }
  const optionTexts = await page.locator(".option-button").allTextContents();
  const wrongAnswer = optionTexts.find(
    (text) => text.trim() !== correctAnswer,
  );
  if (!wrongAnswer) {
    throw new Error(`Missing wrong option for category: ${category}`);
  }

  const wrongAnswerButton = page.getByRole("button", {
    name: wrongAnswer.trim(),
    exact: true,
  });
  await expect(wrongAnswerButton).toBeEnabled();
  await wrongAnswerButton.click();

  await expect(page.locator(".option-incorrect")).toContainText("✕");
  await expect(page.locator(".option-correct")).toContainText("✓");
  await expect(page.locator(".option-incorrect")).toHaveCSS(
    "background-color",
    "rgb(253, 229, 229)",
  );
  await page.getByRole("button", { name: "发现问题" }).click();
  await expect(page.getByRole("status")).toBeVisible();
  const manualReport = page.getByLabel("问题信息");
  if ((await manualReport.count()) > 0) {
    await expect(manualReport).toBeVisible();
  }
});

test("does not apply hover styling on a touch-only device", async (
  { page },
  testInfo,
) => {
  test.skip(testInfo.project.name !== "mobile-safari");
  await startChallenge(page);

  const option = page.locator(".option-button").first();
  const styles = () =>
    option.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        backgroundColor: style.backgroundColor,
        borderColor: style.borderColor,
        transform: style.transform,
      };
    });
  const restingStyles = await styles();

  await option.hover();

  expect(await styles()).toEqual(restingStyles);
});
