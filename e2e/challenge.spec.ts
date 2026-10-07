import { expect, test, type Page } from "@playwright/test";

import { loadQuestionBank } from "../tools/publishing/loadQuestionBank";

const questionsByPrompt = new Map<
  string,
  { questionId: string; answer: string }
>();

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test.beforeAll(async () => {
  if (questionsByPrompt.size > 0) return;

  const questions = await loadQuestionBank(
    "public/data/knowledge-35000-v3",
  );
  for (const question of questions) {
    const correctOption = question.options.find(
      ({ optionId }) => optionId === question.correctOptionId,
    );
    if (!correctOption) {
      throw new Error(`Missing correct option for ${question.questionId}.`);
    }
    questionsByPrompt.set(question.prompt, {
      questionId: question.questionId,
      answer: correctOption.text,
    });
  }
});

function bankQuestionFor(prompt: string) {
  const question = questionsByPrompt.get(prompt);
  if (!question) {
    throw new Error(`Missing bank question for ${prompt}.`);
  }
  return question;
}

async function expectUnframedOptionLetters(page: Page) {
  const letters = page.locator(".option-letter");
  await expect(letters).toHaveText(["A", "B", "C", "D"]);
  for (const letter of await letters.all()) {
    await expect(letter).toHaveCSS("border-top-width", "0px");
  }
}

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
  const seenQuestionIds: string[] = [];

  for (let index = 0; index < 10; index += 1) {
    const category = (await page.locator(".category-badge").innerText()).trim();
    const prompt = (await page.locator(".question-card h1").innerText()).trim();
    const { answer, questionId } = bankQuestionFor(prompt);
    seenCategories.add(category);
    seenQuestionIds.push(questionId);
    await expect(page.getByText(questionId)).toHaveCount(0);

    const answerButton = page.getByRole("button", {
      name: answer,
      exact: true,
    });
    await expect(answerButton).toBeEnabled();
    await answerButton.click();
    await expect(page.locator(".option-correct")).toContainText("✓");
    await expect(page.getByText(questionId)).toHaveCount(0);

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
  for (const questionId of seenQuestionIds) {
    await expect(page.getByText(questionId)).toHaveCount(0);
  }
  const finalScoreFontSize = await page
    .locator(".final-score strong")
    .evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(finalScoreFontSize).toBeLessThanOrEqual(64);
  expect(seenCategories.size).toBe(10);
  await expect(page.getByRole("button", { name: "再来一局" })).toBeInViewport();
  const centers = await page.locator(".result-summary").evaluate((summary) => {
    const icon = summary.querySelector(".brand-mark");
    const label = summary.querySelector(".final-score > span");
    const value = summary.querySelector(".final-score strong");
    if (!icon || !label || !value) {
      throw new Error("Missing result summary.");
    }
    return [icon, label, value].map((element) => {
      const box = element.getBoundingClientRect();
      return box.top + box.height / 2;
    });
  });
  expect(Math.max(...centers) - Math.min(...centers)).toBeLessThanOrEqual(1);
});

test("marks a wrong choice and the correct choice before advancing", async ({
  page,
}) => {
  await startChallenge(page);
  await expectUnframedOptionLetters(page);
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

  const prompt = (await page.locator(".question-card h1").innerText()).trim();
  const { answer: correctAnswer } = bankQuestionFor(prompt);
  const optionTexts = await page.locator(".option-text").allTextContents();
  const wrongAnswer = optionTexts.find(
    (text) => text.trim() !== correctAnswer,
  );
  if (!wrongAnswer) {
    throw new Error(`Missing wrong option for ${prompt}.`);
  }

  const wrongAnswerButton = page.getByRole("button", {
    name: wrongAnswer.trim(),
    exact: true,
  });
  await expect(wrongAnswerButton).toBeEnabled();
  await wrongAnswerButton.hover();
  await expectUnframedOptionLetters(page);
  await wrongAnswerButton.click();
  await expectUnframedOptionLetters(page);

  await expect(page.locator(".option-incorrect")).toContainText("✕");
  await expect(page.locator(".option-correct")).toContainText("✓");
  await expect(page.locator(".option-incorrect")).toHaveCSS(
    "background-color",
    "rgb(250, 234, 231)",
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

test("keeps answer feedback stable in light and dark themes", async ({
  page,
}) => {
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await page.goto("./");
    await page.getByRole("button", { name: "开始挑战" }).click();
    const card = page.locator(".question-card");
    await expect(card).toBeVisible();
    await expect(page.locator(".challenge-progress > span")).toHaveCount(10);
    await expect(page.locator(".progress-current")).toHaveCount(1);
    const before = await card.boundingBox();
    const firstOption = page.locator(".option-button").first();
    const optionBefore = await firstOption.boundingBox();

    const prompt = (await card.locator("h1").innerText()).trim();
    const { answer: correctAnswer } = bankQuestionFor(prompt);
    await page.getByRole("button", { name: correctAnswer, exact: true }).click();
    await expect(page.locator(".option-correct")).toBeVisible();
    expect(await card.boundingBox()).toEqual(before);
    expect(await firstOption.boundingBox()).toEqual(optionBefore);
    await expect(page.locator(".option-correct")).toHaveCSS(
      "background-color",
      colorScheme === "light" ? "rgb(232, 243, 233)" : "rgb(38, 63, 47)",
    );
    expect(await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    )).toBe(true);
  }
});

test("keeps timed options visible and stationary with motion enabled", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await startChallenge(page);
  const options = page.locator(".option-button");
  for (const option of await options.all()) {
    await expect(option).toHaveCSS("opacity", "1");
    await expect(option).toHaveCSS("transform", "none");
    await expect(option).toHaveCSS("animation-name", "none");
    await expect(option).toBeEnabled();
  }
  await expect(page.locator(".question-card h1")).toHaveCSS("opacity", "1");
  await expect(page.locator(".question-card h1")).toHaveCSS(
    "animation-name", "question-enter",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".question-card h1")).toHaveCSS(
    "animation-name", "none",
  );
  await expect(options.first()).toHaveCSS("transition-duration", "0s");
});

test("fits the minimum supported screen width", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await startChallenge(page);
  const boxes = await page.locator(".option-button").evaluateAll(
    (options) => options.map((option) => {
      const { left, right, height } = option.getBoundingClientRect();
      return { left, right, height };
    }),
  );
  for (const box of boxes) {
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(320);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  )).toBe(true);
});
