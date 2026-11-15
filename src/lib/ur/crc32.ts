// SPDX-License-Identifier: BSD-2-Clause-Patent. Algorithms after Blockchain
// Commons `bc-ur` (Copyright © 2020 Blockchain Commons, LLC); see ./NOTICE.md.

/** CRC-32 (IEEE 802.3, reflected, polynomial 0xEDB88320): the checksum UR
 * uses for a Bytewords body and for the whole message of a multi-part UR. */
const TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

/** The checksum as an unsigned 32-bit integer. */
export function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (const b of data) c = TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** A 32-bit integer as four big-endian bytes (`int_to_bytes` in `bc-ur`). */
export function u32be(n: number): Uint8Array {
  return new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff])
}
