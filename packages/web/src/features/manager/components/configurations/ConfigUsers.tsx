import { SESSION_ROLES } from "@razzia/common/constants"
import type { AccountRole, UserSummary } from "@razzia/common/types/auth"
import AlertDialog from "@razzia/web/components/AlertDialog"
import Button from "@razzia/web/components/Button"
import Input from "@razzia/web/components/Input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@razzia/web/components/Select"
import { SkeletonRows } from "@razzia/web/components/Skeleton"
import Switch from "@razzia/web/components/Switch"
import {
  adminAiQuery,
  adminCreateUser,
  adminDeleteUser,
  adminFetchAiModels,
  adminInviteQuery,
  adminKeys,
  adminUpdateAi,
  adminUpdateInvite,
  adminUpdateUser,
  adminUsersQuery,
  aiKeys,
} from "@razzia/web/features/manager/queries"
import { ApiError } from "@razzia/web/lib/api"
import { getClientId } from "@razzia/web/lib/session"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  ChevronDown,
  ChevronUp,
  Copy,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  UserCheck,
  UserX,
} from "lucide-react"
import { Dialog as RadixDialog } from "radix-ui"
import { type SubmitEvent, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

const ConfigUsers = () => {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const currentUserId = getClientId()

  const { data: usersData, isPending: usersPending } =
    useQuery(adminUsersQuery())
  const { data: inviteData } = useQuery(adminInviteQuery())
  const { data: aiData } = useQuery(adminAiQuery())

  const [inviteDraft, setInviteDraft] = useState<{
    enabled?: boolean
    code?: string
  }>({})
  const inviteEnabled = inviteDraft.enabled ?? inviteData?.enabled ?? false
  const inviteCode = inviteDraft.code ?? inviteData?.code ?? ""

  const [aiExpanded, setAiExpanded] = useState(false)
  const [aiDraft, setAiDraft] = useState<{
    enabled?: boolean
    baseUrl?: string
    apiKey?: string
    model?: string
  }>({})
  const [loadedModels, setLoadedModels] = useState<string[]>([])

  const aiEnabled = aiDraft.enabled ?? aiData?.enabled ?? false
  const aiBaseUrl = aiDraft.baseUrl ?? aiData?.baseUrl ?? ""
  const aiApiKey = aiDraft.apiKey ?? ""
  const aiModel = aiDraft.model ?? aiData?.model ?? "gemini-3-flash-preview"

  const [createOpen, setCreateOpen] = useState(false)
  const [newUsername, setNewUsername] = useState("")
  const [newDisplayName, setNewDisplayName] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [newRole, setNewRole] = useState<AccountRole>(SESSION_ROLES.MANAGER)

  const [resetTarget, setResetTarget] = useState<UserSummary | null>(null)
  const [resetPasswordValue, setResetPasswordValue] = useState("")

  const onError = (error: unknown) => {
    toast.error(
      t(error instanceof ApiError ? error.key : "errors:route.description"),
    )
  }

  const invalidateUsers = () =>
    queryClient.invalidateQueries({ queryKey: adminKeys.users })

  const invalidateInvite = () => {
    queryClient.invalidateQueries({ queryKey: adminKeys.invite })
    queryClient.invalidateQueries({ queryKey: adminKeys.inviteStatus })
  }

  const invalidateAi = () => {
    queryClient.invalidateQueries({ queryKey: adminKeys.ai })
    queryClient.invalidateQueries({ queryKey: aiKeys.status })
  }

  const saveAiMutation = useMutation({
    mutationFn: adminUpdateAi,
    onSuccess: (updated) => {
      setAiDraft({
        enabled: updated.enabled,
        baseUrl: updated.baseUrl,
        model: updated.model,
        apiKey: "",
      })
      invalidateAi()
      toast.success(t("manager:admin.aiSaved"))
    },
    onError,
  })

  const fetchModelsMutation = useMutation({
    mutationFn: adminFetchAiModels,
    onSuccess: (res) => {
      setLoadedModels(res.models)

      if (res.models.length > 0 && !res.models.includes(aiModel)) {
        setAiDraft((prev) => ({ ...prev, model: res.models[0] }))
      }

      toast.success(
        t("manager:admin.aiModelsLoaded", { count: res.models.length }),
      )
    },
    onError,
  })

  const saveInviteMutation = useMutation({
    mutationFn: adminUpdateInvite,
    onSuccess: (updated) => {
      setInviteDraft({ enabled: updated.enabled, code: updated.code })
      invalidateInvite()
      toast.success(t("manager:admin.inviteSaved"))
    },
    onError,
  })

  const createUserMutation = useMutation({
    mutationFn: adminCreateUser,
    onSuccess: () => {
      invalidateUsers()
      toast.success(t("manager:admin.userCreated"))
      setNewUsername("")
      setNewDisplayName("")
      setNewPassword("")
      setNewRole(SESSION_ROLES.MANAGER)
      setCreateOpen(false)
    },
    onError,
  })

  const updateUserMutation = useMutation({
    mutationFn: adminUpdateUser,
    onSuccess: () => {
      invalidateUsers()
      toast.success(t("manager:admin.userUpdated"))
      setResetTarget(null)
      setResetPasswordValue("")
    },
    onError,
  })

  const deleteUserMutation = useMutation({
    mutationFn: adminDeleteUser,
    onSuccess: () => {
      invalidateUsers()
      toast.success(t("manager:admin.userDeleted"))
    },
    onError,
  })

  const handleCopyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteCode)
      toast.success(t("manager:admin.inviteCopied"))
    } catch {
      /* Clipboard unavailable */
    }
  }

  const handleToggleInvite = (checked: boolean) => {
    setInviteDraft((prev) => ({ ...prev, enabled: checked }))
    saveInviteMutation.mutate({
      enabled: checked,
      ...(inviteCode.trim() ? { code: inviteCode.trim() } : {}),
    })
  }

  const handleSaveInviteCode = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    saveInviteMutation.mutate({
      enabled: inviteEnabled,
      ...(inviteCode.trim() ? { code: inviteCode.trim() } : {}),
    })
  }

  const handleToggleAi = (checked: boolean) => {
    setAiDraft((prev) => ({ ...prev, enabled: checked }))
    saveAiMutation.mutate({
      enabled: checked,
      baseUrl: aiBaseUrl.trim(),
      ...(aiApiKey.trim().length > 0 ? { apiKey: aiApiKey.trim() } : {}),
      model: aiModel.trim(),
    })
  }

  const handleSaveAi = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    saveAiMutation.mutate({
      enabled: aiEnabled,
      baseUrl: aiBaseUrl.trim(),
      ...(aiApiKey.trim().length > 0 ? { apiKey: aiApiKey.trim() } : {}),
      model: aiModel.trim(),
    })
  }

  const handleFetchAiModels = () => {
    fetchModelsMutation.mutate({
      ...(aiBaseUrl.trim().length > 0 ? { baseUrl: aiBaseUrl.trim() } : {}),
      ...(aiApiKey.trim().length > 0 ? { apiKey: aiApiKey.trim() } : {}),
    })
  }

  const handleCreateUser = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    createUserMutation.mutate({
      username: newUsername,
      displayName: newDisplayName,
      password: newPassword,
      role: newRole,
    })
  }

  const handleResetPassword = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!resetTarget) {
      return
    }

    updateUserMutation.mutate({
      id: resetTarget.id,
      json: { password: resetPasswordValue },
    })
  }

  const users = usersData?.users ?? []

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <form
        onSubmit={handleSaveInviteCode}
        className="border-accent bg-muted/40 flex shrink-0 flex-col gap-2 rounded-lg border p-2.5"
      >
        <div className="flex items-center justify-between">
          <span className="text-foreground text-xs font-semibold">
            {t("manager:admin.inviteTitle")}
          </span>
          <Switch
            checked={inviteEnabled}
            onCheckedChange={handleToggleInvite}
          />
        </div>
        <div className="flex gap-1.5">
          <Input
            variant="sm"
            className="min-w-0 flex-1 py-1.5 text-xs"
            value={inviteCode}
            onChange={(e) =>
              setInviteDraft((prev) => ({ ...prev, code: e.target.value }))
            }
            placeholder={t("manager:auth.inviteCodePlaceholder")}
          />
          <button
            type="button"
            onClick={handleCopyInvite}
            title={t("manager:admin.inviteCopied")}
            className="border-accent text-accent-foreground hover:bg-accent rounded-lg border px-2.5"
          >
            <Copy className="size-3.5" />
          </button>
          <Button
            type="submit"
            size="sm"
            className="px-3 py-1.5 text-xs"
            disabled={saveInviteMutation.isPending}
          >
            {t("manager:admin.saveInvite")}
          </Button>
        </div>
      </form>

      <form
        onSubmit={handleSaveAi}
        className="border-accent bg-muted/40 flex shrink-0 flex-col gap-2 rounded-lg border p-2.5"
      >
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setAiExpanded((prev) => !prev)}
            className="text-foreground flex min-w-0 flex-1 items-center gap-1.5 text-left text-xs font-semibold"
          >
            <Sparkles className="text-primary size-3.5 shrink-0" />
            <span className="truncate">{t("manager:admin.aiTitle")}</span>
            {aiData?.model && (
              <span className="bg-primary/10 text-primary hidden truncate rounded-full px-2 py-0.5 text-[10px] font-bold sm:inline">
                {aiModel}
              </span>
            )}
            {aiExpanded ? (
              <ChevronUp className="text-muted-foreground size-3.5 shrink-0" />
            ) : (
              <ChevronDown className="text-muted-foreground size-3.5 shrink-0" />
            )}
          </button>

          <Switch checked={aiEnabled} onCheckedChange={handleToggleAi} />
        </div>

        {aiExpanded && (
          <div className="flex flex-col gap-1.5 pt-1">
            <Input
              variant="sm"
              className="py-1.5 text-xs"
              value={aiBaseUrl}
              onChange={(e) =>
                setAiDraft((prev) => ({ ...prev, baseUrl: e.target.value }))
              }
              placeholder={t("manager:admin.aiBaseUrlPlaceholder")}
            />
            <Input
              variant="sm"
              type="password"
              autoComplete="off"
              className="py-1.5 text-xs"
              value={aiApiKey}
              onChange={(e) =>
                setAiDraft((prev) => ({ ...prev, apiKey: e.target.value }))
              }
              placeholder={
                aiData?.hasApiKey
                  ? t("manager:admin.aiApiKeyConfigured", {
                      masked: aiData.apiKeyMasked,
                    })
                  : t("manager:admin.aiApiKeyPlaceholder")
              }
            />
            <div className="flex gap-1.5">
              {loadedModels.length > 0 ? (
                <Select
                  value={aiModel}
                  onValueChange={(val) =>
                    setAiDraft((prev) => ({ ...prev, model: val }))
                  }
                >
                  <SelectTrigger
                    aria-label={t("manager:admin.aiModelPlaceholder")}
                    className="min-w-0 flex-1 py-1.5 text-xs"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(!loadedModels.includes(aiModel)
                      ? [aiModel, ...loadedModels]
                      : loadedModels
                    ).map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  variant="sm"
                  className="min-w-0 flex-1 py-1.5 text-xs"
                  value={aiModel}
                  onChange={(e) =>
                    setAiDraft((prev) => ({ ...prev, model: e.target.value }))
                  }
                  placeholder={t("manager:admin.aiModelPlaceholder")}
                />
              )}

              <button
                type="button"
                onClick={handleFetchAiModels}
                disabled={fetchModelsMutation.isPending}
                title={t("manager:admin.aiFetchModels")}
                className="border-accent text-accent-foreground hover:bg-accent flex shrink-0 items-center gap-1 rounded-lg border px-2.5 text-xs font-medium"
              >
                {fetchModelsMutation.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
              </button>

              <Button
                type="submit"
                size="sm"
                className="shrink-0 px-3 py-1.5 text-xs"
                disabled={saveAiMutation.isPending}
              >
                {t("manager:admin.aiSave")}
              </Button>
            </div>
          </div>
        )}
      </form>

      <div className="flex shrink-0">
        <RadixDialog.Root open={createOpen} onOpenChange={setCreateOpen}>
          <RadixDialog.Trigger asChild>
            <Button size="sm" className="w-full py-2 text-sm">
              <Plus className="size-4" />
              {t("manager:admin.createUser")}
            </Button>
          </RadixDialog.Trigger>

          <RadixDialog.Portal>
            <RadixDialog.Overlay className="data-[state=open]:animate-fade fixed inset-0 z-50 bg-black/40" />
            <RadixDialog.Content className="bg-background fixed top-1/2 left-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl p-6 shadow-xl">
              <RadixDialog.Title className="text-foreground text-lg font-semibold">
                {t("manager:admin.createUser")}
              </RadixDialog.Title>

              <form
                className="mt-4 flex flex-col gap-2.5"
                onSubmit={handleCreateUser}
              >
                <Input
                  variant="sm"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder={t("manager:auth.usernamePlaceholder")}
                />
                <Input
                  variant="sm"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  placeholder={t("manager:auth.displayNamePlaceholder")}
                />
                <Input
                  variant="sm"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={t("manager:auth.passwordMinPlaceholder")}
                />
                <Select
                  value={newRole}
                  onValueChange={(value) => setNewRole(value as AccountRole)}
                >
                  <SelectTrigger aria-label={t("manager:admin.roleLabel")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SESSION_ROLES.MANAGER}>
                      {t("manager:roles.manager")}
                    </SelectItem>
                    <SelectItem value={SESSION_ROLES.ADMIN}>
                      {t("manager:roles.admin")}
                    </SelectItem>
                  </SelectContent>
                </Select>

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
                    disabled={createUserMutation.isPending}
                  >
                    {t("common:confirm")}
                  </Button>
                </div>
              </form>
            </RadixDialog.Content>
          </RadixDialog.Portal>
        </RadixDialog.Root>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-auto p-0.5">
        {usersPending && <SkeletonRows className="h-14" />}

        {users.map((user) => {
          const isSelf = user.id === currentUserId

          return (
            <div
              key={user.id}
              className="border-accent flex items-center justify-between gap-2 rounded-md border-2 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-foreground truncate text-sm font-semibold">
                    {user.displayName}
                  </p>
                  <span
                    className={
                      user.role === SESSION_ROLES.ADMIN
                        ? "bg-primary/15 text-primary shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold"
                        : "bg-muted text-muted-foreground shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    }
                  >
                    {user.role === SESSION_ROLES.ADMIN
                      ? t("manager:roles.admin")
                      : t("manager:roles.manager")}
                  </span>
                  {!user.active && (
                    <span className="shrink-0 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-bold text-red-600">
                      {t("manager:admin.inactive")}
                    </span>
                  )}
                </div>
                <p className="text-muted-foreground truncate text-xs">
                  @{user.username}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setResetTarget(user)
                    setResetPasswordValue("")
                  }}
                  title={t("manager:admin.resetPassword")}
                  className="text-accent-foreground hover:bg-accent-foreground/10 rounded-sm p-1.5"
                >
                  <KeyRound className="size-4" />
                </button>

                {!isSelf && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        updateUserMutation.mutate({
                          id: user.id,
                          json: { active: !user.active },
                        })
                      }
                      title={
                        user.active
                          ? t("manager:admin.deactivate")
                          : t("manager:admin.activate")
                      }
                      className="text-accent-foreground hover:bg-accent-foreground/10 rounded-sm p-1.5"
                    >
                      {user.active ? (
                        <UserX className="size-4" />
                      ) : (
                        <UserCheck className="text-primary size-4" />
                      )}
                    </button>

                    <AlertDialog
                      trigger={
                        <button
                          type="button"
                          className="rounded-sm p-1.5 hover:bg-red-600/10"
                          title={t("common:delete")}
                        >
                          <Trash2 className="size-4 stroke-red-500" />
                        </button>
                      }
                      title={t("common:delete")}
                      description={t("manager:admin.deleteConfirm", {
                        name: `${user.displayName} (@${user.username})`,
                      })}
                      confirmLabel={t("common:delete")}
                      onConfirm={() => deleteUserMutation.mutate(user.id)}
                    />
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <RadixDialog.Root
        open={Boolean(resetTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setResetTarget(null)
            setResetPasswordValue("")
          }
        }}
      >
        <RadixDialog.Portal>
          <RadixDialog.Overlay className="data-[state=open]:animate-fade fixed inset-0 z-50 bg-black/40" />
          <RadixDialog.Content className="bg-background fixed top-1/2 left-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl p-6 shadow-xl">
            <RadixDialog.Title className="text-foreground text-lg font-semibold">
              {t("manager:admin.resetPassword")}
            </RadixDialog.Title>
            {resetTarget && (
              <RadixDialog.Description className="text-muted-foreground mt-1 text-xs">
                {resetTarget.displayName} (@{resetTarget.username})
              </RadixDialog.Description>
            )}

            <form
              className="mt-4 flex flex-col gap-3"
              onSubmit={handleResetPassword}
            >
              <Input
                variant="sm"
                type="password"
                value={resetPasswordValue}
                onChange={(e) => setResetPasswordValue(e.target.value)}
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
                  disabled={updateUserMutation.isPending}
                >
                  {t("common:confirm")}
                </Button>
              </div>
            </form>
          </RadixDialog.Content>
        </RadixDialog.Portal>
      </RadixDialog.Root>
    </div>
  )
}

export default ConfigUsers
