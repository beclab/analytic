import {
  Controller,
  Get,
  Post,
  Body,
  HttpCode,
  Param,
  Logger,
  Req,
} from '@nestjs/common';
import { tz } from 'moment-timezone';
import { PrismaService } from './prisma.service';
import { uuid } from './lib/crypto';
import {
  SESSION_COLUMNS,
  EVENT_COLUMNS,
  FILTER_COLUMNS,
} from './lib/constants';
import { MetricsParams, PageviewsParams, StatsParams } from './lib/types';

export interface WebsitesRequestBody {
  name: string;
  domain: string;
  shareId: string;
  appId?: string;
}

const unitTypes = ['year', 'month', 'hour', 'day'];

@Controller('/api/websites')
export class WebSitesController {
  private readonly logger = new Logger(WebSitesController.name);

  constructor(private readonly prismaService: PrismaService) {}

  @Get('/')
  async getWebsites(@Req() req: Request) {
    console.log('getWebsites');
    console.log('headers');
    console.log(req.headers);
    console.log('req');
    console.log(req);
    const userId = req.headers['x-bfl-user'] as string;
    // const {
    //   user: { id: userId },
    // } = req.auth;
    const websites = await this.prismaService.getUserWebsites(userId);
    //return ok(res, websites);

    return websites;
  }

  @Post('/')
  @HttpCode(200)
  async createWebsites(@Req() req: Request, @Body() body: WebsitesRequestBody) {
    // const {
    //   user: { id: userId },
    // } = req.auth;
    const userId = req.headers['x-bfl-user'] as string;
    const { name, domain, shareId, appId } = body;
    console.log(userId);
    console.log(name, domain, shareId, appId);
    // if (!(await canCreateWebsite(req))) {
    //   //return unauthorized(res);
    //   throw Error('Unauthorized');
    // }
    const onlyWebsite = await this.prismaService.getFirstWebsite({
      userId: userId,
      name: name,
    });
    console.log('onlyWebsite');
    console.log(onlyWebsite);
    if (onlyWebsite) {
      //return ok(res, onlyWebsite);
      return onlyWebsite;
    }
    const data: any = {
      id: appId ? appId : uuid(),
      name,
      domain,
      shareId,
    };

    data.userId = userId;
    console.log('data');
    console.log(data);
    const website = await this.prismaService.createWebsite(data);
    console.log('website');
    console.log(website);
    return website;
  }

  @Post('/:websiteId/stats')
  async getWebsitesStats(
    @Param('websiteId') websiteId: string,
    @Body() body: StatsParams,
  ) {
    const { startAt, endAt } = body;

    // if (!(await canViewWebsite(req.auth, websiteId))) {
    //   //return unauthorized(res);
    //   throw Error('Unauthorized');
    // }

    const startDate = new Date(+startAt);
    const endDate = new Date(+endAt);

    const distance = endAt - startAt;
    const prevStartDate = new Date(+startAt - distance);
    const prevEndDate = new Date(+endAt - distance);

    const metrics = await this.prismaService.getWebsiteStats(websiteId, {
      startDate,
      endDate,
      filters: {},
    });
    const prevPeriod = await this.prismaService.getWebsiteStats(websiteId, {
      startDate: prevStartDate,
      endDate: prevEndDate,
      filters: {},
    });

    const stats = Object.keys(metrics[0]).reduce((obj, key) => {
      obj[key] = {
        value: Number(metrics[0][key]) || 0,
        change: Number(metrics[0][key]) - Number(prevPeriod[0][key]) || 0,
      };
      return obj;
    }, {});

    //return ok(res, stats);
    return stats;
  }

  @Post('/:websiteId/metrics')
  async getWebsitesMetrics(
    @Param('websiteId') websiteId: string,
    @Body() body: MetricsParams,
  ) {
    const {
      //id: websiteId,
      type,
      startAt,
      endAt,
      url,
      referrer,
      // title,
      // query,
      // event,
      os,
      browser,
      device,
      country,
      region,
      city,
    } = body;

    // if (!(await canViewWebsite(req.auth, websiteId))) {
    //   return unauthorized(res);
    // }

    const startDate = new Date(+startAt);
    const endDate = new Date(+endAt);

    if (SESSION_COLUMNS.includes(type)) {
      const column = FILTER_COLUMNS[type] || type;
      const filters = {
        os,
        browser,
        device,
        country,
        region,
        city,
      };

      filters[type] = undefined;

      let data: any = await this.prismaService.getSessionMetrics(websiteId, {
        startDate,
        endDate,
        column,
        filters,
      });

      if (type === 'language') {
        const combined = {};

        for (const { x, y } of data) {
          const key = String(x).toLowerCase().split('-')[0];

          if (combined[key] === undefined) {
            combined[key] = { x: key, y };
          } else {
            combined[key].y += y;
          }
        }

        data = Object.values(combined);
      }

      //return ok(res, data);
      return data;
    }

    if (EVENT_COLUMNS.includes(type)) {
      const column = FILTER_COLUMNS[type] || type;
      const filters = {
        url,
        referrer,

        os,
        browser,
        device,
        country,
        region,
        city,
      };

      filters[type] = undefined;

      const data = await this.prismaService.getPageviewMetrics(websiteId, {
        startDate,
        endDate,
        column,
        filters,
      });

      //return ok(res, data);
      return data;
    }
  }

  @Post('/:websiteId/pageviews')
  async getWebsitesPageviews(
    @Param('websiteId') websiteId: string,
    @Body() body: PageviewsParams,
  ) {
    const {
      //  id: websiteId,
      startAt,
      endAt,
      unit,
      timezone,
    } = body;

    // if (!(await canViewWebsite(req.auth, websiteId))) {
    //   //return unauthorized(res);
    //   throw Error('Unauthorized');
    // }

    const startDate = new Date(+startAt);
    const endDate = new Date(+endAt);

    if (!tz.zone(timezone) || !unitTypes.includes(unit)) {
      //return badRequest(res);
      throw Error('Bad Request');
    }

    const [pageviews, sessions] = await Promise.all([
      this.prismaService.getPageviewStats(websiteId, {
        startDate,
        endDate,
        timezone,
        unit,
        count: '*',
        filters: {},
      }),
      this.prismaService.getPageviewStats(websiteId, {
        startDate,
        endDate,
        timezone,
        unit,
        count: 'distinct website_event.',
        filters: {},
      }),
    ]);

    //return ok(res, { pageviews, sessions });
    return { pageviews, sessions };
  }
}
