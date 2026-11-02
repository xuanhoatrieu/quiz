import {
  ESTIMATION_INPUT_MODES,
  MAX_ANSWERS,
  MAX_POINTS,
  MIN_ANSWERS,
  NO_TIME_LIMIT,
  QUESTION_TYPES,
  QUIZZ_MODES,
  SCORING_MODES,
} from "@razzia/common/constants"
import {
  MAX_XLSX_BYTES,
  readXlsxWorkbook,
  writeXlsxWorkbook,
  type XlsxParsedSheet,
  type XlsxSheetInput,
} from "@razzia/common/quizz-io/xlsx"
import { isEstimationOptions } from "@razzia/common/questions/options"
import type {
  EstimationQuestionOptions,
  Question,
  QuestionType,
  Quizz,
  QuizzMode,
} from "@razzia/common/types/game"
import {
  normalizeLegacyQuizz,
  quizzValidator,
} from "@razzia/common/validators/quizz"

export { MAX_XLSX_BYTES, readXlsxWorkbook, writeXlsxWorkbook }

export type { XlsxParsedSheet, XlsxSheetInput }

export interface QuizzImportError {
  row: number
  message: string
}

export interface QuizzImportResult {
  subject: string
  gameMode: QuizzMode
  questions: Question[]
  errors: QuizzImportError[]
}

const textDecoder = new TextDecoder("utf-8")

const SHEET_HEADERS = [
  "Loại câu hỏi",
  "Câu hỏi",
  "Đáp án A",
  "Đáp án B",
  "Đáp án C",
  "Đáp án D",
  "Đáp án đúng",
  "Thời gian (giây)",
  "Điểm tối đa",
  "Ước lượng (Min|Max|Bước|Sai số)",
  "Giải thích / Ghi chú",
  "Chủ đề nhóm",
]

const SHEET_COLUMN_WIDTHS = [16, 48, 24, 24, 24, 24, 16, 18, 14, 30, 34, 20]

export const TEMPLATE_SAMPLE_QUIZZ: Quizz = {
  gameMode: QUIZZ_MODES.QUIZ,
  subject: "Đề mẫu Trắc nghiệm Tổng hợp",
  questions: [
    {
      type: QUESTION_TYPES.SINGLE,
      question:
        "Quá trình quang hợp ở thực vật xanh diễn ra chủ yếu tại bào quan nào?",
      answers: ["Lục lạp", "Ti thể", "Bộ máy Golgi", "Lưới nội chất"],
      solutions: [0],
      cooldown: 5,
      time: 20,
      maxPoints: 1000,
      note: "Lục lạp chứa diệp lục giúp hấp thụ năng lượng ánh sáng mặt trời.",
      category: "Sinh học đại cương",
    },
    {
      type: QUESTION_TYPES.SINGLE,
      question: "Độ pH của đất trung tính nằm trong khoảng giá trị nào?",
      answers: ["3.0 - 4.5", "6.5 - 7.5", "8.5 - 9.5", "10.0 - 11.5"],
      solutions: [1],
      cooldown: 5,
      time: 20,
      maxPoints: 1000,
      note: "Đất có pH từ 6.5 đến 7.5 được phân loại là đất trung tính.",
      category: "Khoa học đất",
    },
    {
      type: QUESTION_TYPES.MULTI,
      question:
        "Những yếu tố nào dưới đây thuộc nhóm nguyên tố đa lượng thiết yếu cho cây trồng?",
      answers: ["Đạm (N)", "Lân (P)", "Kali (K)", "Vàng (Au)"],
      solutions: [0, 1, 2],
      cooldown: 5,
      time: 25,
      maxPoints: 1000,
      options: { scoringMode: SCORING_MODES.BALANCED },
      note: "N, P, K là 3 nguyên tố dinh dưỡng đa lượng quan trọng nhất.",
      category: "Dinh dưỡng cây trồng",
    },
    {
      type: QUESTION_TYPES.ESTIMATION,
      question:
        "Nước sôi ở nhiệt độ bao nhiêu độ C trong điều kiện áp suất khí quyển tiêu chuẩn (1 atm)?",
      answers: [],
      solutions: [100],
      cooldown: 5,
      time: 20,
      maxPoints: 1000,
      options: {
        inputMode: ESTIMATION_INPUT_MODES.SLIDER,
        min: 0,
        max: 200,
        step: 1,
        margin: 2,
      },
      note: "Ở áp suất 1 atm, nước tinh khiết sôi ở 100°C.",
      category: "Vật lý - Nhiệt học",
    },
  ],
}

