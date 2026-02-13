import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '@prisma/prisma.service';
import { WeightsService } from './weights.service';

@Injectable()
export class WeightsScheduler {
  private readonly logger = new Logger(WeightsScheduler.name);

  constructor(
    private weightsService: WeightsService,
    private prismaService: PrismaService,
  ) {}

  // FIX: If it will be realized for admin should be added queue
  @Cron(CronExpression.EVERY_WEEKEND)
  async handleWeeklyOptimization() {
    this.logger.log('Starting optimization of weights');

    const categories = await this.prismaService.deckCategory.findMany({
      select: { id: true, name: true },
    });

    for (const category of categories) {
      this.logger.log(`Category processing ${category.name}`);
      await this.weightsService.trainCategory(category.id);
    }

    this.logger.log('Optimization FSRS is ended ---');
  }
}
