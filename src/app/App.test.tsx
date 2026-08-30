import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { PreparedChallenge } from "../challenge/types";
import { mainCategories } from "../domain/categories";
import { loadQuestionBank } from "../../tools/publishing/loadQuestionBank";
import { App } from "./App";

let sourceChallenge: PreparedChallenge;

beforeAll(async () => {
  const questions = await loadQuestionBank(
    "public/data/knowledge-35000-v1",
  );
  sourceChallenge = {
    bankVersion: "knowledge-35000-v1",
    questions: mainCategories.map((category) => {
      const question = questions.find(
        ({ categoryId }) => categoryId === category.categoryId,
      );
      if (!question) {
        throw new Error(`Missing ${category.categoryId} question.`);
      }
      return {
        ...question,
        categoryLabel: category.categoryLabel,
      };
    }),
  };
});

function preparedChallenge(): PreparedChallenge {
  return structuredClone(sourceChallenge);
}

function questionAt(index: number) {
  const question = sourceChallenge.questions[index];
  if (!question) {
    throw new Error(`Missing challenge question ${index}.`);
  }
  return question;
}

function correctAnswerAt(index: number) {
  const question = questionAt(index);
  const option = question.options.find(
    ({ optionId }) => optionId === question.correctOptionId,
  );
  if (!option) {
    throw new Error(`Missing correct option for ${question.questionId}.`);
  }
  return option;
}

function wrongAnswerAt(index: number) {
  const question = questionAt(index);
  const option = question.options.find(
    ({ optionId }) => optionId !== question.correctOptionId,
  );
  if (!option) {
    throw new Error(`Missing wrong option for ${question.questionId}.`);
  }
  return option;
}