const GUIDE_ROWS: Array<Array<string | number>> = [
  ["Cột dữ liệu", "Bắt buộc?", "Giá trị hợp lệ & Ví dụ minh họa"],
  [
    "1. Loại câu hỏi",
    "Khuyến nghị",
    "Điền 'single' (1 đáp án đúng), 'multi' (nhiều đáp án đúng) hoặc 'estimation' (ước lượng con số). Nếu để trống, hệ thống tự nhận diện single/multi theo cột Đáp án đúng.",
  ],
  [
    "2. Câu hỏi",
    "Bắt buộc",
    "Nội dung câu hỏi hiển thị cho người học (tối thiểu 1 ký tự).",
  ],
  [
    "3. Đáp án A .. F. Đáp án D",
    "Bắt buộc với single/multi",
    "Điền từ 2 đến 4 phương án trả lời. Với câu hỏi 'estimation' (ước lượng số), hãy để trống cả 4 cột đáp án A, B, C, D.",
  ],
  [
    "7. Đáp án đúng",
    "Bắt buộc",
    "Với single: điền A, B, C hoặc D (hoặc 1, 2, 3, 4). Với multi: điền các chữ cái cách nhau bởi dấu phẩy, ví dụ: 'A, B, C'. Với estimation: điền con số đáp án chính xác, ví dụ: '100'.",
  ],
  [
    "8. Thời gian (giây)",
    "Tùy chọn",
    "Số giây làm bài cho câu hỏi (mặc định: 20). Điền -1 nếu muốn không giới hạn thời gian.",
  ],
  [
    "9. Điểm tối đa",
    "Tùy chọn",
    "Điểm thưởng tối đa cho câu hỏi (mặc định: 1000, điền 0 nếu không tính điểm).",
  ],
  [
    "10. Ước lượng (Min|Max|Bước|Sai số)",
    "Tùy chọn (chỉ cho estimation)",
    "Định dạng 'Min | Max | Bước nhảy | Sai số chấp nhận', ví dụ: '0 | 200 | 1 | 2'. Nếu để trống, hệ thống tự động tạo khoảng Min/Max hợp lý quanh đáp án.",
  ],
  [
    "11. Giải thích / Ghi chú",
    "Tùy chọn",
    "Lời giải thích hoặc ghi chú chuyên môn của giảng viên sau khi công bố đáp án.",
  ],
  [
    "12. Chủ đề nhóm",
    "Tùy chọn",
    "Nhãn phân nhóm chương/chủ đề của câu hỏi (ví dụ: 'Chương 1', 'Sinh học đại cương').",
  ],
]

const indexToLetter = (idx: number): string => String.fromCharCode(65 + idx)

const questionToSpreadsheetRow = (
  question: Question,
): Array<string | number> => {
  const ansA = question.answers[0] ?? ""
  const ansB = question.answers[1] ?? ""
  const ansC = question.answers[2] ?? ""
  const ansD = question.answers[3] ?? ""

  let solutionCell: string | number = ""
  let estimationCell = ""

  if (question.type === QUESTION_TYPES.ESTIMATION) {
    const target = question.solutions?.[0]
    solutionCell = target ?? ""

    if (isEstimationOptions(question.options)) {
      const { min, max, step, margin } = question.options
      estimationCell = `${min} | ${max} | ${step} | ${margin}`
    }
  } else {
    solutionCell = (question.solutions ?? [])
      .map((idx) => indexToLetter(idx))
      .join(", ")
  }

  return [
    question.type,
    question.question,
    ansA,
    ansB,
    ansC,
    ansD,
    solutionCell,
    question.time,
    question.maxPoints ?? MAX_POINTS,
    estimationCell,
    question.note ?? "",
    question.category ?? "",
  ]
}

export const exportQuizzToXlsxBytes = (quizz: Quizz): Promise<Uint8Array> => {
  const questionRows: Array<Array<string | number>> = [
    SHEET_HEADERS,
    ...quizz.questions.map((question) => questionToSpreadsheetRow(question)),
  ]

  const sheets: XlsxSheetInput[] = [
    {
      name: "Cau_Hoi",
      columns: SHEET_COLUMN_WIDTHS,
      rows: questionRows,
    },
    {
      name: "Huong_Dan",
      columns: [34, 18, 92],
      rows: GUIDE_ROWS,
    },
  ]

  return writeXlsxWorkbook(sheets)
}

export const buildExcelTemplateBytes = (): Promise<Uint8Array> =>
  exportQuizzToXlsxBytes(TEMPLATE_SAMPLE_QUIZZ)

