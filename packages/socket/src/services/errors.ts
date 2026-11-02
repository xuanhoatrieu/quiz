import { StatusCodes } from "http-status-codes"

type DomainErrorStatus =
  | StatusCodes.BAD_REQUEST
  | StatusCodes.UNAUTHORIZED
  | StatusCodes.FORBIDDEN
  | StatusCodes.NOT_FOUND
  | StatusCodes.CONFLICT
  | StatusCodes.UNSUPPORTED_MEDIA_TYPE
  | StatusCodes.TOO_MANY_REQUESTS
  | StatusCodes.INTERNAL_SERVER_ERROR

export class DomainError extends Error {
  readonly key: string
  readonly status: DomainErrorStatus

  constructor(key: string, status: DomainErrorStatus) {
    super(key)
    this.key = key
    this.status = status
  }
}

export const notFound = (key: string) =>
  new DomainError(key, StatusCodes.NOT_FOUND)

export const invalidInput = (key: string) =>
  new DomainError(key, StatusCodes.BAD_REQUEST)

export const unauthorized = (key: string) =>
  new DomainError(key, StatusCodes.UNAUTHORIZED)

export const forbidden = (key: string) =>
  new DomainError(key, StatusCodes.FORBIDDEN)

export const conflict = (key: string) =>
  new DomainError(key, StatusCodes.CONFLICT)

export const unsupportedMediaType = (key: string) =>
  new DomainError(key, StatusCodes.UNSUPPORTED_MEDIA_TYPE)

export const tooManyRequests = (key: string) =>
  new DomainError(key, StatusCodes.TOO_MANY_REQUESTS)

export const serverError = (key: string) =>
  new DomainError(key, StatusCodes.INTERNAL_SERVER_ERROR)
