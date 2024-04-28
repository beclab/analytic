//import path from 'path';
import path = require('path');
import requestIp = require('request-ip');
import { browserName, detectOS } from 'detect-browser';
//import isLocalhost from 'is-localhost-ip';
import isLocalhost = require('is-localhost-ip');
import maxmind = require('maxmind');

import {
  DESKTOP_OS,
  MOBILE_OS,
  DESKTOP_SCREEN_WIDTH,
  LAPTOP_SCREEN_WIDTH,
  MOBILE_SCREEN_WIDTH,
} from './constants';

let lookup;

export function getIpAddress(req) {
  // Custom header
  if (req.headers[process.env.CLIENT_IP_HEADER]) {
    return req.headers[process.env.CLIENT_IP_HEADER];
  }
  // Cloudflare
  else if (req.headers['cf-connecting-ip']) {
    return req.headers['cf-connecting-ip'];
  }

  return requestIp.getClientIp(req);
}

export function getDevice(screen, os) {
  if (!screen) return;

  const [width] = screen.split('x');

  if (DESKTOP_OS.includes(os)) {
    if (os === 'Chrome OS' || width < DESKTOP_SCREEN_WIDTH) {
      return 'laptop';
    }
    return 'desktop';
  } else if (MOBILE_OS.includes(os)) {
    if (os === 'Amazon OS' || width > MOBILE_SCREEN_WIDTH) {
      return 'tablet';
    }
    return 'mobile';
  }

  if (width >= DESKTOP_SCREEN_WIDTH) {
    return 'desktop';
  } else if (width >= LAPTOP_SCREEN_WIDTH) {
    return 'laptop';
  } else if (width >= MOBILE_SCREEN_WIDTH) {
    return 'tablet';
  } else {
    return 'mobile';
  }
}

export async function getLocation(ip, req) {
  // Ignore local ips
  if (await isLocalhost(ip)) {
    return;
  }

  if (req.headers['x-vercel-ip-country']) {
    const country = req.headers['x-vercel-ip-country'];
    const region = req.headers['x-vercel-ip-country-region'];
    const city = req.headers['x-vercel-ip-city'];

    return {
      country,
      subdivision1: region,
      city: city ? decodeURIComponent(city) : undefined,
    };
  }

  // Database lookup
  if (!lookup) {
    const dir = path.join(process.cwd(), 'geo');

    lookup = await maxmind.open(path.resolve(dir, 'GeoLite2-City.mmdb'));
  }

  const result = lookup.get(ip);

  if (result) {
    return {
      country: result.country?.iso_code ?? result?.registered_country?.iso_code,
      subdivision1: result.subdivisions?.[0]?.iso_code,
      subdivision2: result.subdivisions?.[1]?.names?.en,
      city: result.city?.names?.en,
    };
  }
}

export async function getClientInfo(req: Request, { screen }): Promise<any> {
  const userAgent = req.headers['user-agent'];
  const ip = getIpAddress(req);
  const location = await getLocation(ip, req);
  const country = location?.country;
  const subdivision1 = location?.subdivision1;
  const subdivision2 = location?.subdivision2;
  const city = location?.city;
  const browser = browserName(userAgent);
  const os = detectOS(userAgent);
  const device = getDevice(screen, os);

  return {
    userAgent,
    browser,
    os,
    ip,
    country,
    subdivision1,
    subdivision2,
    city,
    device,
  };
}

export function getJsonBody<T>(req): T {
  if ((req.headers['content-type'] || '').indexOf('text/plain') !== -1) {
    return JSON.parse(req.body);
  }

  return req.body;
}