export const exportQuizzToJsonString = (quizz: Quizz): string =>
  JSON.stringify(
    {
      gameMode: quizz.gameMode,
      subject: quizz.subject,
      questions: quizz.questions,
    },
    null,
    2,
  )

export const buildJsonTemplateString = (): string =>
  exportQuizzToJsonString(TEMPLATE_SAMPLE_QUIZZ)

const stripFilenameExtension = (filename: string): string => {
  const base = filename.split(/[\\/]/u).pop() ?? filename
  const cleaned = base.replace(/\.(?:xlsx|csv|json)$/iu, "").trim()

  return cleaned.length > 0 ? cleaned : "Đề trắc nghiệm mới"
}

const normalizeHeaderToken = (raw: string): string =>
  raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/đ/gu, "d")
    .replace(/Đ/gu, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .trim()

interface ColumnMapping {
  type: number
  question: number
  answerA: number
  answerB: number
  answerC: number
  answerD: number
  solution: number
  time: number
  maxPoints: number
  estimation: number
  note: number
  category: number
}

const DEFAULT_COLUMN_MAPPING: ColumnMapping = {
  type: 0,
  question: 1,
  answerA: 2,
  answerB: 3,
  answerC: 4,
  answerD: 5,
  solution: 6,
  time: 7,
  maxPoints: 8,
  estimation: 9,
  note: 10,
  category: 11,
}

const detectHeaderMapping = (
  firstRow: string[],
): { hasHeader: boolean; mapping: ColumnMapping } => {
  const tokens = firstRow.map((cell) => normalizeHeaderToken(cell))
  const looksLikeHeader = tokens.some(
    (token) =>
      token === "cau hoi" ||
      token === "question" ||
      token === "noi dung cau hoi" ||
      token === "dap an dung" ||
      token === "correct answer" ||
      token === "solution" ||
      token === "loai cau hoi",
  )

  if (!looksLikeHeader) {
    return { hasHeader: false, mapping: DEFAULT_COLUMN_MAPPING }
  }

  const mapping: ColumnMapping = {
    type: -1,
    question: -1,
    answerA: -1,
    answerB: -1,
    answerC: -1,
    answerD: -1,
    solution: -1,
    time: -1,
    maxPoints: -1,
    estimation: -1,
    note: -1,
    category: -1,
  }

  tokens.forEach((token, idx) => {
    if (
      mapping.type < 0 &&
      (token === "loai cau hoi" ||
        token === "loai" ||
        token === "type" ||
        token === "question type")
    ) {
      mapping.type = idx

      return
    }

    if (
      mapping.question < 0 &&
      (token === "cau hoi" ||
        token === "noi dung cau hoi" ||
        token === "question" ||
        token === "prompt")
    ) {
      mapping.question = idx

      return
    }

    if (
      mapping.solution < 0 &&
      (token.includes("dap an dung") ||
        token === "dap an" ||
        token.includes("correct") ||
        token === "solution" ||
        token === "solutions" ||
        token === "ket qua")
    ) {
      mapping.solution = idx

      return
    }

    if (
      mapping.answerA < 0 &&
      (token === "dap an a" ||
        token === "phuong an a" ||
        token === "answer a" ||
        token === "option a" ||
        token === "a" ||
        token === "dap an 1")
    ) {
      mapping.answerA = idx

      return
    }

    if (
      mapping.answerB < 0 &&
      (token === "dap an b" ||
        token === "phuong an b" ||
        token === "answer b" ||
        token === "option b" ||
        token === "b" ||
        token === "dap an 2")
    ) {
      mapping.answerB = idx

      return
    }

    if (
      mapping.answerC < 0 &&
      (token === "dap an c" ||
        token === "phuong an c" ||
        token === "answer c" ||
        token === "option c" ||
        token === "c" ||
        token === "dap an 3")
    ) {
      mapping.answerC = idx

      return
    }

    if (
      mapping.answerD < 0 &&
      (token === "dap an d" ||
        token === "phuong an d" ||
        token === "answer d" ||
        token === "option d" ||
        token === "d" ||
        token === "dap an 4")
    ) {
      mapping.answerD = idx

      return
    }

    if (
      mapping.time < 0 &&
      (token.startsWith("thoi gian") || token.startsWith("time"))
    ) {
      mapping.time = idx

      return
    }

    if (
      mapping.maxPoints < 0 &&
      (token.startsWith("diem") ||
        token.includes("points") ||
        token === "score")
    ) {
      mapping.maxPoints = idx

      return
    }

    if (
      mapping.estimation < 0 &&
      (token.includes("uoc luong") ||
        token.includes("min max") ||
        token.includes("estimation"))
    ) {
      mapping.estimation = idx

      return
    }

    if (
      mapping.note < 0 &&
      (token.includes("giai thich") ||
        token.includes("ghi chu") ||
        token === "note" ||
        token === "explanation")
    ) {
      mapping.note = idx

      return
    }

    if (
      mapping.category < 0 &&
      (token.includes("chu de") ||
        token.includes("nhom") ||
        token === "category" ||
        token === "topic")
    ) {
      mapping.category = idx
    }
  })

  return { hasHeader: true, mapping }
}

const getCell = (row: string[], index: number): string =>
  index >= 0 && index < row.length ? row[index].trim() : ""

const parseQuestionTypeAlias = (
  raw: string,
): { explicit: boolean; type: QuestionType | null } => {
  const trimmed = raw.trim()

  if (trimmed.length === 0) {
    return { explicit: false, type: null }
  }

  const normalized = normalizeHeaderToken(trimmed)

  if (
    normalized === "single" ||
    normalized === "1" ||
    normalized === "1 dap an" ||
    normalized === "mot dap an" ||
    normalized === "trac nghiem" ||
    normalized === "choice"
  ) {
    return { explicit: true, type: QUESTION_TYPES.SINGLE }
  }

  if (
    normalized === "multi" ||
    normalized === "multiple" ||
    normalized === "nhieu" ||
    normalized === "nhieu dap an" ||
    normalized === "checkbox"
  ) {
    return { explicit: true, type: QUESTION_TYPES.MULTI }
  }

  if (
    normalized === "estimation" ||
    normalized === "estimate" ||
    normalized === "uoc luong" ||
    normalized === "con so" ||
    normalized === "number"
  ) {
    return { explicit: true, type: QUESTION_TYPES.ESTIMATION }
  }

  return { explicit: true, type: null }
}

const buildDefaultEstimationOptions = (
  target: number,
): EstimationQuestionOptions => {
  if (Number.isInteger(target) && target >= 0 && target <= 100) {
    return {
      inputMode: ESTIMATION_INPUT_MODES.SLIDER,
      min: 0,
      max: 100,
      step: 1,
      margin: 5,
    }
  }

  const halfSpan = Math.max(20, Math.ceil(Math.abs(target) * 0.5))
  const min = Math.floor(target - halfSpan)
  const max = Math.ceil(target + halfSpan)
  const step = Number.isInteger(target) ? 1 : 0.1
  const margin = Math.max(1, Math.round(halfSpan * 0.1))

  return {
    inputMode: ESTIMATION_INPUT_MODES.SLIDER,
    min,
    max,
    step,
    margin,
  }
}

const parseEstimationOptionsCell = (
  raw: string,
  target: number,
): { options?: EstimationQuestionOptions; error?: string } => {
  if (raw.trim().length === 0) {
    return { options: buildDefaultEstimationOptions(target) }
  }

  const parts = raw
    .split(/[|;/]/u)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)

  if (parts.length < 2 || parts.length > 4) {
    return {
      error:
        "Cột cấu hình ước lượng cần theo định dạng 'Min | Max | Bước | Sai số' (ví dụ: '0 | 200 | 1 | 5').",
    }
  }

  const nums = parts.map((part) => Number(part.replace(",", ".")))

  if (nums.some((n) => !Number.isFinite(n))) {
    return {
      error:
        "Các giá trị Min, Max, Bước, Sai số trong cột ước lượng phải là số.",
    }
  }

  const [min, max] = nums
  const step = nums.length >= 3 ? nums[2] : 1
  const margin =
    nums.length >= 4 ? nums[3] : Math.max(0, Math.round((max - min) * 0.05))

  if (min >= max) {
    return { error: `Giá trị Min (${min}) phải nhỏ hơn Max (${max}).` }
  }

  if (step <= 0) {
    return { error: `Bước nhảy (${step}) phải lớn hơn 0.` }
  }

  if (margin < 0) {
    return { error: `Sai số (${margin}) không được âm.` }
  }

  if (target < min || target > max) {
    return {
      error: `Đáp án ước lượng (${target}) nằm ngoài khoảng [${min}, ${max}].`,
    }
  }

  return {
    options: {
      inputMode: ESTIMATION_INPUT_MODES.SLIDER,
      min,
      max,
      step,
      margin,
    },
  }
}

