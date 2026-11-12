// oxlint-disable typescript/no-unnecessary-condition
import {
  EVENTS,
  MAX_OTHER_TEXT_LENGTH,
  MAX_POINTS,
  MEDIA_TYPES,
  NO_TIME_LIMIT,
  QUESTION_TYPES,
  QUIZZ_MODES,
} from "@razzia/common/constants"
import {
  computeSurveyRanking,
  isEstimationOptions,
} from "@razzia/common/questions/options"
import type {
  Answer,
  GameResult,
  GameSettings,
  GameUpdateQuestion,
  Player,
  Question,
  QuestionAiSynthesis,
  QuestionResult,
  Quizz,
  QuizzMode,
  SurveyOtherResponseItem,
  SurveyQuestionHighlight,
} from "@razzia/common/types/game"
import type { Server, Socket } from "@razzia/common/types/game/socket"
import {
  type Status,
  STATUS,
  type StatusDataMap,
} from "@razzia/common/types/game/status"
import {
  buildFallbackOtherSynthesis,
  synthesizeSurveyOtherAnswersWithAi,
} from "@razzia/socket/services/ai"
import { CooldownTimer } from "@razzia/socket/services/game/cooldown-timer"
import { PlayerManager } from "@razzia/socket/services/game/player-manager"
import {
  countAnswers,
  scoreQuestion,
  type ScoredPlayer,
} from "@razzia/socket/services/scoring/round"
import { orderToPoint, timeToPoint } from "@razzia/socket/utils/game"
import sleep, { SECOND_MS } from "@razzia/socket/utils/sleep"
import { nanoid } from "nanoid"

type BroadcastFn = <T extends Status>(
  _status: T,
  _data: StatusDataMap[T],
) => void
type SendFn = <T extends Status>(
  _target: string,
  _status: T,
  _data: StatusDataMap[T],
) => void

export interface RoundManagerOptions {
  quizz: Quizz
  players: PlayerManager
  cooldown: CooldownTimer
  io: Server
  gameId: string
  getManagerId: () => string
  broadcast: BroadcastFn
  send: SendFn
  onNewQuestion: () => void
  onGameFinished: (_result: GameResult) => void
  onResultUpdated?: (_result: GameResult) => void
  getSettings: () => GameSettings
}

interface RoundStep {
  name: string
  gameModes: QuizzMode[]
  skip?: () => boolean
  enter: () => void
  delay: (_settings: GameSettings) => number
}

export class RoundManager {
  private readonly opts: RoundManagerOptions
  private readonly steps: RoundStep[]
  private started = false
  private currentQuestion = 0
  private currentStep = -1
  private playersAnswers: Answer[] = []
  private startTime = 0
  private acceptingAnswers = false
  private leaderboard: Player[] = []
  private tempOldLeaderboard: Player[] | null = null
  private questionsHistory: QuestionResult[] = []
  private lastSavedResult: GameResult | null = null
  private autoAdvanceTimer: NodeJS.Timeout | null = null

  constructor(opts: RoundManagerOptions) {
    this.opts = opts

    const steps: RoundStep[] = [
      {
        name: "reveal",
        gameModes: [QUIZZ_MODES.QUIZ, QUIZZ_MODES.SURVEY],
        enter: () => {
          this.showResults()
        },
        delay: (settings) => settings.autoAdvance.responsesDelay,
      },
      {
        name: "leaderboard",
        gameModes: [QUIZZ_MODES.QUIZ],
        skip: () => this.isLastQuestion() || this.isSameCategoryNext(),
        enter: () => {
          this.showLeaderboard()
        },
        delay: (settings) => settings.autoAdvance.leaderboardDelay,
      },
    ]

    this.steps = steps.filter((step) =>
      step.gameModes.includes(opts.quizz.gameMode),
    )
  }

  isStarted(): boolean {
    return this.started
  }

  private get question(): Question {
    return this.opts.quizz.questions[this.currentQuestion]
  }

  private isAskingQuestion(): boolean {
    return this.currentStep < 0
  }

  private isLastQuestion(): boolean {
    return !this.opts.quizz.questions[this.currentQuestion + 1]
  }

