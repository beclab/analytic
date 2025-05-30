import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PrismaService } from './prisma.service';

@Injectable()
export class UserMiddleware implements NestMiddleware {
  private readonly logger = new Logger(UserMiddleware.name);

  constructor(private readonly prismaService: PrismaService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    this.logger.log(req.headers);
    const userName = req.headers['x-bfl-user'] as string;
    if (!userName) {
      next();
    }

    this.logger.log('userName ' + userName);

    const user = this.prismaService.getUser({ username: userName });
    if (!user) {
      this.logger.error('User not found');
      next();
    }
    next();
  }
}
