import type { CommonStatusDataMap } from "@razzia/common/types/game/status"
import { ListChecks, Sparkles, Trophy, Users } from "lucide-react"
import { motion } from "motion/react"
import { useTranslation } from "react-i18next"

interface Props {
  data: CommonStatusDataMap["SUMMARY"]
}

const Summary = ({
  data: { subject, totalPlayers, totalQuestions, highlights },
}: Props) => {
  const { t } = useTranslation()

  const stats = [
    {
      icon: Users,
      value: totalPlayers,
      label: t("game:summary.participants"),
    },
    {
      icon: ListChecks,
      value: totalQuestions,
      label: t("game:summary.questions"),
    },
  ]

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center gap-8 px-4 py-6">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 24 }}
        className="flex flex-col items-center gap-3"
      >
        <div className="flex flex-col items-center gap-2">
          <p className="font-bold tracking-[0.25em] text-white uppercase drop-shadow-md">
            {t("game:summary.title")}
          </p>

          <h2 className="text-center text-3xl font-bold text-white drop-shadow-lg md:text-5xl">
            {subject}
          </h2>
        </div>
      </motion.div>

      <div className="grid w-full max-w-2xl grid-cols-2 gap-4">
        {stats.map(({ icon: Icon, value, label }, index) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              type: "spring",
              stiffness: 300,
              damping: 24,
              delay: 0.15 + index * 0.1,
            }}
            className="bg-primary flex items-center gap-4 rounded-xl p-5 text-white"
          >
            <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-black/15">
              <Icon className="size-6" />
            </span>

            <div className="flex flex-col">
              <span className="text-4xl leading-none font-bold drop-shadow-md">
                {value}
              </span>
              <span className="text-sm font-semibold drop-shadow-md">
                {label}
              </span>
            </div>
          </motion.div>
        ))}
      </div>

      {highlights && highlights.length > 0 && (
        <div className="flex w-full flex-col gap-3 rounded-2xl bg-black/45 p-4 text-white backdrop-blur-xs md:p-6">
          <div className="flex items-center gap-2 text-lg font-bold md:text-xl">
            <Trophy className="size-5 text-amber-300" />
            <span>Thống kê lựa chọn / công việc được chọn nhiều nhất</span>
          </div>

          <div className="grid max-h-80 grid-cols-1 gap-3 overflow-y-auto pr-1 md:grid-cols-2">
            {highlights.map((item, qIdx) => (
              <div
                key={qIdx}
                className="flex flex-col gap-2 rounded-xl bg-white/10 p-3.5"
              >
                <p className="text-sm font-bold text-white/95 md:text-base">
                  {qIdx + 1}. {item.question}
                </p>

                {item.topItems.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    {item.topItems.map((rankItem, rIdx) => (
                      <div
                        key={rIdx}
                        className="flex items-center justify-between gap-2 rounded-lg bg-black/30 px-3 py-1.5 text-xs md:text-sm"
                      >
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="font-extrabold text-amber-300">
                            #{rIdx + 1}
                          </span>
                          {rankItem.isFromOtherCluster && (
                            <Sparkles className="size-3.5 shrink-0 text-amber-300" />
                          )}
                          <span className="truncate font-semibold">
                            {rankItem.label}
                          </span>
                        </div>
                        <span className="shrink-0 font-bold text-amber-200">
                          {rankItem.count} ({rankItem.percentage}%)
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-white/60 italic">
                    {t("manager:result.noAnswer")}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

export default Summary
