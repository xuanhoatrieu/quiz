import {
  MEDIA_TYPES,
  NO_TIME_LIMIT,
  QUESTION_TYPES,
  QUIZZ_MODES,
} from "@razzia/common/constants"
import {
  computeSurveyRanking,
  isEstimationOptions,
  isMultiOptions,
} from "@razzia/common/questions/options"
import type { QuestionMedia } from "@razzia/common/types/game"
import {
  ANSWERS_COLORS,
  ANSWERS_LABELS,
} from "@razzia/web/features/game/utils/constants"
import { useResultModal } from "@razzia/web/features/manager/contexts/result-modal-context"
import {
  resultKeys,
  synthesizeAiResultQuestion,
} from "@razzia/web/features/manager/queries"
import { formatValue } from "@razzia/web/features/questions/estimation/utils"
import { useQueryClient } from "@tanstack/react-query"
import clsx from "clsx"
import {
  Check,
  Clock,
  ImageOff,
  Loader2,
  Music,
  Sparkles,
  Trophy,
  Video,
  X,
} from "lucide-react"
import { useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

interface AnswerRow {
  label: string
  count: number
  aiMergedCount?: number
  isTopChoice?: boolean
  isCorrect: boolean
  color: string | null
  answerLabel: string | null
}

const MediaPreview = ({ media }: { media?: QuestionMedia }) => {
  if (media?.type === MEDIA_TYPES.IMAGE) {
    return (
      <img
        src={media.url}
        alt=""
        className="h-16 w-auto rounded-md object-contain md:h-full"
      />
    )
  }

  if (media?.type === MEDIA_TYPES.VIDEO) {
    return (
      <div className="bg-accent flex h-16 w-24 items-center justify-center rounded-lg md:h-38 md:w-full">
        <Video className="text-muted-foreground size-6 md:size-10" />
      </div>
    )
  }

  if (media?.type === MEDIA_TYPES.AUDIO) {
    return (
      <div className="bg-accent flex h-16 w-24 items-center justify-center rounded-lg md:h-38 md:w-full">
        <Music className="text-muted-foreground size-6 md:size-10" />
      </div>
    )
  }

  return (
    <div className="bg-accent flex h-16 w-24 items-center justify-center rounded-lg md:h-38 md:w-full">
      <ImageOff className="text-muted-foreground size-6 md:size-10" />
    </div>
  )
}

const ResultModalAnswers = () => {
  const {
    result,
    questionResult,
    questionIndex,
    totalPlayers,
    answeredCount,
    correctCount,
    updateQuestionAiSynthesis,
  } = useResultModal()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [isSynthesizing, setIsSynthesizing] = useState(false)

  const isSurveyMode = result.gameMode === QUIZZ_MODES.SURVEY
  const noAnswerCount = totalPlayers - answeredCount
  const { options } = questionResult
  const scoringMode = isMultiOptions(options) ? options.scoringMode : undefined

  const otherResponses = questionResult.playerAnswers.filter((pa) =>
    Boolean(pa.otherText?.trim()),
  )

  const directCounts: Record<number, number> = {}
  questionResult.answers.forEach((_, ai) => {
    directCounts[ai] = questionResult.playerAnswers.filter((pa) =>
      pa.answerIds?.includes(ai),
    ).length
  })

  const otherResponseItems = otherResponses.map((pa) => ({
    playerName: pa.playerName,
    text: pa.otherText?.trim() ?? "",
  }))

  const surveyRanking =
    questionResult.type !== QUESTION_TYPES.ESTIMATION
      ? computeSurveyRanking({
          answers: questionResult.answers,
          responses: directCounts,
          otherResponses: otherResponseItems,
          aiSynthesis: questionResult.aiSynthesis,
          totalResponded: answeredCount,
        })
      : []

  const maxChoiceCount =
    surveyRanking.length > 0 && surveyRanking[0].count > 0
      ? surveyRanking[0].count
      : 0

  const handleSynthesizeWithAi = async () => {
    if (isSynthesizing) {
      return
    }

    setIsSynthesizing(true)

    try {
      const res = await synthesizeAiResultQuestion({
        resultId: result.id,
        questionIndex,
      })

      updateQuestionAiSynthesis(questionIndex, res.aiSynthesis)

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: resultKeys.all }),
        queryClient.invalidateQueries({
          queryKey: resultKeys.detail(result.id),
        }),
      ])
      toast.success("Đã gom nhóm ý kiến bằng AI thành công!")
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Không thể gom nhóm bằng AI",
      )
    } finally {
      setIsSynthesizing(false)
    }
  }

  const values = questionResult.playerAnswers.flatMap(
    (pa) => pa.answerIds ?? [],
  )
  const average = (() => {
    if (values.length === 0) {
      return null
    }

    return values.reduce((acc, value) => acc + value, 0) / values.length
  })()

  const estimationRows = (): AnswerRow[] => {
    const solution = questionResult.solutions?.[0]

    if (!isEstimationOptions(options) || solution === undefined) {
      return [
        {
          label: t("manager:result.estimation.answered"),
          count: answeredCount,
          isCorrect: false,
          color: "bg-primary",
          answerLabel: "≈",
        },
      ]
    }

    return [
      {
        label: t("manager:result.estimation.withinMargin", {
          value: formatValue(solution),
          margin: formatValue(options.margin),
        }),
        count: correctCount,
        isCorrect: true,
        color: "bg-correct",
        answerLabel: "≈",
      },
      {
        label: t("manager:result.estimation.outsideMargin"),
        count: answeredCount - correctCount,
        isCorrect: false,
        color: "bg-red-500",
        answerLabel: "≠",
      },
    ]
  }

  const answerRows: AnswerRow[] = (() => {
    if (questionResult.type === QUESTION_TYPES.ESTIMATION) {
      return estimationRows()
    }

    return questionResult.answers.map((label, ai) => {
      const rankItem = surveyRanking.find(
        (r) => !r.isFromOtherCluster && r.answerIndex === ai,
      )
      const count =
        isSurveyMode && rankItem ? rankItem.count : (directCounts[ai] ?? 0)
      const aiMergedCount = isSurveyMode ? (rankItem?.aiMergedCount ?? 0) : 0

      return {
        label,
        count,
        aiMergedCount,
        isTopChoice:
          isSurveyMode && maxChoiceCount > 0 && count === maxChoiceCount,
        isCorrect: questionResult.solutions?.includes(ai) ?? false,
        color: ANSWERS_COLORS[ai % 4],
        answerLabel: ANSWERS_LABELS[ai % 4],
      }
    })
  })()

  const rows: AnswerRow[] = [
    ...answerRows,
    {
      label: t("manager:result.noAnswer"),
      count: noAnswerCount,
      isCorrect: false,
      color: null,
      answerLabel: null,
    },
  ]

  const unmergedAiClusters = (
    questionResult.aiSynthesis?.clusters ?? []
  ).filter((c) => c.matchedAnswerIndex === null)

  return (
    <div className="border-accent flex flex-col border-b-2 md:flex-row">
      <div className="border-accent bg-muted/30 flex shrink-0 flex-row items-center gap-4 border-b-2 p-4 md:w-66 md:flex-col md:justify-center md:border-r-2 md:border-b-0">
        <MediaPreview media={questionResult.media} />
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <Clock className="size-3.5" />
          <span>
            {questionResult.time === NO_TIME_LIMIT
              ? "∞"
              : `${questionResult.time}${t("manager:result.timeLimitSuffix")}`}
          </span>
          {scoringMode && (
            <div className="bg-accent text-accent-foreground rounded-md px-2 py-0.5 font-semibold">
              {t(`quizz:question.config.scoringMode.${scoringMode}`)}
            </div>
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5 overflow-hidden px-4 py-3 md:gap-2 md:px-5 md:py-4">
        <p className="text-md text-foreground mb-1 font-semibold">
          {questionResult.question}
        </p>

        {questionResult.type === QUESTION_TYPES.ESTIMATION &&
          average !== null && (
            <p className="text-muted-foreground mb-1 text-xs">
              {t("manager:result.estimation.average", {
                value: formatValue(Math.round(average * 100) / 100),
              })}
            </p>
          )}

        <div
          className={clsx(
            "grid items-center gap-x-3 gap-y-1.5 md:gap-y-2",
            isSurveyMode
              ? "grid-cols-[auto_minmax(0,1fr)_auto]"
              : "grid-cols-[auto_minmax(0,1fr)_auto_auto]",
          )}
        >
          {rows.map((row, i) => (
            <div key={i} className="contents">
              {row.color && row.answerLabel ? (
                <div
                  className={clsx(
                    "flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white",
                    row.color,
                  )}
                >
                  {row.answerLabel}
                </div>
              ) : (
                <div className="border-accent flex size-6 shrink-0 items-center justify-center rounded-md border-2 bg-white">
                  <X className="text-muted-foreground size-3 stroke-4" />
                </div>
              )}

              <div className="flex min-w-0 items-center gap-1.5">
                <span
                  className={clsx("min-w-0 truncate text-sm font-medium", {
                    "text-muted-foreground": !row.color,
                  })}
                >
                  {row.label}
                </span>
                {row.isTopChoice && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-600">
                    <Trophy className="size-3" />
                    Nhiều nhất
                  </span>
                )}
                {Boolean(row.aiMergedCount && row.aiMergedCount > 0) && (
                  <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-violet-600">
                    <Sparkles className="size-2.5" />+{row.aiMergedCount} từ mục
                    Khác
                  </span>
                )}
              </div>

              {!isSurveyMode && (
                <div className="shrink-0">
                  {row.isCorrect ? (
                    <Check className="text-correct size-5 stroke-4" />
                  ) : (
                    <X
                      className={clsx(
                        "size-5 stroke-4",
                        row.color ? "text-red-500" : "text-red-400",
                      )}
                    />
                  )}
                </div>
              )}

              <span className="text-accent-foreground text-center text-sm font-semibold">
                {row.count}
              </span>
            </div>
          ))}
        </div>

        {otherResponses.length > 0 && (
          <div className="mt-2 rounded-lg border border-violet-500/30 bg-violet-500/5 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-violet-700">
                <Sparkles className="size-3.5" />
                <span>
                  Ý kiến mục &ldquo;Khác&rdquo; ({otherResponses.length})
                </span>
              </div>
              <button
                type="button"
                disabled={isSynthesizing}
                onClick={handleSynthesizeWithAi}
                className="inline-flex items-center gap-1 rounded-md bg-violet-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-violet-700 disabled:opacity-50"
              >
                {isSynthesizing ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Sparkles className="size-3.5" />
                )}
                <span>AI Gom nhóm</span>
              </button>
            </div>

            {unmergedAiClusters.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                {unmergedAiClusters.map((cluster, idx) => {
                  const isTop =
                    isSurveyMode &&
                    maxChoiceCount > 0 &&
                    cluster.count === maxChoiceCount

                  return (
                    <div
                      key={idx}
                      className="bg-background/80 rounded-md border border-violet-500/20 px-2.5 py-1.5 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2 font-semibold">
                        <div className="flex items-center gap-1.5">
                          <span className="text-foreground">
                            {cluster.label}
                          </span>
                          {isTop && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-600">
                              <Trophy className="size-2.5" />
                              Nhiều nhất
                            </span>
                          )}
                        </div>
                        <span className="rounded bg-violet-500/15 px-1.5 py-0.5 font-bold text-violet-700">
                          {cluster.count} người
                        </span>
                      </div>
                      <p className="text-muted-foreground mt-0.5 text-[11px]">
                        {cluster.items
                          .map((it) => `${it.playerName}: "${it.text}"`)
                          .join(" • ")}
                      </p>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {otherResponses.map((pa, idx) => (
                  <span
                    key={idx}
                    className="bg-background/80 text-foreground rounded-md border border-violet-500/20 px-2 py-1 text-xs"
                  >
                    <strong className="font-semibold">{pa.playerName}:</strong>{" "}
                    &ldquo;{pa.otherText}&rdquo;
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default ResultModalAnswers
