export interface User {
  id: string;
  username: string;
  role: 'admin' | 'member';
  status: 'active' | 'disabled';
  quota: number;
  createdAt: string;
}

export interface Provider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  type: string;
  status: string;
  remark?: string;
  models?: Model[];
}

export interface Model {
  id: string;
  name: string;
  modelId: string;
  providerId: string;
  provider?: { id: string; name: string; status: string };
  contextLength: number;
  inputPrice: number;
  outputPrice: number;
  capability: string[];
  status: string;
  isDefault: boolean;
}

export interface UsageLog {
  id: string;
  userId: string;
  modelId: string;
  source: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  duration: number;
  status: string;
  errorMsg?: string;
  createdAt: string;
  user?: { username: string };
  model?: { name: string; provider?: { name: string } };
}

export interface ApiKey {
  id: string;
  name: string;
  status: string;
  lastUsed?: string;
  createdAt: string;
}

export interface InviteCode {
  id: string;
  code: string;
  usedBy?: string;
  usedAt?: string;
  expiresAt: string;
  createdAt: string;
  creator?: { username: string };
}

export interface QuotaRecord {
  id: string;
  userId: string;
  amount: number;
  reason: string;
  operatorId: string;
  createdAt: string;
  user?: { username: string };
  operator?: { username: string };
}

export interface UserModelPermission {
  id: string;
  userId: string;
  modelId: string;
  user?: { username: string };
  model?: Model;
}