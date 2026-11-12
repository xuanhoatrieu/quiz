import { EVENTS } from "@razzia/common/constants"
import { computeSurveyRanking } from "@razzia/common/questions/options"
import type { QuestionAiSynthesis } from "@razzia/common/types/game"
import type { ManagerStatusDataMap } from "@razzia/common/types/game/status"
import AnswerButton from "@razzia/web/features/game/components/AnswerButton"
import AnswerNote from "@razzia/web/features/game/components/AnswerNote"
import { useEvent } from "@razzia/web/features/game/contexts/socket-context"
import {
  ANSWERS_COLORS,
  ANSWERS_LABELS,
  SFX,
} from "@razzia/web/features/game/utils/constants"
import { calculatePercentages } from "@razzia/web/features/game/utils/score"
import { QUESTION_REGISTRY } from "@razzia/web/features/questions"
import clsx from "clsx"
import { Sparkles, Trophy } from "lucide-react"
import { useEffect, useState } from "react"
import useSound from "use-sound"

interface Props {
  data: ManagerStatusDataMap["SHOW_RESPONSES"]
}

const Responses = ({ data }: Props) => {
  const {
    question,
    answers,
    responses,
    solutions,
    type,
    note,
    otherResponses,
    aiSynthesis,
    aiSynthesizing,
  } = data
  const { ResponsesComponent } = QUESTION_REGISTRY[type]
  const [eventSynthesis, setEventSynthesis] = useState<{
    question: string
    synthesis: QuestionAiSynthesis
  } | null>(null)
  const [isMusicPlaying, setIsMusicPlaying] = useState(false)

  useEvent(EVENTS.MANAGER.SURVEY_AI_SYNTHESIS, ({ aiSynthesis: next }) => {
    setEventSynthesis({ question, synthesis: next })
  })

  const liveSynthesis =
    eventSynthesis?.question === question
      ? eventSynthesis.synthesis
      : aiSynthesis
  const isSynthesizing =
    eventSynthesis?.question === question ? false : Boolean(aiSynthesizing)

  const ranked = computeSurveyRanking({
    answers,
    responses,
    otherResponses,
    aiSynthesis: liveSynthesis,
  })
  const topChoice = ranked.find((item) => item.count > 0)

  const combinedResponses: Record<number, number> = { ...responses }

  for (const item of ranked) {
    if (item.answerIndex !== null) {
      combinedResponses[item.answerIndex] = item.count
    }
  }

  const percentages = calculatePercentages(combinedResponses)

  const [sfxResults] = useSound(SFX.RESULTS_SOUND, {
    volume: 0.2,
  })

  const [playMusic, { stop: stopMusic }] = useSound(SFX.ANSWERS.MUSIC, {
    volume: 0.2,
    onplay: () => {
      setIsMusicPlaying(true)
    },
    onend: () => {
      setIsMusicPlaying(false)
    },
  })

  useEffect(() => {
    stopMusic()
    sfxResults()
  }, [responses, playMusic, stopMusic, sfxResults])

  useEffect(() => {
    if (!isMusicPlaying) {
      playMusic()
    }
  }, [isMusicPlaying, playMusic])

  useEffect(() => {
    stopMusic()
  }, [playMusic, stopMusic])

  if (ResponsesComponent) {
    return (
      <div className="flex h-full flex-1 flex-col items-center justify-center gap-8 pb-4">
        <h2 className="text-center text-2xl font-bold text-white drop-shadow-lg md:text-4xl lg:text-5xl">
          {question}
        </h2>
        <ResponsesComponent data={data} />
        <AnswerNote note={note} />
      </div>
    )
  }

  const isSurveyMode = !solutions

  return (
    <div className="flex h-full flex-1 flex-col justify-between">
      <div className="mx-auto inline-flex h-full w-full max-w-7xl flex-1 flex-col items-center justify-center gap-4 px-2">
        <h2 className="text-center text-2xl font-bold text-white drop-shadow-lg md:text-4xl lg:text-5xl">
          {question}
        </h2>

        {isSurveyMode && topChoice && (
          <div className="flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-amber-300/60 bg-amber-500/25 px-4 py-2 text-white shadow-lg backdrop-blur-xs">
            <Trophy className="size-5 shrink-0 text-amber-300" />
            <span className="text-sm font-semibold md:text-base">
              Được chọn nhiều nhất:
            </span>
            <span className="text-base font-extrabold text-amber-200 md:text-lg">
              {topChoice.label}
            </span>
            <span className="rounded-full bg-black/35 px-2.5 py-0.5 text-xs font-bold md:text-sm">
              {topChoice.count} ({topChoice.percentage}%)
            </span>
          </div>
        )}

        <div
          className={`mt-4 grid h-40 w-full max-w-3xl gap-4 px-2`}
          style={{ gridTemplateColumns: `repeat(${answers.length}, 1fr)` }}
        >
          {answers.map((_, key) => (
            <div
              key={key}
              className={clsx(
                "flex flex-col justify-end self-end overflow-hidden rounded-md",
                ANSWERS_COLORS[key],
              )}
              style={{ height: percentages[key] }}
            >
              <span className="w-full bg-black/10 text-center text-lg font-bold text-white drop-shadow-md">
                {combinedResponses[key] || 0}
              </span>
            </div>
          ))}
        </div>

        {otherResponses && otherResponses.length > 0 && (
          <div className="w-full max-w-4xl rounded-2xl bg-black/45 p-3 text-white backdrop-blur-xs">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-bold md:text-base">
                <Sparkles className="size-4 text-amber-300" />
                <span>
                  Ý kiến mục &lsquo;Khác&rsquo; (AI gom nhóm đồng nghĩa) (
                  {otherResponses.length})
                </span>
              </div>
              {isSynthesizing && (
                <span className="animate-pulse rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold text-amber-200">
                  ✨ AI đang phân tích...
                </span>
              )}
            </div>

            {liveSynthesis?.summaryNote && (
              <p className="mb-2 text-xs text-amber-200/95 italic md:text-sm">
                {liveSynthesis.summaryNote}
              </p>
            )}

            <div className="grid max-h-36 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
              {(liveSynthesis?.clusters ?? []).map((cluster, idx) => (
                <div
                  key={idx}
                  className="flex flex-col gap-1 rounded-xl bg-white/10 px-3 py-2 text-xs md:text-sm"
                >
                  <div className="flex items-center justify-between gap-2 font-bold">
                    <span className="truncate">{cluster.label}</span>
                    <div className="flex shrink-0 items-center gap-1">
                      {cluster.matchedAnswerIndex !== null && (
                        <span className="rounded bg-amber-400/30 px-1.5 py-0.5 text-[11px] text-amber-100">
                          → {ANSWERS_LABELS[cluster.matchedAnswerIndex]}
                        </span>
                      )}
                      <span className="rounded-md bg-black/40 px-2 py-0.5">
                        {cluster.count}
                      </span>
                    </div>
                  </div>
                  <p className="truncate text-[11px] text-white/75">
                    {cluster.items
                      .map((it) => `${it.playerName}: "${it.text}"`)
                      .join(" · ")}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <AnswerNote note={note} />
        <div className="mx-auto mb-4 grid w-full max-w-7xl grid-cols-2 gap-1 rounded-full px-2 text-lg font-bold text-white md:text-xl">
          {answers.map((answer, key) => {
            const rankItem = ranked.find((r) => r.answerIndex === key)
            const isTopSurveyChoice =
              isSurveyMode &&
              topChoice &&
              topChoice.count > 0 &&
              rankItem?.count === topChoice.count

            return (
              <AnswerButton
                key={key}
                className={clsx(ANSWERS_COLORS[key], {
                  "opacity-65": solutions && !solutions.includes(key),
                  "ring-3 ring-amber-300": isTopSurveyChoice,
                })}
                label={ANSWERS_LABELS[key]}
                correct={solutions ? solutions.includes(key) : undefined}
              >
                <span>{answer}</span>
                {rankItem && rankItem.aiMergedCount > 0 && (
                  <span className="ml-2 inline-block rounded bg-black/30 px-1.5 py-0.5 text-xs font-semibold">
                    +{rankItem.aiMergedCount} Khác
                  </span>
                )}
              </AnswerButton>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default Responses
