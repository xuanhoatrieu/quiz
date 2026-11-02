import {
  buildExcelTemplateBytes,
  buildJsonTemplateString,
  parseImportedQuizzFile,
  type QuizzImportResult,
} from "@razzia/common/quizz-io"
import type { Question, Quizz } from "@razzia/common/types/game"
import {
  quizzValidator,
  type QuizzValidated,
} from "@razzia/common/validators/quizz"
import Button from "@razzia/web/components/Button"
import Input from "@razzia/web/components/Input"
import clsx from "clsx"
import {
  AlertTriangle,
  CheckCircle2,
  FileJson,
  FileSpreadsheet,
  FolderOpen,
  Upload,
} from "lucide-react"
import { Dialog as RadixDialog } from "radix-ui"
import {
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
  useRef,
  useState,
} from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

export const XLSX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

export const downloadBytesAsFile = (
  bytes: Uint8Array,
  filename: string,
  mimeType: string,
): void => {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const blob = new Blob([copy], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")

  anchor.href = url
  anchor.download = filename
  anchor.click()

  URL.revokeObjectURL(url)
}

export const downloadTextAsFile = (
  content: string,
  filename: string,
  mimeType: string,
): void => {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")

  anchor.href = url
  anchor.download = filename
  anchor.click()

  URL.revokeObjectURL(url)
}

interface ImportQuizzModalProps {
  trigger: ReactNode
  mode: "create" | "append"
  isSaving?: boolean
  onSaveNew?: (_quizz: QuizzValidated) => void
  onOpenInEditor?: (_quizz: Quizz) => void
  onAppend?: (_questions: Question[], _subject: string) => void
}

const ImportQuizzModal = ({
  trigger,
  mode,
  isSaving = false,
  onSaveNew,
  onOpenInEditor,
  onAppend,
}: ImportQuizzModalProps) => {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [selectedFilename, setSelectedFilename] = useState("")
  const [subject, setSubject] = useState("")
  const [parsedResult, setParsedResult] = useState<QuizzImportResult | null>(
    null,
  )

  const resetModal = () => {
    setIsDragging(false)
    setSelectedFilename("")
    setSubject("")
    setParsedResult(null)
  }

  const handleDownloadExcelTemplate = async () => {
    try {
      const bytes = await buildExcelTemplateBytes()
      downloadBytesAsFile(bytes, "quiz-template.xlsx", XLSX_MIME_TYPE)
    } catch {
      toast.error(t("errors:route.description"))
    }
  }

  const handleDownloadJsonTemplate = () => {
    downloadTextAsFile(
      buildJsonTemplateString(),
      "quiz-template.json",
      "application/json",
    )
  }

  const processSelectedFile = async (file: File) => {
    setSelectedFilename(file.name)
    const buffer = await file.arrayBuffer()
    const parsed = await parseImportedQuizzFile(
      file.name,
      new Uint8Array(buffer),
    )
    setParsedResult(parsed)
    setSubject(parsed.subject)
  }

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]

    if (file) {
      void processSelectedFile(file)
    }

    event.target.value = ""
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    const file = event.dataTransfer.files[0] as File | undefined

    if (file) {
      void processSelectedFile(file)
    }
  }

  const buildCurrentQuizz = (): Quizz | null => {
    if (!parsedResult || parsedResult.questions.length === 0) {
      return null
    }

    const cleanSubject =
      subject.trim().length > 0 ? subject.trim() : parsedResult.subject

    return {
      gameMode: parsedResult.gameMode,
      subject: cleanSubject,
      questions: parsedResult.questions,
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
    if (!parsedResult || parsedResult.questions.length === 0 || !onAppend) {
      return
    }

    const cleanSubject =
      subject.trim().length > 0 ? subject.trim() : parsedResult.subject

    onAppend(parsedResult.questions, cleanSubject)
    toast.success(
      t("manager:importModal.appendedToast", {
        count: parsedResult.questions.length,
      }),
    )
    setOpen(false)
    resetModal()
  }

  const validQuestions = parsedResult?.questions ?? []
  const rowErrors = parsedResult?.errors ?? []

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
        <RadixDialog.Content className="bg-background fixed top-1/2 left-1/2 z-50 flex max-h-[90svh] w-[calc(100%-1.5rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl p-5 shadow-xl">
          <RadixDialog.Title className="text-foreground text-lg font-bold">
            {mode === "append"
              ? t("manager:importModal.appendTitle")
              : t("manager:importModal.title")}
          </RadixDialog.Title>
          <RadixDialog.Description className="text-muted-foreground mt-1 text-xs">
            {t("manager:importModal.subtitle")}
          </RadixDialog.Description>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleDownloadExcelTemplate()}
              className="border-primary/30 bg-primary/10 text-primary hover:bg-primary/15 flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors"
            >
              <FileSpreadsheet className="size-4 shrink-0" />
              {t("manager:importModal.downloadExcelTemplate")}
            </button>
            <button
              type="button"
              onClick={handleDownloadJsonTemplate}
              className="border-accent bg-muted/60 text-foreground hover:bg-accent flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors"
            >
              <FileJson className="size-4 shrink-0" />
              {t("manager:importModal.downloadJsonTemplate")}
            </button>
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault()
              setIsDragging(true)
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={clsx(
              "mt-3 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors",
              isDragging
                ? "border-primary bg-primary/10"
                : "border-accent bg-muted/30 hover:border-primary/50 hover:bg-muted/60",
            )}
          >
            <Upload className="text-primary mb-1.5 size-6" />
            <p className="text-foreground text-sm font-semibold">
              {selectedFilename || t("manager:importModal.dropzoneTitle")}
            </p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {t("manager:importModal.dropzoneHint")}
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.csv,.json"
              className="hidden"
              onChange={handleFileInput}
            />
          </div>

          {parsedResult && (
            <div className="mt-3 flex min-h-0 flex-1 flex-col gap-2.5 overflow-auto pr-0.5">
              {mode === "create" && validQuestions.length > 0 && (
                <div className="flex flex-col gap-1">
                  <label className="text-foreground text-xs font-semibold">
                    {t("manager:importModal.subjectLabel")}
                  </label>
                  <Input
                    variant="sm"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder={t("manager:importModal.subjectLabel")}
                  />
                </div>
              )}

              {validQuestions.length > 0 && (
                <div className="border-primary/25 bg-primary/5 rounded-lg border p-2.5">
                  <div className="text-primary flex items-center gap-1.5 text-xs font-bold">
                    <CheckCircle2 className="size-4 shrink-0" />
                    {t("manager:importModal.validCount", {
                      count: validQuestions.length,
                    })}
                  </div>
                  <ul className="mt-1.5 max-h-28 space-y-1 overflow-auto text-xs">
                    {validQuestions.slice(0, 6).map((q, idx) => (
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

              {rowErrors.length > 0 && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800">
                    <AlertTriangle className="size-4 shrink-0" />
                    {t("manager:importModal.errorsTitle", {
                      count: rowErrors.length,
                    })}
                  </div>
                  <ul className="mt-1.5 max-h-28 space-y-1 overflow-auto text-xs text-amber-900">
                    {rowErrors.map((err, idx) => (
                      <li key={`${err.row}-${idx}`}>
                        <span className="font-semibold">
                          {t("manager:importModal.rowPrefix", {
                            row: err.row,
                          })}
                        </span>{" "}
                        {err.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <RadixDialog.Close asChild>
              <Button
                type="button"
                size="sm"
                className="bg-accent text-accent-foreground px-3.5 py-2 text-xs"
              >
                {t("common:cancel")}
              </Button>
            </RadixDialog.Close>

            {mode === "create" ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  className="bg-accent text-accent-foreground px-3.5 py-2 text-xs"
                  disabled={validQuestions.length === 0}
                  onClick={handleOpenEditor}
                >
                  <FolderOpen className="size-3.5" />
                  {t("manager:importModal.openInEditor")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="px-4 py-2 text-xs"
                  disabled={validQuestions.length === 0 || isSaving}
                  onClick={handleSaveDirectly}
                >
                  {t("manager:importModal.saveNow")}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                size="sm"
                className="px-4 py-2 text-xs"
                disabled={validQuestions.length === 0}
                onClick={handleAppendQuestions}
              >
                {t("manager:importModal.appendButton")}
              </Button>
            )}
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}

export default ImportQuizzModal