  private isSameCategoryNext(): boolean {
    const category = this.question.category?.trim()
    const next = this.opts.quizz.questions[this.currentQuestion + 1]

    return Boolean(category) && next?.category?.trim() === category
  }

  private isSurvey(): boolean {
    return this.opts.quizz.gameMode === QUIZZ_MODES.SURVEY
  }

  // ── Auto advance ─────────────────────────────────────────────────────────

  clearAutoAdvance(): void {
    if (!this.autoAdvanceTimer) {
      return
    }

    clearInterval(this.autoAdvanceTimer)
    this.autoAdvanceTimer = null
    this.emitAutoAdvance(null)
  }

  private emitAutoAdvance(state: { seconds: number; total: number } | null) {
    this.opts.io
      .to(this.opts.getManagerId())
      .emit(EVENTS.MANAGER.AUTO_ADVANCE, state)
  }

  private scheduleAutoAdvance(delay: number): void {
    this.clearAutoAdvance()

    if (!this.opts.getSettings().autoAdvance.enable) {
      return
    }

    let remaining = delay

    this.emitAutoAdvance({ seconds: remaining, total: delay })

    this.autoAdvanceTimer = setInterval(() => {
      remaining -= 1

      if (remaining > 0) {
        this.emitAutoAdvance({ seconds: remaining, total: delay })

        return
      }

      this.clearAutoAdvance()
      this.advance()
    }, SECOND_MS)
  }

  // ── Flow ─────────────────────────────────────────────────────────────────

  getReconnectInfo(): GameUpdateQuestion | null {
    if (!this.started) {
      return null
    }

    return {
      current: this.currentQuestion + 1,
      total: this.opts.quizz.questions.length,
    }
  }

  async start(socket: Socket): Promise<void> {
    if (this.started) {
      return
    }

    if (this.opts.players.count() === 0) {
      socket.emit(EVENTS.GAME.ERROR_MESSAGE, "errors:game.noPlayersConnected")

      return
    }

    this.started = true

    this.opts.broadcast(STATUS.SHOW_START, {
      time: 3,
      subject: this.opts.quizz.subject,
    })

    await sleep(3)

    this.opts.io.to(this.opts.gameId).emit(EVENTS.GAME.START_COOLDOWN)
    await this.opts.cooldown.start(3)

    void this.newQuestion()
  }

  advance(): void {
    if (!this.started) {
      return
    }

    this.clearAutoAdvance()

    if (this.isAskingQuestion()) {
      this.acceptingAnswers = false
      this.opts.cooldown.abort()

      return
    }

    this.runStep(this.currentStep + 1)
  }

  private runStep(index: number): void {
    const step = this.steps[index]

    if (!step) {
      this.nextQuestion()

      return
    }

    if (step.skip?.()) {
      this.runStep(index + 1)

      return
    }

    this.currentStep = index
    step.enter()
    this.scheduleAutoAdvance(step.delay(this.opts.getSettings()))
  }

  private nextQuestion(): void {
    if (this.isLastQuestion()) {
      this.finish()

      return
    }

    this.currentQuestion += 1
    void this.newQuestion()
  }

  private async newQuestion(): Promise<void> {
    if (!this.started) {
      return
    }

    this.currentStep = -1

    this.opts.onNewQuestion()

    this.opts.io.to(this.opts.gameId).emit(EVENTS.GAME.UPDATE_QUESTION, {
      current: this.currentQuestion + 1,
      total: this.opts.quizz.questions.length,
    })

    this.opts.broadcast(STATUS.SHOW_PREPARED, {
      totalAnswers: this.question.answers.length,
      questionNumber: this.currentQuestion + 1,
      questionType: this.question.type,
    })

    await sleep(2)

    if (!this.started) {
      return
    }

    const imageMedia = (() => {
      if (this.question.media?.type !== MEDIA_TYPES.IMAGE) {
        return undefined
      }

      return this.question.media
    })()

    this.opts.broadcast(STATUS.SHOW_QUESTION, {
      question: this.question.question,
      media: imageMedia,
      cooldown: this.question.cooldown,
    })

    await sleep(this.question.cooldown)

    if (!this.started) {
      return
    }

    this.startTime = Date.now()
    this.acceptingAnswers = true

    this.opts.broadcast(STATUS.SELECT_ANSWER, {
      question: this.question.question,
      answers: this.question.answers,
      allowOther: this.question.allowOther,
      media: this.question.media,
      time: this.question.time,
      totalPlayer: this.opts.players.count(),
      questionType: this.question.type,
      options: this.question.options,
      answersOnly: this.opts.getSettings().answersOnly,
    })

    await this.opts.cooldown.start(this.question.time)

    this.acceptingAnswers = false

    if (!this.started) {
      return
    }

    this.runStep(0)
  }

