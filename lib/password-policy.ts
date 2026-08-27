import { z } from "zod";

export const PASSWORD_REQUIREMENTS = [
  "At least 8 characters",
  "At least one uppercase letter",
  "At least one lowercase letter",
  "At least one number",
  "At least one symbol"
] as const;

export const passwordSchema = z.string()
  .min(8, "Password must be at least 8 characters.")
  .regex(/[A-Z]/, "Password must include an uppercase letter.")
  .regex(/[a-z]/, "Password must include a lowercase letter.")
  .regex(/[0-9]/, "Password must include a number.")
  .regex(/[^A-Za-z0-9]/, "Password must include a symbol.");

export const newPasswordSchema = z.object({
  password: passwordSchema,
  confirmPassword: z.string()
}).superRefine(({ password, confirmPassword }, context) => {
  if (password !== confirmPassword) context.addIssue({ code: z.ZodIssueCode.custom, path: ["confirmPassword"], message: "Passwords do not match." });
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password."),
  password: passwordSchema,
  confirmPassword: z.string()
}).superRefine(({ password, confirmPassword }, context) => {
  if (password !== confirmPassword) context.addIssue({ code: z.ZodIssueCode.custom, path: ["confirmPassword"], message: "Passwords do not match." });
});

export const recoveryEmailSchema = z.string().trim().email("Enter a valid email address.");
