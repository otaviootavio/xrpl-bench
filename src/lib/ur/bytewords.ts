// SPDX-License-Identifier: BSD-2-Clause-Patent. Algorithms after Blockchain
// Commons `bc-ur` (Copyright © 2020 Blockchain Commons, LLC); see ./NOTICE.md.
import { crc32, u32be } from './crc32'

/**
 * Bytewords (BCR-2020-012), the minimal and the standard style. A UR body is
 * minimal Bytewords: two letters (a word's first and last) per byte, followed
 * by the CRC-32 of the bytes. Decoding checks that CRC and throws on any
 * mismatch, unknown pair or a body shorter than the checksum.
 */

/** The 256 bytewords in byte order, as published in BCR-2020-012. */
const WORDS_JOINED =
  'ableacidalsoapexaquaarchatomauntawayaxisbackbaldbarnbeltbetabiasbluebodybragbrewbulbbuzzcalmcashcatschefcityclawcodecolacookcostcruxcurlcuspcyandarkdatadaysdelidicedietdoordowndrawdropdrumdulldutyeacheasyechoedgeepicevenexamexiteyesfactfairfernfigsfilmfishfizzflapflewfluxfoxyfreefrogfuelfundgalagamegeargemsgiftgirlglowgoodgraygrimgurugushgyrohalfhanghardhawkheathelphighhillholyhopehornhutsicedideaidleinchinkyintoirisironitemjadejazzjoinjoltjowljudojugsjumpjunkjurykeepkenokeptkeyskickkilnkingkitekiwiknoblamblavalazyleaflegsliarlimplionlistlogoloudloveluaulucklungmainmanymathmazememomenumeowmildmintmissmonknailnavyneednewsnextnoonnotenumbobeyoboeomitonyxopenovalowlspaidpartpeckplaypluspoempoolposepuffpumapurrquadquizraceramprealredorichroadrockroofrubyruinrunsrustsafesagascarsetssilkskewslotsoapsolosongstubsurfswantacotasktaxitenttiedtimetinytoiltombtoystriptunatwinuglyundouniturgeuservastveryvetovialvibeviewvisavoidvowswallwandwarmwaspwavewaxywebswhatwhenwhizwolfworkyankyawnyellyogayurtzapszerozestzinczonezoom'

const WORDS: readonly string[] = Array.from({ length: 256 }, (_, i) => WORDS_JOINED.slice(i * 4, i * 4 + 4))
const MINIMAL: readonly string[] = WORDS.map((w) => w[0] + w[3])
const BY_WORD = new Map(WORDS.map((w, i) => [w, i]))
const BY_MINIMAL = new Map(MINIMAL.map((m, i) => [m, i]))

export class BytewordsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BytewordsError'
  }
}

function withChecksum(data: Uint8Array): Uint8Array {
  const out = new Uint8Array(data.length + 4)
  out.set(data)
  out.set(u32be(crc32(data)), data.length)
  return out
}

function checked(bytes: number[]): Uint8Array {
  if (bytes.length < 5) throw new BytewordsError('too short')
  const body = Uint8Array.from(bytes.slice(0, -4))
  const sum = u32be(crc32(body))
  for (let i = 0; i < 4; i++) {
    if (sum[i] !== bytes[bytes.length - 4 + i]) throw new BytewordsError('bad checksum')
  }
  return body
}

export function encodeMinimal(data: Uint8Array): string {
  let out = ''
  for (const b of withChecksum(data)) out += MINIMAL[b]
  return out
}

export function decodeMinimal(text: string): Uint8Array {
  const s = text.toLowerCase()
  if (s.length % 2 !== 0) throw new BytewordsError('odd length')
  const bytes: number[] = []
  for (let i = 0; i < s.length; i += 2) {
    const b = BY_MINIMAL.get(s.slice(i, i + 2))
    if (b === undefined) throw new BytewordsError('unknown byteword')
    bytes.push(b)
  }
  return checked(bytes)
}

/** Words separated by `separator` (" " is the standard style, "-" the URI style). */
export function encodeWords(data: Uint8Array, separator = ' '): string {
  return Array.from(withChecksum(data), (b) => WORDS[b]).join(separator)
}

export function decodeWords(text: string, separator = ' '): Uint8Array {
  if (text.length === 0) throw new BytewordsError('too short')
  const bytes = text
    .toLowerCase()
    .split(separator)
    .map((w) => {
      const b = BY_WORD.get(w)
      if (b === undefined) throw new BytewordsError('unknown byteword')
      return b
    })
  return checked(bytes)
}
