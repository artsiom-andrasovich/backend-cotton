import { JwtAuthGuard } from '@auth/guards/jwt-auth.guard';
import { CronModule } from '@cron/cron.module';
import KeyvRedis from '@keyv/redis';
import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { CardModule } from './card/card.module';
import { CategoriesModule } from './categories/categories.module';
import { DeckModule } from './deck/deck.module';
import { FsrsModule } from './fsrs/fsrs.module';
import { MailModule } from './mail/mail.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProfileModule } from './profile/profile.module';
import { StatsModule } from './stats/stats.module';
import { UploadModule } from './upload/upload.module';
import { UserModule } from './user/user.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const host = configService.get<string>('REDIS_HOST') || 'localhost';
        const port = configService.get<string>('REDIS_PORT') || '6379';
        const redisUrl = `redis://${host}:${port}`;

        return {
          stores: [new KeyvRedis(redisUrl)],
        };
      },
    }),

    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 10,
      },
    ]),
    PrismaModule,
    AuthModule,
    UserModule,
    MailModule,
    DeckModule,
    CardModule,
    CategoriesModule,
    FsrsModule,
    CronModule,
    UploadModule,
    ProfileModule,
    StatsModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
