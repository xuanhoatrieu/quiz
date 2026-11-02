export const MAX_XLSX_BYTES = 5 * 1024 * 1024

export interface XlsxSheetInput {
  name: string
  columns: number[]
  rows: Array<Array<string | number>>
}

export interface XlsxParsedSheet {
  name: string
  rows: string[][]
}

interface ZipEntryInput {
  name: string
  data: Uint8Array
}

interface CompressedZipEntry {
  nameBytes: Uint8Array
  rawSize: number
  compressedData: Uint8Array
  crc32: number
  method: number
}

interface CentralDirectoryEntry {
  name: string
  method: number
  compressedSize: number
  uncompressedSize: number
  localHeaderOffset: number
}

interface ParsedZipEntry {
  name: string
  text: string
}

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder("utf-8")

const buildCrc32Table = (): Uint32Array => {
  const table = new Uint32Array(256)

  for (let i = 0; i < 256; i += 1) {
    let crc = i

    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
    }

    table[i] = crc >>> 0
  }

  return table
}

const CRC32_TABLE = buildCrc32Table()

const computeCrc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff

  for (const byte of bytes) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }

  return (crc ^ 0xffffffff) >>> 0
}

const deflateRaw = async (data: Uint8Array): Promise<Uint8Array> => {
  const copy = new Uint8Array(data.byteLength)
  copy.set(data)
  const stream = new Blob([copy])
    .stream()
    .pipeThrough(new CompressionStream("deflate-raw"))
  const buffer = await new Response(stream).arrayBuffer()

  return new Uint8Array(buffer)
}

const inflateRawBounded = async (
  compressed: Uint8Array,
  budget: { remaining: number },
): Promise<Uint8Array> => {
  const copy = new Uint8Array(compressed.byteLength)
  copy.set(compressed)
  const limiter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      budget.remaining -= chunk.byteLength

      if (budget.remaining < 0) {
        controller.error(
          new Error("File Excel giải nén vượt quá giới hạn an toàn 5 MB."),
        )

        return
      }

      controller.enqueue(chunk)
    },
  })

  const stream = new Blob([copy])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"))
    .pipeThrough(limiter)
  const buffer = await new Response(stream).arrayBuffer()

  return new Uint8Array(buffer)
}

const writeUint16LE = (view: DataView, offset: number, value: number): void => {
  view.setUint16(offset, value & 0xffff, true)
}

const writeUint32LE = (view: DataView, offset: number, value: number): void => {
  view.setUint32(offset, value >>> 0, true)
}

