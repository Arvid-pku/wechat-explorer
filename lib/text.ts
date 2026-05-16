/**
 * Text utilities for Chinese + English message analytics.
 *
 * Uses Node's built-in Intl.Segmenter (available in modern V8) for Chinese
 * word segmentation, plus a curated CJK + English stopword list and a small
 * TF-IDF helper. No external deps. Reused by Calendar, Contacts, and Recap.
 */

const ZH_SEGMENTER = new Intl.Segmenter("zh", { granularity: "word" });

const EMOJI_RE = /\p{Extended_Pictographic}/gu;
const URL_RE = /https?:\/\/\S+/gi;
const PUNCT_RE = /[\p{P}\p{S}\s]+/gu;

// CJK + common English stopwords. Kept small + curated to maximize signal.
export const STOPWORDS = new Set<string>([
  // Chinese particles + pronouns
  "的", "了", "是", "在", "我", "你", "他", "她", "它", "我们", "你们", "他们",
  "这", "那", "这个", "那个", "这些", "那些", "和", "与", "或", "也", "都", "就", "还",
  "不", "没", "没有", "有", "对", "吗", "呢", "啊", "哦", "嗯", "哈哈", "哈", "嘿", "呀", "吧",
  "但", "但是", "因为", "所以", "如果", "可以", "可能", "应该", "需要", "要", "想",
  "上", "下", "中", "里", "外", "前", "后", "里面", "外面", "时候", "时间", "今天", "明天",
  "什么", "怎么", "为什么", "怎么样", "如何", "哪里", "谁", "几", "多少",
  "一个", "一下", "一些", "一直", "一样", "一起",
  "好", "好的", "好吧", "好看", "真", "真的", "非常", "很", "比较", "更", "最", "太",
  "知道", "看", "看到", "看看", "听", "说", "讲", "做", "去", "来", "到", "走",
  "吃", "喝", "买", "卖", "用", "把", "被", "让", "给", "从", "向", "往",
  "啦", "嘛", "哇", "哎", "诶", "嘞", "呐", "喂", "唉", "嗨",
  "之", "等", "及", "其", "并", "于", "中", "里",
  "已经", "正在", "将", "将要", "已", "曾", "曾经",
  "或者", "而且", "并且", "另外", "另", "其他", "其它",
  // English common words
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being", "to", "of", "in",
  "for", "on", "with", "at", "by", "as", "from", "this", "that", "these", "those",
  "and", "or", "but", "if", "then", "else", "so", "not", "no", "do", "does", "did",
  "have", "has", "had", "i", "you", "he", "she", "it", "we", "they", "me", "him",
  "her", "them", "my", "your", "his", "their", "our", "us", "what", "when", "where",
  "why", "how", "which", "who", "whom", "can", "could", "would", "should", "will",
  "just", "also", "than", "too", "very", "only", "more", "most", "any", "some", "all",
  "into", "out", "up", "down", "over", "under", "after", "before", "between",
  "ok", "okay", "yes", "yeah", "no", "hmm", "haha", "lol", "lmao", "u", "ur", "im",
  "thanks", "thank", "thx", "pls", "please", "sure", "right", "well", "still", "now",
  // numbers as digit strings often turn up as junk
  "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
  "00", "01", "02", "03", "04", "05", "06", "07", "08", "09",
  // WeChat boilerplate
  "微信", "公众号", "链接", "图片", "视频", "语音", "聊天", "记录", "转账", "发送", "收到",
  "查看", "点击", "打开", "分享", "wechat", "weixin",
]);

const SINGLE_CHAR_KEEP = new Set<string>([
  // single chars that are still meaningful as topic words
]);

/**
 * Tokenize a string into normalized lower-case tokens, dropping URLs,
 * emoji, punctuation, stopwords, and 1-char CJK tokens (most are filler).
 */