interface CompactedAnswers {
  answers: string[]
  slotToCompactedIndex: Map<number, number>
}

const compactChoiceAnswers = (rawSlots: string[]): CompactedAnswers => {
  const answers: string[] = []
  const slotToCompactedIndex = new Map<number, number>()

  rawSlots.forEach((value, slotIndex) => {
    const trimmed = value.trim()

    if (trimmed.length > 0) {
      slotToCompactedIndex.set(slotIndex, answers.length)
      answers.push(trimmed)
    }
  })

  return { answers, slotToCompactedIndex }
}

const parseChoiceSolutions = (
  rawSolution: string,
  compacted: CompactedAnswers,
): { solutions?: number[]; error?: string } => {
  const trimmed = rawSolution.trim()

  if (trimmed.length === 0) {
    return { error: "Thiếu đáp án đúng (hãy điền A, B, C hoặc D)." }
  }

  // First check if rawSolution matches one of the answer texts verbatim
  const exactAnswerIdx = compacted.answers.findIndex(
    (ans) => ans.toLowerCase() === trimmed.toLowerCase(),
  )

  if (exactAnswerIdx >= 0) {
    return { solutions: [exactAnswerIdx] }
  }

  const tokens = trimmed
    .split(/[,;|/\s]+/u)
    .map((tok) => tok.trim().toUpperCase())
    .filter((tok) => tok.length > 0)

  if (tokens.length === 0) {
    return { error: "Thiếu đáp án đúng (hãy điền A, B, C hoặc D)." }
  }

  const indices: number[] = []

  for (const token of tokens) {
    let slotIndex = -1

    if (/^[A-D]$/u.test(token)) {
      slotIndex = token.charCodeAt(0) - 65
    } else if (/^[1-4]$/u.test(token)) {
      slotIndex = Number.parseInt(token, 10) - 1
    } else {
      return {
        error: `Ký hiệu đáp án đúng '${token}' không hợp lệ (chỉ dùng A, B, C, D hoặc 1, 2, 3, 4).`,
      }
    }

    const mapped = compacted.slotToCompactedIndex.get(slotIndex)

    if (mapped === undefined) {
      return {
        error: `Đáp án đúng '${indexToLetter(slotIndex)}' đang trỏ tới cột phương án bị bỏ trống.`,
      }
    }

    if (!indices.includes(mapped)) {
      indices.push(mapped)
    }
  }

  return { solutions: indices }
}