  // ── Steps ────────────────────────────────────────────────────────────────

  private recordHistory(
    players: Player[],
    scored: ScoredPlayer[] = [],
    initialSynthesis?: QuestionAiSynthesis,
  ): number {
    const historyIndex = this.questionsHistory.length

    this.questionsHistory.push({
      ...this.question,
      solutions: this.isSurvey() ? undefined : this.question.solutions,
      ...(initialSynthesis ? { aiSynthesis: initialSynthesis } : {}),
      playerAnswers: players.map((player) => {
        const score = scored.find((s) => s.id === player.id)
        const entry = this.playersAnswers.find((a) => a.playerId === player.id)

        return {
          playerName: player.username,
          answerIds:
            entry && (entry.answerIds.length > 0 || entry.otherText)
              ? entry.answerIds
              : null,
          ...(entry?.otherText ? { otherText: entry.otherText } : {}),
          ...(score && {
            correct: score.lastCorrect,
            points: score.lastPoints,
          }),
        }
      }),
    })

    return historyIndex
  }

  private collectOtherResponses(players: Player[]): SurveyOtherResponseItem[] {
    const list: SurveyOtherResponseItem[] = []

    for (const answer of this.playersAnswers) {
      if (!answer.otherText) {
        continue
      }

      const player = players.find((p) => p.id === answer.playerId)

      if (player) {
        list.push({ playerName: player.username, text: answer.otherText })
      }
    }

    return list
  }

  private triggerAsyncOtherSynthesis(
    historyIndex: number,
    otherResponses: SurveyOtherResponseItem[],
  ): void {
    const historyItem = this.questionsHistory[historyIndex]

    if (otherResponses.length === 0 || !historyItem) {
      return
    }

    void synthesizeSurveyOtherAnswersWithAi(
      {
        question: historyItem.question,
        predefinedAnswers: historyItem.answers,
        otherResponses,
      },
      false,
    )
      .then(({ aiSynthesis }) => {
        historyItem.aiSynthesis = aiSynthesis

        if (this.lastSavedResult) {
          this.opts.onResultUpdated?.(this.lastSavedResult)
        }

        this.opts.io
          .to(this.opts.getManagerId())
          .emit(EVENTS.MANAGER.SURVEY_AI_SYNTHESIS, {
            questionIndex: historyIndex,
            aiSynthesis,
          })
      })
      .catch(() => {
        /* Fallback synthesis is already set */
      })
  }

