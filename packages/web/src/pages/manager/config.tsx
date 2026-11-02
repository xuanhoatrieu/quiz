import Background from "@razzia/web/components/Background"
import Configurations from "@razzia/web/features/manager/components/configurations"
import { isManagerSession } from "@razzia/web/lib/session"
import { createFileRoute, redirect } from "@tanstack/react-router"

const ManagerConfigPage = () => (
  <Background>
    <Configurations />
  </Background>
)

export const Route = createFileRoute("/manager/config")({
  beforeLoad: () => {
    if (!isManagerSession()) {
      // oxlint-disable-next-line typescript/only-throw-error
      throw redirect({ to: "/manager" })
    }
  },
  component: ManagerConfigPage,
})
