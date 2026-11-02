import { ACCOUNT_ROLES, SESSION_ROLES } from "@razzia/common/constants"
import z from "zod"

export const usernameValidator = z
  .string()
  .min(1, "errors:auth.usernameTooShort")
  .max(24, "errors:auth.usernameTooLong")

export const inviteCodeValidator = z
  .string()
  .length(6, "errors:auth.invalidInviteCode")

export const sessionClaimsValidator = z.object({
  sub: z.string().min(1),
  role: z.enum(SESSION_ROLES),
  ver: z.number().int().positive().optional(),
  username: z.string().min(1).optional(),
  displayName: z.string().min(1).optional(),
  iat: z.number(),
  exp: z.number(),
})

export const joinTicketClaimsValidator = z.object({
  sub: z.string().min(1),
  gameId: z.string().min(1),
  username: usernameValidator.optional(),
  iat: z.number(),
  exp: z.number(),
})

export const managerLoginValidator = z.object({
  password: z.string().min(1, "errors:manager.invalidPassword"),
})

export const sessionRequestValidator = z.object({
  token: z.string().optional(),
})

export const accountUsernameValidator = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "errors:auth.accountUsernameInvalid")
  .max(48, "errors:auth.accountUsernameInvalid")
  .regex(/^[a-z0-9._@-]+$/u, "errors:auth.accountUsernameInvalid")

export const displayNameValidator = z
  .string()
  .trim()
  .min(1, "errors:auth.displayNameRequired")
  .max(64, "errors:auth.displayNameTooLong")

export const accountPasswordValidator = z
  .string()
  .min(8, "errors:auth.passwordTooShort")
  .max(128, "errors:auth.passwordTooLong")

export const teacherInviteCodeInputValidator = z
  .string()
  .trim()
  .min(4, "errors:auth.teacherInviteInvalid")
  .max(32, "errors:auth.teacherInviteInvalid")

export const accountLoginValidator = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "errors:auth.invalidCredentials")
    .max(64, "errors:auth.invalidCredentials"),
  password: z
    .string()
    .min(1, "errors:auth.invalidCredentials")
    .max(128, "errors:auth.invalidCredentials"),
})

export const accountRegisterValidator = z.object({
  username: accountUsernameValidator,
  displayName: displayNameValidator,
  password: accountPasswordValidator,
  inviteCode: teacherInviteCodeInputValidator,
})

export const changePasswordValidator = z.object({
  currentPassword: z
    .string()
    .min(1, "errors:auth.invalidCredentials")
    .max(128, "errors:auth.invalidCredentials"),
  newPassword: accountPasswordValidator,
})

export const adminCreateUserValidator = z.object({
  username: accountUsernameValidator,
  displayName: displayNameValidator,
  password: accountPasswordValidator,
  role: z.enum(ACCOUNT_ROLES),
})

export const adminUpdateUserValidator = z.object({
  displayName: displayNameValidator.optional(),
  role: z.enum(ACCOUNT_ROLES).optional(),
  active: z.boolean().optional(),
  password: accountPasswordValidator.optional(),
})

export const adminInviteSettingsValidator = z.object({
  enabled: z.boolean(),
  code: teacherInviteCodeInputValidator.optional(),
})
