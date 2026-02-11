import { Module } from '@nestjs/common';
import { MasteryService } from './mastery/mastery.service';

@Module({
  providers: [MasteryService]
})
export class CronModule {}
