import type { CommonStatusDataMap } from "@razzia/common/types/game/status"
import CricleCheck from "@razzia/web/features/game/components/icons/CricleCheck"
import CricleXmark from "@razzia/web/features/game/components/icons/CricleXmark"
import { usePlayerStore } from "@razzia/web/features/game/stores/player"
import { SFX } from "@razzia/web/features/game/utils/constants"
import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import useSound from "use-sound"

interface Props {
  data: CommonStatusDataMap["SHOW_RESULT"]
}

const Result = ({
  data: { correct, message, points, myPoints, rank, aheadOfMe },
}: Props) => {
  const { updatePlayer } = usePlayerStore()
  const { t } = useTranslation()

  const [sfxResults] = useSound(SFX.RESULTS_SOUND, {
    volume: 0.2,
  })

  useEffect(() => {
    updatePlayer(({ player }) => ({ player: { ...player, points: myPoints } }))

    sfxResults()
    // oxlint-disable-next-line
  }, [sfxResults])

  return (
    <section className="anim-show relative mx-auto my-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center px-4 py-4 text-center">
      {correct ? (
        <CricleCheck className="aspect-square max-h-32 w-auto sm:max-h-44 md:max-h-52" />
      ) : (
        <CricleXmark className="aspect-square max-h-32 w-auto sm:max-h-44 md:max-h-52" />
      )}
      <h2 className="mt-3 text-2xl font-bold text-white drop-shadow-lg sm:text-3xl md:text-4xl">
        {t(message)}
      </h2>
      <p className="mt-2 max-w-md rounded-xl bg-black/30 px-4 py-2 text-base font-medium text-white/95 drop-shadow-md sm:text-lg">
        {t(correct ? "game:correctEncourage" : "game:wrongEncourage")}
      </p>
      <p className="mt-3 text-lg font-bold text-white drop-shadow-lg sm:text-xl">
        {t("game:resultTop")}
        {t("game:rank", { count: rank, ordinal: true })}
        {aheadOfMe ? `${t("game:resultBehind")}${aheadOfMe}` : ""}
      </p>
      {correct && (
        <span className="mt-3 rounded-lg bg-black/40 px-4 py-2 text-xl font-bold text-white drop-shadow-lg sm:text-2xl">
          +{points} {t("game:pointsUnit")}
        </span>
      )}
    </section>
  )
}

export default Result
