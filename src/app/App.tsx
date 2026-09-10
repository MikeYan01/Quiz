import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type {
  ChallengeQuestion,
  PrepareChallenge,
  PreparedChallenge,
} from "../challenge/types";
import {
  feedbackDurationMs,
  formatRemainingTime,
  maximumScoreWindowMs,
  questionDurationMs,
  questionsPerChallenge,
  scoreCorrectAnswer,
} from "../challenge/policy";
import "./App.css";

interface AppProps {
  prepareChallenge: PrepareChallenge;
  copyText?: (text: string) => Promise<void>;
}

interface Feedback {
  questionScore: number;
  outcome: "correct" | "incorrect" | "timeout";
  selectedOptionId: string | null;
}

type ChallengeResult = Feedback;

interface ReviewCopyState {
  questionId: string;
  status: "copied" | "error";
  message: string;
}

function outcomeLabel(outcome: Feedback["outcome"]) {
  if (outcome === "correct") {
    return "回答正确";
  }
  if (outcome === "incorrect") {
    return "回答错误";
  }
  return "超时";
}

function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path d="M24 5 43 24 24 43 5 24Z" />
      <path d="m24 14 10 10-10 10-10-10Z" />
      <path d="M24 5v9m19 10h-9M24 43v-9M5 24h9" />
      <circle cx="24" cy="24" r="2" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg className="arrow-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12h14m-6-6 6 6-6 6" />
    </svg>
  );
}

interface ChallengeHeaderProps {
  question: ChallengeQuestion;
  questionIndex: number;
  status: ReactNode;
}

function ChallengeHeader({
  question,
  questionIndex,
  status,
}: ChallengeHeaderProps) {
  return (
    <header className="challenge-header">
      <span className="category-badge">{question.categoryLabel}</span>
      <span className="question-position">
        第 {questionIndex + 1} / {questionsPerChallenge} 题
      </span>
      {status}
      <div className="challenge-progress" aria-hidden="true">
        {Array.from({ length: questionsPerChallenge }, (_, index) => (
          <span
            key={index}
            className={
              index < questionIndex
                ? "progress-complete"
                : index === questionIndex
                  ? "progress-current"
                  : undefined
            }
          />
        ))}
      </div>
    </header>
  );
}

interface QuestionCardProps {
  question: ChallengeQuestion;
  feedback: Feedback | null;
  onSelect: ((optionId: string) => void) | null;
  children?: ReactNode;
}

function QuestionCard({
  question,
  feedback,
  onSelect,
  children,
}: QuestionCardProps) {
  return (
    <section className="card question-card" aria-live={feedback ? "polite" : "off"}>
      <h1>{question.prompt}</h1>
      <div className="options" aria-label="选项">
        {question.options.map((option, index) => {
          const isCorrect =
            feedback !== null &&
            option.optionId === question.correctOptionId;
          const isIncorrectSelection =
            feedback?.outcome === "incorrect" &&
            option.optionId === feedback.selectedOptionId;
          const marker = isCorrect ? "✓" : isIncorrectSelection ? "✕" : null;
          const feedbackClass = isCorrect
            ? " option-correct"
            : isIncorrectSelection
              ? " option-incorrect"
              : "";
          return (
            <button
              className={`option-button${feedbackClass}`}
              key={option.optionId}
              type="button"
              disabled={feedback !== null || onSelect === null}
              aria-label={marker ? `${option.text} ${marker}` : option.text}
              onClick={
                onSelect ? () => onSelect(option.optionId) : undefined
              }
            >
              <span className="option-letter" aria-hidden="true">
                {String.fromCharCode(65 + index)}
              </span>
              <span className="option-text">{option.text}</span>
              <span className="option-marker" aria-hidden="true">
                {marker}
              </span>
            </button>
          );
        })}
      </div>
      <div className="question-footer">{children}</div>
    </section>
  );
}

async function copyToClipboard(text: string) {
  if (!navigator.clipboard) {
    throw new Error("当前浏览器不支持自动复制。");
  }
  await navigator.clipboard.writeText(text);
}

