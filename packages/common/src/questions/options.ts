import type {
  EstimationQuestionOptions,
  MultiQuestionOptions,
  QuestionAiSynthesis,
  QuestionOptions,
  SurveyOtherResponseItem,
  SurveyRankItem,
} from "@razzia/common/types/game"

export const isMultiOptions = (
  options?: QuestionOptions,
): options is MultiQuestionOptions =>
  options !== undefined && "scoringMode" in options

export const isEstimationOptions = (
  options?: QuestionOptions,
): options is EstimationQuestionOptions =>
  options !== undefined && "min" in options && "max" in options

export const computeSurveyRanking = ({
  answers,
  responses,
  otherResponses = [],
  aiSynthesis,
  totalResponded,
}: {
  answers: string[]
  responses: Record<number, number>
  otherResponses?: SurveyOtherResponseItem[]
  aiSynthesis?: QuestionAiSynthesis
  totalResponded?: number
}): SurveyRankItem[] => {
  const directTotal = Object.values(responses).reduce((a, b) => a + b, 0)
  const fallbackTotal = directTotal + otherResponses.length
  const denominator =
    totalResponded !== undefined && totalResponded > 0
      ? totalResponded
      : fallbackTotal

  const calcPct = (count: number) =>
    denominator > 0 ? Math.round((count / denominator) * 100) : 0

  const mergedByAnswer = new Map<
    number,
    { count: number; items: SurveyOtherResponseItem[] }
  >()
  const standaloneClusters: SurveyRankItem[] = []

  if (aiSynthesis && aiSynthesis.clusters.length > 0) {
    for (const cluster of aiSynthesis.clusters) {
      const idx = cluster.matchedAnswerIndex

      if (idx !== null && idx >= 0 && idx < answers.length) {
        const prev = mergedByAnswer.get(idx) ?? { count: 0, items: [] }
        mergedByAnswer.set(idx, {
          count: prev.count + cluster.count,
          items: [...prev.items, ...cluster.items],
        })
      } else if (cluster.count > 0) {
        standaloneClusters.push({
          label: cluster.label,
          count: cluster.count,
          directCount: 0,
          aiMergedCount: cluster.count,
          percentage: calcPct(cluster.count),
          isFromOtherCluster: true,
          answerIndex: null,
          items: cluster.items,
        })
      }
    }
  } else if (otherResponses.length > 0) {
    // Before AI synthesis finishes (or if AI is disabled), group identical normalized strings
    const grouped = new Map<
      string,
      { label: string; items: SurveyOtherResponseItem[] }
    >()

    for (const item of otherResponses) {
      const norm = item.text.trim().toLowerCase().replace(/\s+/gu, " ")

      if (!norm) {
        continue
      }

      // Check if it exactly matches a predefined answer
      const exactAnswerIdx = answers.findIndex(
        (a) => a.trim().toLowerCase().replace(/\s+/gu, " ") === norm,
      )

      if (exactAnswerIdx >= 0) {
        const prev = mergedByAnswer.get(exactAnswerIdx) ?? {
          count: 0,
          items: [],
        }
        mergedByAnswer.set(exactAnswerIdx, {
          count: prev.count + 1,
          items: [...prev.items, item],
        })

        continue
      }

      const existing = grouped.get(norm)

      if (existing) {
        existing.items.push(item)
      } else {
        grouped.set(norm, { label: item.text.trim(), items: [item] })
      }
    }

    for (const group of grouped.values()) {
      const count = group.items.length
      standaloneClusters.push({
        label: group.label,
        count,
        directCount: 0,
        aiMergedCount: count,
        percentage: calcPct(count),
        isFromOtherCluster: true,
        answerIndex: null,
        items: group.items,
      })
    }
  }

  const predefinedItems: SurveyRankItem[] = answers.map((label, idx) => {
    const directCount = responses[idx] ?? 0
    const merged = mergedByAnswer.get(idx)
    const aiMergedCount = merged?.count ?? 0
    const count = directCount + aiMergedCount

    return {
      label,
      count,
      directCount,
      aiMergedCount,
      percentage: calcPct(count),
      isFromOtherCluster: false,
      answerIndex: idx,
      ...(merged && merged.items.length > 0 ? { items: merged.items } : {}),
    }
  })

  return [...predefinedItems, ...standaloneClusters].sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count
    }

    if (a.isFromOtherCluster !== b.isFromOtherCluster) {
      return a.isFromOtherCluster ? 1 : -1
    }

    return (a.answerIndex ?? 999) - (b.answerIndex ?? 999)
  })
}
