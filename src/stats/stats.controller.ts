import { CurrentUser } from '@app/common/decorators';
import { Controller, Get } from '@nestjs/common';
import { StatsService } from './stats.service';

@Controller('stats')
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get('dashboard')
  public async getDashboardStats(@CurrentUser('id') userId: string) {
    return this.statsService.getDashboardStats(userId);
  }
  @Get('profile')
  public async getProfileStats(@CurrentUser('id') userId: string) {
    return this.statsService.getProfileStats(userId);
  }
}