export function tokenize(input: string): string[] {
  if (!input) return [];
  const cleaned = input.replace(URL_RE, " ").replace(EMOJI_RE, " ");
  const out: string[] = [];

  // Walk via Intl.Segmenter for proper CJK segmentation.
  for (const seg of ZH_SEGMENTER.segment(cleaned)) {
    if (!seg.isWordLike) continue;
    const raw = seg.segment.trim();
    if (!raw) continue;
    const norm = raw.toLowerCase();
    if (PUNCT_RE.test(norm) && norm.replace(PUNCT_RE, "") === "") continue;
    if (STOPWORDS.has(norm)) continue;
    if (norm.length === 1 && !SINGLE_CHAR_KEEP.has(norm)) {
      // single Latin char tokens are noise; single CJK chars are mostly particles
      if (/^[a-z0-9]$/.test(norm)) continue;
      if (/^[一-鿿]$/.test(norm)) continue;
    }
    // drop pure-numeric tokens
    if (/^\d+$/.test(norm) && norm.length < 3) continue;
    // drop tokens that are still all punctuation
    if (PUNCT_RE.test(norm) && norm.replace(PUNCT_RE, "") === "") continue;
    out.push(norm);
  }
  return out;
}

export interface ScoredWord {
  word: string;
  weight: number;
  count: number;
}

/**
 * Plain term-frequency over a corpus (array of doc strings or pre-tokenized).
 */
export function termFreq(docs: (string | string[])[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const d of docs) {
    const toks = Array.isArray(d) ? d : tokenize(d);
    for (const t of toks) {
      tf.set(t, (tf.get(t) ?? 0) + 1);
    }
  }
  return tf;
}

/**
 * TF-IDF style "what is interesting about THIS subset versus the baseline".
 * `subset` and `baseline` are bags of (word -> count). Returns top-N by
 * `subsetTf * log((baselineTotal+1) / (baselineCount+1))` smoothed.
 *
 * `min` filters tokens that appear fewer than min times in the subset
 * (default 2).
 */
export function tfidfAgainst(
  subset: Map<string, number>,
  baseline: Map<string, number>,
  opts: { top?: number; min?: number } = {},
): ScoredWord[] {
  const top = opts.top ?? 30;
  const min = opts.min ?? 2;
  const baselineTotal = Array.from(baseline.values()).reduce((a, b) => a + b, 0);
  const scored: ScoredWord[] = [];
  for (const [word, count] of subset) {
    if (count < min) continue;
    const base = baseline.get(word) ?? 0;
    // smoothed IDF: rare-in-baseline words score higher
    const idf = Math.log((baselineTotal + 10) / (base + 1));
    const weight = count * idf;
    scored.push({ word, weight, count });
  }
  scored.sort((a, b) => b.weight - a.weight);
  return scored.slice(0, top);
}

/**
 * Simple top-N by raw count. Used when there's no baseline to compare against.
 */
export function topByCount(tf: Map<string, number>, opts: { top?: number; min?: number } = {}): ScoredWord[] {
  const top = opts.top ?? 30;
  const min = opts.min ?? 2;
  const scored: ScoredWord[] = [];
  for (const [word, count] of tf) {
    if (count < min) continue;
    scored.push({ word, weight: count, count });
  }
  scored.sort((a, b) => b.weight - a.weight);
  return scored.slice(0, top);
}

/**
 * Extract a vocabulary diff: words used heavily by side A but rarely by side B.
 * Returns { aOnly, bOnly } ordered by signal.
 */
export function vocabDiff(
  a: Map<string, number>,
  b: Map<string, number>,
  opts: { top?: number; min?: number } = {},
): { aOnly: ScoredWord[]; bOnly: ScoredWord[] } {
  return {
    aOnly: tfidfAgainst(a, b, opts),
    bOnly: tfidfAgainst(b, a, opts),
  };
}

const EMOJI_BUCKET_RE = /\p{Extended_Pictographic}/u;
/**
 * Count emoji codepoints in a string. WeChat custom emoticons like [开心]
 * are not Unicode emoji and are not counted here.
 */
export function countEmoji(s: string): number {
  if (!s) return 0;
  let n = 0;
  for (const ch of s) {
    if (EMOJI_BUCKET_RE.test(ch)) n++;
  }
  return n;
}

/**
 * Return top emoji (as a Map of glyph -> count).
 */
export function topEmoji(messages: string[], top = 12): { emoji: string; n: number }[] {
  const counts = new Map<string, number>();
  for (const m of messages) {
    if (!m) continue;
    for (const ch of m) {
      if (EMOJI_BUCKET_RE.test(ch)) {
        counts.set(ch, (counts.get(ch) ?? 0) + 1);
      }
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([emoji, n]) => ({ emoji, n }));
}
