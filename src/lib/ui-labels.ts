const LABELS: Record<string, string> = {
  active: "启用",
  paused: "暂停",
  canceled: "已取消",
  expired: "已过期",
  trial: "试用",
  unknown: "未知",
  disabled: "停用",
  revoked: "已撤销",
  open: "未处理",
  acknowledged: "已确认",
  resolved: "已解决",
  ignored: "已忽略",
  info: "信息",
  warning: "警告",
  critical: "严重",
  success: "成功",
  error: "错误",
  timeout: "超时",
  rate_limited: "限流",
  fallback: "回退",
  completed: "已完成",
  failed: "失败",
  running: "运行中",
  pending: "等待中",
  monthly: "每月",
  yearly: "每年",
  one_time: "一次性",
  usage_based: "按量计费",
  daily: "每天",
  weekly: "每周",
  token: "Token",
  request: "请求",
  credit: "额度",
  message: "消息",
  hour: "小时",
  daily_limit: "每日限制",
  monthly_limit: "每月限制",
  unlimited: "无限",
  global: "全局",
  provider: "供应商",
  subscription: "订阅",
  api_key: "API 密钥",
  model: "模型",
  model_endpoint: "模型端点",
  task_type: "任务类型",
  chat: "聊天",
  analyze: "分析",
  review: "审查",
  plan: "规划",
  refactor: "重构",
  bug_diagnosis: "问题诊断",
  test_generation: "测试生成",
  security_review: "安全审查",
  performance_analysis: "性能分析",
  pr_description: "PR 描述",
  commit_message: "提交信息",
  requirement_breakdown: "需求拆解",
  architecture_planning: "架构规划",
  custom: "自定义",
  manual: "手动",
  best_quality: "最佳质量",
  lowest_cost: "最低成本",
  fastest: "最快",
  most_quota_left: "剩余额度最多",
  balanced: "均衡",
  fallback_chain: "回退链",
  official: "官方",
  reseller: "经销商",
  proxy: "中转站",
  shared_account: "共享账号",
  other: "其他",
};

export function labelFor(value: string | null | undefined): string {
  if (!value) return "未知";
  return LABELS[value] || value;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("zh-CN");
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("zh-CN");
}

export function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  const now = new Date();
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}
