import {
  exportQuizzToJsonString,
  exportQuizzToXlsxBytes,
} from "@razzia/common/quizz-io"
import type { Quizz } from "@razzia/common/types/game"
import AlertDialog from "@razzia/web/components/AlertDialog"
import Button from "@razzia/web/components/Button"
import { SkeletonRows } from "@razzia/web/components/Skeleton"
import AiGenerateModal from "@razzia/web/features/manager/components/AiGenerateModal"
import ImportQuizzModal, {
  downloadBytesAsFile,
  downloadTextAsFile,
  XLSX_MIME_TYPE,
} from "@razzia/web/features/manager/components/ImportQuizzModal"
import {
  aiStatusQuery,
  createQuizz,
  deleteQuizz,
  quizzKeys,
  quizzListQuery,
} from "@razzia/web/features/manager/queries"
import { useQuizzDraftStore } from "@razzia/web/features/quizz/stores/quizz-draft"
import { api, ApiError, unwrap } from "@razzia/web/lib/api"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import {
  Download,
  FileJson,
  FileSpreadsheet,
  Sparkles,
  SquarePen,
  Trash2,
  Upload,
} from "lucide-react"
import { DropdownMenu as RadixDropdown } from "radix-ui"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

const ConfigManageQuizz = () => {
  const { data, isPending } = useQuery(quizzListQuery())
  const { data: aiStatus } = useQuery(aiStatusQuery())
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const setDraft = useQuizzDraftStore((state) => state.setDraft)
  const { t } = useTranslation()

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: quizzKeys.all })

  const onError = (error: Error, fallback: string) => {
    toast.error(t(error instanceof ApiError ? error.key : fallback))
  }

  const { mutate: remove } = useMutation({
    mutationFn: deleteQuizz,
    onSuccess: () => {
      invalidate()
      toast.success(t("manager:quizz.deleted"))
    },
    onError: (error) => onError(error, "errors:quizz.failedToDelete"),
  })

  const { mutate: saveImportedQuizz, isPending: isSavingImport } = useMutation({
    mutationFn: createQuizz,
    onSuccess: () => {
      invalidate()
      toast.success(t("quizz:quizzSaved"))
    },
    onError: (error) => onError(error, "errors:quizz.failedToSave"),
  })

  const handleOpenInEditor = (draftQuizz: Quizz) => {
    setDraft(draftQuizz)
    void navigate({ to: "/manager/quizz" })
  }

  const handleCreateBlank = () => {
    setDraft(null)
    void navigate({ to: "/manager/quizz" })
  }

  const handleExportFormat = async (id: string, format: "xlsx" | "json") => {
    try {
      const { id: _id, ...quizzData } = await unwrap(
        api.quizz[":id"].$get({ param: { id } }),
      )

      if (format === "xlsx") {
        const bytes = await exportQuizzToXlsxBytes(quizzData)
        downloadBytesAsFile(bytes, `${quizzData.subject}.xlsx`, XLSX_MIME_TYPE)

        return
      }

      downloadTextAsFile(
        exportQuizzToJsonString(quizzData),
        `${quizzData.subject}.json`,
        "application/json",
      )
    } catch (error) {
      onError(error as Error, "errors:quizz.notFound")
    }
  }

  const quizz = data?.quizz ?? []

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4 flex shrink-0 gap-1.5">
        <Button className="min-w-0 flex-1 px-3" onClick={handleCreateBlank}>
          {t("manager:quizz.create")}
        </Button>

        {aiStatus?.enabled && (
          <AiGenerateModal
            mode="create"
            modelName={aiStatus.model}
            isSaving={isSavingImport}
            onSaveNew={(validated) => saveImportedQuizz(validated)}
            onOpenInEditor={handleOpenInEditor}
            trigger={
              <Button
                className="bg-accent text-primary hover:bg-primary/15 shrink-0 px-3 text-sm font-semibold"
                title={t("manager:aiModal.trigger")}
              >
                <Sparkles className="size-4" />
                <span className="hidden sm:inline">
                  {t("manager:aiModal.trigger")}
                </span>
              </Button>
            }
          />
        )}

        <ImportQuizzModal
          mode="create"
          isSaving={isSavingImport}
          onSaveNew={(validated) => saveImportedQuizz(validated)}
          onOpenInEditor={handleOpenInEditor}
          trigger={
            <Button
              className="bg-accent text-accent-foreground aspect-square shrink-0 px-3"
              title={t("manager:quizz.import")}
            >
              <Upload className="size-4" />
            </Button>
          }
        />
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-auto p-0.5">
        {isPending && <SkeletonRows className="h-12" />}

        {quizz.map((q) => (
          <div
            key={q.id}
            className="border-accent flex h-12 w-full items-center justify-between rounded-md border-2 p-3 pr-1.5"
          >
            <p className="text-foreground truncate font-medium">{q.subject}</p>
            <div className="flex gap-0.5">
              <button
                type="button"
                className="text-accent-foreground hover:bg-accent-foreground/10 rounded-sm p-2"
                title={t("manager:quizz.edit")}
                onClick={() =>
                  navigate({
                    to: "/manager/quizz/$quizzId",
                    params: { quizzId: q.id },
                  })
                }
              >
                <SquarePen className="size-4" />
              </button>

              <RadixDropdown.Root>
                <RadixDropdown.Trigger asChild>
                  <button
                    type="button"
                    className="text-accent-foreground hover:bg-accent-foreground/10 rounded-sm p-2"
                    title={t("manager:quizz.export")}
                  >
                    <Download className="size-4" />
                  </button>
                </RadixDropdown.Trigger>

                <RadixDropdown.Portal>
                  <RadixDropdown.Content
                    align="end"
                    sideOffset={4}
                    className="border-accent bg-background z-50 min-w-44 rounded-lg border p-1 shadow-lg"
                  >
                    <RadixDropdown.Item
                      onSelect={() => void handleExportFormat(q.id, "xlsx")}
                      className="text-foreground hover:bg-accent flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-xs font-medium outline-none"
                    >
                      <FileSpreadsheet className="text-primary size-4" />
                      {t("manager:quizz.exportExcel")}
                    </RadixDropdown.Item>
                    <RadixDropdown.Item
                      onSelect={() => void handleExportFormat(q.id, "json")}
                      className="text-foreground hover:bg-accent flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-xs font-medium outline-none"
                    >
                      <FileJson className="text-muted-foreground size-4" />
                      {t("manager:quizz.exportJson")}
                    </RadixDropdown.Item>
                  </RadixDropdown.Content>
                </RadixDropdown.Portal>
              </RadixDropdown.Root>

              <AlertDialog
                trigger={
                  <button
                    type="button"
                    className="rounded-sm p-2 hover:bg-red-600/10"
                    title={t("manager:quizz.delete")}
                  >
                    <Trash2 className="size-4 stroke-red-500" />
                  </button>
                }
                title={t("manager:quizz.delete")}
                description={t("manager:quizz.deleteConfirm", {
                  name: q.subject,
                })}
                confirmLabel={t("common:delete")}
                onConfirm={() => remove(q.id)}
              />
            </div>
          </div>
        ))}

        {!isPending && quizz.length === 0 && (
          <p className="text-muted-foreground my-8 text-center">
            {t("manager:quizz.none")}
          </p>
        )}
      </div>
    </div>
  )
}

export default ConfigManageQuizz