  private showResults(): void {
    const currentPlayers = this.opts.players.getAll()
    const answerCounts = countAnswers(this.playersAnswers)
    const otherResponses = this.collectOtherResponses(currentPlayers)
    const initialSynthesis =
      otherResponses.length > 0
        ? buildFallbackOtherSynthesis(this.question.answers, otherResponses)
        : undefined

    if (this.isSurvey()) {
      this.opts.send(this.opts.getManagerId(), STATUS.SHOW_RESPONSES, {
        ...this.question,
        solutions: undefined,
        responses: answerCounts,
        otherResponses,
        aiSynthesis: initialSynthesis,
        aiSynthesizing: otherResponses.length > 0,
      })

      currentPlayers.forEach((player) => {
        this.opts.send(player.id, STATUS.WAIT, {
          text: "game:answerNoted",
        })
      })

      const historyIndex = this.recordHistory(
        currentPlayers,
        [],
        initialSynthesis,
      )
      this.playersAnswers = []
      this.triggerAsyncOtherSynthesis(historyIndex, otherResponses)

      return
    }

    const oldLeaderboard = (() => {
      if (this.leaderboard.length === 0) {
        return currentPlayers.map((p) => ({ ...p }))
      }

      return this.leaderboard.map((p) => ({ ...p }))
    })()

    const sortedPlayers = scoreQuestion(
      this.question,
      currentPlayers,
      this.playersAnswers,
    )

    this.opts.players.replace(sortedPlayers)

    sortedPlayers.forEach((player, index) => {
      const aheadPlayer = sortedPlayers[index - 1]

      this.opts.send(player.id, STATUS.SHOW_RESULT, {
        correct: player.lastCorrect,
        message: player.lastCorrect ? "game:correct" : "game:wrong",
        points: player.lastPoints,
        myPoints: player.points,
        rank: index + 1,
        aheadOfMe: aheadPlayer ? aheadPlayer.username : null,
      })
    })

    this.opts.send(this.opts.getManagerId(), STATUS.SHOW_RESPONSES, {
      ...this.question,
      responses: answerCounts,
      otherResponses,
      aiSynthesis: initialSynthesis,
      aiSynthesizing: otherResponses.length > 0,
    })

    const historyIndex = this.recordHistory(
      currentPlayers,
      sortedPlayers,
      initialSynthesis,
    )

    this.leaderboard = sortedPlayers
    this.tempOldLeaderboard ??= oldLeaderboard
    this.playersAnswers = []
    this.triggerAsyncOtherSynthesis(historyIndex, otherResponses)
  }

  private showLeaderboard(): void {
    const oldLeaderboard = this.tempOldLeaderboard ?? this.leaderboard

    this.opts.send(this.opts.getManagerId(), STATUS.SHOW_LEADERBOARD, {
      oldLeaderboard: oldLeaderboard.slice(0, 5),
      leaderboard: this.leaderboard.slice(0, 5),
    })

    this.tempOldLeaderboard = null
  }

  private buildSurveyHighlights(): SurveyQuestionHighlight[] {
    return this.questionsHistory
      .filter((q) => q.type !== QUESTION_TYPES.ESTIMATION)
      .map((q) => {
        const directCounts: Record<number, number> = {}
        const otherResponses: SurveyOtherResponseItem[] = []
        let totalResponses = 0

        for (const pa of q.playerAnswers) {
          const hasIds = pa.answerIds !== null && pa.answerIds.length > 0
          const hasOther =
            typeof pa.otherText === "string" && pa.otherText.trim().length > 0

          if (hasIds || hasOther) {
            totalResponses += 1
          }

          if (pa.answerIds) {
            for (const id of pa.answerIds) {
              directCounts[id] = (directCounts[id] ?? 0) + 1
            }
          }

          if (hasOther && pa.otherText) {
            otherResponses.push({
              playerName: pa.playerName,
              text: pa.otherText.trim(),
            })
          }
        }

        const ranked = computeSurveyRanking({
          answers: q.answers,
          responses: directCounts,
          otherResponses,
          aiSynthesis: q.aiSynthesis,
          totalResponded: totalResponses,
        })

        return {
          question: q.question,
          totalResponses,
          topItems: ranked.filter((item) => item.count > 0).slice(0, 3),
          otherCount: otherResponses.length,
          ...(q.aiSynthesis?.summaryNote
            ? { summaryNote: q.aiSynthesis.summaryNote }
            : {}),
        }
      })
  }

  private finishSurvey(): void {
    const players = this.opts.players.getAll()
    const highlights = this.buildSurveyHighlights()

    const summary = {
      subject: this.opts.quizz.subject,
      totalPlayers: players.length,
      totalQuestions: this.opts.quizz.questions.length,
      highlights,
    }

    this.opts.send(this.opts.getManagerId(), STATUS.SUMMARY, summary)

    players.forEach((player) => {
      this.opts.send(player.id, STATUS.SUMMARY, summary)
    })
  }

