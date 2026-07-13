function bytesToBase64(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export async function createRsaPrivateKeyPem(): Promise<{
  readonly privateKey: CryptoKey
  readonly publicKey: CryptoKey
  readonly pem: string
}> {
  const keys = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  )
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", keys.privateKey))
  const body = bytesToBase64(pkcs8).match(/.{1,64}/g)?.join("\n") ?? ""
  return {
    ...keys,
    pem: `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n`,
  }
}