const parseSpreadsheetRows = (
  rows: string[][],
  subject: string,
): QuizzImportResult => {
  const nonEmptyRows = rows.filter((row) =>
    row.some((cell) => cell.trim().length > 0),
  )

  if (nonEmptyRows.length === 0) {
    return {
      subject,
      gameMode: QUIZZ_MODES.QUIZ,
      questions: [],
      errors: [{ row: 1, message: "File nhập vào không có dữ liệu câu hỏi." }],
    }
  }

  const { hasHeader, mapping } = detectHeaderMapping(routesFirstRow(rows))
  const errors: QuizzImportError[] = []
  const questions: Question[] = []

  if (hasHeader && mapping.question < 0) {
    return {
      subject,
      gameMode: QUIZZ_MODES.QUIZ,
      questions: [],
      errors: [
        {
          row: 1,
          message:
            "Không tìm thấy cột 'Câu hỏi' trong dòng tiêu đề. Hãy tải file mẫu Excel (.xlsx) để xem đúng cấu trúc cột.",
        },
      ],
    }
  }

  const startRowIndex = hasHeader ? findFirstNonEmptyRowIndex(rows) + 1 : 0

  for (let r = startRowIndex; r < rows.length; r += 1) {
    const row = rows[r]
    const excelRowNumber = r + 1

    if (!row.some((cell) => cell.trim().length > 0)) {
      continue
    }

    const questionText = getCell(row, mapping.question)

    if (questionText.length === 0) {
      errors.push({
        row: excelRowNumber,
        message: "Nội dung cột 'Câu hỏi' bị bỏ trống.",
      })

      continue
    }

    const rawType = getCell(row, mapping.type)
    const parsedType = parseQuestionTypeAlias(rawType)

    if (parsedType.explicit && parsedType.type === null) {
      errors.push({
        row: excelRowNumber,
        message: `Loại câu hỏi '${rawType}' không hợp lệ (chỉ chấp nhận 'single', 'multi' hoặc 'estimation').`,
      })

      continue
    }

    const rawTime = getCell(row, mapping.time)
    let time = 20

    if (rawTime.length > 0) {
      const parsedTime = Number.parseInt(rawTime, 10)

      if (
        !Number.isInteger(parsedTime) ||
        (parsedTime !== NO_TIME_LIMIT && (parsedTime < 5 || parsedTime > 600))
      ) {
        errors.push({
          row: excelRowNumber,
          message: `Thời gian '${rawTime}' không hợp lệ (nhập từ 5 đến 600 giây, hoặc -1 nếu không giới hạn).`,
        })

        continue
      }

      time = parsedTime
    }

    const rawMaxPoints = getCell(row, mapping.maxPoints)
    let maxPoints = MAX_POINTS

    if (rawMaxPoints.length > 0) {
      const parsedPoints = Number.parseInt(rawMaxPoints, 10)

      if (!Number.isInteger(parsedPoints) || parsedPoints < 0) {
        errors.push({
          row: excelRowNumber,
          message: `Điểm tối đa '${rawMaxPoints}' phải là số nguyên không âm.`,
        })

        continue
      }

      maxPoints = parsedPoints
    }

    const note = getCell(row, mapping.note)
    const category = getCell(row, mapping.category)
    const rawSolution = getCell(row, mapping.solution)

    if (parsedType.type === QUESTION_TYPES.ESTIMATION) {
      const targetNum = Number(rawSolution.replace(",", "."))

      if (rawSolution.length === 0 || !Number.isFinite(targetNum)) {
        errors.push({
          row: excelRowNumber,
          message:
            "Câu hỏi ước lượng (estimation) cần cột 'Đáp án đúng' là một con số hợp lệ.",
        })

        continue
      }

      const estResult = parseEstimationOptionsCell(
        getCell(row, mapping.estimation),
        targetNum,
      )

      if (!estResult.options) {
        errors.push({
          row: excelRowNumber,
          message: estResult.error ?? "Cấu hình ước lượng không hợp lệ.",
        })

        continue
      }

      questions.push({
        type: QUESTION_TYPES.ESTIMATION,
        question: questionText,
        answers: [],
        solutions: [targetNum],
        cooldown: 5,
        time,
        maxPoints,
        options: estResult.options,
        ...(note.length > 0 ? { note } : {}),
        ...(category.length > 0 ? { category } : {}),
      })

      continue
    }

    const compacted = compactChoiceAnswers([
      getCell(row, mapping.answerA),
      getCell(row, mapping.answerB),
      getCell(row, mapping.answerC),
      getCell(row, mapping.answerD),
    ])

    if (compacted.answers.length < MIN_ANSWERS) {
      errors.push({
        row: excelRowNumber,
        message: `Cần nhập tối thiểu ${MIN_ANSWERS} phương án trả lời (hiện có ${compacted.answers.length}).`,
      })

      continue
    }

    if (compacted.answers.length > MAX_ANSWERS) {
      errors.push({
        row: excelRowNumber,
        message: `Tối đa ${MAX_ANSWERS} phương án trả lời được hỗ trợ.`,
      })

      continue
    }

    const solutionParsed = parseChoiceSolutions(rawSolution, compacted)

    if (!solutionParsed.solutions) {
      errors.push({
        row: excelRowNumber,
        message: solutionParsed.error ?? "Đáp án đúng không hợp lệ.",
      })

      continue
    }

    const effectiveType: QuestionType =
      parsedType.type ??
      (solutionParsed.solutions.length > 1
        ? QUESTION_TYPES.MULTI
        : QUESTION_TYPES.SINGLE)

    if (
      effectiveType === QUESTION_TYPES.SINGLE &&
      solutionParsed.solutions.length > 1
    ) {
      errors.push({
        row: excelRowNumber,
        message:
          "Câu hỏi loại 'single' chỉ được phép có 1 đáp án đúng. Hãy đổi cột Loại câu hỏi thành 'multi' nếu có nhiều đáp án đúng.",
      })

      continue
    }

    questions.push({
      type: effectiveType,
      question: questionText,
      answers: compacted.answers,
      solutions: solutionParsed.solutions,
      cooldown: 5,
      time,
      maxPoints,
      ...(effectiveType === QUESTION_TYPES.MULTI
        ? { options: { scoringMode: SCORING_MODES.BALANCED } }
        : {}),
      ...(note.length > 0 ? { note } : {}),
      ...(category.length > 0 ? { category } : {}),
    })
  }

  if (questions.length === 0 && errors.length === 0) {
    errors.push({
      row: 1,
      message: "Không tìm thấy dòng câu hỏi nào sau dòng tiêu đề.",
    })
  }

  return {
    subject,
    gameMode: QUIZZ_MODES.QUIZ,
    questions,
    errors,
  }
}

