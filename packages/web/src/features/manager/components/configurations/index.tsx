import { SESSION_ROLES } from "@razzia/common/constants"
import Card from "@razzia/web/components/Card"
import LanguageSwitcher from "@razzia/web/components/LanguageSwitcher"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import ChangePasswordModal from "@razzia/web/features/manager/components/configurations/ChangePasswordModal"
import ConfigManageQuizz from "@razzia/web/features/manager/components/configurations/ConfigManageQuizz"
import ConfigResults from "@razzia/web/features/manager/components/configurations/ConfigResults"
import ConfigSelectQuizz from "@razzia/web/features/manager/components/configurations/ConfigSelectQuizz"
import ConfigTabButton from "@razzia/web/features/manager/components/configurations/ConfigTabButton"
import ConfigUsers from "@razzia/web/features/manager/components/configurations/ConfigUsers"
import { managerLogout } from "@razzia/web/features/manager/queries"
import {
  getAccountProfile,
  isAdminSession,
  setToken,
} from "@razzia/web/lib/session"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { LogOut } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

const baseTabs = [
  {
    nameKey: "manager:tabs.play",
    component: ConfigSelectQuizz,
  },
  {
    nameKey: "manager:tabs.quizz",
    component: ConfigManageQuizz,
  },
  {
    nameKey: "manager:tabs.results",
    component: ConfigResults,
  },
]

const adminTabs = [
  ...baseTabs,
  {
    nameKey: "manager:tabs.users",
    component: ConfigUsers,
  },
]

const Configurations = () => {
  const [selectedTab, setSelectedTab] = useState(0)
  const { resetManager } = useManagerStore()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const isAdmin = isAdminSession()
  const profile = getAccountProfile()
  const tabs = isAdmin ? adminTabs : baseTabs
  const safeTabIndex = selectedTab < tabs.length ? selectedTab : 0
  const TabComponent = tabs[safeTabIndex].component

  const handleSelect = (index: number) => () => {
    setSelectedTab(index)
  }

  const { mutate: logout } = useMutation({
    mutationFn: managerLogout,
    onSuccess: (session) => setToken(session.token),
    onSettled: () => {
      queryClient.clear()
      resetManager()
      navigate({ to: "/manager" })
    },
  })

  return (
    <Card className="max-h-140 w-full max-w-lg">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-foreground text-lg leading-tight font-semibold">
            {t("manager:configurationsTitle")}
          </p>
          {profile?.displayName && (
            <div className="mt-0.5 flex items-center gap-1.5">
              <span className="text-muted-foreground truncate text-xs font-medium">
                {profile.displayName}
              </span>
              <span className="bg-primary/15 text-primary shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold">
                {profile.role === SESSION_ROLES.ADMIN
                  ? t("manager:roles.admin")
                  : t("manager:roles.manager")}
              </span>
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {profile?.username && <ChangePasswordModal />}
          <LanguageSwitcher />
          <button
            type="button"
            className="text-muted-foreground hover:bg-accent hover:text-accent-foreground rounded-sm p-1.5"
            onClick={() => logout()}
            title={t("manager:logout")}
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
      <div className="bg-muted flex shrink-0 overflow-hidden rounded-lg">
        {tabs.map((tab, index) => (
          <ConfigTabButton
            key={tab.nameKey}
            className="px-2 text-sm"
            active={index === safeTabIndex}
            onClick={handleSelect(index)}
          >
            {t(tab.nameKey)}
          </ConfigTabButton>
        ))}
      </div>
      <hr className="text-muted my-3.5 border" />
      <div className="flex min-h-0 flex-1 flex-col">
        <TabComponent />
      </div>
    </Card>
  )
}

export default Configurations