describe("knowledge challenge", () => {
  it("starts only after a complete challenge is prepared", async () => {
    const user = userEvent.setup();
    const prepareChallenge = vi.fn().mockResolvedValue(preparedChallenge());

    render(<App prepareChallenge={prepareChallenge} />);

    expect(screen.getByRole("heading", { name: "知识挑战" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "开始挑战" }));

    expect(prepareChallenge).toHaveBeenCalledOnce();
    expect(await screen.findByText(questionAt(0).prompt)).toBeVisible();
    expect(screen.getByText("第 1 / 10 题")).toBeVisible();
  });

  it("locks an answer and shows its score immediately", async () => {
    const user = userEvent.setup();

    render(<App prepareChallenge={async () => preparedChallenge()} />);
    await user.click(screen.getByRole("button", { name: "开始挑战" }));

    expect(await screen.findByText("15.0")).toBeVisible();
    const correctAnswer = correctAnswerAt(0);
    const wrongAnswer = wrongAnswerAt(0);
    await user.click(
      screen.getByRole("button", { name: correctAnswer.text }),
    );

    expect(
      screen.queryByText(`正确答案：${correctAnswer.text}`),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("已提交")).not.toBeInTheDocument();
    expect(screen.getByText("本题得分：10")).toBeVisible();
    expect(screen.getByText("累计得分：10")).toBeVisible();
    expect(
      screen.getByRole("button", { name: `${correctAnswer.text} ✓` }),
    ).toHaveClass("option-correct");
    expect(
      screen.getByRole("button", { name: wrongAnswer.text }),
    ).toBeDisabled();
  });

  it("marks a wrong selection red and also reveals the correct option", async () => {
    const user = userEvent.setup();

    render(<App prepareChallenge={async () => preparedChallenge()} />);
    await user.click(screen.getByRole("button", { name: "开始挑战" }));
    const correctAnswer = correctAnswerAt(0);
    const wrongAnswer = wrongAnswerAt(0);
    const otherAnswer = questionAt(0).options.find(
      ({ optionId }) =>
        optionId !== correctAnswer.optionId &&
        optionId !== wrongAnswer.optionId,
    );
    if (!otherAnswer) {
      throw new Error("Missing second wrong answer.");
    }
    await user.click(
      await screen.findByRole("button", { name: wrongAnswer.text }),
    );

    expect(
      screen.getByRole("button", { name: `${wrongAnswer.text} ✕` }),
    ).toHaveClass("option-incorrect");
    expect(
      screen.getByRole("button", { name: `${correctAnswer.text} ✓` }),
    ).toHaveClass("option-correct");
    expect(
      screen.getByRole("button", { name: otherAnswer.text }),
    ).toBeDisabled();
  });

  it("scores elapsed time and advances after two seconds of feedback", async () => {
    vi.useFakeTimers();

    render(<App prepareChallenge={async () => preparedChallenge()} />);
    fireEvent.click(screen.getByRole("button", { name: "开始挑战" }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText(questionAt(0).prompt)).toBeVisible();

    act(() => {
      vi.advanceTimersByTime(5_001);
    });
    fireEvent.click(
      screen.getByRole("button", { name: correctAnswerAt(0).text }),
    );

    expect(screen.getByText("本题得分：9")).toBeVisible();
    act(() => {
      vi.advanceTimersByTime(1_999);
    });
    expect(
      screen.getByRole("button", {
        name: `${correctAnswerAt(0).text} ✓`,
      }),
    ).toBeVisible();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByText(questionAt(1).prompt)).toBeVisible();
    expect(screen.getByText("第 2 / 10 题")).toBeVisible();
  });

  it("updates the countdown and times out at fifteen seconds", async () => {
    vi.useFakeTimers();

    render(<App prepareChallenge={async () => preparedChallenge()} />);
    fireEvent.click(screen.getByRole("button", { name: "开始挑战" }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByLabelText("剩余时间")).toHaveTextContent("15.0");
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.getByLabelText("剩余时间")).toHaveTextContent("14.9");

    act(() => {
      vi.advanceTimersByTime(14_900);
    });
    expect(
      screen.getByRole("button", {
        name: `${correctAnswerAt(0).text} ✓`,
      }),
    ).toBeVisible();
    expect(screen.getByText("本题得分：0")).toBeVisible();
  });

  it("keeps the question timer running while the page is hidden", async () => {
    vi.useFakeTimers();
    let visibilityState: DocumentVisibilityState = "visible";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(
      () => visibilityState,
    );

    render(<App prepareChallenge={async () => preparedChallenge()} />);
    fireEvent.click(screen.getByRole("button", { name: "开始挑战" }));
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(screen.getByLabelText("剩余时间")).toHaveTextContent("14.0");

    visibilityState = "hidden";
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(screen.getByText(questionAt(0).prompt)).toBeVisible();
    expect(
      screen.queryByText("挑战已暂停"),
    ).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(14_000);
    });
    expect(
      screen.getByRole("button", {
        name: `${correctAnswerAt(0).text} ✓`,
      }),
    ).toBeVisible();
    expect(screen.getByText("本题得分：0")).toBeVisible();

    visibilityState = "visible";
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(
      screen.queryByText("挑战已暂停"),
    ).not.toBeInTheDocument();
  });

  it("starts a loaded challenge even if the page becomes hidden", async () => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    let resolveChallenge:
      | ((challenge: ReturnType<typeof preparedChallenge>) => void)
      | undefined;
    const pendingChallenge = new Promise<ReturnType<typeof preparedChallenge>>(
      (resolve) => {
        resolveChallenge = resolve;
      },
    );

    render(<App prepareChallenge={() => pendingChallenge} />);
    fireEvent.click(screen.getByRole("button", { name: "开始挑战" }));
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await act(async () => {
      resolveChallenge?.(preparedChallenge());
      await pendingChallenge;
    });

    expect(screen.getByText(questionAt(0).prompt)).toBeVisible();
    expect(screen.getByText("第 1 / 10 题")).toBeVisible();
  });

  it("copies issue details and pauses feedback until the player continues", async () => {
    vi.useFakeTimers();
    const copyText = vi.fn().mockResolvedValue(undefined);

    render(
      <App
        copyText={copyText}
        prepareChallenge={async () => preparedChallenge()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "开始挑战" }));
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.click(
      screen.getByRole("button", { name: wrongAnswerAt(0).text }),
    );
    fireEvent.click(screen.getByRole("button", { name: "发现问题" }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(copyText).toHaveBeenCalledWith(
      expect.stringContaining(`题目标识：${questionAt(0).questionId}`),
    );
    expect(copyText).toHaveBeenCalledWith(
      expect.stringContaining("题库版本：knowledge-35000-v1"),
    );
    expect(screen.getByText("问题信息已复制")).toBeVisible();
    expect(screen.getByRole("button", { name: "继续挑战" })).toHaveClass(
      "compact-button",
    );

    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(
      screen.getByRole("button", {
        name: `${correctAnswerAt(0).text} ✓`,
      }),
    ).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "继续挑战" }));
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(screen.getByText(questionAt(1).prompt)).toBeVisible();
  });

  it("shows the final score with a complete challenge review and can start again", async () => {
    vi.useFakeTimers();
    const prepareChallenge = vi.fn().mockResolvedValue(preparedChallenge());
    const copyText = vi.fn().mockResolvedValue(undefined);

    render(
      <App copyText={copyText} prepareChallenge={prepareChallenge} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "开始挑战" }));
    await act(async () => {
      await Promise.resolve();
    });

    for (let index = 0; index < 10; index += 1) {
      fireEvent.click(
        screen.getByRole("button", {
          name:
            index === 0
              ? wrongAnswerAt(index).text
              : correctAnswerAt(index).text,
        }),
      );
      act(() => {
        vi.advanceTimersByTime(2_000);
      });
    }

    expect(screen.getByText("挑战得分：90")).toBeVisible();
    expect(screen.getByRole("heading", { name: "挑战复盘" })).toBeVisible();
    const reviewedQuestions = screen.getAllByRole("article");
    expect(reviewedQuestions).toHaveLength(10);
    expect(reviewedQuestions[0]).toBeDefined();
    const firstQuestion = within(reviewedQuestions[0] as HTMLElement);
    expect(firstQuestion.getByText("回答错误")).toBeVisible();
    expect(
      firstQuestion.getByText(`你的答案：${wrongAnswerAt(0).text}`),
    ).toBeVisible();
    expect(
      firstQuestion.getByText(
        `正确答案：${correctAnswerAt(0).text}`,
      ),
    ).toBeVisible();
    expect(
      screen.getAllByRole("button", { name: "复制" }),
    ).toHaveLength(10);
    fireEvent.click(
      firstQuestion.getByRole("button", { name: "复制" }),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(copyText).toHaveBeenCalledWith(questionAt(0).prompt);
    expect(
      firstQuestion.getByRole("button", { name: "已复制" }),
    ).toBeVisible();
    expect(screen.queryByText("第 10 / 10 题")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "再来一局" }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText("第 1 / 10 题")).toBeVisible();
    expect(prepareChallenge).toHaveBeenCalledTimes(2);
  });

  it("shows a retry loading error instead of leaving it behind the result", async () => {
    vi.useFakeTimers();
    const prepareChallenge = vi
      .fn()
      .mockResolvedValueOnce(preparedChallenge())
      .mockRejectedValueOnce(new Error("新题库加载失败。"));

    render(<App prepareChallenge={prepareChallenge} />);
    fireEvent.click(screen.getByRole("button", { name: "开始挑战" }));
    await act(async () => {
      await Promise.resolve();
    });
    for (let index = 0; index < 10; index += 1) {
      fireEvent.click(
        screen.getByRole("button", {
          name: correctAnswerAt(index).text,
        }),
      );
      act(() => {
        vi.advanceTimersByTime(2_000);
      });
    }

    fireEvent.click(screen.getByRole("button", { name: "再来一局" }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole("alert")).toHaveTextContent("新题库加载失败。");
    expect(screen.getByRole("button", { name: "开始挑战" })).toBeVisible();
  });
});