const findFirstNonEmptyRowIndex = (rows: string[][]): number => {
  for (let i = 0; i < rows.length; i += 1) {
    if (rows[i].some((cell) => cell.trim().length > 0)) {
      return i
    }
  }

  return 0
}

const routesFirstRow = (rows: string[][]): string[] =>
  rows[findFirstNonEmptyRowIndex(rows)] ?? []

const detectCsvDelimiter = (text: string): string => {
  const firstLine =
    text.split(/\r?\n/u).find((line) => line.trim().length > 0) ?? ""

  let inQuotes = false
  let commas = 0
  let semicolons = 0
  let tabs = 0

  for (const ch of firstLine) {
    if (ch === '"') {
      inQuotes = !inQuotes
    } else if (!inQuotes) {
      if (ch === ",") {
        commas += 1
      } else if (ch === ";") {
        semicolons += 1
      } else if (ch === "\t") {
        tabs += 1
      }
    }
  }

  if (tabs > commas && tabs >= semicolons) {
    return "\t"
  }

  if (semicolons > commas) {
    return ";"
  }

  return ","
}

export const parseCsvRows = (rawText: string): string[][] => {
  const cleanText = rawText.replace(/^\uFEFF/u, "")
  const delimiter = detectCsvDelimiter(cleanText)
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentField = ""
  let inQuotes = false
  let i = 0

  while (i < cleanText.length) {
    const ch = cleanText[i]

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < cleanText.length && cleanText[i + 1] === '"') {
          currentField += '"'
          i += 2

          continue
        }

        inQuotes = false
        i += 1

        continue
      }

      currentField += ch
      i += 1

      continue
    }

    if (ch === '"') {
      inQuotes = true
      i += 1

      continue
    }

    if (ch === delimiter) {
      currentRow.push(currentField)
      currentField = ""
      i += 1

      continue
    }

    if (ch === "\r" || ch === "\n") {
      currentRow.push(currentField)
      rows.push(currentRow)
      currentRow = []
      currentField = ""

      if (
        ch === "\r" &&
        i + 1 < cleanText.length &&
        cleanText[i + 1] === "\n"
      ) {
        i += 2
      } else {
        i += 1
      }

      continue
    }

    currentField += ch
    i += 1
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField)
    rows.push(currentRow)
  }

  return rows
}

