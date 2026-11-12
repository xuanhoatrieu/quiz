import type {
  GameResult,
  QuestionAiSynthesis,
  QuestionResult,
} from "@razzia/common/types/game"
import { isAnswerCorrect } from "@razzia/web/features/questions/utils"
import {
  createContext,
  useContext,
  useState,
  type PropsWithChildren,
} from "react"

interface ResultModalContextType {
  result: GameResult
  questionResult: QuestionResult
  questionIndex: number
  total: number
  totalPlayers: number
  answeredCount: number
  correctCount: number
  correctPct: number
  maxAnswerCount: number
  getPlayerPoints: (_name: string) => number
  updateQuestionAiSynthesis: (
    _questionIndex: number,
    _synthesis: QuestionAiSynthesis,
  ) => void
  goNext: () => void
  goPrev: () => void
  onClose: () => void
}

const ResultModalContext = createContext<ResultModalContextType | null>(null)

type Props = PropsWithChildren<{
  result: GameResult
  onClose: () => void
}>

export const ResultModalProvider = ({ children, result, onClose }: Props) => {
  const [questionIndex, setQuestionIndex] = useState(0)
  const [aiSynthesisOverrides, setAiSynthesisOverrides] = useState<
    Record<number, QuestionAiSynthesis | undefined>
  >({})

  const rawQuestionResult = result.questions[questionIndex]
  const overrideSynthesis = aiSynthesisOverrides[questionIndex]
  const questionResult: QuestionResult = overrideSynthesis
    ? {
        ...rawQuestionResult,
        aiSynthesis: overrideSynthesis,
      }
    : rawQuestionResult
  const total = result.questions.length
  const totalPlayers = result.players.length

  const answeredCount = questionResult.playerAnswers.filter(
    (pa) =>
      (pa.answerIds !== null && pa.answerIds.length > 0) ||
      Boolean(pa.otherText?.trim()),
  ).length

  const correctCount = questionResult.playerAnswers.filter(
    (pa) => pa.correct ?? isAnswerCorrect(questionResult, pa.answerIds),
  ).length

  const correctPct =
    totalPlayers > 0 ? Math.round((correctCount / totalPlayers) * 100) : 0

  const maxAnswerCount = Math.max(
    1,
    ...questionResult.answers.map(
      (_, ai) =>
        questionResult.playerAnswers.filter((pa) => pa.answerIds?.includes(ai))
          .length,
    ),
  )

  const getPlayerPoints = (name: string) =>
    result.players.find((p) => p.username === name)?.points ?? 0

  const updateQuestionAiSynthesis = (
    idx: number,
    synthesis: QuestionAiSynthesis,
  ) => {
    setAiSynthesisOverrides((prev) => ({
      ...prev,
      [idx]: synthesis,
    }))
  }

  const goNext = () => setQuestionIndex((i) => Math.min(i + 1, total - 1))

  const goPrev = () => setQuestionIndex((i) => Math.max(i - 1, 0))

  return (
    <ResultModalContext.Provider
      value={{
        result,
        questionResult,
        questionIndex,
        total,
        totalPlayers,
        answeredCount,
        correctCount,
        correctPct,
        maxAnswerCount,
        getPlayerPoints,
        updateQuestionAiSynthesis,
        goNext,
        goPrev,
        onClose,
      }}
    >
      {children}
    </ResultModalContext.Provider>
  )
}

export const useResultModal = () => {
  const ctx = useContext(ResultModalContext)

  if (!ctx) {
    throw new Error("useResultModal must be used inside ResultModalProvider")
  }

  return ctx
}
