import { JwtAuthGuard } from '@auth/guards/jwt-auth.guard';
import { CronModule } from '@cron/cron.module';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module';
import { CardModule } from './card/card.module';
import { CategoriesModule } from './categories/categories.module';
import { DeckModule } from './deck/deck.module';
import { FsrsModule } from './fsrs/fsrs.module';
import { MailModule } from './mail/mail.module';
import { PrismaModule } from './prisma/prisma.module';
import { UserModule } from './user/user.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    UserModule,
    MailModule,
    DeckModule,
    CardModule,
    CategoriesModule,
    FsrsModule,
    CronModule,
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
