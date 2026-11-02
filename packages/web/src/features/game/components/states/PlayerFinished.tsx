import type { CommonStatusDataMap } from "@razzia/common/types/game/status"
import { usePlayerStore } from "@razzia/web/features/game/stores/player"
import clsx from "clsx"
import { useTranslation } from "react-i18next"

interface Props {
  data: CommonStatusDataMap["FINISHED"]
}

const medalStyles: Record<number, string> = {
  1: "bg-yellow-500 border-yellow-600",
  2: "bg-gray-400 border-gray-200",
  3: "bg-amber-700 border-amber-800",
}

const PlayerFinished = ({ data: { rank, subject } }: Props) => {
  const { player } = usePlayerStore()
  const { t } = useTranslation()
  const isTopThree = typeof rank === "number" && rank >= 1 && rank <= 3

  return (
    <section className="anim-show my-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-3 px-4 py-6 text-center">
      {isTopThree && (
        <div
          className={clsx(
            "flex size-20 items-center justify-center rounded-full border-6 text-4xl font-extrabold text-white shadow-xl sm:size-24 sm:text-5xl",
            medalStyles[rank],
          )}
        >
          {rank}
        </div>
      )}

      <p className="text-sm font-bold tracking-widest text-white/90 uppercase drop-shadow-md sm:text-base">
        {t("game:finishedTitle")}
      </p>

      <h2 className="text-center text-2xl font-bold text-white drop-shadow-lg sm:text-4xl md:text-5xl">
        {subject}
      </h2>

      <p className="text-center text-2xl font-bold text-white drop-shadow-lg sm:text-3xl md:text-4xl">
        {typeof rank === "number"
          ? `${t("game:resultTop")}${t("game:rank", { count: rank, ordinal: true })}`
          : "—"}
      </p>

      <p className="mt-1 rounded-xl bg-black/40 px-6 py-2.5 text-xl font-bold text-white shadow-lg sm:text-2xl">
        {player?.points ?? 0} {t("game:pointsUnit")}
      </p>

      <p className="mt-2 max-w-md rounded-xl bg-white/15 px-4 py-2.5 text-base font-medium text-white drop-shadow-md sm:text-lg">
        {t(
          isTopThree
            ? "game:finishedEncourageTop"
            : "game:finishedEncourageOther",
        )}
      </p>
    </section>
  )
}

export default PlayerFinished