const selectQuestionsSheet = (sheets: XlsxParsedSheet[]): XlsxParsedSheet => {
  const preferred = sheets.find((sheet) => {
    const token = normalizeHeaderToken(sheet.name)

    return (
      token === "cau hoi" ||
      token.includes("question") ||
      token.includes("quiz")
    )
  })

  if (preferred) {
    return preferred
  }

  const nonGuide = sheets.find((sheet) => {
    const token = normalizeHeaderToken(sheet.name)

    return (
      !token.includes("huong dan") &&
      !token.includes("guide") &&
      !token.includes("instruction")
    )
  })

  return nonGuide ?? sheets[0]
}

const isRecord = (val: unknown): val is Record<string, unknown> =>
  typeof val === "object" && val !== null && !Array.isArray(val)

const tryParseJsonText = (
  rawText: string,
): { ok: true; value: unknown } | { ok: false } => {
  try {
    return {
      ok: true,
      value: JSON.parse(rawText.replace(/^\uFEFF/u, "")) as unknown,
    }
  } catch {
    return { ok: false }
  }
}

const parseJsonQuizzPayload = (
  rawText: string,
  fallbackSubject: string,
): QuizzImportResult => {
  const parsedJson = tryParseJsonText(rawText)

  if (!parsedJson.ok) {
    return {
      subject: fallbackSubject,
      gameMode: QUIZZ_MODES.QUIZ,
      questions: [],
      errors: [
        {
          row: 1,
          message:
            "Cú pháp JSON không hợp lệ. Vui lòng kiểm tra dấu ngoặc hoặc dấu phẩy.",
        },
      ],
    }
  }

  const decoded = parsedJson.value

  const candidateObject = Array.isArray(decoded)
    ? {
        gameMode: QUIZZ_MODES.QUIZ,
        subject: fallbackSubject,
        questions: decoded as unknown[],
      }
    : decoded

  const normalized = normalizeLegacyQuizz(candidateObject)

  if (!isRecord(normalized)) {
    return {
      subject: fallbackSubject,
      gameMode: QUIZZ_MODES.QUIZ,
      questions: [],
      errors: [
        {
          row: 1,
          message:
            "Nội dung JSON phải là một đối tượng đề thi hoặc mảng câu hỏi.",
        },
      ],
    }
  }

  const rawSubject =
    typeof normalized.subject === "string" &&
    normalized.subject.trim().length > 0
      ? normalized.subject.trim()
      : fallbackSubject

  const payload: Record<string, unknown> = {
    ...normalized,
    subject: rawSubject,
  }

  const boundsErrors: QuizzImportError[] = []

  if (Array.isArray(payload.questions)) {
    const questionItems = payload.questions as unknown[]

    questionItems.forEach((q: unknown, idx: number) => {
      if (!isRecord(q)) {
        return
      }

      const qType = q.type ?? QUESTION_TYPES.SINGLE

      if (
        (qType === QUESTION_TYPES.SINGLE || qType === QUESTION_TYPES.MULTI) &&
        Array.isArray(q.answers) &&
        Array.isArray(q.solutions)
      ) {
        const answerCount = q.answers.length
        const solutionItems = q.solutions as unknown[]
        const outOfRange = solutionItems.some(
          (sol) => typeof sol === "number" && sol >= answerCount,
        )

        if (outOfRange) {
          boundsErrors.push({
            row: idx + 1,
            message: `Câu hỏi #${idx + 1}: Chỉ số đáp án đúng vượt quá số lượng phương án (${answerCount}).`,
          })
        }
      }
    })
  }

  const parsed = quizzValidator.safeParse(payload)

  if (!parsed.success || boundsErrors.length > 0) {
    const zodErrors: QuizzImportError[] = parsed.success
      ? []
      : parsed.error.issues.map((issue) => {
          const qIndex =
            issue.path[0] === "questions" && typeof issue.path[1] === "number"
              ? issue.path[1] + 1
              : 1

          return {
            row: qIndex,
            message: `Câu hỏi #${qIndex} (${issue.path.join(".")}): ${issue.message}`,
          }
        })

    return {
      subject: rawSubject,
      gameMode:
        normalized.gameMode === QUIZZ_MODES.SURVEY
          ? QUIZZ_MODES.SURVEY
          : QUIZZ_MODES.QUIZ,
      questions: [],
      errors: [...boundsErrors, ...zodErrors],
    }
  }

  return {
    subject: parsed.data.subject,
    gameMode: parsed.data.gameMode,
    questions: parsed.data.questions,
    errors: [],
  }
}

