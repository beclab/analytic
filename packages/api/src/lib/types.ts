import { EVENT_DATA_TYPE, EVENT_TYPE, KAFKA_TOPIC, ROLES } from './constants';

type ObjectValues<T> = T[keyof T];

export type Roles = ObjectValues<typeof ROLES>;

export type EventTypes = ObjectValues<typeof EVENT_TYPE>;

export type EventDataTypes = ObjectValues<typeof EVENT_DATA_TYPE>;

export type KafkaTopics = ObjectValues<typeof KAFKA_TOPIC>;

export interface EventData {
  [key: string]:
    | number
    | string
    | EventData
    | number[]
    | string[]
    | EventData[];
}

export interface Auth {
  user?: {
    id: string;
    username: string;
    role: string;
    isAdmin: boolean;
  };
  shareToken?: {
    websiteId: string;
  };
}

export interface User {
  id: string;
  username: string;
  password?: string;
  role: string;
  createdAt?: Date;
}

export interface Website {
  id: string;
  userId: string;
  resetAt: Date;
  name: string;
  domain: string;
  shareId: string;
  createdAt: Date;
}

export interface Share {
  id: string;
  token: string;
}

export interface WebsiteActive {
  x: number;
}

export interface WebsiteMetric {
  x: string;
  y: number;
}

export interface WebsiteMetricFilter {
  domain?: string;
  url?: string;
  referrer?: string;
  title?: string;
  query?: string;
  event?: string;
  os?: string;
  browser?: string;
  device?: string;
  country?: string;
  region?: string;
  city?: string;
}

export interface WebsiteEventMetric {
  x: string;
  t: string;
  y: number;
}

export interface WebsiteEventDataMetric {
  x: string;
  t: string;
  eventName?: string;
  urlPath?: string;
}

export interface WebsitePageviews {
  pageviews: {
    t: string;
    y: number;
  };
  sessions: {
    t: string;
    y: number;
  };
}

export interface WebsiteStats {
  pageviews: { value: number; change: number };
  uniques: { value: number; change: number };
  bounces: { value: number; change: number };
  totalTime: { value: number; change: number };
}

export interface RealtimeInit {
  websites: Website[];
  token: string;
  data: RealtimeUpdate;
}

export interface RealtimeUpdate {
  pageviews: any[];
  sessions: any[];
  events: any[];
  timestamp: number;
}

export interface CollectRequestBody {
  payload: {
    data: { [key: string]: any };
    hostname: string;
    language: string;
    referrer: string;
    screen: string;
    title: string;
    url: string;
    website: string;
    name: string;
  };
  type: string;
}

export interface NextApiRequestCollect {
  body: CollectRequestBody;
  session: {
    id: string;
    websiteId: string;
    hostname: string;
    browser: string;
    os: string;
    device: string;
    screen: string;
    language: string;
    country: string;
    subdivision1: string;
    subdivision2: string;
    city: string;
  };
  headers: { [key: string]: any };
}

export interface MetricsParams {
  type: string;
  startAt?: number;
  endAt?: number;
  url?: string;
  referrer?: string;
  os?: string;
  browser?: string;
  device?: string;
  country?: string;
  region?: string;
  city?: string;
}

export interface PageviewsParams {
  startAt: number;
  endAt: number;
  unit: string;
  timezone?: string;
}

export interface StatsParams {
  startAt: number;
  endAt: number;
}