const createZipBytes = async (
  entries: ZipEntryInput[],
): Promise<Uint8Array> => {
  const prepared: CompressedZipEntry[] = await Promise.all(
    entries.map(async (entry) => {
      const nameBytes = textEncoder.encode(entry.name)
      const crc32 = computeCrc32(entry.data)
      const deflated = await deflateRaw(entry.data)
      const useDeflate = deflated.byteLength < entry.data.byteLength

      return {
        nameBytes,
        rawSize: entry.data.byteLength,
        compressedData: useDeflate ? deflated : entry.data,
        crc32,
        method: useDeflate ? 8 : 0,
      }
    }),
  )

  let localTotalSize = 0
  let centralTotalSize = 0

  for (const item of prepared) {
    localTotalSize +=
      30 + item.nameBytes.byteLength + item.compressedData.byteLength
    centralTotalSize += 46 + item.nameBytes.byteLength
  }

  const totalSize = localTotalSize + centralTotalSize + 22
  const out = new Uint8Array(totalSize)
  const view = new DataView(out.buffer)

  // Fixed MS-DOS date/time (2026-01-01 00:00:00) for deterministic archives
  const dosTime = 0
  const dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1
  const localOffsets: number[] = []
  let cursor = 0

  for (const item of prepared) {
    localOffsets.push(cursor)
    writeUint32LE(view, cursor, 0x04034b50)
    writeUint16LE(view, cursor + 4, 20)
    writeUint16LE(view, cursor + 6, 0x0800)
    writeUint16LE(view, cursor + 8, item.method)
    writeUint16LE(view, cursor + 10, dosTime)
    writeUint16LE(view, cursor + 12, dosDate)
    writeUint32LE(view, cursor + 14, item.crc32)
    writeUint32LE(view, cursor + 18, item.compressedData.byteLength)
    writeUint32LE(view, cursor + 22, item.rawSize)
    writeUint16LE(view, cursor + 26, item.nameBytes.byteLength)
    writeUint16LE(view, cursor + 28, 0)
    cursor += 30

    out.set(item.nameBytes, cursor)
    cursor += item.nameBytes.byteLength

    out.set(item.compressedData, cursor)
    cursor += item.compressedData.byteLength
  }

  const centralDirStart = cursor

  for (let index = 0; index < prepared.length; index += 1) {
    const item = prepared[index]
    const localOffset = localOffsets[index]

    writeUint32LE(view, cursor, 0x02014b50)
    writeUint16LE(view, cursor + 4, 20)
    writeUint16LE(view, cursor + 6, 20)
    writeUint16LE(view, cursor + 8, 0x0800)
    writeUint16LE(view, cursor + 10, item.method)
    writeUint16LE(view, cursor + 12, dosTime)
    writeUint16LE(view, cursor + 14, dosDate)
    writeUint32LE(view, cursor + 16, item.crc32)
    writeUint32LE(view, cursor + 20, item.compressedData.byteLength)
    writeUint32LE(view, cursor + 24, item.rawSize)
    writeUint16LE(view, cursor + 28, item.nameBytes.byteLength)
    writeUint16LE(view, cursor + 30, 0)
    writeUint16LE(view, cursor + 32, 0)
    writeUint16LE(view, cursor + 34, 0)
    writeUint16LE(view, cursor + 36, 0)
    writeUint32LE(view, cursor + 38, 0)
    writeUint32LE(view, cursor + 42, localOffset)
    cursor += 46

    out.set(item.nameBytes, cursor)
    cursor += item.nameBytes.byteLength
  }

  writeUint32LE(view, cursor, 0x06054b50)
  writeUint16LE(view, cursor + 4, 0)
  writeUint16LE(view, cursor + 6, 0)
  writeUint16LE(view, cursor + 8, prepared.length)
  writeUint16LE(view, cursor + 10, prepared.length)
  writeUint32LE(view, cursor + 12, centralTotalSize)
  writeUint32LE(view, cursor + 16, centralDirStart)
  writeUint16LE(view, cursor + 20, 0)

  return out
}

const ALLOWED_XLSX_XML_ENTRY =
  /^(?:xl\/sharedStrings\.xml|xl\/workbook\.xml|xl\/_rels\/workbook\.xml\.rels|xl\/worksheets\/sheet\d+\.xml)$/u

const resolveZipEntryBytes = async (
  method: number,
  slice: Uint8Array,
  budget: { remaining: number },
): Promise<Uint8Array> => {
  if (method === 0) {
    budget.remaining -= slice.byteLength

    if (budget.remaining < 0) {
      throw new Error("File Excel giải nén vượt quá giới hạn an toàn 5 MB.")
    }

    return slice
  }

  if (method === 8) {
    return await inflateRawBounded(slice, budget)
  }

  throw new Error(
    `Phương thức nén ZIP (${method}) trong file Excel không được hỗ trợ.`,
  )
}

