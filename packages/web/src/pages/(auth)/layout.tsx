import Background from "@razzia/web/components/Background"
import LanguageSwitcher from "@razzia/web/components/LanguageSwitcher"
import {
  createFileRoute,
  Link,
  Outlet,
  useLocation,
} from "@tanstack/react-router"
import { Gamepad2, GraduationCap } from "lucide-react"
import { useTranslation } from "react-i18next"
import { z } from "zod"

const searchSchema = z.object({
  pin: z.coerce.string().optional(),
})

const AuthLayout = () => {
  const { pathname } = useLocation()
  const { t } = useTranslation()
  const isManagerPage = pathname.startsWith("/manager")

  return (
    <Background>
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
        <Link
          to={isManagerPage ? "/" : "/manager"}
          className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/90 backdrop-blur-sm transition-colors hover:bg-white/20"
        >
          {isManagerPage ? (
            <>
              <Gamepad2 className="size-3.5" />
              {t("manager:auth.playerPortal")}
            </>
          ) : (
            <>
              <GraduationCap className="size-3.5" />
              {t("manager:auth.teacherPortal")}
            </>
          )}
        </Link>
        <LanguageSwitcher />
      </div>
      <Outlet />
    </Background>
  )
}

export const Route = createFileRoute("/(auth)")({
  component: AuthLayout,
  validateSearch: searchSchema,
})
