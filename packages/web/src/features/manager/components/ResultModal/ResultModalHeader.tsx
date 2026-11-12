import { QUESTION_TYPES } from "@razzia/common/constants"
import { computeSurveyRanking } from "@razzia/common/questions/options"
import type { QuestionAiSynthesis } from "@razzia/common/types/game"
import { useResultModal } from "@razzia/web/features/manager/contexts/result-modal-context"
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react"
import { useTranslation } from "react-i18next"

const escapeCsvCell = (value: string | number | null | undefined): string => {
  const str = String(value ?? "")

  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`
  }

  return str
}

const findMatchedClusterLabel = (
  aiSynthesis: QuestionAiSynthesis | undefined,
  playerName: string,
  otherText: string | undefined,
): string => {
  if (!otherText || !aiSynthesis) {
    return ""
  }

  for (const cluster of aiSynthesis.clusters) {
    const matched = cluster.items.some(
      (it) => it.playerName === playerName && it.text === otherText,
    )

    if (matched) {
      return cluster.label
    }
  }

  return ""
}

const ResultModalHeader = () => {
  const { result, questionIndex, total, goNext, goPrev, onClose } =
    useResultModal()
  const { t } = useTranslation()

  const handleExportCsv = () => {
    const rows: string[][] = []
    const totalPlayers = result.players.length

    rows.push([
      "Câu số",
      "Câu hỏi",
      "Phương án / Nhóm ý kiến",
      "Nguồn",
      "Số lượt chọn",
      "Tỷ lệ (%)",
      "Xếp hạng",
    ])

    result.questions.forEach((q, qIdx) => {
      if (q.type === QUESTION_TYPES.ESTIMATION) {
        return
      }

      const directCounts: Record<number, number> = {}
      q.answers.forEach((_, ai) => {
        directCounts[ai] = q.playerAnswers.filter((pa) =>
          pa.answerIds?.includes(ai),
        ).length
      })

      const otherResponseItems = q.playerAnswers
        .filter((pa) => Boolean(pa.otherText?.trim()))
        .map((pa) => ({
          playerName: pa.playerName,
          text: pa.otherText?.trim() ?? "",
        }))

      const ranking = computeSurveyRanking({
        answers: q.answers,
        responses: directCounts,
        otherResponses: otherResponseItems,
        aiSynthesis: q.aiSynthesis,
        totalResponded: totalPlayers,
      })
      const topCount = ranking.length > 0 ? ranking[0].count : 0

      ranking.forEach((item) => {
        rows.push([
          String(qIdx + 1),
          q.question,
          item.label,
          item.isFromOtherCluster ? "Khác (AI gom nhóm)" : "Có sẵn",
          String(item.count),
          `${item.percentage}%`,
          topCount > 0 && item.count === topCount
            ? "Nhiều người chọn nhất"
            : "",
        ])
      })
    })

    rows.push([])
    rows.push([
      "Câu số",
      "Câu hỏi",
      "Người tham gia",
      "Phương án đã chọn",
      "Ý kiến mục Khác (Nguyên gốc)",
      "Nhóm AI chuẩn hóa",
      "Điểm",
    ])

    result.questions.forEach((q, qIdx) => {
      q.playerAnswers.forEach((pa) => {
        const chosenLabels = (pa.answerIds ?? [])
          .map((id) => q.answers[id] ?? String(id))
          .join("; ")

        const matchedLabel = findMatchedClusterLabel(
          q.aiSynthesis,
          pa.playerName,
          pa.otherText,
        )

        rows.push([
          String(qIdx + 1),
          q.question,
          pa.playerName,
          chosenLabels,
          pa.otherText ?? "",
          matchedLabel,
          String(pa.points ?? 0),
        ])
      })
    })

    const csvBody = rows.map((r) => r.map(escapeCsvCell).join(",")).join("\r\n")
    const csvContent = `\uFEFF${csvBody}`
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    const safeTitle =
      result.subject.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 40) || "survey"
    link.href = url
    link.download = `${safeTitle}_ket_qua.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="border-accent flex shrink-0 items-center gap-3 border-b-2 px-5 py-3">
      <h2 className="text-foreground flex-1 truncate text-base font-bold">
        {result.subject}
      </h2>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={handleExportCsv}
          title="Xuất file CSV thống kê & câu trả lời"
          className="border-accent bg-muted/50 text-foreground hover:bg-muted mr-2 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold transition"
        >
          <Download className="size-3.5" />
          <span>Xuất CSV</span>
        </button>
        <span className="text-muted-foreground text-sm">
          {questionIndex + 1}
          {t("manager:result.paginationOf")}
          {total}
        </span>
        <button
          disabled={questionIndex === 0}
          onClick={goPrev}
          title={t("common:previous")}
          className="text-muted-foreground hover:bg-muted rounded p-1 disabled:opacity-30"
        >
          <ChevronLeft className="size-5" />
        </button>
        <button
          disabled={questionIndex === total - 1}
          onClick={goNext}
          title={t("common:next")}
          className="text-muted-foreground hover:bg-muted rounded p-1 disabled:opacity-30"
        >
          <ChevronRight className="size-5" />
        </button>
        <button
          onClick={onClose}
          title={t("common:close")}
          className="text-muted-foreground hover:bg-muted hover:text-accent-foreground ml-1 rounded p-1"
        >
          <X className="size-5" />
        </button>
      </div>
    </div>
  )
}

export default ResultModalHeader
