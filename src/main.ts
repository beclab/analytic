import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as dotenv from 'dotenv';
//import { tz } from 'moment-timezone';

declare global {
  interface BigInt {
    toJSON(): string;
  }
}

BigInt.prototype.toJSON = function () {
  const int = Number.parseInt(this.toString());
  return int ?? this.toString();
};

dotenv.config();
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // --- Swagger setup for API documentation ---

  // --- End Swagger setup ---
  //console.log(tz.zone('Asia/Shanghai'));

  app.enableCors();
  await app.listen(3010);
}
bootstrap();
