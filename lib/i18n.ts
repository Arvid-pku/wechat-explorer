/**
 * Tiny i18n: a flat dictionary keyed by locale, plus a `t()` resolver. No
 * deps, no runtime parser — every string we want to translate lives here, and
 * the resolver picks the right column for the active locale.
 *
 * Locale persistence: a `we-locale` cookie set by `LanguageToggle`. Server
 * components read it via `getServerLocale()` in `lib/i18n-server.ts`. Client
 * components consume the same value through `LocaleProvider`.
 *
 * Scope: navigation, common buttons, and the most visible page titles. Chat
 * content (messages, sender names) is user data and stays as-is. The aim is
 * a polished surface rather than full coverage of every label.
 */

export type Locale = "en" | "zh";

export const LOCALES: Locale[] = ["en", "zh"];
export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  zh: "中文",
};

// The dictionary is `{ key: { en, zh } }`. Adding a new key is O(1) — drop a
// new top-level entry, fill in both columns. Missing keys fall back to the
// English entry (and then to the key string) so a translation gap surfaces
// as the original copy rather than `undefined`.
const DICT = {
  // Nav
  "nav.overview": { en: "Overview", zh: "概览" },
  "nav.you": { en: "You", zh: "你" },
  "nav.contacts": { en: "Contacts", zh: "联系人" },
  "nav.links": { en: "Links", zh: "链接" },
  "nav.search": { en: "Search", zh: "搜索" },
  "nav.calendar": { en: "Calendar", zh: "日历" },
  "nav.reading": { en: "Reading queue", zh: "稍后阅读" },
  "nav.topics": { en: "Topics", zh: "话题" },
  "nav.graph": { en: "Graph", zh: "关系图" },
  "nav.settings": { en: "Settings", zh: "设置" },

  // Common
  "common.loading": { en: "Loading…", zh: "加载中…" },
  "common.save": { en: "Save", zh: "保存" },
  "common.cancel": { en: "Cancel", zh: "取消" },
  "common.search": { en: "Search", zh: "搜索" },
  "common.archive": { en: "Archive", zh: "归档" },
  "common.restore": { en: "Restore", zh: "恢复" },
  "common.export": { en: "Export", zh: "导出" },
  "common.read": { en: "Read", zh: "已读" },
  "common.unread": { en: "Unread", zh: "未读" },
  "common.all": { en: "All", zh: "全部" },
  "common.you": { en: "You", zh: "你" },
  "common.them": { en: "Them", zh: "对方" },
  "common.combined": { en: "Combined", zh: "合并" },
  "common.splitByType": { en: "Split by type", zh: "按类型拆分" },
  "common.week": { en: "Week", zh: "周" },
  "common.month": { en: "Month", zh: "月" },
  "common.year": { en: "Year", zh: "年" },
  "common.private": { en: "Private", zh: "私聊" },
  "common.groups": { en: "Groups", zh: "群聊" },
  "common.archived": { en: "Archived", zh: "已归档" },
  "common.includeArchived": { en: "Include archived", zh: "包含已归档" },
  "common.archivedShown": { en: "Archived shown", zh: "已显示归档" },
  "common.older": { en: "Older →", zh: "更早 →" },
  "common.newer": { en: "← Newer", zh: "← 更新" },
  "common.openCalendar": { en: "Open in calendar", zh: "在日历中打开" },
  "common.backToContacts": { en: "Back to contacts", zh: "返回联系人列表" },
  "common.backToSearch": { en: "Back to search", zh: "返回搜索" },
  "common.backToOverview": { en: "Overview", zh: "概览" },

  // Overview
  "overview.title": { en: "Overview", zh: "概览" },
  "overview.lastRefreshed": { en: "Index refreshed", zh: "索引更新于" },
  "overview.notIndexed": { en: "Index has not been built yet", zh: "尚未建立索引" },
  "overview.sessions": { en: "Sessions", zh: "会话" },
  "overview.indexedMessages": { en: "Indexed messages", zh: "已索引消息" },
  "overview.sharedLinks": { en: "Shared links", zh: "分享的链接" },
  "overview.contacts": { en: "Contacts", zh: "通讯录联系人" },
  "overview.activity365": { en: "Activity (last 365 days)", zh: "近 365 天活跃度" },
  "overview.activity365Desc": {
    en: "Daily message count across all indexed chats",
    zh: "全部已索引会话的每日消息总数",
  },
  "overview.msgTypes": { en: "Message types", zh: "消息类型" },
  "overview.msgTypesDesc": { en: "Top types in your index", zh: "你索引中数量最多的类型" },
  "overview.topLinks": { en: "Top link sources", zh: "主要链接来源" },
  "overview.topLinksDesc": {
    en: "Most shared domain groups across all chats",
    zh: "全部会话中分享最多的域名分组",
  },
  "overview.surprises": { en: "Surprises", zh: "惊喜发现" },
  "overview.surprisesDesc": {
    en: "Anomalies and patterns in the last few weeks, vs your usual baseline.",
    zh: "近几周相对你日常基线的异常与变化。",
  },
  "overview.recap": { en: "in Review", zh: "年度回顾" },

  // /me
  "me.eyebrow": { en: "From your perspective", zh: "以你的视角" },
  "me.title": { en: "You in numbers", zh: "数字里的你" },
  "me.heroMessages": { en: "Messages you sent", zh: "你发出的消息" },
  "me.heroShare": { en: "of all indexed conversation", zh: "占索引消息总数" },
  "me.heroActiveDays": { en: "Active days", zh: "活跃天数" },
  "me.heroLongestStreak": { en: "Longest streak", zh: "最长连续" },
  "me.heroPeakHour": { en: "Peak hour", zh: "高峰小时" },
  "me.heroMedianReply": { en: "Median reply", zh: "回复中位数" },
  "me.heroTheirReply": { en: "Theirs to you", zh: "对方回复你" },
  "me.heroNoLatency": { en: "Not enough reply pairs", zh: "回复样本不足" },
  "me.overTimeTitle": { en: "Your messages over time", zh: "你的消息随时间变化" },
  "me.overTimeTwo": {
    en: "Two lines: you vs them per",
    zh: "两条线：你 vs 对方，按",
  },
  "me.overTimeThree": {
    en: "Three lines: you vs them in private chats vs them in groups, per",
    zh: "三条线：你 vs 私聊里的对方 vs 群聊里的对方，按",
  },
  "me.vsLastYear": { en: "vs. last 365 days", zh: "对比上一个 365 天" },
  "me.vsLastYearDesc": {
    en: "Rolling 12-month comparison.",
    zh: "滚动 12 个月对比。",
  },
  "me.vsLastYearUnreliable": {
    en: "Heads up: the prior-year sample is much smaller than this one. Likely an incomplete index — run a Deep index to fill in older history.",
    zh: "提示：上一个 365 天的样本明显小于当前 365 天，很可能是索引不完整 — 跑一次 Deep index 把旧历史补回来。",
  },
  "me.theirMessages": { en: "Their messages", zh: "对方消息" },
  "me.yourShare": { en: "Your share", zh: "你的占比" },
  "me.combined": { en: "Combined", zh: "合并" },
  "me.splitByType": { en: "Split by type", zh: "按类型拆分" },

  // Reading
  "reading.title": { en: "Reading queue", zh: "稍后阅读" },
  "reading.desc": {
    en: "Recent long-form links shared with you — articles, posts, threads",
    zh: "你近期收到的长文链接 — 公众号、小红书、知乎等",
  },
  "reading.unique": { en: "unique articles", zh: "篇文章" },
  "reading.page": { en: "page", zh: "第" },
  "reading.pageOf": { en: "of", zh: "页 / 共" },
  "reading.sharedTimes": { en: "shared", zh: "分享" },
  "reading.aggregatedFrom": { en: "Aggregated from", zh: "来源：" },
  "reading.dedupNote": {
    en: "Same URL shared in multiple chats is shown once — see the \"shared N×\" badge. Tick the checkbox to mark an item read.",
    zh: "同一条链接在多个会话中分享只显示一次，旁边的 “shared N×” 标签会告诉你出现次数。勾选复选框即可标为已读。",
  },

  // Topics
  "topics.title": { en: "Topics", zh: "话题" },
  "topics.subtitle": { en: "Track a word over time", zh: "追踪一个词在时间上的变化" },
  "topics.desc": {
    en: "Plot when a specific word entered your conversations, who uses it, and which chats it lives in.",
    zh: "看一个具体的词何时进入你的对话、谁在用、活在哪些聊天里。",
  },
  "topics.lookup": { en: "Look up a word", zh: "查询一个词" },
  "topics.lookupDesc": {
    en: "Type the term and press enter. Trigram-FTS5 powered; 2-char CJK falls back to LIKE.",
    zh: "输入关键词回车。基于 trigram FTS5；2 字 CJK 自动 LIKE 兜底。",
  },
  "topics.suggestions": { en: "Suggestions from your recent years", zh: "来自最近两年的关键词建议" },
  "topics.placeholder": { en: "e.g. GPT, 球, Cursor", zh: "例如：GPT、球、Cursor" },
  "topics.track": { en: "Track", zh: "追踪" },

  // Fun facts
  "fun.title": { en: "Did you know", zh: "你不知道吧" },
  "fun.subtitle": {
    en: "Records and oddities mined from your indexed chats.",
    zh: "从你索引的聊天里挖出来的记录与冷知识。",
  },
  "fun.section.time": { en: "Time markers", zh: "时间记号" },
  "fun.section.people": { en: "Who's around you", zh: "人际记录" },
  "fun.section.records": { en: "Records & bursts", zh: "文字与爆发" },
  "fun.section.scope": { en: "Coverage", zh: "覆盖范围" },
  "fun.busiestDay": { en: "Busiest day overall", zh: "全语料最忙的一天" },
  "fun.busiestMineDay": { en: "Your busiest send-day", zh: "你发得最多的一天" },
  "fun.newPeopleDay": { en: "Most new chats opened in a day", zh: "新接触最多的一天" },
  "fun.longestSilence": { en: "Longest silence streak", zh: "最长沉默" },
  "fun.earliestSend": { en: "Earliest message you ever sent", zh: "你最早的一条" },
  "fun.latestSend": { en: "Latest message you ever sent", zh: "你最晚的一条" },
  "fun.theyMessageMost": { en: "Sends you the most (1:1)", zh: "给你发最多的人" },
  "fun.youMessageMost": { en: "You send the most to (1:1)", zh: "你发最多的人" },
  "fun.chattiest": { en: "Longest average message", zh: "平均最啰嗦的人" },
  "fun.mostConcise": { en: "Shortest average message", zh: "平均最言简意赅" },
  "fun.mostLopsided": { en: "Most lopsided 1:1", zh: "最一边倒的私聊" },
  "fun.mostBalanced": { en: "Most balanced 1:1", zh: "最势均力敌的私聊" },
  "fun.oldestActive": { en: "Oldest still-active contact", zh: "认识最久仍在聊" },
  "fun.newRegular": { en: "New person, already a regular", zh: "新晋常聊" },
  "fun.longestSingle": { en: "Longest single message", zh: "最长的一条消息" },
  "fun.longestMine": { en: "Your longest single message", zh: "你写过最长的一条" },
  "fun.minuteBurst": { en: "Most messages in a single minute", zh: "一分钟内最多消息" },
  "fun.concurrentHour": { en: "Most chats juggled in one hour", zh: "一小时同时聊最多人" },
  "fun.concurrentDay": { en: "Most chats juggled in one day", zh: "一天同时聊最多人" },
  "fun.longestReunionGap": { en: "Longest gap before talking again", zh: "再开口隔了多久" },
  "fun.spanYears": { en: "Indexed history span", zh: "索引覆盖时长" },
  "fun.activeCoverage": { en: "Days you talked / days indexed", zh: "活跃天 / 总覆盖天" },
  "fun.distinctChats": { en: "Distinct chats", zh: "不同会话数" },
  "fun.distinctSenders": { en: "Distinct people", zh: "不同发送者" },
  "fun.empty": {
    en: "No data yet — run a Deep index from Settings.",
    zh: "暂无数据，先去 Settings 跑一次 Deep index。",
  },

  // Export
  "export.button": { en: "Export HTML", zh: "导出 HTML" },
  "export.title": {
    en: "Download this page as a standalone HTML file",
    zh: "把当前页面导出成独立的 HTML 文件，方便分享",
  },
  "export.footer": {
    en: "Exported from WeChat Explorer",
    zh: "由 WeChat Explorer 导出",
  },
  "export.note": {
    en: "Charts are pre-rendered as inline SVG — open the file anywhere, no JavaScript needed. The page's own data and time of export are baked in.",
    zh: "图表已预渲染为内联 SVG，无需 JavaScript 即可打开。页面数据与导出时间已固化在文件中。",
  },

  // Settings
  "settings.title": { en: "Settings", zh: "设置" },
  "settings.desc": {
    en: "Index status, chat hygiene, and data location.",
    zh: "索引状态、聊天清理、数据位置。",
  },
  "settings.language": { en: "Language", zh: "语言" },
  "settings.languageDesc": {
    en: "Toggle the UI between English and Chinese. Your chat data is not translated.",
    zh: "在英文与中文之间切换界面文案。你的聊天数据本身不会被翻译。",
  },
} satisfies Record<string, Record<Locale, string>>;

export type TKey = keyof typeof DICT;

export function t(key: TKey, locale: Locale = DEFAULT_LOCALE): string {
  const entry = DICT[key];
  if (!entry) return key as string;
  return entry[locale] ?? entry[DEFAULT_LOCALE] ?? (key as string);
}

/** Cookie key — read on the server, written by the client toggle. */
export const LOCALE_COOKIE = "we-locale";

export function parseLocale(v: string | null | undefined): Locale {
  if (v === "zh" || v === "en") return v;
  return DEFAULT_LOCALE;
}
