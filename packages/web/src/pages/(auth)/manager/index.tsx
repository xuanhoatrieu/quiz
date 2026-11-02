import ManagerPassword from "@razzia/web/features/manager/components/ManagerPassword"
import {
  accountLogin,
  accountRegister,
  inviteStatusQuery,
} from "@razzia/web/features/manager/queries"
import { ApiError } from "@razzia/web/lib/api"
import { isManagerSession, setToken } from "@razzia/web/lib/session"
import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

const ManagerAuthPage = () => {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { data: inviteStatus } = useQuery(inviteStatusQuery())

  const handleSuccess = (session: { token: string }) => {
    setToken(session.token)
    navigate({ to: "/manager/config" })
  }

  const handleError = (error: unknown) => {
    toast.error(
      t(error instanceof ApiError ? error.key : "errors:route.description"),
    )
  }

  const loginMutation = useMutation({
    mutationFn: accountLogin,
    onSuccess: handleSuccess,
    onError: handleError,
  })

  const registerMutation = useMutation({
    mutationFn: accountRegister,
    onSuccess: (session) => {
      toast.success(t("manager:auth.registerSuccess"))
      handleSuccess(session)
    },
    onError: handleError,
  })

  return (
    <ManagerPassword
      inviteEnabled={Boolean(inviteStatus?.enabled)}
      onLogin={(data) => loginMutation.mutate(data)}
      onRegister={(data) => registerMutation.mutate(data)}
      disabled={loginMutation.isPending || registerMutation.isPending}
    />
  )
}

export const Route = createFileRoute("/(auth)/manager/")({
  beforeLoad: () => {
    if (isManagerSession()) {
      // oxlint-disable-next-line typescript/only-throw-error
      throw redirect({ to: "/manager/config" })
    }
  },
  component: ManagerAuthPage,
})
