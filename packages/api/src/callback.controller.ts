import { Controller, Post, Body, Logger } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { uuid } from './lib/crypto';

@Controller('/')
export class CallbackController {
  private readonly logger = new Logger(CallbackController.name);

  constructor(private readonly prismaService: PrismaService) {}

  @Post('/callback/create')
  async getMyWebsites(@Body() { name }: { name: string }): Promise<void> {
    this.logger.log('createUser ' + name);

    const user = await this.prismaService.getUser({ username: name });
    this.logger.log(user);
    if (user) {
      this.logger.error('User already exists');
      return;
    }

    const res = await this.prismaService.createUser({
      // id: uuid(),
      id: name,
      username: name,
      password: uuid(),
      role: 'admin',
    });
    this.logger.log(res);

    return;
  }

  @Post('/callback/delete')
  async deleteAccount(@Body() { name }: { name: string }): Promise<void> {
    this.logger.debug('deleteAccount ' + name);

    const user = await this.prismaService.getUser({ username: name });
    this.logger.log(user);
    if (!user) {
      this.logger.error('User not found');
      return;
    }

    const res = await this.prismaService.deleteUser(user.id);
    this.logger.log(res);

    return;
  }
}
