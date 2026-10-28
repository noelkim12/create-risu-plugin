const PKCS8_BEGIN = "-----BEGIN PRIVATE KEY-----"
const PKCS8_END = "-----END PRIVATE KEY-----"
const MAX_OID_CONTENT_BYTES = 128
const MAX_OID_SUBIDENTIFIER_BYTES = 9

type DerElement = {
  readonly tag: number
  readonly contentStart: number
  readonly end: number
}

function readDerElement(bytes: Uint8Array, offset: number): DerElement | null {
  const tag = bytes[offset]
  const firstLengthByte = bytes[offset + 1]
  if (tag === undefined || firstLengthByte === undefined) return null
  let contentStart = offset + 2
  let length = firstLengthByte
  if ((firstLengthByte & 0x80) !== 0) {
    const lengthByteCount = firstLengthByte & 0x7f
    if (lengthByteCount === 0 || lengthByteCount > 4 || bytes.length - contentStart < lengthByteCount) return null
    const firstLength = bytes[contentStart]
    if (firstLength === undefined || firstLength === 0) return null
    length = 0
    for (let index = 0; index < lengthByteCount; index += 1) {
      const lengthByte = bytes[contentStart + index]
      if (lengthByte === undefined) return null
      length = (length * 256) + lengthByte
    }
    if (length < 128) return null
    contentStart += lengthByteCount
  }
  const end = contentStart + length
  return end <= bytes.length ? { tag, contentStart, end } : null
}

function isCanonicalObjectIdentifier(bytes: Uint8Array, element: DerElement): boolean {
  if (element.end === element.contentStart || element.end - element.contentStart > MAX_OID_CONTENT_BYTES) return false
  let offset = element.contentStart
  while (offset < element.end) {
    let groupCount = 0
    while (offset < element.end) {
      const octet = bytes[offset]
      if (octet === undefined || groupCount === MAX_OID_SUBIDENTIFIER_BYTES) return false
      if (groupCount === 0 && octet === 0x80) return false
      groupCount += 1
      offset += 1
      if ((octet & 0x80) === 0) break
    }
    const finalOctet = bytes[offset - 1]
    if (groupCount === 0 || finalOctet === undefined || (finalOctet & 0x80) !== 0) return false
  }
  return true
}

function isAlgorithmIdentifier(bytes: Uint8Array, element: DerElement): boolean {
  const objectIdentifier = readDerElement(bytes, element.contentStart)
  if (objectIdentifier === null || objectIdentifier.tag !== 0x06 || !isCanonicalObjectIdentifier(bytes, objectIdentifier)) return false
  if (objectIdentifier.end === element.end) return true
  const parameters = readDerElement(bytes, objectIdentifier.end)
  return parameters !== null && parameters.end === element.end
}

export function isPkcs8PrivateKey(value: string): boolean {
  const normalized = value.trim()
  if (!normalized.startsWith(PKCS8_BEGIN) || !normalized.endsWith(PKCS8_END)) return false
  const body = normalized.slice(PKCS8_BEGIN.length, -PKCS8_END.length)
  if (!/^\r?\n(?:[A-Za-z0-9+/]+={0,2}\r?\n)+$/.test(body)) return false
  const base64 = body.replace(/\r?\n/g, "")
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) return false
  const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0))
  const sequence = readDerElement(bytes, 0)
  if (sequence === null || sequence.tag !== 0x30 || sequence.end !== bytes.length) return false
  const version = readDerElement(bytes, sequence.contentStart)
  if (version === null || version.tag !== 0x02 || version.end !== version.contentStart + 1 || bytes[version.contentStart] !== 0) return false
  const algorithm = readDerElement(bytes, version.end)
  if (algorithm === null || algorithm.tag !== 0x30 || !isAlgorithmIdentifier(bytes, algorithm)) return false
  const privateKey = readDerElement(bytes, algorithm.end)
  return privateKey !== null && privateKey.tag === 0x04 && privateKey.end === sequence.end
}
