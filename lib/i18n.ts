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
  "settings.indexStatus": { en: "Index status", zh: "索引状态" },
  "settings.indexStatusDesc": {
    en: "Trigger fresh indexing runs against your local WeChat data.",
    zh: "针对本地 WeChat 数据手动触发新一轮索引。",
  },
  "settings.lastQuickIndex": { en: "Last quick index", zh: "上次快速索引" },
  "settings.lastDeepIndex": { en: "Last deep index", zh: "上次深度索引" },
  "settings.sessions": { en: "Sessions", zh: "会话" },
  "settings.messages": { en: "Messages", zh: "消息" },
  "settings.urls": { en: "URLs", zh: "链接" },
  "settings.contacts": { en: "Contacts", zh: "联系人" },
  "settings.never": { en: "Never", zh: "从未" },
  "settings.archivedSuffix": { en: "archived", zh: "已归档" },
  "settings.unmatchedTitle": {
    en: "{m} messages and {u} URLs aren't linked to a session",
    zh: "{m} 条消息和 {u} 条链接没有关联到任何会话",
  },
  "settings.unmatchedDesc": {
    en: "Backfill skips ambiguous matches — most often display names shared by multiple sessions in WeChat (e.g. several “工作群”). These rows are still searchable but won't roll up into a contact page. Rename the colliding contacts in WeChat to recover them.",
    zh: "回填会跳过模糊匹配——通常是 WeChat 中多个会话共用同一个显示名（例如多个 “工作群”）。这些消息仍可搜索，但不会汇总到联系人页面。在 WeChat 里给冲突的联系人改名即可恢复。",
  },
  "settings.deepStaleTitle": {
    en: "Deep index looks stale — consider rerunning",
    zh: "深度索引可能过时了——建议重跑一次",
  },
  "settings.deepStaleDesc": {
    en: "Last deep run was {ago}. Heavy chats with new history won't appear in /me top charts, contact analytics, or the recap until you re-deep-index.",
    zh: "上一次深度索引发生在 {ago}。最近活跃的聊天若没重跑一次深度索引，不会出现在 /me 的高频会话、联系人深度分析或年度回顾里。",
  },
  "settings.deepNeverDesc": {
    en: "You haven't run a deep index yet. Quick index only covers session metadata + bulk link messages — full-text search, contact analytics, and recap need the deep pass.",
    zh: "你还没跑过深度索引。快速索引只覆盖会话元数据和链接消息——全文搜索、联系人深度分析、年度回顾都需要跑一次深度索引。",
  },
  "settings.storage": { en: "Storage", zh: "存储" },
  "settings.storageDesc": {
    en: "Where the explorer keeps its derived index.",
    zh: "Explorer 自己生成的索引保存在哪里。",
  },
  "settings.indexPath": { en: "Index path", zh: "索引路径" },
  "settings.indexSize": { en: "Index size", zh: "索引大小" },
  "settings.sourceDb": { en: "Source DB", zh: "源数据库" },
  "settings.sourceDbValue": {
    en: "Read-only via",
    zh: "通过此工具只读访问：",
  },
  "settings.hygieneTitle": { en: "Chat hygiene", zh: "聊天清理" },
  "settings.hygieneLoading": {
    en: "Loading archive candidates…",
    zh: "正在加载可归档列表…",
  },

  // Onboarding empty state (Overview when nothing indexed yet)
  "onboarding.title": {
    en: "Welcome — let's build your index",
    zh: "欢迎 —— 我们来建立你的索引",
  },
  "onboarding.line1": {
    en: "WeChat Explorer turns your local WeChat history into a searchable, analyzable dashboard — everything stays on your machine.",
    zh: "WeChat Explorer 把你本地的微信聊天记录变成可搜索、可分析的仪表盘 —— 全部数据都留在你自己电脑上。",
  },
  "onboarding.line2": {
    en: "It needs the wx-cli tool installed first; then the Settings page has the buttons to run the index.",
    zh: "需要先安装 wx-cli 工具；然后在 Settings 页面点击按钮即可开始建立索引。",
  },
  "onboarding.openSettings": { en: "Open Settings", zh: "打开设置" },
  "onboarding.step1": { en: "Install wx-cli", zh: "安装 wx-cli" },
  "onboarding.step2": {
    en: "Run sudo wx init",
    zh: "执行 sudo wx init",
  },
  "onboarding.step3": {
    en: "Press Index from Settings",
    zh: "在 Settings 里点击 Index",
  },

  // Contacts list
  "contacts.title": { en: "Contacts", zh: "联系人" },
  "contacts.session": { en: "session", zh: "个会话" },
  "contacts.sessions": { en: "sessions", zh: "个会话" },
  "contacts.showingOf": {
    en: "Showing {n} of {total}",
    zh: "显示 {n} / 共 {total}",
  },
  "contacts.matchingFilters": { en: "matching filters", zh: "符合筛选条件" },
  "contacts.viewingArchived": { en: "viewing archived", zh: "查看已归档" },
  "contacts.includingArchived": { en: "including archived", zh: "包含已归档" },
  "contacts.clear": { en: "Clear", zh: "清除" },
  "contacts.clearAll": { en: "Clear all filters", zh: "清除所有筛选" },
  "contacts.csv": { en: "CSV", zh: "CSV" },
  "contacts.json": { en: "JSON", zh: "JSON" },
  "contacts.downloadCsv": { en: "Download sessions as CSV", zh: "导出会话为 CSV" },
  "contacts.downloadJson": { en: "Download sessions as JSON", zh: "导出会话为 JSON" },
  "contacts.chipName": { en: "Name", zh: "姓名" },
  "contacts.chipType": { en: "Type", zh: "类型" },
  "contacts.chipView": { en: "View", zh: "视图" },
  "contacts.colName": { en: "Name", zh: "姓名" },
  "contacts.colType": { en: "Type", zh: "类型" },
  "contacts.colMessages": { en: "Messages", zh: "消息数" },
  "contacts.colLinks": { en: "Links", zh: "链接数" },
  "contacts.colLastActive": { en: "Last active", zh: "最近活跃" },
  "contacts.sectionSort": { en: "Sort", zh: "排序" },
  "contacts.sectionFilter": { en: "Filter", zh: "筛选" },
  "contacts.sectionShowType": { en: "Show type", zh: "类型筛选" },
  "contacts.sectionArchived": { en: "Archived", zh: "归档" },
  "contacts.sortAZ": { en: "A → Z", zh: "A → Z" },
  "contacts.sortZA": { en: "Z → A", zh: "Z → A" },
  "contacts.sortHighLow": { en: "High → Low", zh: "高 → 低" },
  "contacts.sortLowHigh": { en: "Low → High", zh: "低 → 高" },
  "contacts.sortNewest": { en: "Newest first", zh: "最新优先" },
  "contacts.sortOldest": { en: "Oldest first", zh: "最旧优先" },
  "contacts.typeAll": { en: "All types", zh: "全部类型" },
  "contacts.typePrivate": { en: "Private", zh: "私聊" },
  "contacts.typeGroup": { en: "Group", zh: "群聊" },
  "contacts.typeOfficial": { en: "Official", zh: "公众号" },
  "contacts.typeFolded": { en: "Folded", zh: "折叠会话" },
  "contacts.viewActive": { en: "Active", zh: "活跃" },
  "contacts.viewArchived": { en: "Archived", zh: "已归档" },
  "contacts.viewAll": { en: "All", zh: "全部" },
  "contacts.noSessions": { en: "No sessions match.", zh: "没有匹配的会话。" },
  "contacts.unread": { en: "unread", zh: "未读" },
  "contacts.cappedTooltip": {
    en: "{n} indexed · {note}. Run Deep index from Settings to continue backfilling.",
    zh: "已索引 {n} 条 · {note}。在 Settings 里再跑一次 Deep index 即可继续回填。",
  },
  "contacts.cappedLegacyTooltip": {
    en: "{n} indexed — likely capped under the old 10,000-msg limit. Run Deep index from Settings to backfill older history.",
    zh: "已索引 {n} 条 — 很可能受旧版 10,000 条上限限制。在 Settings 里跑一次 Deep index 即可回填更早的历史。",
  },

  // Contact detail
  "contact.archivedBadge": { en: "Archived", zh: "已归档" },
  "contact.members": { en: "members", zh: "位成员" },
  "contact.recap": { en: "Recap", zh: "年度回顾" },
  "contact.viewInCalendar": { en: "View in calendar", zh: "在日历中查看" },
  "contact.noMeHere": {
    en: "We couldn't identify you in this chat — reply latency and your-share will be blank",
    zh: "这个聊天里没识别到你的发送者名，回复时长和你的占比会留空",
  },
  "contact.noMeHereSub": {
    en: "The indexer couldn't identify your sender handle here.",
    zh: "索引器在这个聊天里没识别到你的发送者名。",
  },
  "contact.openSettings": { en: "Open Settings", zh: "打开设置" },
  "contact.openSettingsSuffix": {
    en: "to set your me-handles and re-run a quick index.",
    zh: "去配置 me-handles 后再跑一次快速索引。",
  },
  "contact.hero.messages": { en: "Messages", zh: "消息数" },
  "contact.hero.messagesSub": {
    en: "{mine} you · {theirs} them",
    zh: "你 {mine} · 对方 {theirs}",
  },
  "contact.hero.yourShare": { en: "Your share", zh: "你的占比" },
  "contact.hero.yourShareNoMe": { en: "no me-handle here", zh: "没识别到你" },
  "contact.hero.yourShareOf": {
    en: "{mine} of {total}",
    zh: "{mine} / {total}",
  },
  "contact.hero.links": { en: "Links shared", zh: "分享的链接" },
  "contact.hero.linksTop": { en: "top", zh: "主要来源" },
  "contact.hero.lastActive": { en: "Last active", zh: "最近活跃" },
  "contact.hero.firstContacted": { en: "First contacted", zh: "首次联系" },
  "contact.hero.daysSpan": { en: "days span", zh: "天跨度" },
  "contact.monthlyTitle": { en: "Monthly activity (last 24 months)", zh: "近 24 个月每月活跃度" },
  "contact.monthlyDesc": {
    en: "Stacked counts: your sends + their sends per month",
    zh: "堆叠：每月你发出的 + 对方发出的消息数",
  },
  "contact.monthlyEmpty": {
    en: "No messages indexed in the last 24 months — run a deep index from Settings.",
    zh: "近 24 个月没有索引到消息 — 去 Settings 跑一次 Deep index。",
  },
  "contact.hourlyTitle": { en: "Activity by hour", zh: "按小时活跃度" },
  "contact.hourlyDesc": {
    en: "When does this chat happen? (local time)",
    zh: "聊天主要发生在几点？（本地时间）",
  },
  "contact.latencyTitle": { en: "Reply latency", zh: "回复时长" },
  "contact.latencyMedians": {
    en: "Median them→you {them} · you→them {you}",
    zh: "中位数：对方→你 {them} · 你→对方 {you}",
  },
  "contact.latencyNoMe": {
    en: "Configure your me-handles in Settings to see reply latency.",
    zh: "去 Settings 配置 me-handles 才能看到回复时长。",
  },
  "contact.latencyNotEnough": {
    en: "Not enough back-and-forth in this chat yet.",
    zh: "这个聊天的一来一回样本还不够。",
  },
  "contact.themToYou": { en: "Them → You", zh: "对方 → 你" },
  "contact.youToThem": { en: "You → Them", zh: "你 → 对方" },
  "contact.replies": { en: "replies", zh: "条回复" },
  "contact.styleYour": { en: "Your style", zh: "你的风格" },
  "contact.styleTheir": { en: "Their style", zh: "对方的风格" },
  "contact.styleGroup": { en: "Group", zh: "群聊" },
  "contact.styleGroupTitle": { en: "Group style fingerprint", zh: "群聊风格画像" },
  "contact.styleSampled": {
    en: "Sampled across the most recent {n} messages",
    zh: "采样自最近的 {n} 条消息",
  },
  "contact.styleEmpty": {
    en: "No messages on this side yet.",
    zh: "这一侧暂无消息。",
  },
  "contact.metric.avgChars": { en: "Avg chars / text", zh: "平均字数 / 条" },
  "contact.metric.emojiPerMsg": { en: "Emoji / text", zh: "Emoji / 条" },
  "contact.metric.linkRate": { en: "Link rate", zh: "链接占比" },
  "contact.metric.voice": { en: "Voice", zh: "语音" },
  "contact.metric.image": { en: "Image", zh: "图片" },
  "contact.metric.sticker": { en: "Sticker", zh: "表情" },
  "contact.topEmoji": { en: "Top emoji", zh: "常用 emoji" },
  "contact.topEmojiTooltip": {
    en: "{emoji} — {n} uses",
    zh: "{emoji} — 共 {n} 次",
  },
  "contact.topicTitle": { en: "Topic fingerprint", zh: "话题画像" },
  "contact.topicDesc": {
    en: "Top {n} TF-IDF words for this chat vs a global baseline. Click a word to search.",
    zh: "本聊天相对整体基线的 Top {n} TF-IDF 关键词。点击词条搜索。",
  },
  "contact.sharedTitle": { en: "Shared content", zh: "分享的内容" },
  "contact.sharedDesc": { en: "Where do the links go?", zh: "链接都流向了哪里？" },
  "contact.fileTypes": { en: "File types", zh: "文件类型" },
  "contact.sharedEmpty": {
    en: "No shared content indexed yet.",
    zh: "暂未索引到分享内容。",
  },
  "contact.linksEmpty": {
    en: "No links indexed yet.",
    zh: "暂未索引到链接。",
  },
  "contact.vocabYours": { en: "Words you use, they don't", zh: "你用、对方不用的词" },
  "contact.vocabYoursDesc": { en: "Tokens distinctive to your side", zh: "你这一侧的高辨识度词汇" },
  "contact.vocabTheirs": { en: "Words they use, you don't", zh: "对方用、你不用的词" },
  "contact.vocabTheirsDesc": { en: "Tokens distinctive to their side", zh: "对方那一侧的高辨识度词汇" },
  "contact.vocabEmpty": {
    en: "Not enough distinctive vocabulary yet.",
    zh: "暂没有足够高辨识度的词汇。",
  },
  "contact.vocabMentions": {
    en: "{count} mentions{scope}",
    zh: "{count} 次提及{scope}",
  },
  "contact.vocabInChat": {
    en: " (in this chat)",
    zh: "（本聊天内）",
  },
  "contact.topSendersTitle": { en: "Top senders", zh: "高频发言者" },
  "contact.topSendersDesc": { en: "The voices that drive this group", zh: "撑起这个群的几把声音" },
  "contact.contactBadge": { en: "contact", zh: "联系人" },
  "contact.msgTypesTitle": { en: "Message types", zh: "消息类型" },
  "contact.msgTypesDesc": { en: "What flows here", zh: "这里流过的内容" },
  "contact.msgTypesEmpty": { en: "No data yet.", zh: "暂无数据。" },
  "contact.recentTitle": { en: "Recent messages", zh: "最近消息" },
  "contact.recentDesc": { en: "Last 50 indexed messages", zh: "最近 50 条索引消息" },
  "contact.recentEmpty": {
    en: "History for this chat has not been indexed yet. Trigger a deep index from Settings to pull messages.",
    zh: "这个聊天的历史还没被索引。去 Settings 跑一次 Deep index 把消息拉过来。",
  },
  "contact.searchInChat": {
    en: "Search for {sender} within this chat",
    zh: "在本聊天里搜索 {sender}",
  },
  "contact.openDayInCal": {
    en: "Open this day in the calendar (filtered to this chat)",
    zh: "在日历里打开这一天（已过滤为本聊天）",
  },

  // /me extras (extend existing me.*)
  "me.noHandlesTitle": {
    en: "We can't identify which messages are yours yet",
    zh: "我们暂时分不清哪些消息是你发的",
  },
  "me.noHandlesDesc": {
    en: "This page summarises messages you sent. Without knowing which sender name(s) are you, every metric reads zero.",
    zh: "这个页面统计的是你发出的消息。如果不知道哪些发送者名代表你，每项指标都会是零。",
  },
  "me.noHandlesEmpty": {
    en: "No me-handles are configured.",
    zh: "尚未配置 me-handles。",
  },
  "me.noHandlesUnmatched": {
    en: "You have {n} me-handle(s) but none of them match any messages.",
    zh: "已配置 {n} 个 me-handle，但都没有匹配到任何消息。",
  },
  "me.noHandlesOpenSettingsPre": { en: "Open", zh: "打开" },
  "me.noHandlesOpenSettingsSuffix": {
    en: ", scroll to Chat hygiene, and either click Re-detect or set them manually.",
    zh: "，滚到 Chat hygiene，点击 Re-detect 或手动配置即可。",
  },
  "me.headerSummary": {
    en: "{my} messages from you across {days} active days. Identified by {n} handle{plural}:",
    zh: "你发出了 {my} 条消息，分布在 {days} 个活跃日里。识别自 {n} 个发送者名：",
  },
  "me.heroLongestStreakSub": {
    en: "Longest streak {n}d · {rate} msgs/day on active days",
    zh: "最长连续 {n} 天 · 活跃日均 {rate} 条",
  },
  "me.heroPeakHourSub": {
    en: "{n} messages sent in that hour",
    zh: "这一小时共发出 {n} 条",
  },
  "me.whenYouTalk": { en: "When you talk", zh: "你什么时候聊" },
  "me.whenYouTalkDesc": {
    en: "Hour-of-day pattern. Look for sleep windows and the late-night spike.",
    zh: "按小时的活跃曲线。看睡眠窗口和深夜的峰值。",
  },
  "me.byWeekday": { en: "By weekday", zh: "按星期" },
  "me.byWeekdayDesc": {
    en: "Does the weekend look like the workweek for you?",
    zh: "你的周末和工作日长得一样吗？",
  },
  "me.voiceTitle": { en: "Your voice fingerprint", zh: "你的声音画像" },
  "me.voiceSampled": {
    en: "Sampled across your most recent {n} messages.",
    zh: "采样自你最近的 {n} 条消息。",
  },
  "me.topEmojiHeading": { en: "Top emoji from you", zh: "你最常用的 emoji" },
  "me.topChatsTitle": { en: "Your top chats over time", zh: "你的高频会话" },
  "me.topChatsDesc": {
    en: "Per {unit}, with what you send on the left and what they send you on the right.",
    zh: "每{unit}对比，左列是你发出的，右列是对方/群里发给你的。",
  },
  "me.unitWeek": { en: "week", zh: "周" },
  "me.unitMonth": { en: "month", zh: "月" },
  "me.unitYear": { en: "year", zh: "年" },
  "me.privateSent": { en: "Who you message most (1:1)", zh: "你给谁发最多（私聊）" },
  "me.privateSentDesc": {
    en: "Your sends per {unit}, sorted by total you sent.",
    zh: "每{unit}你发出的消息，按总量排序。",
  },
  "me.privateSentEmpty": {
    en: "No private chats yet — try a deep index.",
    zh: "暂无私聊数据，跑一次 Deep index。",
  },
  "me.privateReceived": { en: "Who messages you most (1:1)", zh: "谁给你发最多（私聊）" },
  "me.privateReceivedDesc": {
    en: "Their messages to you per {unit}, sorted by their total.",
    zh: "每{unit}对方发给你的消息，按总量排序。",
  },
  "me.privateReceivedEmpty": {
    en: "No incoming private messages yet — try a deep index.",
    zh: "暂无对方消息数据，跑一次 Deep index。",
  },
  "me.groupsSent": { en: "Groups you contribute to most", zh: "你贡献最多的群" },
  "me.groupsSentDesc": {
    en: "Your sends per {unit}, sorted by total you sent.",
    zh: "每{unit}你在群里的发言。",
  },
  "me.groupsSentEmpty": {
    en: "No groups indexed for you yet.",
    zh: "暂无群聊数据。",
  },
  "me.groupsReceived": { en: "Groups that message you most", zh: "群里给你发最多的" },
  "me.groupsReceivedDesc": {
    en: "Total messages other group members send per {unit}.",
    zh: "每{unit}群里其他人发的消息总量。",
  },
  "me.groupsReceivedEmpty": {
    en: "No group messages indexed yet — try a deep index.",
    zh: "暂无群消息数据。",
  },
  "me.toolbarTop": { en: "Top", zh: "Top" },
  "me.toolbarRange": { en: "Range", zh: "范围" },
  "me.rangeAll": { en: "All", zh: "全部" },
  "me.range1y": { en: "1y", zh: "近 1 年" },
  "me.range6m": { en: "6m", zh: "近 6 月" },
  "me.range3m": { en: "3m", zh: "近 3 月" },
  "me.replyTitle": { en: "How you reply", zh: "你如何回复" },
  "me.replyDesc": {
    en: "Based on {n} alternating-side reply pairs (capped to the last 200k messages). Median you → them {you} · them → you {them}.",
    zh: "基于 {n} 对换边回复（最多取最近 20 万条）。你→对方 中位数 {you} · 对方→你 {them}。",
  },
  "me.replyEmpty": {
    en: "Not enough back-and-forth in your indexed history.",
    zh: "索引历史里一来一回的样本不够。",
  },
  "me.youToThem": { en: "You → them", zh: "你 → 对方" },
  "me.themToYou": { en: "Them → you", zh: "对方 → 你" },
  "me.topicsTitle": { en: "What you talk about", zh: "你聊些什么" },
  "me.topicsDesc": {
    en: "Top {n} TF-IDF words from your text vs everyone else's. Click to search.",
    zh: "你的文本相对其他人的 Top {n} TF-IDF 关键词。点击搜索。",
  },
  "me.topicsEmpty": {
    en: "Not enough text from you to score topics yet.",
    zh: "你的文本还不够用来打话题分数。",
  },
  "me.whatYouSend": { en: "What you send", zh: "你发出的内容" },
  "me.whatYouSendDesc": { en: "Message-type mix on your side.", zh: "你这一侧的消息类型分布。" },
  "me.linksTitle": { en: "Links you share", zh: "你分享的链接" },
  "me.linksDesc": { en: "Top domain groups in URLs you sent.", zh: "你发出的链接里最多的域名分组。" },
  "me.linksEmpty": { en: "No links from you yet.", zh: "你暂未分享过链接。" },
  "me.shoutingTitle": { en: "Shouting into the void", zh: "对空气说话" },
  "me.shoutingDesc": {
    en: "{n} private chats where you sent ≥ 5 messages but got ≤ 1 reply back. Showing the heaviest.",
    zh: "有 {n} 个私聊里你发了 ≥ 5 条但只得到 ≤ 1 条回复。下面展示最严重的。",
  },
  "me.shoutingNone": {
    en: "No one-sided private chats — every conversation has had a reply.",
    zh: "没有一边倒的私聊 — 每次都有人回。",
  },
  "me.shoutingEmpty": { en: "Nothing to show.", zh: "暂无可展示。" },
  "me.yoursTheirs": {
    en: "{mine} yours · {theirs} theirs",
    zh: "你 {mine} · 对方 {theirs}",
  },
  "me.longestTitle": { en: "Longest things you sent", zh: "你写过的最长" },
  "me.longestDesc": { en: "Top 5 text essays.", zh: "你最长的 5 条文字。" },
  "me.longestEmpty": {
    en: "No long text messages.",
    zh: "没有特别长的文字消息。",
  },
  "me.chars": { en: "chars", zh: "字" },
  "me.burstTitle": { en: "Most messages in 1 minute", zh: "一分钟内最多消息" },
  "me.burstDesc": {
    en: "You sent {n} messages within a single minute.",
    zh: "你在一分钟内发出了 {n} 条消息。",
  },
  "me.where": { en: "Where", zh: "哪里" },
  "me.when": { en: "When", zh: "什么时候" },
  "me.donutCenterYours": { en: "yours", zh: "你的" },
  "me.combinedTooltipOn": {
    en: "Show all of their messages as a single line",
    zh: "对方消息合并为一条线",
  },
  "me.splitTooltipOn": {
    en: "Break out their messages into private chats vs groups",
    zh: "把对方消息拆分为私聊和群聊",
  },
  "me.fullRanking": {
    en: "Show full top-{n} ranking",
    zh: "展开完整 Top-{n} 排行",
  },

  // Stats — sessions / messages / links / contacts
  "stats.sessions.eyebrow": { en: "Sessions breakdown", zh: "会话拆分" },
  "stats.sessions.heroSuffix": { en: "sessions", zh: "个会话" },
  "stats.sessions.heroDesc": {
    en: "One row per chat that ever appeared in your client — private DMs, group chats, official accounts, and the folded inbox.",
    zh: "在你客户端出现过的每个聊天都是一行 — 私聊、群聊、公众号、折叠消息盒子都算。",
  },
  "stats.sessions.tileActive": { en: "Active", zh: "活跃" },
  "stats.sessions.tileArchived": { en: "Archived", zh: "已归档" },
  "stats.sessions.tileGroups": { en: "Groups", zh: "群聊" },
  "stats.sessions.tileNoMsgs": { en: "No indexed msgs", zh: "无索引消息" },
  "stats.sessions.typeTitle": { en: "Type breakdown", zh: "类型分布" },
  "stats.sessions.typeDesc": {
    en: "Active sessions split by chat type.",
    zh: "活跃会话按类型拆分。",
  },
  "stats.sessions.activeVsArchTitle": { en: "Active vs archived", zh: "活跃 vs 已归档" },
  "stats.sessions.activeVsArchDesc": {
    en: "Archived sessions are hidden from stats by default.",
    zh: "已归档会话默认不计入统计。",
  },
  "stats.sessions.donutActive": { en: "active", zh: "活跃" },
  "stats.sessions.msgsPerTitle": { en: "Messages per chat", zh: "每个会话的消息数" },
  "stats.sessions.msgsPerDesc": { en: "How chatty is each session?", zh: "每个会话有多能聊？" },
  "stats.sessions.lastActiveTitle": { en: "Last-active distribution", zh: "最近活跃分布" },
  "stats.sessions.lastActiveDesc": {
    en: "When did each session most recently see activity?",
    zh: "每个会话最近一次有动静是什么时候？",
  },
  "stats.sessions.largestGroupsTitle": { en: "Largest groups", zh: "成员最多的群" },
  "stats.sessions.largestGroupsDesc": { en: "Top 10 groups by member count.", zh: "按成员数排前 10 的群。" },
  "stats.sessions.noMembers": {
    en: "No member counts indexed yet. Hit",
    zh: "暂未索引到成员数。去",
  },
  "stats.sessions.noMembersSuffix": {
    en: "Fetch member counts to backfill.",
    zh: "Fetch member counts 回填。",
  },
  "stats.sessions.whyArchivedTitle": { en: "Why archived?", zh: "为何归档？" },
  "stats.sessions.whyArchivedDesc": {
    en: "Reason recorded when each archived session was bulk-archived.",
    zh: "批量归档时为每个会话记录的原因。",
  },
  "stats.sessions.label.private": { en: "Private", zh: "私聊" },
  "stats.sessions.label.group": { en: "Group", zh: "群聊" },
  "stats.sessions.label.official": { en: "Official", zh: "公众号" },
  "stats.sessions.label.folded": { en: "Folded", zh: "折叠" },
  "stats.sessions.label.other": { en: "Other", zh: "其他" },

  "stats.messages.eyebrow": { en: "Indexed messages", zh: "已索引消息" },
  "stats.messages.heroSuffix": { en: "messages", zh: "条消息" },
  "stats.messages.heroDesc": {
    en: "{mine} from you ({pct}), {theirs} from everyone else.",
    zh: "你 {mine}（{pct}），其他人 {theirs}。",
  },
  "stats.messages.heroExtra": {
    en: " Plus {n} more from official accounts and the folded inbox that are excluded from these charts.",
    zh: "另有 {n} 条来自公众号 / 折叠消息盒子被排除在这些图表之外。",
  },
  "stats.messages.tileYours": { en: "Yours", zh: "你的" },
  "stats.messages.tileTheirs": { en: "Theirs", zh: "对方的" },
  "stats.messages.tileMonths": { en: "Months covered", zh: "覆盖月数" },
  "stats.messages.tileMonthsSub": { en: "of indexed history", zh: "已索引历史" },
  "stats.messages.tilePeak": { en: "Peak hour", zh: "高峰小时" },
  "stats.messages.tilePeakSub": { en: "msgs", zh: "条" },
  "stats.messages.monthlyTitle": { en: "Activity by month (you vs them)", zh: "每月活跃度（你 vs 对方）" },
  "stats.messages.monthlyDesc": {
    en: "Stacked: your share on top of theirs over your full indexed history.",
    zh: "堆叠：你的部分在上，对方的部分在下，覆盖整个索引历史。",
  },
  "stats.messages.seriesYou": { en: "You", zh: "你" },
  "stats.messages.seriesThem": { en: "Them", zh: "对方" },
  "stats.messages.typesTitle": { en: "Message types", zh: "消息类型" },
  "stats.messages.typesDesc": { en: "Donut of the indexed type distribution.", zh: "索引中各类型的环形图。" },
  "stats.messages.dowTitle": { en: "By weekday", zh: "按星期" },
  "stats.messages.dowDesc": { en: "Does the weekend look different?", zh: "周末和工作日有差别吗？" },
  "stats.messages.byHourTitle": { en: "By hour of day", zh: "按小时" },
  "stats.messages.byHourDesc": {
    en: "Radial — your circadian pattern at a glance. Bars are total messages per hour (24-hour clock).",
    zh: "雷达图 — 一眼看到你的作息。每根柱子是该小时的总消息数（24 小时制）。",
  },
  "stats.messages.longestTitle": { en: "Longest messages", zh: "最长消息" },
  "stats.messages.longestDesc": { en: "Your top-5 single-message essays.", zh: "你的 5 条最长单条消息。" },
  "stats.messages.fastestTitle": { en: "Fastest minutes", zh: "最快的一分钟" },
  "stats.messages.fastestDesc": {
    en: "Most messages in a single minute — usually a hot group convo.",
    zh: "一分钟内最多消息 — 通常是热闹的群聊。",
  },
  "stats.messages.donutCenter": { en: "messages", zh: "消息" },
  "stats.messages.chars": { en: "chars", zh: "字" },

  "stats.links.eyebrow": { en: "Shared links", zh: "分享的链接" },
  "stats.links.heroSuffix": { en: "unique links", zh: "条独立链接" },
  "stats.links.heroDesc": { en: "De-duplicated across chat / sender / timestamp.", zh: "按 聊天 / 发送者 / 时间戳 去重。" },
  "stats.links.heroIncluded": { en: " Archived chats are included.", zh: " 含已归档聊天。" },
  "stats.links.heroExcluded": { en: " Archived chats are excluded by default.", zh: " 默认不含已归档聊天。" },
  "stats.links.tileTopGroup": { en: "Top group", zh: "主要分组" },
  "stats.links.tileTopGroupSub": { en: "links", zh: "条链接" },
  "stats.links.tileDistinctGroups": { en: "Distinct groups", zh: "不同分组" },
  "stats.links.tileTopSender": { en: "Top sender", zh: "最爱分享的人" },
  "stats.links.tileTopSenderSub": { en: "shared", zh: "次分享" },
  "stats.links.tileBusiestMonth": { en: "Busiest month", zh: "最忙的月份" },
  "stats.links.byGroupTitle": { en: "By domain group", zh: "按域名分组" },
  "stats.links.byGroupDesc": { en: "Donut of the indexed domain-group distribution.", zh: "域名分组分布的环形图。" },
  "stats.links.donutCenter": { en: "links", zh: "链接" },
  "stats.links.treemapTitle": { en: "Top hosts (treemap)", zh: "高频域名（树图）" },
  "stats.links.treemapDesc": { en: "Top-20 hostnames sized by share count.", zh: "前 20 个域名，按分享次数缩放。" },
  "stats.links.volumeTitle": { en: "Sharing volume over time", zh: "分享量随时间变化" },
  "stats.links.volumeDesc": { en: "Monthly link-share count.", zh: "每月分享链接数。" },
  "stats.links.topSendersTitle": { en: "Top senders", zh: "高频分享者" },
  "stats.links.topSendersDesc": { en: "People who share the most links with you.", zh: "最常给你分享链接的人。" },
  "stats.links.topChatsTitle": { en: "Top chats", zh: "高频聊天" },
  "stats.links.topChatsDesc": { en: "Where the links land.", zh: "链接最终落在哪些聊天里。" },
  "stats.links.noData": { en: "No data.", zh: "暂无数据。" },

  "stats.contacts.eyebrow": { en: "Address book breakdown", zh: "通讯录拆分" },
  "stats.contacts.heroSuffix": { en: "contacts", zh: "位联系人" },
  "stats.contacts.heroDescPre": {
    en: "That number is large because WeChat counts ",
    zh: "这个数字看起来大，是因为 WeChat 把 ",
  },
  "stats.contacts.heroDescStrong": {
    en: "every group-chat member you've ever encountered",
    zh: "你接触过的每一个群成员",
  },
  "stats.contacts.heroDescSuffix": {
    en: ", not just your accepted friends. Below is the breakdown — most are people you've never sent a direct message to.",
    zh: " 都算进来，而不只是你加好友的人。下面是拆分 — 大部分你从来没单独私聊过。",
  },
  "stats.contacts.tileDirect": { en: "Directly messaged", zh: "私聊过" },
  "stats.contacts.tileDirectSub": { en: "of address book", zh: "通讯录占比" },
  "stats.contacts.tileInGroups": { en: "In groups with you", zh: "和你在同一个群" },
  "stats.contacts.tileInGroupsSub": { en: "member of ≥ 1 of your groups", zh: "至少在你的 1 个群里" },
  "stats.contacts.tileGroupOnly": { en: "Group-only acquaintances", zh: "只在群里见过" },
  "stats.contacts.tileGroupOnlySub": {
    en: "{pct} — never DM'd",
    zh: "{pct} — 从未私聊",
  },
  "stats.contacts.tileSilent": { en: "Silent contacts", zh: "沉默联系人" },
  "stats.contacts.tileSilentSub": {
    en: "{pct} — no chat, no group",
    zh: "{pct} — 既没聊天也没共群",
  },
  "stats.contacts.howKnowTitle": { en: "How you know each contact", zh: "你和每位联系人是怎么认识的" },
  "stats.contacts.howKnowDesc": {
    en: "Split by whether you have a 1:1 chat with them, only share group(s), or neither.",
    zh: "按你和对方有无私聊、有无共同的群、都没有来拆分。",
  },
  "stats.contacts.howKnowDirect": { en: "Direct chat", zh: "私聊" },
  "stats.contacts.howKnowGroup": { en: "Group only", zh: "仅共群" },
  "stats.contacts.howKnowSilent": { en: "Silent (no chat)", zh: "沉默（没聊天）" },
  "stats.contacts.donutCenter": { en: "contacts", zh: "联系人" },
  "stats.contacts.groupDistTitle": { en: "Group overlap distribution", zh: "共群分布" },
  "stats.contacts.groupDistDesc": {
    en: "Of contacts who share at least one group with you, how many groups do you co-inhabit?",
    zh: "在和你至少共一个群的联系人里，你们共多少个群？",
  },
  "stats.contacts.bookVsSessTitle": { en: "Address book vs sessions", zh: "通讯录 vs 会话" },
  "stats.contacts.bookVsSessDesc": {
    en: "Three-way split: in contacts only, in both, or only as a session row.",
    zh: "三类拆分：仅在通讯录、都有、仅作为会话行。",
  },
  "stats.contacts.overlapTitle": { en: "Most-overlapping people", zh: "和你共群最多的人" },
  "stats.contacts.overlapDesc": {
    en: "Ranked by how many of your groups they sit in. Often classmates, colleagues, or family.",
    zh: "按和你共群数排序。通常是同学、同事或家人。",
  },
  "stats.contacts.overlapEmpty": {
    en: "No group membership data indexed yet — backfill via Settings → Fetch member counts.",
    zh: "暂无群成员数据 — 去 Settings → Fetch member counts 回填。",
  },
  "stats.contacts.groupsSuffix": { en: "groups", zh: "个群" },
  "stats.contacts.legend": {
    en: "Definitions: direct chat = a session with chat_type=“private”. Group only = appears in your group_members but no 1:1 session. Silent = no session and no shared group — usually old or never-acted-on contacts.",
    zh: "定义：direct chat = chat_type 为 “private” 的会话。Group only = 在你的 group_members 里但没有 1:1 会话。Silent = 既没有会话也没有共群 — 通常是很久没动的旧联系人。",
  },

  // Graph
  "graph.title": { en: "Relationship graph", zh: "关系图" },
  "graph.descIndexed": {
    en: "{indexed} of {total}{kind} groups have membership data indexed",
    zh: "{indexed} / {total}{kind} 群已索引成员数据",
  },
  "graph.activeArchived": { en: " active + archived", zh: " 活跃 + 已归档" },
  "graph.active": { en: " active", zh: " 活跃" },
  "graph.showing": { en: "showing", zh: "显示" },
  "graph.groupsLabel": { en: "groups", zh: "个群" },
  "graph.peopleLabel": { en: "people", zh: "人" },
  "graph.edgesLabel": { en: "co-occurrence edges", zh: "共现连线" },
  "graph.archivedHidden": { en: "{n} archived hidden", zh: "{n} 个已归档被隐藏" },
  "graph.noMembershipsTitle": { en: "No memberships yet", zh: "暂无成员数据" },
  "graph.noMembershipsDesc": {
    en: "The graph is empty because no group memberships have been indexed.",
    zh: "因为还没索引到任何群成员，所以图是空的。",
  },
  "graph.noMembershipsHowto": {
    en: "and click Fetch member counts repeatedly to populate. Each click does about 5 groups.",
    zh: "里反复点击 Fetch member counts 来回填。每次点击大约处理 5 个群。",
  },
  "graph.noMembershipsCount": {
    en: "You have {n} groups awaiting backfill.",
    zh: "还有 {n} 个群等待回填。",
  },
  "graph.headTo": { en: "Head to", zh: "去" },
  "graph.noMatchTitle": { en: "No nodes match current filters", zh: "没有节点匹配当前筛选" },
  "graph.noMatchDesc": {
    en: "{indexed} groups have memberships indexed, but none meet the minimum group size of {min}. Loosen the filter or toggle archived.",
    zh: "已有 {indexed} 个群索引了成员，但没有一个达到最小群规模 {min}。放宽筛选或勾选已归档。",
  },

  // Recap (year + chat-scoped)
  "recap.eyebrow": { en: "Year in Review", zh: "年度回顾" },
  "recap.eyebrowChat": { en: "Year in Review", zh: "年度回顾" },
  "recap.noMessages": {
    en: "No indexed messages in {year}. Try one of the years below.",
    zh: "{year} 没有索引到任何消息。试试下面其他年份。",
  },
  "recap.noChatMessages": {
    en: "No messages with this chat in {year}.",
    zh: "{year} 没有和这个聊天的消息。",
  },
  "recap.backToContact": { en: "Back to contact", zh: "返回联系人" },
  "recap.hero.messages": { en: "Messages", zh: "消息数" },
  "recap.hero.messagesSub": {
    en: "{mine} you · {theirs} them",
    zh: "你 {mine} · 对方 {theirs}",
  },
  "recap.hero.topContact": { en: "Top contact", zh: "高频联系人" },
  "recap.hero.busiestMonth": { en: "Busiest month", zh: "最忙的月份" },
  "recap.hero.msgs": { en: "msgs", zh: "条" },
  "recap.hero.longestDry": { en: "Longest dry streak", zh: "最长空窗" },
  "recap.hero.longestDrySub": { en: "Longest active streak {n}d", zh: "最长连续活跃 {n} 天" },
  "recap.hero.activeDays": { en: "Active days", zh: "活跃天数" },
  "recap.hero.activeDaysSub": { en: "out of 365", zh: "/ 365" },
  "recap.hero.longestStreak": { en: "Longest streak", zh: "最长连续" },
  "recap.hero.longestStreakSub": { en: "Longest gap {n}d", zh: "最长空窗 {n} 天" },
  "recap.hero.medianReply": { en: "Median reply", zh: "回复中位数" },
  "recap.hero.medianReplySub": {
    en: "from them, {you} from you",
    zh: "来自对方，你为 {you}",
  },
  "recap.vsLast": { en: "vs {year}", zh: "对比 {year}" },
  "recap.vsLastNotice": {
    en: "{year} only has {n} indexed messages — deltas likely reflect coverage, not behavior.",
    zh: "{year} 只索引了 {n} 条消息 — 差值更可能反映索引覆盖，而非真实变化。",
  },
  "recap.delta.messages": { en: "messages", zh: "消息" },
  "recap.delta.links": { en: "links", zh: "链接" },
  "recap.delta.chats": { en: "chats", zh: "会话" },
  "recap.delta.days": { en: "active days", zh: "活跃天数" },
  "recap.topContactShifted": {
    en: "Top contact shifted from {from} → {to}.",
    zh: "高频联系人从 {from} → {to}。",
  },
  "recap.yearOfConvos": { en: "A year of conversations", zh: "这一年的对话" },
  "recap.yearOfConvosDesc": {
    en: "Stacked bars: your messages on top, theirs underneath. The thin line is the year's cumulative total.",
    zh: "堆叠柱：你的消息在上、对方在下。细线是该年累计总数。",
  },
  "recap.whenOnline": { en: "When you were online", zh: "你什么时候在线" },
  "recap.whenOnlineDesc": {
    en: "Cells are darker when more messages landed in that hour. Look for sleep windows and peak times.",
    zh: "格子越深表示该小时消息越多。看睡眠窗口和高峰。",
  },
  "recap.topPrivateTitle": { en: "Top 10 private chats", zh: "私聊 Top 10" },
  "recap.topPrivateDesc": { en: "The people you exchanged the most with this year.", zh: "这一年你和谁交流最多。" },
  "recap.topPrivateEmpty": { en: "No private chats indexed.", zh: "暂无私聊索引。" },
  "recap.topGroupsTitle": { en: "Top 10 groups", zh: "群聊 Top 10" },
  "recap.topGroupsDesc": { en: "The group chats you spent the most time in.", zh: "这一年你最投入的群聊。" },
  "recap.topGroupsEmpty": { en: "No groups indexed.", zh: "暂无群聊索引。" },
  "recap.mine": { en: "mine", zh: "我的" },
  "recap.yours": { en: "yours", zh: "你的" },
  "recap.linksSuffix": { en: "links", zh: "条链接" },
  "recap.membersSuffix": { en: "members", zh: "位成员" },
  "recap.topLinkSourcesTitle": { en: "Top 25 link sources", zh: "链接来源 Top 25" },
  "recap.topLinkSourcesDesc": { en: "What you shared and read most this year.", zh: "这一年你分享与阅读最多的来源。" },
  "recap.topLinksChatTitle": { en: "Top link sources", zh: "链接主要来源" },
  "recap.topLinksChatDesc": { en: "What this chat shared most.", zh: "这个聊天里分享最多的来源。" },
  "recap.topLinksEmpty": { en: "No shared links this year.", zh: "今年没有共享链接。" },
  "recap.recordsTitle": { en: "Records", zh: "纪录" },
  "recap.recordsDesc": { en: "Quirky highlights of the year.", zh: "这一年的怪趣亮点。" },
  "recap.recordsChatDesc": { en: "Notable points in your year together.", zh: "你们这一年的重要节点。" },
  "recap.whatYouTalked": { en: "What you talked about", zh: "你聊了些什么" },
  "recap.whatYouTalkedDesc": {
    en: "Top 50 distinctive words, sized by how much more they appeared in your year vs the rest of the corpus.",
    zh: "Top 50 高辨识度词汇，大小代表本年度相对其他时段的强度。",
  },
  "recap.whatChatTalkedDesc": {
    en: "Distinctive words in this chat versus the rest of your conversations.",
    zh: "本聊天相对你其他对话的高辨识度词汇。",
  },
  "recap.replyLatency": { en: "Reply latency", zh: "回复时长" },
  "recap.replyLatencyDesc": {
    en: "How fast replies came in. Median them → you {them}, you → them {you}.",
    zh: "回复有多快。中位数：对方→你 {them}，你→对方 {you}。",
  },
  "recap.replyLatencyChatDesc": {
    en: "Median them → you {them}, you → them {you}.",
    zh: "中位数：对方→你 {them}，你→对方 {you}。",
  },
  "recap.latencyOverTimeTitle": { en: "Latency over time", zh: "回复时长随时间" },
  "recap.latencyOverTimeDesc": { en: "Median monthly reply time, log-scaled.", zh: "每月回复时长中位数，对数刻度。" },
  "recap.latencyOverTimeChatDesc": { en: "Median monthly reply time, log scale.", zh: "每月回复时长中位数，对数刻度。" },
  "recap.latencyTrendEmpty": { en: "Not enough data for a monthly trend.", zh: "数据不够画月度趋势。" },
  "recap.latencyTrendChatEmpty": { en: "Not enough data for a trend.", zh: "数据不够画趋势。" },
  "recap.themToYou": { en: "them → you", zh: "对方 → 你" },
  "recap.youToThem": { en: "you → them", zh: "你 → 对方" },
  "recap.newPeopleTitle": { en: "New people in {year}", zh: "{year} 的新朋友" },
  "recap.newPeopleDesc": { en: "Sessions where the first message ever was this year.", zh: "首次消息恰好发生在今年的会话。" },
  "recap.newPeopleEmpty": { en: "No new contacts in {year}.", zh: "{year} 没有新增联系人。" },
  "recap.bookendsTitle": { en: "First & last message", zh: "首条与末条" },
  "recap.bookendsDesc": { en: "How the year opened and closed.", zh: "一年的开场与收尾。" },
  "recap.first": { en: "First", zh: "首条" },
  "recap.last": { en: "Last", zh: "末条" },
  "recap.noText": { en: "(no text)", zh: "（无文本）" },
  "recap.topEmojiYours": { en: "Your top emoji", zh: "你常用的 emoji" },
  "recap.topEmojiTheirs": { en: "Their top emoji", zh: "对方常用的 emoji" },
  "recap.noEmoji": { en: "No emoji.", zh: "没有 emoji。" },
  "recap.busiestDayTitle": { en: "Busiest day", zh: "最忙的一天" },
  "recap.busiestDayDesc": { en: "The day with the most messages.", zh: "消息数最多的一天。" },
  "recap.busiestDayCard": {
    en: "Busiest day: {day}",
    zh: "最忙的一天：{day}",
  },
  "recap.busiestDayMsgs": {
    en: "{n} messages on a single day.",
    zh: "{n} 条消息只用了一天。",
  },
  "recap.seeDayInCalendar": { en: "See the day in the calendar →", zh: "在日历中查看这一天 →" },
  "recap.computedFooter": {
    en: "Computed {when} · all stats are local to your machine",
    zh: "计算时间 {when} · 所有统计都在你本地完成",
  },
  "recap.computedChatFooter": {
    en: "Computed {when} · everything local to your machine",
    zh: "计算时间 {when} · 全部本地完成",
  },
  "recap.yearOfMessages": { en: "A year of messages", zh: "这一年的消息" },
  "recap.yearOfMessagesDesc": {
    en: "Stacked: your messages on top, theirs underneath.",
    zh: "堆叠：你的在上、对方在下。",
  },
  "recap.hourPattern": { en: "Hour-of-day pattern", zh: "按小时的活跃曲线" },
  "recap.hourPatternDesc": { en: "Who's chatting when.", zh: "谁在什么时候聊天。" },
  "recap.busiestDayNoneChat": { en: "No day stands out.", zh: "没有特别突出的一天。" },
  "recap.html": { en: "HTML", zh: "HTML" },

  // Messages permalink
  "messages.backTo": { en: "Back to {name}", zh: "返回 {name}" },
  "messages.message": { en: "Message", zh: "消息" },
  "messages.unlinkedChat": { en: "unlinked chat", zh: "未关联会话" },
  "messages.contextTitle": { en: "Context", zh: "上下文" },
  "messages.contextDesc": {
    en: "{before} before · target · {after} after",
    zh: "前 {before} · 目标 · 后 {after}",
  },
  "messages.contextEmpty": {
    en: "No surrounding messages indexed for this chat.",
    zh: "这个聊天没有索引到相邻消息。",
  },
  "messages.before": { en: "Before", zh: "之前" },
  "messages.after": { en: "After", zh: "之后" },
  "messages.beforeEmpty": { en: "Nothing older indexed in this chat.", zh: "这个聊天没有更早的索引消息。" },
  "messages.afterEmpty": { en: "Nothing newer indexed in this chat.", zh: "这个聊天没有更新的索引消息。" },
  "messages.openInCalendar": { en: "Open in calendar", zh: "在日历中打开" },
  "messages.openContact": { en: "Open contact", zh: "打开联系人" },
  "messages.searchMessage": { en: "Search this message", zh: "搜索本条消息" },
  "messages.searchTooltip": {
    en: "Search for \"{q}\"",
    zh: "搜索 “{q}”",
  },
  "messages.permalink": { en: "Open permalink", zh: "打开永久链接" },
  "messages.openDayInCal": { en: "Open this day in the calendar", zh: "在日历中打开这一天" },
  "messages.day": { en: "day", zh: "当天" },

  // Search
  "search.title": { en: "Search", zh: "搜索" },
  "search.desc": {
    en: "Full-text search across indexed messages — Chinese substring matching included.",
    zh: "对已索引消息做全文搜索 — 含中文子串匹配。",
  },
  "search.placeholder": { en: "Search messages…", zh: "搜索消息…" },
  "search.archivedShown": { en: "Archived shown", zh: "已包含归档" },
  "search.includeArchived": { en: "Include archived", zh: "包含已归档" },
  "search.archivedTitle": { en: "Including archived chats in results", zh: "已把已归档聊天纳入结果" },
  "search.archivedClickToggle": { en: "Click to also search archived chats", zh: "点击同时搜索已归档聊天" },
  "search.filteredTo": { en: "Filtered to chat:", zh: "已过滤到聊天：" },
  "search.clearFilter": { en: "Clear chat filter", zh: "清除聊天筛选" },
  "search.poweredBy": {
    en: "Powered by SQLite FTS5 with trigram tokenizer — short CJK queries fall back to LIKE.",
    zh: "由 SQLite FTS5 trigram 分词器驱动 — 短 CJK 查询自动回退到 LIKE。",
  },
  "search.empty": {
    en: "Type at least one character to search across",
    zh: "至少输入一个字符以搜索",
  },
  "search.emptyStrong": { en: "indexed messages", zh: "已索引消息" },
  "search.noMatch": {
    en: "No matches for \"{q}\".",
    zh: "未找到 “{q}” 的匹配。",
  },
  "search.searchForSender": {
    en: "Search for {sender}",
    zh: "搜索 {sender}",
  },
  "search.searchForSenderInChat": {
    en: "Search for {sender} within this chat",
    zh: "在本聊天里搜索 {sender}",
  },
  "search.permalinkDay": {
    en: "Permalink · also opens day {day} via the calendar link",
    zh: "永久链接 · 顺便可经日历链接打开 {day}",
  },
  "search.dayShort": { en: "day", zh: "当天" },
  "search.openDayCal": { en: "Open this day in the calendar", zh: "在日历中打开这一天" },

  // Calendar
  "calendar.title": { en: "Calendar", zh: "日历" },
  "calendar.summary": {
    en: "{n} messages in {year}",
    zh: "{year} 共 {n} 条消息",
  },
  "calendar.busiestDay": { en: "busiest day", zh: "最忙的一天" },
  "calendar.viewRecap": { en: "View {year} Recap →", zh: "查看 {year} 年度回顾 →" },
  "calendar.filteredToChat": { en: "Filtered to chat:", zh: "已过滤到聊天：" },
  "calendar.clearFilter": { en: "Clear chat filter", zh: "清除聊天筛选" },
  "calendar.clear": { en: "clear", zh: "清除" },
  "calendar.heatmapTitle": { en: "Activity heatmap", zh: "活跃度热力图" },
  "calendar.heatmapDesc": { en: "Click any day to deep-dive", zh: "点击任意一天深入查看" },
  "calendar.whatWasItAbout": {
    en: "What was {year} about",
    zh: "{year} 关键词",
  },
  "calendar.whatChatDesc": {
    en: "Top-30 distinctive terms in this chat in {year} vs your all-time chat baseline.",
    zh: "本聊天在 {year} 内相对你全时段基线的 Top-30 关键词。",
  },
  "calendar.whatGlobalDesc": {
    en: "Top-30 distinctive terms in {year} vs your all-time chat baseline (sampled).",
    zh: "{year} 相对你全时段（采样）基线的 Top-30 关键词。",
  },
  "calendar.yearGlanceTitle": { en: "Year at a glance", zh: "年度速览" },
  "calendar.yearGlanceChatDesc": {
    en: "{year} for this chat",
    zh: "本聊天的 {year}",
  },
  "calendar.yearGlanceGlobalDesc": {
    en: "{year} totals after exclusions",
    zh: "{year} 排除后的总数",
  },
  "calendar.totalMessages": { en: "Total messages", zh: "消息总数" },
  "calendar.uniqueChats": { en: "Unique chats", zh: "不同会话" },
  "calendar.yourShare": { en: "Your share", zh: "你的占比" },
  "calendar.busiestDayLabel": { en: "Busiest day", zh: "最忙的一天" },
  "calendar.noKeywords": {
    en: "Not enough text in this year to extract keywords.",
    zh: "这一年的文本不足以提取关键词。",
  },
  "calendar.messagesLabel": { en: "messages", zh: "条消息" },
  "calendar.chatsLabel": { en: "chats", zh: "个会话" },
  "calendar.dayHourly": {
    en: "Hour-by-hour activity for {day}",
    zh: "{day} 每小时活跃度",
  },
  "calendar.dayChatEmpty": {
    en: "No messages with this chat on this day.",
    zh: "今天没有和这个聊天的消息。",
  },
  "calendar.dayGlobalEmpty": {
    en: "No indexed messages on this day — try a deep index from Settings.",
    zh: "今天没有索引到消息 — 去 Settings 跑一次 Deep index 试试。",
  },
  "calendar.onTheTableTitle": { en: "What was on the table", zh: "今日话题" },
  "calendar.onTheTableDesc": {
    en: "Top-30 distinctive terms vs the trailing 365-day sampled baseline{suffix}",
    zh: "相对前 365 天采样基线的 Top-30 关键词{suffix}",
  },
  "calendar.onTheTableSuffix": {
    en: " · from {n} text messages",
    zh: " · 来自 {n} 条文本",
  },
  "calendar.dayNoKeywords": {
    en: "Not enough text messages on this day to extract keywords.",
    zh: "今天的文本不足以提取关键词。",
  },
  "calendar.onThisDayTitle": { en: "On this day in previous years", zh: "往年的今天" },
  "calendar.onThisDayDesc": {
    en: "Same {monthDay} across earlier years that have data{scope}",
    zh: "{monthDay} 在过往有数据的年份的样子{scope}",
  },
  "calendar.onThisDayChatScope": { en: " with this chat", zh: "（本聊天）" },
  "calendar.noTextSnippets": { en: "(no text snippets — links/images/etc.)", zh: "（没有文本片段 — 链接/图片等）" },
  "calendar.messagesTitle": { en: "Messages", zh: "消息" },
  "calendar.chatsThisDayTitle": { en: "Chats this day", zh: "今日会话" },
  "calendar.messagesChatDesc": {
    en: "Latest messages from this chat on this day",
    zh: "本聊天今日最新消息",
  },
  "calendar.messagesGlobalDesc": {
    en: "One row per session, sorted by message count",
    zh: "每个会话一行，按消息数排序",
  },
  "calendar.dayEmpty": {
    en: "Nothing indexed for {day}. If you expect messages here, try a deep reindex from Settings.",
    zh: "{day} 没有索引到内容。如果你认为应该有，去 Settings 跑一次 Deep index。",
  },
  "calendar.msgsLabel": { en: "msgs", zh: "条" },
  "calendar.lastPrefix": { en: "last", zh: "最近" },
  "calendar.noSample": { en: "No sample available.", zh: "暂无样本。" },

  // Links
  "links.title": { en: "Links", zh: "链接" },
  "links.summary": {
    en: "{n} shared links across {groups} domain groups",
    zh: "{n} 条共享链接，分布在 {groups} 个域名分组",
  },
  "links.includingArchived": { en: " (including archived)", zh: "（含已归档）" },
  "links.lastPrefix": { en: "last", zh: "最近" },
  "links.showAll": { en: "Show {n} more domain groups", zh: "查看更多 {n} 个域名分组" },
  "links.collapse": { en: "Collapse to top 60", zh: "收起，只看前 60 个" },

  // Topics longitudinal page
  "topic.backToSearch": { en: "Back to search", zh: "返回搜索" },
  "topic.timeline": { en: "Topic timeline", zh: "话题时间线" },
  "topic.fts5": { en: "FTS5", zh: "FTS5" },
  "topic.likeFallback": { en: "LIKE fallback", zh: "LIKE 兜底" },
  "topic.noMatches": {
    en: "No indexed messages contain \"{word}\".",
    zh: "没有索引消息包含 “{word}”。",
  },
  "topic.occurrences": {
    en: "{n} occurrences across the corpus",
    zh: "全语料共出现 {n} 次",
  },
  "topic.firstAppeared": { en: "first appeared", zh: "首次出现" },
  "topic.trySpelling": {
    en: "Try a different spelling, or",
    zh: "换个拼写试试，或者",
  },
  "topic.searchMessages": { en: "search messages", zh: "搜索消息" },
  "topic.forContext": { en: "for surrounding context.", zh: "查找上下文。" },
  "topic.overTime": { en: "Over time", zh: "随时间变化" },
  "topic.overTimeDesc": {
    en: "Monthly occurrences. Useful to spot when a topic showed up in your life.",
    zh: "按月出现次数。用来观察某个话题何时进入你的生活。",
  },
  "topic.topChats": { en: "Top chats", zh: "高频聊天" },
  "topic.topChatsDesc": { en: "Where this word lives most.", zh: "这个词出现最多的聊天。" },
  "topic.topChatsEmpty": { en: "No chat breakdown.", zh: "没有聊天拆分数据。" },
  "topic.topSenders": { en: "Top senders", zh: "高频发送者" },
  "topic.topSendersDesc": { en: "Who says it most.", zh: "谁说得最多。" },
  "topic.topSendersEmpty": { en: "No sender breakdown.", zh: "没有发送者拆分数据。" },
  "topic.firstAppearances": { en: "First appearances", zh: "最早出现" },
  "topic.firstAppearancesDesc": {
    en: "The earliest indexed messages mentioning this word.",
    zh: "索引中最早提到这个词的消息。",
  },
  "topic.recentMentions": { en: "Recent mentions", zh: "最近提及" },
  "topic.recentMentionsDesc": { en: "Most recent ten.", zh: "最近十条。" },
} satisfies Record<string, Record<Locale, string>>;

export type TKey = keyof typeof DICT;

export function t(key: TKey, locale: Locale = DEFAULT_LOCALE): string {
  const entry = DICT[key];
  if (!entry) return key as string;
  return entry[locale] ?? entry[DEFAULT_LOCALE] ?? (key as string);
}

/**
 * Translate + interpolate `{name}` placeholders. Lookup is identical to `t`;
 * any `{key}` in the resolved string is replaced with `String(vars[key])`.
 * Unknown placeholders are left untouched so they're visible in dev.
 */
export function tf(
  key: TKey,
  locale: Locale,
  vars: Record<string, string | number>,
): string {
  const raw = t(key, locale);
  return raw.replace(/\{(\w+)\}/g, (m, k) =>
    Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m,
  );
}

/** Cookie key — read on the server, written by the client toggle. */
export const LOCALE_COOKIE = "we-locale";

export function parseLocale(v: string | null | undefined): Locale {
  if (v === "zh" || v === "en") return v;
  return DEFAULT_LOCALE;
}
