import {
  NO_TIME_LIMIT,
  QUESTION_TYPES,
  QUIZZ_MODES,
  SCORING_MODES,
} from "@razzia/common/constants"
import {
  buildExcelTemplateBytes,
  buildJsonTemplateString,
  exportQuizzToXlsxBytes,
  MAX_XLSX_BYTES,
  parseImportedQuizzFile,
  readXlsxWorkbook,
  TEMPLATE_SAMPLE_QUIZZ,
} from "@razzia/common/quizz-io"
import { assertSafeXml } from "@razzia/common/quizz-io/xlsx"
import type { Quizz } from "@razzia/common/types/game"
import { quizzValidator } from "@razzia/common/validators/quizz"
import { describe, expect, it } from "vitest"

const encoder = new TextEncoder()

describe("quizz-io Excel (.xlsx), CSV & JSON templates and smart importer", () => {
  it("generates a valid 2-sheet Excel template and round-trips all 3 question types without errors", async () => {
    const bytes = await buildExcelTemplateBytes()
    expect(bytes.byteLength).toBeGreaterThan(500)

    const sheets = await readXlsxWorkbook(bytes)
    expect(sheets.map((sheet) => sheet.name)).toEqual(["Cau_Hoi", "Huong_Dan"])

    const parsed = await parseImportedQuizzFile("De-mau-sinh-hoc.xlsx", bytes)
    expect(parsed.errors).toEqual([])
    expect(parsed.subject).toBe("De-mau-sinh-hoc")
    expect(parsed.questions).toHaveLength(
      TEMPLATE_SAMPLE_QUIZZ.questions.length,
    )
    expect(parsed.questions[0].type).toBe(QUESTION_TYPES.SINGLE)
    expect(parsed.questions[2].type).toBe(QUESTION_TYPES.MULTI)
    expect(parsed.questions[2].solutions).toEqual([0, 1, 2])
    expect(parsed.questions[3].type).toBe(QUESTION_TYPES.ESTIMATION)
    expect(parsed.questions[3].solutions).toEqual([100])

    const validated = quizzValidator.safeParse({
      subject: parsed.subject,
      gameMode: parsed.gameMode,
      questions: parsed.questions,
    })
    expect(validated.success).toBe(true)
  })

  it("round-trips custom quizzes with XML entities, sparse 2-answer questions, and unlimited time", async () => {
    const custom: Quizz = {
      gameMode: QUIZZ_MODES.QUIZ,
      subject: "Kiểm tra Toán & Logic <Chương 1>",
      questions: [
        {
          type: QUESTION_TYPES.SINGLE,
          question: 'Biểu thức "3 < 5 & 7 > 2" có giá trị chân lý là gì?',
          answers: ["Đúng (True)", "Sai (False)"],
          solutions: [0],
          cooldown: 5,
          time: NO_TIME_LIMIT,
          maxPoints: 500,
          note: "Cả hai mệnh đề con đều đúng nên phép hội (&) trả về Đúng.",
          category: "Mệnh đề & Tập hợp",
        },
        {
          type: QUESTION_TYPES.MULTI,
          question: "Số nào dưới đây là số nguyên tố?",
          answers: ["2", "4", "7", "9"],
          solutions: [0, 2],
          cooldown: 5,
          time: 30,
          maxPoints: 1200,
          options: { scoringMode: SCORING_MODES.BALANCED },
        },
      ],
    }

    const xlsxBytes = await exportQuizzToXlsxBytes(custom)
    const parsed = await parseImportedQuizzFile(
      "toan-logic.xlsx",
      xlsxBytes,
      custom.subject,
    )

    expect(parsed.errors).toEqual([])
    expect(parsed.subject).toBe(custom.subject)
    expect(parsed.questions).toHaveLength(2)
    expect(parsed.questions[0].question).toContain("3 < 5 & 7 > 2")
    expect(parsed.questions[0].answers).toEqual(["Đúng (True)", "Sai (False)"])
    expect(parsed.questions[0].time).toBe(NO_TIME_LIMIT)
    expect(parsed.questions[0].maxPoints).toBe(500)
    expect(parsed.questions[1].solutions).toEqual([0, 2])
  })

  it("parses CSV files with UTF-8 BOM, semicolon delimiter, quoted commas, and auto-detects multi type", async () => {
    const csvContent = [
      "\uFEFFLoại câu hỏi;Câu hỏi;Đáp án A;Đáp án B;Đáp án C;Đáp án D;Đáp án đúng;Thời gian (giây)",
      ';Thủ đô của Việt Nam là thành phố nào?;"Hà Nội, Việt Nam";TP. Hồ Chí Minh;Đà Nẵng;Huế;A;15',
      ";Chọn các ngôn ngữ lập trình chạy trên trình duyệt hoặc Node.js;JavaScript;TypeScript;HTML;CSS;A, B;25",
      "estimation;Năm thành lập Trường Đại học Nông Lâm Thái Nguyên?; ; ; ; ;1970;20",
    ].join("\r\n")

    const parsed = await parseImportedQuizzFile(
      "cau-hoi-csv.csv",
      encoder.encode(csvContent),
    )

    expect(parsed.errors).toEqual([])
    expect(parsed.questions).toHaveLength(3)
    expect(parsed.questions[0].type).toBe(QUESTION_TYPES.SINGLE)
    expect(parsed.questions[0].answers[0]).toBe("Hà Nội, Việt Nam")
    expect(parsed.questions[0].time).toBe(15)
    expect(parsed.questions[1].type).toBe(QUESTION_TYPES.MULTI)
    expect(parsed.questions[1].solutions).toEqual([0, 1])
    expect(parsed.questions[2].type).toBe(QUESTION_TYPES.ESTIMATION)
    expect(parsed.questions[2].solutions).toEqual([1970])
  })

  it("parses JSON template and rejects out-of-range answer indices in JSON", async () => {
    const jsonStr = buildJsonTemplateString()
    const okResult = await parseImportedQuizzFile(
      "quiz-template.json",
      encoder.encode(jsonStr),
    )

    expect(okResult.errors).toEqual([])
    expect(okResult.questions).toHaveLength(4)

    const badJson = JSON.stringify({
      subject: "Đề lỗi",
      questions: [
        {
          type: "single",
          question: "Câu lỗi chỉ số",
          answers: ["A", "B"],
          solutions: [3],
          cooldown: 5,
          time: 20,
        },
      ],
    })

    const badResult = await parseImportedQuizzFile(
      "bad.json",
      encoder.encode(badJson),
    )
    expect(badResult.questions).toHaveLength(0)
    expect(badResult.errors.length).toBeGreaterThan(0)
    expect(badResult.errors[0].message).toContain("vượt quá")
  })

  it("collects clear row-by-row validation errors for invalid spreadsheet rows while keeping valid rows", async () => {
    const csv = [
      "Loại câu hỏi,Câu hỏi,Đáp án A,Đáp án B,Đáp án C,Đáp án D,Đáp án đúng",
      "single,Câu hợp lệ,Phương án 1,Phương án 2,,,B",
      "single,Câu chọn cột trống,Phương án 1,Phương án 2,,,D",
      'single,Câu single nhưng nhiều đáp án,A1,B1,C1,D1,"A, B"',
      "estimation,Câu ước lượng thiếu số, , , , ,abc",
    ].join("\n")

    const parsed = await parseImportedQuizzFile(
      "kiem-tra-loi.csv",
      encoder.encode(csv),
    )

    expect(parsed.questions).toHaveLength(1)
    expect(parsed.questions[0].question).toBe("Câu hợp lệ")
    expect(parsed.errors).toHaveLength(3)
    expect(parsed.errors.map((err) => err.row)).toEqual([3, 4, 5])
  })

  it("blocks XXE DOCTYPE/ENTITY declarations and oversized uploads", async () => {
    expect(() =>
      assertSafeXml(
        '<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe "bar">]>',
      ),
    ).toThrow(/DOCTYPE\/ENTITY/u)

    const oversized = new Uint8Array(MAX_XLSX_BYTES + 1)
    const result = await parseImportedQuizzFile("huge.xlsx", oversized)
    expect(result.questions).toHaveLength(0)
    expect(result.errors[0].message).toContain("5 MB")
  })
})
