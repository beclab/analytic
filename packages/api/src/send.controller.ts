import { Controller, Post, Body, HttpCode, Logger, Req } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import isbot = require('isbot');
import ipaddr = require('ipaddr.js');
//import ipaddr from 'ipaddr.js';
//import { canViewWebsite } from './lib/auth';
import { getJsonBody, getIpAddress } from './lib/detect';
import { secret } from './lib/crypto';
import { Resolver } from 'dns/promises';
import { CollectRequestBody } from './lib/types';
import { createToken } from './lib/token';

@Controller('/api/send')
export class SendController {
  private readonly logger = new Logger(SendController.name);

  constructor(private readonly prismaService: PrismaService) {}

  @Post('')
  @HttpCode(200)
  async addSender(
    @Body()
    body: CollectRequestBody,
    @Req()
    req: Request,
  ): Promise<void> {
    if (isbot(req.headers['user-agent']) && !process.env.DISABLE_BOT_CHECK) {
      return;
    }

    const { type, payload } = getJsonBody<CollectRequestBody>(req);

    if (type !== 'event') {
      throw Error('Wrong payload type.');
    }

    const {
      url,
      referrer,
      name: eventName,
      data: eventData,
      title: pageTitle,
    } = payload;

    // Validate eventData is JSON
    if (
      eventData &&
      !(typeof eventData === 'object' && !Array.isArray(eventData))
    ) {
      throw Error('Invalid event data.');
    }

    const ignoreIps = process.env.IGNORE_IP;
    const ignoreHostnames = process.env.IGNORE_HOSTNAME;

    if (ignoreIps || ignoreHostnames) {
      const ips = [];

      if (ignoreIps) {
        ips.push(...ignoreIps.split(',').map((n) => n.trim()));
      }

      if (ignoreHostnames) {
        const resolver = new Resolver();
        const promises = ignoreHostnames.split(',').map((n) =>
          resolver.resolve4(n.trim()).catch(() => {
            //
          }),
        );

        await Promise.all(promises).then((resolvedIps) => {
          ips.push(
            ...resolvedIps.filter((n) => n).flatMap((n) => n as string[]),
          );
        });
      }

      const clientIp = getIpAddress(req);

      const blocked = ips.find((ip) => {
        if (ip === clientIp) return true;

        // CIDR notation
        if (ip.indexOf('/') > 0) {
          const addr = ipaddr.parse(clientIp);
          const range = ipaddr.parseCIDR(ip);

          if (addr.kind() === range[0].kind() && addr.match(range)) return true;
        }

        return false;
      });

      if (blocked) {
        throw Error('Blocked');
      }
    }

    // await useSession(req, res);

    // const session = req.session;
    const session = await this.prismaService.findSession(body, req);

    // eslint-disable-next-line prefer-const
    let [urlPath, urlQuery] = url?.split('?') || [];
    let [referrerPath, referrerQuery] = referrer?.split('?') || [];
    let referrerDomain;

    if (!urlPath) {
      urlPath = '/';
    }

    if (referrerPath?.startsWith('http')) {
      const refUrl = new URL(referrer);
      referrerPath = refUrl.pathname;
      referrerQuery = refUrl.search.substring(1);
      referrerDomain = refUrl.hostname.replace(/www\./, '');
    }

    if (process.env.REMOVE_TRAILING_SLASH) {
      urlPath = urlPath.replace(/.+\/$/, '');
    }

    await this.prismaService.saveEvent({
      urlPath,
      urlQuery,
      referrerPath,
      referrerQuery,
      referrerDomain,
      pageTitle,
      eventName,
      eventData,
      ...session,
      sessionId: session.id,
    });

    const token = createToken(session, secret());

    //return send(res, token);
    return token;
  }
}
