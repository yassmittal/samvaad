import type { ErrorCode } from '@samvaad/shared';
import type { z } from 'zod';

/** An unsupported language gets its own code, so the UI can say what is wrong. */
export function findErrorCodeForInvalidMessage(error: z.ZodError): ErrorCode {
  const isLanguageProblem = error.issues.some(
    (issue) => issue.path[0] === 'languageCodes' && issue.code === 'invalid_value',
  );
  return isLanguageProblem ? 'UNSUPPORTED_LANGUAGE' : 'INVALID_MESSAGE';
}
