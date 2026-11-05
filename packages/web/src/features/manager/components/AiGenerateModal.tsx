import {
  AI_DIFFICULTIES,
  AI_LANGUAGES,
  AI_QUESTION_TYPES,
  type AiDifficulty,
  type AiLanguage,
  type AiQuestionTypeFilter,
} from "@razzia/common/types/ai"
import type { Question, Quizz } from "@razzia/common/types/game"
import {
  quizzValidator,
  type QuizzValidated,
} from "@razzia/common/validators/quizz"
import Button from "@razzia/web/components/Button"
import Input from "@razzia/web/components/Input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@razzia/web/components/Select"
import { generateAiQuizz } from "@razzia/web/features/manager/queries"
import { ApiError } from "@razzia/web/lib/api"
import { useMutation } from "@tanstack/react-query"
import { CheckCircle2, FolderOpen, Loader2, Sparkles } from "lucide-react"
import { Dialog as RadixDialog } from "radix-ui"
import { type ReactNode, type SubmitEvent, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

interface AiGenerateModalProps {
  trigger: ReactNode
  mode: "create" | "append"
  modelName?: string
  isSaving?: boolean
  onSaveNew?: (_quizz: QuizzValidated) => void
  onOpenInEditor?: (_quizz: Quizz) => void
  onAppend?: (_questions: Question[], _subject: string) => void
}

const AiGenerateModal = ({
  trigger,
  mode,
  modelName,
  isSaving = false,
  onSaveNew,
  onOpenInEditor,
  onAppend,
}: AiGenerateModalProps) => {
  const { t, i18n } = useTranslation()
  const defaultLang: AiLanguage = i18n.language.startsWith("vi")
    ? AI_LANGUAGES.VI
    : AI_LANGUAGES.EN

  const [open, setOpen] = useState(false)
  const [topic, setTopic] = useState("")
  const [sourceText, setSourceText] = useState("")
  const [count, setCount] = useState("10")
  const [questionType, setQuestionType] = useState<AiQuestionTypeFilter>(
    AI_QUESTION_TYPES.MIXED,
  )
  const [difficulty, setDifficulty] = useState<AiDifficulty>(
    AI_DIFFICULTIES.BLOOM,
  )
  const [time, setTime] = useState("20")
  const [language, setLanguage] = useState<AiLanguage>(defaultLang)
  const [generatedQuizz, setGeneratedQuizz] = useState<Quizz | null>(null)
  const [editableSubject, setEditableSubject] = useState("")

  const resetModal = () => {
    setTopic("")
    setSourceText("")
    setGeneratedQuizz(null)
    setEditableSubject("")
  }

  const generateMutation = useMutation({
    mutationFn: generateAiQuizz,
    onSuccess: (res) => {
      setGeneratedQuizz(res.quizz)
      setEditableSubject(res.quizz.subject)
      toast.success(
        t("manager:aiModal.generatedSuccess", {
          count: res.questions.length,
        }),
      )
    },
    onError: (error) => {
      toast.error(
        t(error instanceof ApiError ? error.key : "errors:ai.providerFailed"),
      )
    },
  })

  const handleGenerate = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (generateMutation.isPending) {
      return
    }

    generateMutation.mutate({
      topic: topic.trim(),
      ...(sourceText.trim().length > 0
        ? { sourceText: sourceText.trim() }
        : {}),
      count: Number.parseInt(count, 10) || 10,
      questionType,
      difficulty,
      time: Number.parseInt(time, 10) || 20,
      language,
    })
  }

  const buildCurrentQuizz = (): Quizz | null => {
    if (!generatedQuizz) {
      return null
    }

    return {
      ...generatedQuizz,
      subject:
        editableSubject.trim().length > 0
          ? editableSubject.trim()
          : generatedQuizz.subject,
    }
  }

  const handleOpenEditor = () => {
    const quizz = buildCurrentQuizz()

    if (!quizz || !onOpenInEditor) {
      return
    }

    onOpenInEditor(quizz)
    setOpen(false)
    resetModal()
  }

  const handleSaveDirectly = () => {
    const quizz = buildCurrentQuizz()

    if (!quizz || !onSaveNew) {
      return
    }

    const validated = quizzValidator.safeParse(quizz)

    if (!validated.success) {
      toast.error(t("errors:quizz.failedToSave"))

      return
    }

    onSaveNew(validated.data)
    setOpen(false)
    resetModal()
  }

  const handleAppendQuestions = () => {
    const quizz = buildCurrentQuizz()

    if (!quizz || !onAppend) {
      return
    }

    onAppend(quizz.questions, quizz.subject)
    toast.success(
      t("manager:importModal.appendedToast", {
        count: quizz.questions.length,
      }),
    )
    setOpen(false)
    resetModal()
  }

  return (
    <RadixDialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next)

        if (!next) {
          resetModal()
        }
      }}
    >
      <RadixDialog.Trigger asChild>{trigger}</RadixDialog.Trigger>

      <RadixDialog.Portal>
        <RadixDialog.Overlay className="data-[state=open]:animate-fade fixed inset-0 z-50 bg-black/45" />
        <RadixDialog.Content className="bg-background fixed top-1/2 left-1/2 z-50 flex max-h-[92svh] w-[calc(100%-1.5rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl p-5 shadow-xl">
          <div className="flex items-center justify-between gap-2">
            <RadixDialog.Title className="text-foreground flex items-center gap-1.5 text-lg font-bold">
              <Sparkles className="text-primary size-5 shrink-0" />
              {mode === "append"
                ? t("manager:aiModal.appendTitle")
                : t("manager:aiModal.title")}
            </RadixDialog.Title>
            {modelName && (
              <span className="bg-primary/10 text-primary truncate rounded-full px-2.5 py-0.5 text-[11px] font-semibold">
                {modelName}
              </span>
            )}
          </div>
          <RadixDialog.Description className="text-muted-foreground mt-1 text-xs">
            {t("manager:aiModal.subtitle")}
          </RadixDialog.Description>

          <form
            onSubmit={handleGenerate}
            className="mt-3 flex min-h-0 flex-1 flex-col gap-2.5 overflow-auto pr-0.5"
          >
            <div className="flex flex-col gap-1">
              <label className="text-foreground text-xs font-semibold">
                {t("manager:aiModal.topicLabel")}
              </label>
              <Input
                variant="sm"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder={t("manager:aiModal.topicPlaceholder")}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-foreground text-xs font-semibold">
                {t("manager:aiModal.sourceLabel")}
              </label>
              <textarea
                rows={3}
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                placeholder={t("manager:aiModal.sourcePlaceholder")}
                className="border-accent bg-background text-foreground placeholder:text-muted-foreground focus:border-primary w-full resize-y rounded-lg border-2 px-3 py-2 text-xs outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-foreground text-xs font-semibold">
                  {t("manager:aiModal.countLabel")}
                </label>
                <Select value={count} onValueChange={setCount}>
                  <SelectTrigger aria-label={t("manager:aiModal.countLabel")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3">3</SelectItem>
                    <SelectItem value="5">5</SelectItem>
                    <SelectItem value="8">8</SelectItem>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="15">15</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-foreground text-xs font-semibold">
                  {t("manager:aiModal.typeLabel")}
                </label>
                <Select
                  value={questionType}
                  onValueChange={(v) =>
                    setQuestionType(v as AiQuestionTypeFilter)
                  }
                >
                  <SelectTrigger aria-label={t("manager:aiModal.typeLabel")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={AI_QUESTION_TYPES.MIXED}>
                      {t("manager:aiModal.typeMixed")}
                    </SelectItem>
                    <SelectItem value={AI_QUESTION_TYPES.SINGLE}>
                      {t("manager:aiModal.typeSingle")}
                    </SelectItem>
                    <SelectItem value={AI_QUESTION_TYPES.MULTI}>
                      {t("manager:aiModal.typeMulti")}
                    </SelectItem>
                    <SelectItem value={AI_QUESTION_TYPES.ESTIMATION}>
                      {t("manager:aiModal.typeEstimation")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-foreground text-xs font-semibold">
                  {t("manager:aiModal.difficultyLabel")}
                </label>
                <Select
                  value={difficulty}
                  onValueChange={(v) => setDifficulty(v as AiDifficulty)}
                >
                  <SelectTrigger
                    aria-label={t("manager:aiModal.difficultyLabel")}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={AI_DIFFICULTIES.BLOOM}>
                      {t("manager:aiModal.diffBloom")}
                    </SelectItem>
                    <SelectItem value={AI_DIFFICULTIES.EASY}>
                      {t("manager:aiModal.diffEasy")}
                    </SelectItem>
                    <SelectItem value={AI_DIFFICULTIES.MEDIUM}>
                      {t("manager:aiModal.diffMedium")}
                    </SelectItem>
                    <SelectItem value={AI_DIFFICULTIES.HARD}>
                      {t("manager:aiModal.diffHard")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <div className="flex flex-col gap-1">
                  <label className="text-foreground text-xs font-semibold">
                    {t("manager:aiModal.timeLabel")}
                  </label>
                  <Select value={time} onValueChange={setTime}>
                    <SelectTrigger aria-label={t("manager:aiModal.timeLabel")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="15">15s</SelectItem>
                      <SelectItem value="20">20s</SelectItem>
                      <SelectItem value="30">30s</SelectItem>
                      <SelectItem value="45">45s</SelectItem>
                      <SelectItem value="60">60s</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-foreground text-xs font-semibold">
                    {t("manager:aiModal.languageLabel")}
                  </label>
                  <Select
                    value={language}
                    onValueChange={(v) => setLanguage(v as AiLanguage)}
                  >
                    <SelectTrigger
                      aria-label={t("manager:aiModal.languageLabel")}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={AI_LANGUAGES.VI}>
                        {t("manager:aiModal.langVi")}
                      </SelectItem>
                      <SelectItem value={AI_LANGUAGES.EN}>
                        {t("manager:aiModal.langEn")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <Button
              type="submit"
              size="sm"
              className="mt-1 py-2 text-xs"
              disabled={generateMutation.isPending || topic.trim().length < 2}
            >
              {generateMutation.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t("manager:aiModal.generatingButton")}
                </>
              ) : (
                <>
                  <Sparkles className="size-4" />
                  {generatedQuizz
                    ? t("manager:aiModal.regenerateButton")
                    : t("manager:aiModal.generateButton")}
                </>
              )}
            </Button>

            {generatedQuizz && (
              <div className="border-primary/25 bg-primary/5 mt-1 flex flex-col gap-2 rounded-lg border p-2.5">
                {mode === "create" && (
                  <Input
                    variant="sm"
                    value={editableSubject}
                    onChange={(e) => setEditableSubject(e.target.value)}
                    placeholder={t("manager:importModal.subjectLabel")}
                  />
                )}
                <div className="text-primary flex items-center gap-1.5 text-xs font-bold">
                  <CheckCircle2 className="size-4 shrink-0" />
                  {t("manager:importModal.validCount", {
                    count: generatedQuizz.questions.length,
                  })}
                </div>
                <ul className="max-h-28 space-y-1 overflow-auto text-xs">
                  {generatedQuizz.questions.map((q, idx) => (
                    <li
                      key={`${idx}-${q.question}`}
                      className="text-foreground flex items-center gap-1.5 truncate"
                    >
                      <span className="bg-primary/15 text-primary shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase">
                        {q.type}
                      </span>
                      <span className="truncate">
                        {idx + 1}. {q.question}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-2 flex flex-wrap justify-end gap-2">
              <RadixDialog.Close asChild>
                <Button
                  type="button"
                  size="sm"
                  className="bg-accent text-accent-foreground px-3.5 py-2 text-xs"
                >
                  {t("common:cancel")}
                </Button>
              </RadixDialog.Close>

              {generatedQuizz && mode === "create" && (
                <>
                  <Button
                    type="button"
                    size="sm"
                    className="bg-accent text-accent-foreground px-3.5 py-2 text-xs"
                    onClick={handleOpenEditor}
                  >
                    <FolderOpen className="size-3.5" />
                    {t("manager:importModal.openInEditor")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="px-4 py-2 text-xs"
                    disabled={isSaving}
                    onClick={handleSaveDirectly}
                  >
                    {t("manager:importModal.saveNow")}
                  </Button>
                </>
              )}

              {generatedQuizz && mode === "append" && (
                <Button
                  type="button"
                  size="sm"
                  className="px-4 py-2 text-xs"
                  onClick={handleAppendQuestions}
                >
                  {t("manager:importModal.appendButton")}
                </Button>
              )}
            </div>
          </form>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}

export default AiGenerateModal