export function App({
  prepareChallenge,
  copyText = copyToClipboard,
}: AppProps) {
  const [challenge, setChallenge] = useState<PreparedChallenge | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [reportingIssue, setReportingIssue] = useState(false);
  const [reportStatus, setReportStatus] = useState<string | null>(null);
  const [manualReport, setManualReport] = useState<string | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [remainingMs, setRemainingMs] = useState(questionDurationMs);
  const [totalScore, setTotalScore] = useState(0);
  const [challengeResults, setChallengeResults] = useState<ChallengeResult[]>(
    [],
  );
  const [reviewCopyState, setReviewCopyState] =
    useState<ReviewCopyState | null>(null);
  const segmentStartedAt = useRef(0);

  useLayoutEffect(() => {
    if (!challenge || feedback) {
      return;
    }
    if (questionIndex === challenge.questions.length) {
      return;
    }

    const question = challenge.questions[questionIndex];
    if (!question) {
      setError("挑战数据不完整。");
      setChallenge(null);
      return;
    }
    const currentQuestion = question;
    const correctOption = currentQuestion.options.find(
      (option) => option.optionId === question.correctOptionId,
    );
    if (!correctOption) {
      setError("题目缺少正确答案。");
      setChallenge(null);
      return;
    }
    segmentStartedAt.current = performance.now();

    const updateCountdown = () => {
      const elapsedMs = performance.now() - segmentStartedAt.current;
      setRemainingMs(Math.max(0, questionDurationMs - elapsedMs));
    };
    const interval = window.setInterval(updateCountdown, 50);
    const timeout = window.setTimeout(() => {
      const result: ChallengeResult = {
        questionScore: 0,
        outcome: "timeout",
        selectedOptionId: null,
      };
      setRemainingMs(0);
      setChallengeResults((current) => [...current, result]);
      setFeedback(result);
    }, questionDurationMs);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [challenge, feedback, questionIndex]);

  useEffect(() => {
    if (!challenge || !feedback || reportingIssue) {
      return;
    }

    const timer = window.setTimeout(() => {
      setRemainingMs(questionDurationMs);
      setQuestionIndex((current) => current + 1);
      setFeedback(null);
    }, feedbackDurationMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [challenge, feedback, reportingIssue]);

  async function startChallenge() {
    setLoading(true);
    setError(null);
    setChallenge(null);

    try {
      const prepared = await prepareChallenge();
      if (prepared.questions.length !== questionsPerChallenge) {
        throw new Error("完整挑战局必须包含十道题。");
      }
      setQuestionIndex(0);
      setTotalScore(0);
      setChallengeResults([]);
      setReviewCopyState(null);
      setFeedback(null);
      setReportingIssue(false);
      setReportStatus(null);
      setManualReport(null);
      setRemainingMs(questionDurationMs);
      setChallenge(prepared);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "挑战加载失败。");
    } finally {
      setLoading(false);
    }
  }

  if (challenge) {
    const currentChallenge = challenge;
    if (questionIndex === currentChallenge.questions.length) {
      async function copyReviewPrompt(question: ChallengeQuestion) {
        try {
          await copyText(question.prompt);
          setReviewCopyState({
            questionId: question.questionId,
            status: "copied",
            message: "题干已复制",
          });
        } catch (cause) {
          setReviewCopyState({
            questionId: question.questionId,
            status: "error",
            message:
              cause instanceof Error ? cause.message : "题干复制失败。",
          });
        }
      }

      return (
        <main className="app-shell results-shell">
          <div className="card result-card">
            <div className="result-summary">
              <BrandMark />
              <p className="final-score">
                <span>挑战得分：</span>
                <strong>{totalScore}</strong>
              </p>
            </div>
            <button
              className="primary-button"
              type="button"
              disabled={loading}
              onClick={startChallenge}
            >
              {loading ? "正在准备..." : "再来一局"}
              <ArrowIcon />
            </button>
          </div>
          <section className="challenge-review">
            <div className="review-heading">
              <h1>挑战复盘</h1>
              <span aria-hidden="true">回顾 · 再发现</span>
            </div>
            <div className="challenge-review-list">
              {currentChallenge.questions.map((reviewQuestion, index) => {
                const result = challengeResults[index];
                const correctOption = reviewQuestion.options.find(
                  ({ optionId }) =>
                    optionId === reviewQuestion.correctOptionId,
                );
                const selectedOption = reviewQuestion.options.find(
                  ({ optionId }) =>
                    optionId === result?.selectedOptionId,
                );
                return (
                  <article
                    className="card review-item"
                    key={reviewQuestion.questionId}
                  >
                    <div className="review-item-header">
                      <span className="category-badge">
                        {reviewQuestion.categoryLabel}
                      </span>
                      <div className="review-item-actions">
                        <strong
                          className={
                            result?.outcome === "correct"
                              ? "review-correct"
                              : "review-incorrect"
                          }
                        >
                          {result ? outcomeLabel(result.outcome) : "结果缺失"}
                        </strong>
                        <button
                          className="review-copy-button"
                          type="button"
                          onClick={() => copyReviewPrompt(reviewQuestion)}
                        >
                          {reviewCopyState?.questionId ===
                            reviewQuestion.questionId &&
                          reviewCopyState.status === "copied"
                            ? "已复制"
                            : "复制"}
                        </button>
                      </div>
                    </div>
                    <h2>
                      {index + 1}. {reviewQuestion.prompt}
                    </h2>
                    <p>
                      你的答案：
                      {result?.outcome === "timeout"
                        ? "未作答"
                        : (selectedOption?.text ?? "未记录")}
                    </p>
                    <p>正确答案：{correctOption?.text ?? "缺失"}</p>
                    {reviewCopyState?.questionId ===
                      reviewQuestion.questionId &&
                    reviewCopyState.status === "error" ? (
                      <p className="review-copy-error" role="alert">
                        {reviewCopyState.message}
                      </p>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>
        </main>
      );
    }

    const question = challenge.questions[questionIndex];
    if (!question) {
      return <p role="alert">挑战数据不完整。</p>;
    }
    const currentQuestion = question;

    async function reportIssue() {
      const correctOption = currentQuestion.options.find(
        ({ optionId }) => optionId === currentQuestion.correctOptionId,
      );
      const report = [
        `题库版本：${currentChallenge.bankVersion}`,
        `题目标识：${currentQuestion.questionId}`,
        `题干：${currentQuestion.prompt}`,
        "选项：",
        ...currentQuestion.options.map(
          (option, index) => `${index + 1}. ${option.text}`,
        ),
        `正确答案：${correctOption?.text ?? "缺失"}`,
      ].join("\n");

      setReportingIssue(true);
      setManualReport(null);
      try {
        await copyText(report);
        setReportStatus("问题信息已复制");
      } catch (cause) {
        setReportStatus(
          cause instanceof Error ? cause.message : "问题信息复制失败。",
        );
        setManualReport(report);
      }
    }

    if (feedback) {
      return (
        <main className="app-shell play-shell">
          <ChallengeHeader
            question={currentQuestion}
            questionIndex={questionIndex}
            status={
              <span className="timer timer-idle" aria-hidden="true">—</span>
            }
          />
          <QuestionCard
            key={currentQuestion.questionId}
            question={currentQuestion}
            feedback={feedback}
            onSelect={null}
          >
            <div className="feedback-toolbar">
              <div className="score-row">
                <p>本题得分：{feedback.questionScore}</p>
                <p>累计得分：{totalScore}</p>
              </div>
              {!reportingIssue ? (
                <button
                  className="text-button"
                  type="button"
                  onClick={reportIssue}
                >
                  发现问题
                </button>
              ) : null}
            </div>
            {reportingIssue ? (
              <div className="report-panel">
                {reportStatus ? <p role="status">{reportStatus}</p> : null}
                {manualReport ? (
                  <textarea
                    aria-label="问题信息"
                    readOnly
                    value={manualReport}
                  />
                ) : null}
                <button
                  className="compact-button"
                  type="button"
                  onClick={() => {
                    setReportingIssue(false);
                    setReportStatus(null);
                    setManualReport(null);
                  }}
                >
                  继续挑战
                </button>
              </div>
            ) : null}
          </QuestionCard>
        </main>
      );
    }

    function submitAnswer(optionId: string) {
      const correctOption = currentQuestion.options.find(
        (option) => option.optionId === currentQuestion.correctOptionId,
      );
      if (!correctOption) {
        setError("题目缺少正确答案。");
        return;
      }

      const currentRemainingMs = Math.max(
        0,
        questionDurationMs -
          (performance.now() - segmentStartedAt.current),
      );
      const elapsedMs = questionDurationMs - currentRemainingMs;
      const timedOut = elapsedMs >= questionDurationMs;
      const correct = optionId === currentQuestion.correctOptionId;
      const questionScore =
        correct && !timedOut ? scoreCorrectAnswer(elapsedMs) : 0;
      const result: ChallengeResult = {
        questionScore,
        outcome: timedOut ? "timeout" : correct ? "correct" : "incorrect",
        selectedOptionId: timedOut ? null : optionId,
      };

      setTotalScore((current) => current + questionScore);
      setChallengeResults((current) => [...current, result]);
      setFeedback(result);
    }

    return (
      <main className="app-shell play-shell">
        <ChallengeHeader
          question={question}
          questionIndex={questionIndex}
          status={
            <span
              className={
                remainingMs <= maximumScoreWindowMs
                  ? "timer timer-warning"
                  : "timer"
              }
              aria-label="剩余时间"
            >
              {formatRemainingTime(remainingMs)}
            </span>
          }
        />
        <QuestionCard
          key={question.questionId}
          question={question}
          feedback={null}
          onSelect={submitAnswer}
        />
      </main>
    );
  }

  return (
    <main className="app-shell centered-panel">
      <div className="brand-emblem">
        <BrandMark />
      </div>
      <h1 className="brand-title">知识挑战</h1>
      <button
        className="primary-button"
        type="button"
        disabled={loading}
        aria-busy={loading}
        onClick={startChallenge}
      >
        {loading ? "正在准备..." : "开始挑战"}
        {loading ? (
          <span className="loading-spinner" aria-hidden="true" />
        ) : (
          <ArrowIcon />
        )}
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </main>
  );
}
