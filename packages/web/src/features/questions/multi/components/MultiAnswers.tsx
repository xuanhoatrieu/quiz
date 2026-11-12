import { MAX_OTHER_TEXT_LENGTH } from "@razzia/common/constants"
import Button from "@razzia/web/components/Button"
import Input from "@razzia/web/components/Input"
import AnswerButton from "@razzia/web/features/game/components/AnswerButton"
import {
  ANSWERS_COLORS,
  ANSWERS_LABELS,
} from "@razzia/web/features/game/utils/constants"
import type { AnswerComponentProps } from "@razzia/web/features/questions/types"
import clsx from "clsx"
import { useState } from "react"
import { useTranslation } from "react-i18next"

const MultiAnswers = ({
  answers,
  allowOther,
  onSubmit,
  readOnly,
  fill,
}: AnswerComponentProps) => {
  const [selected, setSelected] = useState<number[]>([])
  const [otherOpen, setOtherOpen] = useState(false)
  const [otherText, setOtherText] = useState("")
  const { t } = useTranslation()

  const trimmedOther = otherText.trim()
  const canConfirm =
    selected.length > 0 || (allowOther && otherOpen && trimmedOther.length > 0)

  const handleSubmit = () =>
    onSubmit(
      selected,
      allowOther && otherOpen && trimmedOther.length > 0
        ? trimmedOther
        : undefined,
    )

  const toggle = (key: number) => {
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    )
  }

  return (
    <div
      className={clsx(
        "mx-auto mb-4 flex w-full max-w-7xl flex-col gap-2 px-2",
        {
          "flex-1": fill,
        },
      )}
    >
      <div
        className={clsx(
          "grid gap-1 text-lg font-bold text-white md:text-xl",
          fill
            ? "flex-1 auto-rows-fr grid-cols-1 sm:grid-cols-2"
            : "grid-cols-2",
        )}
      >
        {answers.map((answer, key) => {
          const isSelected = selected.includes(key)

          return (
            <AnswerButton
              key={key}
              className={ANSWERS_COLORS[key]}
              label={ANSWERS_LABELS[key]}
              onClick={() => toggle(key)}
              selected={readOnly ? undefined : isSelected}
              disabled={readOnly}
              large={fill}
            >
              {answer}
            </AnswerButton>
          )
        })}
      </div>

      {allowOther && !readOnly && (
        <div className="mx-auto w-full max-w-2xl">
          {!otherOpen ? (
            <button
              type="button"
              onClick={() => setOtherOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-white/70 bg-black/45 px-4 py-2.5 text-base font-bold text-white transition hover:bg-black/60"
            >
              <span>✏️</span>
              <span>Khác (Tự gõ câu trả lời của bạn...)</span>
            </button>
          ) : (
            <div className="flex items-center gap-2 rounded-2xl bg-white/95 p-2.5 shadow-lg">
              <Input
                value={otherText}
                maxLength={MAX_OTHER_TEXT_LENGTH}
                onChange={(e) => setOtherText(e.target.value)}
                placeholder="Nhập thêm công việc / ý kiến khác của bạn..."
                className="flex-1 text-black"
              />
              <button
                type="button"
                onClick={() => {
                  setOtherOpen(false)
                  setOtherText("")
                }}
                className="rounded-lg bg-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-300"
              >
                {t("common:cancel")}
              </button>
            </div>
          )}
        </div>
      )}

      {!readOnly && (
        <Button
          onClick={handleSubmit}
          disabled={!canConfirm}
          className="mx-auto w-full max-w-xs"
        >
          {t("game:confirm")}
        </Button>
      )}
    </div>
  )
}

export default MultiAnswers
