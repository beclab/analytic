import { Controller, Get, Body, Param, Logger, Req } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { subMinutes } from 'date-fns';

@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);
  constructor(private readonly prismaService: PrismaService) {}

  @Get('/api/me/websites')
  async getMyWebsites(@Req() req: Request) {
    const userId = req.headers['x-bfl-user'] as string;
    const websites = await this.prismaService.getUserWebsites(userId);

    //return ok(res, websites);
    return websites;
  }

  @Get('/api/realtime/:websiteId')
  async getRealtime(
    @Param('websiteId') websiteId: string,
    @Body() { startAt }: { startAt: number },
  ) {
    //const { id, startAt } = req.query;
    let startTime = subMinutes(new Date(), 30);

    if (+startAt > startTime.getTime()) {
      startTime = new Date(+startAt);
    }

    const data = await this.prismaService.getRealtimeData(websiteId, startTime);

    //return ok(res, data);
    return data;
  }
}
