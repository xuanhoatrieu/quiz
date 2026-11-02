import Button from "@razzia/web/components/Button"
import Input from "@razzia/web/components/Input"
import { changeAccountPassword } from "@razzia/web/features/manager/queries"
import { ApiError } from "@razzia/web/lib/api"
import { setToken } from "@razzia/web/lib/session"
import { useMutation } from "@tanstack/react-query"
import { KeyRound } from "lucide-react"
import { Dialog as RadixDialog } from "radix-ui"
import { type SubmitEvent, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

const ChangePasswordModal = () => {
  const [open, setOpen] = useState(false)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const { t } = useTranslation()

  const resetForm = () => {
    setCurrentPassword("")
    setNewPassword("")
  }

  const { mutate, isPending } = useMutation({
    mutationFn: changeAccountPassword,
    onSuccess: (session) => {
      setToken(session.token)
      toast.success(t("manager:account.passwordChanged"))
      resetForm()
      setOpen(false)
    },
    onError: (error) => {
      toast.error(
        t(error instanceof ApiError ? error.key : "errors:route.description"),
      )
    },
  })

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (isPending) {
      return
    }

    mutate({ currentPassword, newPassword })
  }

  return (
    <RadixDialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next)

        if (!next) {
          resetForm()
        }
      }}
    >
      <RadixDialog.Trigger asChild>
        <button
          type="button"
          className="text-muted-foreground hover:bg-accent hover:text-accent-foreground rounded-sm p-1.5"
          title={t("manager:account.changePassword")}
        >
          <KeyRound className="size-4" />
        </button>
      </RadixDialog.Trigger>

      <RadixDialog.Portal>
        <RadixDialog.Overlay className="data-[state=open]:animate-fade fixed inset-0 z-50 bg-black/40" />
        <RadixDialog.Content className="bg-background fixed top-1/2 left-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl p-6 shadow-xl">
          <RadixDialog.Title className="text-foreground text-lg font-semibold">
            {t("manager:account.changePassword")}
          </RadixDialog.Title>

          <form className="mt-4 flex flex-col gap-3" onSubmit={handleSubmit}>
            <Input
              variant="sm"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder={t("manager:account.currentPassword")}
            />
            <Input
              variant="sm"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={t("manager:account.newPassword")}
            />

            <div className="mt-2 flex justify-end gap-2">
              <RadixDialog.Close asChild>
                <Button
                  type="button"
                  size="sm"
                  className="bg-accent text-accent-foreground px-4 py-2"
                >
                  {t("common:cancel")}
                </Button>
              </RadixDialog.Close>
              <Button
                type="submit"
                size="sm"
                className="px-4 py-2"
                disabled={isPending}
              >
                {t("common:confirm")}
              </Button>
            </div>
          </form>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}

export default ChangePasswordModal