export const parseImportedQuizzFile = async (
  filename: string,
  bytes: Uint8Array,
  fallbackSubject?: string,
): Promise<QuizzImportResult> => {
  const defaultSubject =
    fallbackSubject && fallbackSubject.trim().length > 0
      ? fallbackSubject.trim()
      : stripFilenameExtension(filename)

  if (bytes.byteLength === 0) {
    return {
      subject: defaultSubject,
      gameMode: QUIZZ_MODES.QUIZ,
      questions: [],
      errors: [{ row: 1, message: "File tải lên đang rỗng (0 byte)." }],
    }
  }

  if (bytes.byteLength > MAX_XLSX_BYTES) {
    return {
      subject: defaultSubject,
      gameMode: QUIZZ_MODES.QUIZ,
      questions: [],
      errors: [
        { row: 1, message: "Dung lượng file vượt quá giới hạn tối đa 5 MB." },
      ],
    }
  }

  const lower = filename.trim().toLowerCase()

  if (lower.endsWith(".json")) {
    return parseJsonQuizzPayload(textDecoder.decode(bytes), defaultSubject)
  }

  if (lower.endsWith(".csv")) {
    const csvRows = parseCsvRows(textDecoder.decode(bytes))

    return parseSpreadsheetRows(csvRows, defaultSubject)
  }

  if (lower.endsWith(".xlsx")) {
    try {
      const sheets = await readXlsxWorkbook(bytes)
      const targetSheet = selectQuestionsSheet(sheets)

      return parseSpreadsheetRows(targetSheet.rows, defaultSubject)
    } catch (error) {
      return {
        subject: defaultSubject,
        gameMode: QUIZZ_MODES.QUIZ,
        questions: [],
        errors: [
          {
            row: 1,
            message:
              error instanceof Error
                ? error.message
                : "Không thể đọc file Excel (.xlsx).",
          },
        ],
      }
    }
  }

  return {
    subject: defaultSubject,
    gameMode: QUIZZ_MODES.QUIZ,
    questions: [],
    errors: [
      {
        row: 1,
        message:
          "Định dạng file chưa được hỗ trợ. Vui lòng chọn file .xlsx, .csv hoặc .json.",
      },
    ],
  }
}