const readAllowedZipXmlEntries = async (
  zipBytes: Uint8Array,
): Promise<Map<string, string>> => {
  if (zipBytes.byteLength > MAX_XLSX_BYTES) {
    throw new Error("File Excel vượt quá giới hạn dung lượng 5 MB.")
  }

  if (zipBytes.byteLength < 22) {
    throw new Error("File Excel (.xlsx) không hợp lệ hoặc bị hỏng.")
  }

  const view = new DataView(
    zipBytes.buffer,
    zipBytes.byteOffset,
    zipBytes.byteLength,
  )

  const minEocdOffset = Math.max(0, zipBytes.byteLength - 65557)
  let eocdOffset = -1

  for (
    let offset = zipBytes.byteLength - 22;
    offset >= minEocdOffset;
    offset -= 1
  ) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      eocdOffset = offset

      break
    }
  }

  if (eocdOffset < 0) {
    throw new Error("Không đọc được cấu trúc nén ZIP của file Excel (.xlsx).")
  }

  const entryCount = view.getUint16(eocdOffset + 10, true)
  const centralDirSize = view.getUint32(eocdOffset + 12, true)
  const centralDirOffset = view.getUint32(eocdOffset + 16, true)

  if (
    entryCount > 256 ||
    centralDirOffset + centralDirSize > zipBytes.byteLength
  ) {
    throw new Error(
      "Cấu trúc thư mục bên trong file Excel (.xlsx) không hợp lệ.",
    )
  }

  const allowedEntries: CentralDirectoryEntry[] = []
  let cursor = centralDirOffset
  let declaredBytes = 0

  for (let i = 0; i < entryCount; i += 1) {
    if (
      cursor + 46 > zipBytes.byteLength ||
      view.getUint32(cursor, true) !== 0x02014b50
    ) {
      throw new Error("Header mục dữ liệu trong file Excel (.xlsx) bị hỏng.")
    }

    const method = view.getUint16(cursor + 10, true)
    const compressedSize = view.getUint32(cursor + 20, true)
    const uncompressedSize = view.getUint32(cursor + 24, true)
    const nameLen = view.getUint16(cursor + 28, true)
    const extraLen = view.getUint16(cursor + 30, true)
    const commentLen = view.getUint16(cursor + 32, true)
    const localHeaderOffset = view.getUint32(cursor + 42, true)

    const nameStart = cursor + 46
    const nameEnd = nameStart + nameLen

    if (nameEnd > zipBytes.byteLength) {
      throw new Error("Tên mục bên trong file Excel (.xlsx) bị cắt cụt.")
    }

    const rawName = textDecoder.decode(zipBytes.subarray(nameStart, nameEnd))
    const normalizedName = rawName.replace(/^\/+/u, "")

    if (normalizedName.includes("..") || normalizedName.includes("\\")) {
      throw new Error("Đường dẫn nội bộ trong file Excel không an toàn.")
    }

    if (ALLOWED_XLSX_XML_ENTRY.test(normalizedName)) {
      declaredBytes += uncompressedSize

      if (declaredBytes > MAX_XLSX_BYTES) {
        throw new Error("Nội dung file Excel vượt quá giới hạn an toàn 5 MB.")
      }

      allowedEntries.push({
        name: normalizedName,
        method,
        compressedSize,
        uncompressedSize,
        localHeaderOffset,
      })
    }

    cursor = nameEnd + extraLen + commentLen
  }

  const budget = { remaining: MAX_XLSX_BYTES }

  const extracted: ParsedZipEntry[] = await Promise.all(
    allowedEntries.map(async (entry) => {
      if (
        entry.localHeaderOffset + 30 > zipBytes.byteLength ||
        view.getUint32(entry.localHeaderOffset, true) !== 0x04034b50
      ) {
        throw new Error("Local header của file Excel (.xlsx) bị lỗi.")
      }

      const localNameLen = view.getUint16(entry.localHeaderOffset + 26, true)
      const localExtraLen = view.getUint16(entry.localHeaderOffset + 28, true)
      const dataStart =
        entry.localHeaderOffset + 30 + localNameLen + localExtraLen
      const dataEnd = dataStart + entry.compressedSize

      if (dataEnd > zipBytes.byteLength) {
        throw new Error("Dữ liệu nén trong file Excel (.xlsx) không đầy đủ.")
      }

      const slice = zipBytes.subarray(dataStart, dataEnd)
      const rawBytes = await resolveZipEntryBytes(entry.method, slice, budget)
      const xmlText = textDecoder.decode(rawBytes)
      assertSafeXml(xmlText)

      return { name: entry.name, text: xmlText }
    }),
  )

  const result = new Map<string, string>()

  for (const item of extracted) {
    result.set(item.name, item.text)
  }

  return result
}

