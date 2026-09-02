// Plain-language mapping for common transaction result codes — see
// docs/user-stories/sending-payments.md US-6 and transaction-history.md US-2.
// Raw codes are always still shown alongside these (advanced/debug detail).
const MESSAGES: Record<string, string> = {
  tesSUCCESS: 'Success.',
  tecUNFUNDED_PAYMENT: "You don't have enough XRP to cover this payment and the reserve.",
  tecNO_DST: "The recipient account doesn't exist yet and needs to be funded with enough XRP to activate it.",
  tecNO_DST_INSUF_XRP:
    "The recipient account doesn't exist yet and this amount is below the minimum needed to activate it.",
  tecPATH_DRY: "The recipient can't receive this token right now (no usable path).",
  tecNO_LINE: "The recipient can't receive this token (no trust line to the issuer).",
  tecNO_LINE_INSUF_RESERVE: "You don't have enough spendable XRP to cover the reserve for this trust line.",
  tecFROZEN: 'This asset is frozen by its issuer and cannot be moved.',
  tecPATH_PARTIAL: 'The full amount could not be delivered along an available path.',
  tecUNFUNDED: "You don't have enough funds to submit this transaction.",
  tefPAST_SEQ: 'This transaction was already superseded by another from this account (sequence number reused).',
  temBAD_AMOUNT: 'The amount entered is not valid.',
  temDST_IS_SRC: "You can't send a payment to your own address as the destination.",
  temREDUNDANT: 'This trust line change has no effect (limit already set to this value).',
}

export function describeResultCode(code: string): string {
  return MESSAGES[code] ?? `Ledger returned: ${code}.`
}
