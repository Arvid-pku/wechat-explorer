const URL_REGEX = /\bhttps?:\/\/[^\s　<>"'「」『』【】〔〕）)]+/gi;

const DOMAIN_GROUPS: Record<string, string> = {
  "arxiv.org": "arxiv",
  "openreview.net": "openreview",
  "scholar.google.com": "scholar",
  "github.com": "github",
  "gist.github.com": "github",
  "huggingface.co": "huggingface",
  "twitter.com": "twitter",
  "x.com": "twitter",
  "mp.weixin.qq.com": "wechat-article",
  "weixin.qq.com": "wechat",
  "bilibili.com": "bilibili",
  "b23.tv": "bilibili",
  "zhihu.com": "zhihu",
  "zhuanlan.zhihu.com": "zhihu",
  "xiaohongshu.com": "xiaohongshu",
  "xhslink.com": "xiaohongshu",
  "youtube.com": "youtube",
  "youtu.be": "youtube",
  "douban.com": "douban",
  "douyin.com": "douyin",
  "weibo.com": "weibo",
  "weibo.cn": "weibo",
  "notion.so": "notion",
  "notion.site": "notion",
  "linkedin.com": "linkedin",
  "medium.com": "medium",
  "substack.com": "substack",
  "reddit.com": "reddit",
  "hackernews.com": "hackernews",
  "news.ycombinator.com": "hackernews",
  "wikipedia.org": "wikipedia",
  "stackoverflow.com": "stackoverflow",
  "stackexchange.com": "stackoverflow",
  "google.com": "google",
  "duckduckgo.com": "duckduckgo",
  "anthropic.com": "anthropic",
  "openai.com": "openai",
};

export interface ExtractedUrl {
  url: string;
  domain: string;
  group: string;
}

export function extractUrls(text: string): ExtractedUrl[] {
  if (!text) return [];
  const out: ExtractedUrl[] = [];
  const seen = new Set<string>();
  const matches = text.match(URL_REGEX) ?? [];
  for (const raw of matches) {
    let cleaned = raw.replace(/[.,;:!?）)]+$/, "");
    if (!seen.has(cleaned)) {
      seen.add(cleaned);
      out.push(toExtracted(cleaned));
    }
  }
  return out;
}

export function toExtracted(url: string): ExtractedUrl {
  const domain = extractDomain(url);
  return { url, domain, group: groupOf(domain) };
}

export function extractDomain(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "unknown";
  }
}

export function groupOf(domain: string): string {
  if (DOMAIN_GROUPS[domain]) return DOMAIN_GROUPS[domain];
  for (const [d, g] of Object.entries(DOMAIN_GROUPS)) {
    if (domain.endsWith("." + d)) return g;
  }
  return domain;
}
