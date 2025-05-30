import redis from '@umami/redis-client';
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaClient, Prisma, Website, Session, User } from '@prisma/client';
import {
  toUuid,
  parseFilters,
  getDateQuery,
  getTimestampInterval,
} from './lib/prisma';
import {
  EVENT_NAME_LENGTH,
  URL_LENGTH,
  EVENT_TYPE,
  EVENT_DATA_TYPE,
  ROLES,
} from './lib/constants';
import { uuid, md5, secret } from './lib/crypto';
import { flattenJSON } from './lib/eventData';
import { EventData } from './lib/types';
import { CollectRequestBody, Roles } from './lib/types';
import { getClientInfo } from './lib/detect';
import { validate } from 'uuid';
import { parseToken } from './lib/token';

const DELETED = 'DELETED';
//const enabled = false;
const enabled = !!process.env.REDIS_URL;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'info' },
        { emit: 'stdout', level: 'warn' },
        { emit: 'stdout', level: 'error' },
      ],
      errorFormat: 'colorless',
    });
  }

  async onModuleInit() {
    this.logger.verbose('onModuleInit');
    await this.$connect();
  }

  async findSession(body: CollectRequestBody, req: Request) {
    //const { payload } = getJsonBody<CollectRequestBody>(req);

    // if (!payload) {
    //   throw new Error('Invalid payload.');
    // }

    // Check if cache token is passed
    const cacheToken = req.headers['x-umami-cache'];

    if (cacheToken) {
      const result = await parseToken(cacheToken, secret());

      if (result) {
        return result;
      }
    }

    // Verify payload
    const { website: websiteId, hostname, screen, language } = body.payload;

    if (!validate(websiteId)) {
      throw new Error('Invalid website ID.');
    }

    // Find website
    const website = await this.loadWebsite(websiteId);

    if (!website) {
      throw new Error(`Website not found: ${websiteId}.`);
    }

    const {
      userAgent,
      browser,
      os,
      ip,
      country,
      subdivision1,
      subdivision2,
      city,
      device,
    } = await getClientInfo(req, body.payload);
    const sessionId = uuid(websiteId, hostname, ip, userAgent);

    // Find session
    let session = await this.loadSession(sessionId);

    // Create a session if not found
    if (!session) {
      try {
        session = await this.createSession({
          id: sessionId,
          websiteId,
          hostname,
          browser,
          os,
          device,
          screen,
          language,
          country,
          subdivision1,
          subdivision2,
          city,
        });
      } catch (e: any) {
        if (!e.message.toLowerCase().includes('unique constraint')) {
          throw e;
        }
      }
    }

    return session;
  }

  async saveEvent(data: {
    sessionId: string;
    websiteId: string;
    urlPath: string;
    urlQuery?: string;
    referrerPath?: string;
    referrerQuery?: string;
    referrerDomain?: string;
    pageTitle?: string;
    eventName?: string;
    eventData?: any;
    hostname?: string;
    browser?: string;
    os?: string;
    device?: string;
    screen?: string;
    language?: string;
    country?: string;
    subdivision1?: string;
    subdivision2?: string;
    city?: string;
  }) {
    const {
      websiteId,
      sessionId,
      urlPath,
      urlQuery,
      referrerPath,
      referrerQuery,
      referrerDomain,
      eventName,
      eventData,
      pageTitle,
    } = data;
    const websiteEventId = uuid();

    const websiteEvent = this.websiteEvent.create({
      data: {
        id: websiteEventId,
        websiteId,
        sessionId,
        urlPath: urlPath?.substring(0, URL_LENGTH),
        urlQuery: urlQuery?.substring(0, URL_LENGTH),
        referrerPath: referrerPath?.substring(0, URL_LENGTH),
        referrerQuery: referrerQuery?.substring(0, URL_LENGTH),
        referrerDomain: referrerDomain?.substring(0, URL_LENGTH),
        pageTitle,
        eventType: eventName ? EVENT_TYPE.customEvent : EVENT_TYPE.pageView,
        eventName: eventName
          ? eventName?.substring(0, EVENT_NAME_LENGTH)
          : null,
      },
    });

    if (eventData) {
      await this.saveEventData({
        websiteId,
        sessionId,
        eventId: websiteEventId,
        urlPath: urlPath?.substring(0, URL_LENGTH),
        eventName: eventName?.substring(0, EVENT_NAME_LENGTH),
        eventData,
      });
    }

    return websiteEvent;
  }

  async saveEventData(data: {
    websiteId: string;
    eventId: string;
    sessionId?: string;
    urlPath?: string;
    eventName?: string;
    eventData: EventData;
    createdAt?: string;
  }) {
    const { websiteId, eventId, eventData } = data;

    const jsonKeys = flattenJSON(eventData);

    //id, websiteEventId, eventStringValue
    const flattendData = jsonKeys.map((a) => ({
      id: uuid(),
      websiteEventId: eventId,
      websiteId,
      eventKey: a.key,
      eventStringValue:
        a.eventDataType === EVENT_DATA_TYPE.string ||
        a.eventDataType === EVENT_DATA_TYPE.boolean ||
        a.eventDataType === EVENT_DATA_TYPE.array
          ? a.value
          : null,
      eventNumericValue:
        a.eventDataType === EVENT_DATA_TYPE.number ? a.value : null,
      eventDateValue:
        a.eventDataType === EVENT_DATA_TYPE.date ? new Date(a.value) : null,
      eventDataType: a.eventDataType,
    }));

    return this.eventData.createMany({
      data: flattendData,
    });
  }

  async getUserWebsites(userId: string): Promise<Website[]> {
    return this.website.findMany({
      where: {
        userId,
        deletedAt: null,
      },
      orderBy: [
        {
          name: 'asc',
        },
      ],
    });
  }

  async getWebsite(where: Prisma.WebsiteWhereUniqueInput): Promise<Website> {
    return this.website.findUnique({
      where,
    });
  }

  async getFirstWebsite(where: Prisma.WebsiteWhereInput): Promise<Website> {
    return this.website.findFirst({
      where,
    });
  }

  async createWebsite(
    data: Prisma.WebsiteCreateInput | Prisma.WebsiteUncheckedCreateInput,
  ): Promise<Website> {
    return this.website
      .create({
        data,
      })
      .then(async (data) => {
        if (enabled) {
          await this.storeWebsite(data);
        }

        return data;
      });
  }

  async getWebsiteStats(
    websiteId: string,
    criteria: {
      startDate: Date;
      endDate: Date;
      type?: string;
      filters: object;
    },
  ) {
    const { startDate, endDate, filters = {} } = criteria;
    const website = await this.loadWebsite(websiteId);
    const resetDate = new Date(website?.resetAt || website?.createdAt);
    const params: any = [websiteId, resetDate, startDate, endDate];
    const { filterQuery, joinSession } = parseFilters(filters, params);

    return this.$queryRawUnsafe(
      `select sum(t.c) as "pageviews",
        count(distinct t.session_id) as "uniques",
        sum(case when t.c = 1 then 1 else 0 end) as "bounces",
        sum(t.time) as "totaltime"
      from (
        select website_event.session_id,
          ${getDateQuery('website_event.created_at', 'hour')},
          count(*) c,
          ${getTimestampInterval('website_event.created_at')} as "time"
        from website_event
          join website 
            on website_event.website_id = website.website_id
          ${joinSession}
        where event_type = ${EVENT_TYPE.pageView}
          and website.website_id = $1${toUuid()}
          and website_event.created_at >= $2
          and website_event.created_at between $3 and $4
          ${filterQuery}
        group by 1, 2
     ) t`,
      ...params,
    );
  }

  async getSessionMetrics(
    websiteId: string,
    criteria: {
      startDate: Date;
      endDate: Date;
      column: string;
      filters: object;
    },
  ) {
    const website = await this.loadWebsite(websiteId);
    const resetDate = new Date(website?.resetAt || website?.createdAt);
    const { startDate, endDate, column, filters = {} } = criteria;
    // const { toUuid, parseFilters, rawQuery } = prisma;
    const params: any = [websiteId, resetDate, startDate, endDate];
    const { filterQuery, joinSession } = parseFilters(filters, params);

    return this.$queryRawUnsafe(
      `select ${column} x, count(*) y
      from session as x
      where x.session_id in (
        select website_event.session_id
        from website_event
          join website 
            on website_event.website_id = website.website_id
          ${joinSession}
        where website.website_id = $1${toUuid()}
          and website_event.created_at >= $2
          and website_event.created_at between $3 and $4
        ${filterQuery}
      )
      group by 1
      order by 2 desc
      limit 100`,
      ...params,
    );
  }

  async getPageviewMetrics(
    websiteId: string,
    criteria: {
      startDate: Date;
      endDate: Date;
      column: string;
      filters: object;
    },
  ) {
    const { startDate, endDate, filters = {}, column } = criteria;
    //const { rawQuery, parseFilters, toUuid } = prisma;
    const website = await this.loadWebsite(websiteId);
    const resetDate = new Date(website?.resetAt || website?.createdAt);
    const params: any = [
      websiteId,
      resetDate,
      startDate,
      endDate,
      column === 'event_name' ? EVENT_TYPE.customEvent : EVENT_TYPE.pageView,
    ];

    let excludeDomain = '';

    if (column === 'referrer_domain') {
      excludeDomain = 'and website_event.referrer_domain != $6';
      params.push(website.domain);
    }

    const { filterQuery, joinSession } = parseFilters(filters, params);

    return this.$queryRawUnsafe(
      `select ${column} x, count(*) y
    from website_event
      ${joinSession}
    where website_event.website_id = $1${toUuid()}
      and website_event.created_at >= $2
      and website_event.created_at between $3 and $4
      and event_type = $5
      ${excludeDomain}
      ${filterQuery}
    group by 1
    order by 2 desc
    limit 100`,
      ...params,
    );
  }

  async getPageviewStats(
    websiteId: string,
    criteria: {
      startDate: Date;
      endDate: Date;
      timezone?: string;
      unit?: string;
      count?: string;
      filters: object;
      sessionKey?: string;
    },
  ) {
    const {
      startDate,
      endDate,
      timezone = 'utc',
      unit = 'day',
      count = '*',
      filters = {},
      sessionKey = 'session_id',
    } = criteria;
    //const { toUuid, getDateQuery, parseFilters, rawQuery } = prisma;
    const website = await this.loadWebsite(websiteId);

    const resetDate = new Date(website?.resetAt || website?.createdAt);
    const params: any = [websiteId, resetDate, startDate, endDate];
    const { filterQuery, joinSession } = parseFilters(filters, params);

    return this.$queryRawUnsafe(
      `select ${getDateQuery('website_event.created_at', unit, timezone)} x,
          count(${count !== '*' ? `${count}${sessionKey}` : count}) y
        from website_event
          ${joinSession}
        where website_event.website_id = $1${toUuid()}
          and website_event.created_at >= $2
          and website_event.created_at between $3 and $4
          and event_type = ${EVENT_TYPE.pageView}
          ${filterQuery}
        group by 1`,
      ...params,
    );
  }

  async getEvents(websiteId: string, startAt: Date, eventType: number) {
    return this.websiteEvent.findMany({
      where: {
        websiteId,
        eventType,
        createdAt: {
          gte: startAt,
        },
      },
    });
  }

  async createSession(data: Prisma.SessionCreateInput) {
    const {
      id,
      websiteId,
      hostname,
      browser,
      os,
      device,
      screen,
      language,
      country,
      subdivision1,
      subdivision2,
      city,
    } = data;

    return this.session.create({
      data: {
        id,
        websiteId,
        hostname,
        browser,
        os,
        device,
        screen,
        language,
        country,
        subdivision1:
          country && subdivision1 ? `${country}-${subdivision1}` : null,
        subdivision2,
        city,
      },
    });
  }

  async getSessions(websiteId: string, startAt: Date) {
    return this.session.findMany({
      where: {
        websiteId,
        createdAt: {
          gte: startAt,
        },
      },
    });
  }

  async getRealtimeData(websiteId: string, time: Date) {
    const [pageviews, sessions, events] = await Promise.all([
      this.getEvents(websiteId, time, EVENT_TYPE.pageView),
      this.getSessions(websiteId, time),
      this.getEvents(websiteId, time, EVENT_TYPE.customEvent),
    ]);

    const decorate = (id, data) => {
      return data.map((props) => ({
        ...props,
        __id: md5(id, ...Object.values(props)),
        __type: id,
        timestamp: props.timestamp
          ? props.timestamp * 1000
          : new Date(props.createdAt).getTime(),
      }));
    };

    return {
      pageviews: decorate('pageview', pageviews),
      sessions: decorate('session', sessions),
      events: decorate('event', events),
      timestamp: Date.now(),
    };
  }

  async loadWebsite(websiteId: string): Promise<Website> {
    let website;

    if (enabled) {
      website = await this.fetchWebsite(websiteId);
    } else {
      website = await this.getWebsite({ id: websiteId });
    }

    if (!website || website.deletedAt) {
      return null;
    }

    return website;
  }

  async getSession(where: Prisma.SessionWhereUniqueInput) {
    return this.session.findUnique({
      where,
    });
  }

  async loadSession(sessionId: string): Promise<Session> {
    let session;

    if (enabled) {
      session = await this.fetchSession(sessionId);
    } else {
      session = await this.getSession({ id: sessionId });
    }

    if (!session) {
      return null;
    }

    return session;
  }

  async fetchObject(key, query) {
    const obj = await redis.get(key);

    if (obj === DELETED) {
      return null;
    }

    if (!obj) {
      return query().then(async (data) => {
        if (data) {
          await redis.set(key, data);
        }

        return data;
      });
    }

    return obj;
  }

  async getUser(
    where: Prisma.UserWhereInput | Prisma.UserWhereUniqueInput,
    options: { includePassword?: boolean; showDeleted?: boolean } = {},
  ) {
    const { includePassword = false, showDeleted = false } = options;

    return this.user.findFirst({
      where: { ...where, ...(showDeleted ? {} : { deletedAt: null }) },
      select: {
        id: true,
        username: true,
        password: includePassword,
        role: true,
        createdAt: true,
      },
    });
  }

  async getUsers() {
    return this.user.findMany({
      take: 100,
      where: {
        deletedAt: null,
      },
      orderBy: [
        {
          username: 'asc',
        },
      ],
      select: {
        id: true,
        username: true,
        role: true,
        createdAt: true,
      },
    });
  }

  async createUser(data: {
    id: string;
    username: string;
    password: string;
    role: Roles;
  }): Promise<{
    id: string;
    username: string;
    role: string;
  }> {
    return this.user.create({
      data,
      select: {
        id: true,
        username: true,
        role: true,
      },
    });
  }

  async deleteUser(
    userId: string,
  ): Promise<
    [
      Prisma.BatchPayload,
      Prisma.BatchPayload,
      Prisma.BatchPayload,
      Prisma.BatchPayload,
      Prisma.BatchPayload,
      Prisma.BatchPayload,
      Prisma.BatchPayload,
      Prisma.BatchPayload,
      User,
    ]
  > {
    //const { client } = prisma;
    const cloudMode = false;

    const websites = await this.website.findMany({
      where: { userId },
    });

    let websiteIds = [];

    if (websites.length > 0) {
      websiteIds = websites.map((a) => a.id);
    }

    const teams = await this.team.findMany({
      where: {
        teamUser: {
          some: {
            userId,
            role: ROLES.teamOwner,
          },
        },
      },
    });

    const teamIds = teams.map((a) => a.id);

    return this.$transaction([
      this.eventData.deleteMany({
        where: { websiteId: { in: websiteIds } },
      }),
      this.websiteEvent.deleteMany({
        where: { websiteId: { in: websiteIds } },
      }),
      this.session.deleteMany({
        where: { websiteId: { in: websiteIds } },
      }),
      this.teamWebsite.deleteMany({
        where: {
          OR: [
            {
              websiteId: {
                in: websiteIds,
              },
            },
            {
              teamId: {
                in: teamIds,
              },
            },
          ],
        },
      }),
      this.teamWebsite.deleteMany({
        where: {
          teamId: {
            in: teamIds,
          },
        },
      }),
      this.teamUser.deleteMany({
        where: {
          teamId: {
            in: teamIds,
          },
        },
      }),
      this.team.deleteMany({
        where: {
          id: {
            in: teamIds,
          },
        },
      }),
      cloudMode
        ? this.website.updateMany({
            data: {
              deletedAt: new Date(),
            },
            where: { id: { in: websiteIds } },
          })
        : this.website.deleteMany({
            where: { id: { in: websiteIds } },
          }),
      cloudMode
        ? this.user.update({
            data: {
              deletedAt: new Date(),
            },
            where: {
              id: userId,
            },
          })
        : this.user.delete({
            where: {
              id: userId,
            },
          }),
    ]).then(async (data) => {
      if (enabled) {
        const ids = websites.map((a) => a.id);

        for (let i = 0; i < ids.length; i++) {
          await this.deleteWebsite(`website:${ids[i]}`);
        }
      }

      return data;
    });
  }

  async storeObject(key, data) {
    return redis.set(key, data);
  }

  async deleteObject(key, soft = false) {
    return soft ? redis.set(key, DELETED) : redis.del(key);
  }

  async fetchWebsite(id): Promise<Website> {
    return this.fetchObject(`website:${id}`, () => this.getWebsite({ id }));
  }

  async storeWebsite(data) {
    const { id } = data;
    const key = `website:${id}`;

    return this.storeObject(key, data);
  }

  async deleteWebsite(id) {
    return this.deleteObject(`website:${id}`);
  }

  async fetchSession(id) {
    return this.fetchObject(`session:${id}`, () => this.getSession({ id }));
  }

  async storeSession(data) {
    const { id } = data;
    const key = `session:${id}`;

    return this.storeObject(key, data);
  }

  async deleteSession(id) {
    return this.deleteObject(`session:${id}`);
  }
}