  private finish(): void {
    this.started = false
    this.clearAutoAdvance()

    const finalPlayers = this.isSurvey()
      ? this.opts.players.getAll()
      : this.leaderboard

    const resultPayload: GameResult = {
      id: `${Date.now()}-${nanoid(8)}`,
      gameMode: this.opts.quizz.gameMode,
      subject: this.opts.quizz.subject,
      date: new Date().toISOString(),
      players: finalPlayers.map((player, index) => ({
        username: player.username,
        points: player.points,
        rank: index + 1,
      })),
      questions: this.questionsHistory,
    }

    this.lastSavedResult = resultPayload
    this.opts.onGameFinished(resultPayload)

    if (this.isSurvey()) {
      this.finishSurvey()

      return
    }

    const top = this.leaderboard
      .slice(0, 3)
      .map(({ username, points }) => ({ username, points }))

    this.opts.send(this.opts.getManagerId(), STATUS.FINISHED, {
      subject: this.opts.quizz.subject,
      top,
    })

    this.leaderboard.forEach((player, index) => {
      this.opts.send(player.id, STATUS.FINISHED, {
        subject: this.opts.quizz.subject,
        top,
        rank: index + 1,
      })
    })
  }

  // ── Player actions ───────────────────────────────────────────────────────

  private normalizeAnswer(
    answerIds: number[],
    otherText?: string,
  ): number[] | null {
    const { options, answers } = this.question

    if (!isEstimationOptions(options)) {
      const validIds = answerIds.filter(
        (id) => Number.isInteger(id) && id >= 0 && id < answers.length,
      )

      if (validIds.length === 0 && !otherText) {
        return null
      }

      if (this.question.type === QUESTION_TYPES.SINGLE) {
        return otherText ? [] : validIds.slice(0, 1)
      }

      return validIds
    }

    const value = answerIds.at(0)

    if (
      answerIds.length !== 1 ||
      value === undefined ||
      !Number.isFinite(value)
    ) {
      return null
    }

    return [Math.min(options.max, Math.max(options.min, value))]
  }

  selectAnswer(socket: Socket, answerIds: number[], otherText?: string): void {
    const player = this.opts.players.findById(socket.id)

    if (!player || !this.acceptingAnswers) {
      return
    }

    if (this.playersAnswers.find((a) => a.playerId === socket.id)) {
      return
    }

    const cleanOther =
      this.question.allowOther &&
      typeof otherText === "string" &&
      otherText.trim().length > 0
        ? otherText.trim().slice(0, MAX_OTHER_TEXT_LENGTH)
        : undefined

    const submitted = this.normalizeAnswer(answerIds, cleanOther)

    if (!submitted) {
      return
    }

    const points = (() => {
      if (isEstimationOptions(this.question.options)) {
        return this.question.maxPoints ?? MAX_POINTS
      }

      if (this.question.time === NO_TIME_LIMIT) {
        return orderToPoint(
          this.playersAnswers.length,
          this.opts.players.count(),
          this.question.maxPoints,
        )
      }

      return timeToPoint(this.startTime, this.question)
    })()

    this.playersAnswers.push({
      playerId: player.id,
      answerIds: submitted,
      ...(cleanOther ? { otherText: cleanOther } : {}),
      points,
    })

    this.opts.send(socket.id, STATUS.WAIT, {
      text: "game:waitingForAnswers",
    })

    this.opts.io
      .to(this.opts.getManagerId())
      .emit(EVENTS.GAME.PLAYER_ANSWER, this.playersAnswers.length)
    this.endIfEveryoneAnswered()
  }

  updatePlayerId(oldId: string, newId: string): void {
    this.playersAnswers = this.playersAnswers.map((answer) =>
      answer.playerId === oldId ? { ...answer, playerId: newId } : answer,
    )
  }

  endIfEveryoneAnswered(): void {
    if (!this.acceptingAnswers) {
      return
    }

    const allPlayers = this.opts.players.getAll()
    const everyoneAnswered = allPlayers.every((player) =>
      this.playersAnswers.some((a) => a.playerId === player.id),
    )

    if (allPlayers.length > 0 && everyoneAnswered) {
      this.opts.cooldown.abort()
    }
  }
}
