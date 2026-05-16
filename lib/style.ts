/**
 * Voice-fingerprint computation shared between `/me` and the contact-detail
 * page. Given a sample of messages with `content` + `msg_type`, returns the
 * style block (avg chars / emoji rate / link rate / share of voice/image/
 * sticker + the top emoji).
 *
 * Both call sites previously had their own near-identical implementation; the
 * old contact-side helper additionally carried a `side` discriminator in its
 * output that the `/me` version didn't. We keep the field optional here so
 * callers can attach a label without forcing one when there's only one side.
 */

import { topEmoji } from "./text";

export interface StyleSample {
  content: string;
  msg_type: string;
}

export interface StyleFingerprint {
  /** Optional discriminator ("mine" / "theirs") — purely descriptive. */
  side?: "mine" | "theirs";
  sampleSize: number;
  avgChars: number;
  emojiPerMsg: number;
  linkPerMsg: number;
  voiceShare: number;
  imageShare: number;
  stickerShare: number;
  topEmoji: { emoji: string; n: number }[];
}

const URL_RE = /https?:\/\/\S+/i;

/**
 * Compute the style fingerprint over a sample. Voice/image/sticker shares are
 * computed against the full sample; avg chars and emoji-per-text are computed
 * against the text-message subset (otherwise a sample dominated by stickers
 * would report ~0 chars).
 */
export function computeStyle(
  rows: StyleSample[],
  side?: "mine" | "theirs",
): StyleFingerprint {
  let chars = 0;
  let emoji = 0;
  let links = 0;
  let voice = 0;
  let image = 0;
  let sticker = 0;
  let textCount = 0;
  const textForEmoji: string[] = [];
  for (const r of rows) {
    const c = r.content || "";
    const t = r.msg_type;
    if (t === "语音") voice++;
    else if (t === "图片") image++;
    else if (t === "表情") sticker++;
    else if (t === "文本") {
      textCount++;
      chars += [...c].length;
      for (const ch of c) if (/\p{Extended_Pictographic}/u.test(ch)) emoji++;
      if (URL_RE.test(c)) links++;
      textForEmoji.push(c);
    } else if (t.includes("链接")) {
      // "链接/文件" + "链接" both count toward link rate.
      links++;
    }
  }
  const n = rows.length || 1;
  const textN = textCount || 1;
  return {
    side,
    sampleSize: rows.length,
    avgChars: chars / textN,
    emojiPerMsg: emoji / textN,
    linkPerMsg: links / n,
    voiceShare: voice / n,
    imageShare: image / n,
    stickerShare: sticker / n,
    topEmoji: topEmoji(textForEmoji, side ? 8 : 12),
  };
}
