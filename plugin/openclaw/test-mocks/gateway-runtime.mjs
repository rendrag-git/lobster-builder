export const ErrorCodes = {
  INVALID_REQUEST: 'invalid_request',
}

export function errorShape(code, message) {
  return { code, message }
}