export const assertSafeXml = (xml: string): void => {
  if (/<!DOCTYPE|<!ENTITY/iu.test(xml)) {
    throw new Error(
      "File XML chứa khai báo thực thể không an toàn (DOCTYPE/ENTITY bị từ chối).",
    )
  }
}

const stripXmlControlChars = (input: string): string => {
  let out = ""

  for (const ch of input) {
    const code = ch.charCodeAt(0)

    if (code === 9 || code === 10 || code === 13 || code >= 32) {
      out += ch
    }
  }

  return out
}

const escapeXmlText = (input: string): string =>
  stripXmlControlChars(input)
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")

const escapeXmlAttr = (input: string): string =>
  escapeXmlText(input).replace(/"/gu, "&quot;").replace(/'/gu, "&apos;")

const decodeXmlEntities = (raw: string): string =>
  raw.replace(
    /&(#\d+|#x[0-9a-fA-F]+|amp|lt|gt|quot|apos);/gu,
    (_full: string, token: string) => {
      if (token.startsWith("#x") || token.startsWith("#X")) {
        const code = Number.parseInt(token.slice(2), 16)

        return Number.isFinite(code) && code >= 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : ""
      }

      if (token.startsWith("#")) {
        const code = Number.parseInt(token.slice(1), 10)

        return Number.isFinite(code) && code >= 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : ""
      }

      switch (token) {
        case "amp":
          return "&"

        case "lt":
          return "<"

        case "gt":
          return ">"

        case "quot":
          return '"'

        case "apos":
          return "'"

        default:
          return ""
      }
    },
  )

const columnIndexToLetters = (index: number): string => {
  let n = index + 1
  let letters = ""

  while (n > 0) {
    const rem = (n - 1) % 26
    letters = String.fromCharCode(65 + rem) + letters
    n = Math.floor((n - 1) / 26)
  }

  return letters
}

const cellRefToColumnIndex = (cellRef: string): number => {
  const match = /^([A-Za-z]+)/u.exec(cellRef)

  if (!match) {
    return -1
  }

  const letters = match[1].toUpperCase()
  let col = 0

  for (let i = 0; i < letters.length; i += 1) {
    col = col * 26 + (letters.charCodeAt(i) - 64)
  }

  return col - 1
}

const buildStylesXml =
  (): string => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><color rgb="FF111827"/><name val="Arial"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF15803D"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFD1D5DB"/></left>
      <right style="thin"><color rgb="FFD1D5DB"/></right>
      <top style="thin"><color rgb="FFD1D5DB"/></top>
      <bottom style="thin"><color rgb="FFD1D5DB"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="4">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment vertical="center" wrapText="1"/>
    </xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1">
      <alignment vertical="top" wrapText="1"/>
    </xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="top"/>
    </xf>
  </cellXfs>
</styleSheet>`

const buildWorksheetXml = (sheet: XlsxSheetInput): string => {
  const colsXml = sheet.columns
    .map(
      (width, index) =>
        `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`,
    )
    .join("")

  const rowsXml = sheet.rows
    .map((row, rowIndex) => {
      const rNum = rowIndex + 1
      const isHeader = rowIndex === 0
      const rowHeightAttr = isHeader ? ' ht="28" customHeight="1"' : ""

      const cellsXml = row
        .map((cell, colIndex) => {
          const ref = `${columnIndexToLetters(colIndex)}${rNum}`

          if (typeof cell === "number" && Number.isFinite(cell)) {
            const styleId = isHeader ? 1 : 3

            return `<c r="${ref}" s="${styleId}"><v>${cell}</v></c>`
          }

          const strValue = String(cell)
          const styleId = isHeader ? 1 : 2

          return `<c r="${ref}" s="${styleId}" t="inlineStr"><is><t xml:space="preserve">${escapeXmlText(strValue)}</t></is></c>`
        })
        .join("")

      return `<row r="${rNum}"${rowHeightAttr}>${cellsXml}</row>`
    })
    .join("")

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews>
    <sheetView workbookViewId="0">
      <pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>
    </sheetView>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="20"/>
  <cols>${colsXml}</cols>
  <sheetData>${rowsXml}</sheetData>
</worksheet>`
}

export const writeXlsxWorkbook = (
  sheets: XlsxSheetInput[],
): Promise<Uint8Array> => {
  const worksheetOverrides = sheets
    .map(
      (_sheet, index) =>
        `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join("")

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${worksheetOverrides}
</Types>`

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`

  const workbookSheetsXml = sheets
    .map((sheet, index) => {
      const cleanName = sheet.name.slice(0, 31) || `Sheet${index + 1}`

      return `<sheet name="${escapeXmlAttr(cleanName)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`
    })
    .join("")

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${workbookSheetsXml}</sheets>
</workbook>`

  const sheetRelsXml = sheets
    .map(
      (_sheet, index) =>
        `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
    )
    .join("")

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheetRelsXml}
  <Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`

  const zipInputs: ZipEntryInput[] = [
    { name: "[Content_Types].xml", data: textEncoder.encode(contentTypesXml) },
    { name: "_rels/.rels", data: textEncoder.encode(rootRelsXml) },
    { name: "xl/workbook.xml", data: textEncoder.encode(workbookXml) },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: textEncoder.encode(workbookRelsXml),
    },
    { name: "xl/styles.xml", data: textEncoder.encode(buildStylesXml()) },
    ...sheets.map((sheet, index) => ({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      data: textEncoder.encode(buildWorksheetXml(sheet)),
    })),
  ]

  return createZipBytes(zipInputs)
}

const extractAttr = (attrs: string, attrName: string): string | undefined => {
  const pattern = new RegExp(
    `(?:^|\\s)${attrName}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`,
    "u",
  )
  const match = pattern.exec(attrs)

  if (!match) {
    return undefined
  }

  const [, doubleQuoted, singleQuoted] = match
  const raw = doubleQuoted || singleQuoted || ""

  return decodeXmlEntities(raw)
}

const extractTextSegments = (fragment: string): string => {
  const segments: string[] = []
  const tRegex = /<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/gu
  let match = tRegex.exec(fragment)

  while (match !== null) {
    segments.push(decodeXmlEntities(match[1]))
    match = tRegex.exec(fragment)
  }

  return segments.join("")
}

const parseSharedStrings = (xml: string | undefined): string[] => {
  if (!xml) {
    return []
  }

  const strings: string[] = []
  const siRegex = /<(?:\w+:)?si(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?si>/gu
  let match = siRegex.exec(xml)

  while (match !== null) {
    strings.push(extractTextSegments(match[1]))
    match = siRegex.exec(xml)
  }

  return strings
}

const parseWorksheetRows = (
  xml: string,
  sharedStrings: string[],
): string[][] => {
  const rows: string[][] = []
  const rowRegex = /<(?:\w+:)?row\b[^>]*>([\s\S]*?)<\/(?:\w+:)?row>/gu
  let rowMatch = rowRegex.exec(xml)

  while (rowMatch !== null) {
    const [, rowBody] = rowMatch
    const cells: string[] = []
    const cellRegex = /<(?:\w+:)?c\b([^>]*)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/gu
    let cellMatch = cellRegex.exec(rowBody)
    let autoCol = 0

    while (cellMatch !== null) {
      const [, attrs, rawCellBody] = cellMatch
      const body = rawCellBody || ""
      const ref = extractAttr(attrs, "r")
      const cellType = extractAttr(attrs, "t")

      let colIndex = autoCol

      if (ref) {
        const parsedCol = cellRefToColumnIndex(ref)

        if (parsedCol >= 0) {
          colIndex = parsedCol
        }
      }

      autoCol = colIndex + 1

      while (cells.length <= colIndex) {
        cells.push("")
      }

      let value = ""

      if (cellType === "inlineStr") {
        value = extractTextSegments(body)
      } else {
        const vMatch = /<(?:\w+:)?v(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?v>/u.exec(
          body,
        )
        const rawVal = vMatch ? decodeXmlEntities(vMatch[1]).trim() : ""

        if (cellType === "s") {
          const idx = Number.parseInt(rawVal, 10)
          value =
            Number.isInteger(idx) && idx >= 0 && idx < sharedStrings.length
              ? sharedStrings[idx]
              : ""
        } else if (cellType === "b") {
          value = rawVal === "1" ? "TRUE" : "FALSE"
        } else {
          value = rawVal
        }
      }

      cells[colIndex] = value
      cellMatch = cellRegex.exec(rowBody)
    }

    rows.push(cells)
    rowMatch = rowRegex.exec(xml)
  }

  return rows
}

interface SheetBinding {
  name: string
  path: string
}

const resolveWorkbookSheets = (
  entries: Map<string, string>,
): SheetBinding[] => {
  const workbookXml = entries.get("xl/workbook.xml")
  const relsXml = entries.get("xl/_rels/workbook.xml.rels")
  const relTargets = new Map<string, string>()

  if (relsXml) {
    const relRegex = /<(?:\w+:)?Relationship\b([^>]*)\/?>/gu
    let match = relRegex.exec(relsXml)

    while (match !== null) {
      const id = extractAttr(match[1], "Id")
      const target = extractAttr(match[1], "Target")

      if (id && target) {
        const normalizedTarget = target.startsWith("/")
          ? target.replace(/^\/+/u, "")
          : `xl/${target.replace(/^\.\/+/u, "")}`
        relTargets.set(id, normalizedTarget)
      }

      match = relRegex.exec(relsXml)
    }
  }

  const bindings: SheetBinding[] = []

  if (workbookXml) {
    const sheetRegex = /<(?:\w+:)?sheet\b([^>]*)\/?>/gu
    let match = sheetRegex.exec(workbookXml)
    let fallbackIdx = 1

    while (match !== null) {
      const name = extractAttr(match[1], "name") ?? `Sheet${fallbackIdx}`
      const rId =
        extractAttr(match[1], "r:id") ?? extractAttr(match[1], "id") ?? ""
      const path =
        relTargets.get(rId) ?? `xl/worksheets/sheet${fallbackIdx}.xml`

      if (entries.has(path)) {
        bindings.push({ name, path })
      }

      fallbackIdx += 1
      match = sheetRegex.exec(workbookXml)
    }
  }

  if (bindings.length > 0) {
    return bindings
  }

  const sheetKeys = [...entries.keys()]
    .filter((key) => /^xl\/worksheets\/sheet\d+\.xml$/u.test(key))
    .sort()

  return sheetKeys.map((path, index) => ({
    name: `Sheet${index + 1}`,
    path,
  }))
}

export const readXlsxWorkbook = async (
  zipBytes: Uint8Array,
): Promise<XlsxParsedSheet[]> => {
  const entries = await readAllowedZipXmlEntries(zipBytes)
  const sharedStrings = parseSharedStrings(entries.get("xl/sharedStrings.xml"))
  const bindings = resolveWorkbookSheets(entries)

  if (bindings.length === 0) {
    throw new Error(
      "Không tìm thấy trang tính (worksheet) nào trong file Excel.",
    )
  }

  return bindings.map((binding) => ({
    name: binding.name,
    rows: parseWorksheetRows(entries.get(binding.path) ?? "", sharedStrings),
  }))
}
