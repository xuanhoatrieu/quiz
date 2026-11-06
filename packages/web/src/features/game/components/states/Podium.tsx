import type { ManagerStatusDataMap } from "@razzia/common/types/game/status"
import { SFX } from "@razzia/web/features/game/utils/constants"
import useScreenSize from "@razzia/web/hooks/useScreenSize"
import clsx from "clsx"
import { useEffect, useState } from "react"
import ReactConfetti from "react-confetti"
import useSound from "use-sound"

interface Props {
  data: ManagerStatusDataMap["FINISHED"]
}

const SUSPENSE_MIN_PLAYERS = 3
const SUSPENSE_SPOTLIGHT_STEP = 3

const usePodiumAnimation = (topLength: number) => {
  const hasSuspense = topLength >= SUSPENSE_MIN_PLAYERS
  const [apparition, setApparition] = useState(() => (hasSuspense ? 0 : 4))

  const [sfxtThree] = useSound(SFX.PODIUM.THREE, { volume: 0.1 })
  const [sfxSecond] = useSound(SFX.PODIUM.SECOND, { volume: 0.1 })
  const [sfxRool, { stop: sfxRoolStop }] = useSound(SFX.PODIUM.SNEAR_ROOL, {
    volume: 0.1,
  })
  const [sfxFirst] = useSound(SFX.PODIUM.FIRST, { volume: 0.1 })

  useEffect(() => {
    const actions: Partial<Record<number, () => void>> = {
      4: () => {
        sfxRoolStop()
        sfxFirst()
      },
      3: sfxRool,
      2: sfxSecond,
      1: sfxtThree,
    }

    actions[apparition]?.()
  }, [apparition, sfxFirst, sfxSecond, sfxtThree, sfxRool, sfxRoolStop])

  useEffect(() => {
    if (apparition >= 4) {
      return
    }

    const interval = setInterval(() => {
      setApparition((value) => value + 1)
    }, 2000)

    return () => clearInterval(interval)
  }, [apparition, topLength])

  return { apparition, hasSuspense }
}

const medalColor = [
  {
    background: "bg-yellow-500",
    border: "border-yellow-600",
  },
  {
    background: "bg-gray-400",
    border: "border-gray-200",
  },
  {
    background: "bg-amber-700",
    border: "border-amber-800",
  },
]

const Medal = ({ rank }: { rank: number }) => {
  const color = medalColor[rank - 1]

  return (
    <div
      className={clsx(
        "relative flex aspect-square size-14 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 text-3xl font-extrabold text-white drop-shadow-sm sm:size-20 sm:border-6 sm:text-5xl md:size-24 md:border-8 md:text-6xl",
        color.background,
        color.border,
      )}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
        <div className="absolute top-[30%] left-1/2 h-5 w-[160%] -translate-x-1/2 -rotate-40 bg-white/25 sm:h-6" />
        <div className="absolute top-[70%] left-1/2 h-2.5 w-[160%] -translate-x-1/2 -rotate-40 bg-white/25 sm:h-3" />
      </div>
      <p
        className="relative z-10"
        style={{ textShadow: "2px 2px rgba(0,0,0, 0.25)" }}
      >
        {rank}
      </p>
    </div>
  )
}

const Podium = ({ data: { subject, top } }: Props) => {
  const { apparition, hasSuspense } = usePodiumAnimation(top.length)

  const { width, height } = useScreenSize()

  return (
    <>
      {apparition >= 4 && (
        <ReactConfetti
          width={width}
          height={height}
          className="pointer-events-none fixed inset-0 h-full w-full"
        />
      )}

      {hasSuspense && apparition >= SUSPENSE_SPOTLIGHT_STEP && (
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="spotlight"></div>
        </div>
      )}
      <section className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-between gap-4 px-2 pt-2">
        <h2 className="anim-show px-2 text-center text-2xl font-bold text-white drop-shadow-lg sm:text-3xl md:text-4xl lg:text-5xl">
          {subject}
        </h2>

        <div className="mt-auto flex w-full max-w-5xl items-end justify-center gap-2 overflow-x-visible overflow-y-hidden px-2 pt-8 sm:gap-4 sm:px-6">
          {top[1] && (
            <div
              className={clsx(
                "z-20 flex max-w-72 min-w-0 flex-1 translate-y-full flex-col items-center justify-end gap-2 opacity-0 transition-all duration-500 sm:gap-3",
                { "translate-y-0! opacity-100": apparition >= 2 },
              )}
            >
              <p
                className={clsx(
                  "w-full px-1 text-center text-sm leading-tight font-bold wrap-break-word whitespace-normal text-white drop-shadow-lg sm:text-xl md:text-2xl",
                  {
                    "anim-balanced": apparition >= 4,
                  },
                )}
              >
                {top[1].username}
              </p>
              <div className="bg-primary flex h-44 w-full flex-col items-center justify-start gap-2 rounded-t-2xl px-2 pt-4 text-center shadow-2xl sm:h-56 sm:gap-3 sm:pt-6 md:h-64">
                <Medal rank={2} />
                <p className="text-xl font-bold text-white drop-shadow-sm sm:text-3xl md:text-4xl">
                  {top[1].points}
                </p>
              </div>
            </div>
          )}

          {top[0] && (
            <div
              className={clsx(
                "z-30 flex max-w-80 min-w-0 flex-1 translate-y-full flex-col items-center justify-end gap-2 opacity-0 transition-all duration-500 sm:gap-3",
                {
                  "translate-y-0! opacity-100": apparition >= 3,
                },
                {
                  "max-w-64 sm:max-w-80": top.length < 2,
                },
              )}
            >
              <p
                className={clsx(
                  "w-full px-1 text-center text-base leading-tight font-bold wrap-break-word whitespace-normal text-white opacity-0 drop-shadow-lg sm:text-2xl md:text-3xl",
                  { "anim-balanced opacity-100": apparition >= 4 },
                )}
              >
                {top[0].username}
              </p>
              <div className="bg-primary flex h-54 w-full flex-col items-center justify-start gap-2 rounded-t-2xl px-2 pt-4 text-center shadow-2xl sm:h-68 sm:gap-3 sm:pt-6 md:h-80">
                <Medal rank={1} />
                <p className="text-2xl font-bold text-white drop-shadow-sm sm:text-3xl md:text-4xl">
                  {top[0].points}
                </p>
              </div>
            </div>
          )}

          {top[2] && (
            <div
              className={clsx(
                "z-10 flex max-w-72 min-w-0 flex-1 translate-y-full flex-col items-center justify-end gap-2 opacity-0 transition-all duration-500 sm:gap-3",
                {
                  "translate-y-0! opacity-100": apparition >= 1,
                },
              )}
            >
              <p
                className={clsx(
                  "w-full px-1 text-center text-sm leading-tight font-bold wrap-break-word whitespace-normal text-white drop-shadow-lg sm:text-xl md:text-2xl",
                  {
                    "anim-balanced": apparition >= 4,
                  },
                )}
              >
                {top[2].username}
              </p>
              <div className="bg-primary flex h-36 w-full flex-col items-center justify-start gap-2 rounded-t-2xl px-2 pt-3 text-center shadow-2xl sm:h-46 sm:gap-3 sm:pt-5 md:h-52">
                <Medal rank={3} />
                <p className="text-xl font-bold text-white drop-shadow-sm sm:text-3xl md:text-4xl">
                  {top[2].points}
                </p>
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  )
}

export default Podium
