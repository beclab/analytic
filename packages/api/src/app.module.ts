import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { CallbackController } from './callback.controller';
import { SendController } from './send.controller';
import { WebSitesController } from './websites.controller';
import { PrismaService } from './prisma.service';

@Module({
  imports: [],
  controllers: [
    AppController,
    CallbackController,
    SendController,
    WebSitesController,
  ],
  providers: [PrismaService],
})
export class AppModule {}
