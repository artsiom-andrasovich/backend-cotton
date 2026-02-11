import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '@prisma/prisma.service';

@Injectable()
export class MasteryService {
	private readonly logger = new Logger(MasteryService.name);
	constructor(private readonly prismaService:PrismaService) {}
	
	@Cron(CronExpression.EVERY_DAY_AT_1AM)
	public async updateDeckMastery(){
		this.logger.log('Updating all decks mastery');

		await this.prismaService.$executeRawUnsafe(`
			UPDATE deck_session ds
SET mastery = sub.mastery
FROM (
    SELECT
        c.deck_id,
        ROUND(
            AVG(
                LEAST(1, GREATEST(0,
                    CASE WHEN f.elapsed_days = 0 THEN 1
                         ELSE EXP(-f.elapsed_days / GREATEST(0.1, f.stability)) END
                    *
                    CASE WHEN f.elapsed_days <= f.scheduled_days THEN 1
                         ELSE EXP(-(f.elapsed_days::float / GREATEST(1, f.scheduled_days) - 1)) END
                    *
                    (1 - LEAST(1, f.difficulty / 10) * 0.2)
                    *
                    (0.5 + 0.5 * (1 - EXP(-f.reps / 30.0)))
                    *
                    (0.6 + 0.4 * (LN(f.stability + 1) / LN(366)))
                    *
                    (1 - LEAST(0.5, f.lapses::float / GREATEST(1, f.reps)))
                ))
            ) * 100
        )::int AS mastery
    FROM card c
    JOIN "FSRS_card" f ON f.card_id = c.id
    GROUP BY c.deck_id
) sub
WHERE ds.deck_id = sub.deck_id;
			`)
			this.logger.log('Updated all decks mastery');
	}
}
