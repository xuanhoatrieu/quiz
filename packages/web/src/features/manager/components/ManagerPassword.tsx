import Button from "@razzia/web/components/Button"
import Card from "@razzia/web/components/Card"
import Input from "@razzia/web/components/Input"
import ConfigTabButton from "@razzia/web/features/manager/components/configurations/ConfigTabButton"
import { type SubmitEvent, useState } from "react"
import { useTranslation } from "react-i18next"

interface LoginInput {
  username: string
  password: string
}

interface RegisterInput {
  username: string
  displayName: string
  password: string
  inviteCode: string
}

interface Props {
  inviteEnabled: boolean
  onLogin: (input: LoginInput) => void
  onRegister: (input: RegisterInput) => void
  disabled?: boolean
}

const ManagerPassword = ({
  inviteEnabled,
  onLogin,
  onRegister,
  disabled,
}: Props) => {
  const [mode, setMode] = useState<"login" | "register">("login")
  const [username, setUsername] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [password, setPassword] = useState("")
  const [inviteCode, setInviteCode] = useState("")
  const { t } = useTranslation()

  const activeMode = inviteEnabled ? mode : "login"

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (disabled) {
      return
    }

    if (activeMode === "register") {
      onRegister({
        username,
        displayName,
        password,
        inviteCode,
      })

      return
    }

    onLogin({
      username,
      password,
    })
  }

  return (
    <Card className="max-w-sm">
      {inviteEnabled ? (
        <div className="bg-muted mb-4 flex shrink-0 overflow-hidden rounded-lg">
          <ConfigTabButton
            type="button"
            active={activeMode === "login"}
            onClick={() => setMode("login")}
          >
            {t("manager:auth.loginTab")}
          </ConfigTabButton>
          <ConfigTabButton
            type="button"
            active={activeMode === "register"}
            onClick={() => setMode("register")}
          >
            {t("manager:auth.registerTab")}
          </ConfigTabButton>
        </div>
      ) : (
        <p className="text-foreground mb-3 text-center text-lg font-semibold">
          {t("manager:auth.loginTitle")}
        </p>
      )}

      <form className="flex flex-col gap-2.5" onSubmit={handleSubmit}>
        <Input
          variant="sm"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder={t("manager:auth.usernamePlaceholder")}
        />

        {activeMode === "register" && (
          <Input
            variant="sm"
            autoComplete="name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={t("manager:auth.displayNamePlaceholder")}
          />
        )}

        <Input
          variant="sm"
          type="password"
          autoComplete={
            activeMode === "register" ? "new-password" : "current-password"
          }
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={
            activeMode === "register"
              ? t("manager:auth.passwordMinPlaceholder")
              : t("manager:passwordPlaceholder")
          }
        />

        {activeMode === "register" && (
          <Input
            variant="sm"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            placeholder={t("manager:auth.inviteCodePlaceholder")}
          />
        )}

        <Button className="mt-1.5" type="submit" disabled={disabled}>
          {activeMode === "register"
            ? t("manager:auth.registerSubmit")
            : t("manager:auth.loginSubmit")}
        </Button>
      </form>
    </Card>
  )
}

export default ManagerPassword
