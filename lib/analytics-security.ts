const INJECTION_SIGNATURE = /(?:\b(?:pg_)?sleep\s*\(|\bwaitfor\s+(?:delay|time)\b|\bdbms_pipe\.receive_message\s*\(|\bsysdate\s*\(|\b(?:or|xor)\s+\d+\s*\*\s*\d+\s*=\s*\d+|\bselect\s+\d+\s*\*\s*\d+)/i

export function hasInjectionSignature(values: unknown[]): boolean {
  return values.some(value => typeof value === 'string' && INJECTION_SIGNATURE.test(value))
}
