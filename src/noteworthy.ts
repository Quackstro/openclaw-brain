/**
 * Brain Core — Noteworthiness heuristic.
 *
 * Quick filter to decide whether a message is worth auto-capturing.
 */

/** Quick heuristic to filter out trivial messages from auto-capture. */
export function isMessageNoteworthy(text: string): boolean {
  const lower = text.toLowerCase().trim();
  // Skip very short messages
  if (lower.length < 20) return false;
  // Skip common acks/greetings
  const trivialPatterns = [
    /^(ok|okay|sure|yes|no|yep|nope|thanks|thank you|ty|thx|lol|haha|hmm|ah|oh|cool|nice|great|good|got it|understood|roger|ack)\s*[.!?]*$/i,
    /^(hi|hello|hey|yo|sup|morning|evening|night|gm|gn)\s*[.!?]*$/i,
    /^(👍|👌|✅|❌|🙏|😊|😂|🤣|💯|🔥|❤️|🎉)\s*$/,
  ];
  for (const pattern of trivialPatterns) {
    if (pattern.test(lower)) return false;
  }
  // Must have some substance (multiple words)
  const wordCount = lower.split(/\s+/).length;
  return wordCount >= 4;
}
