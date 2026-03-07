import { TFSRSCardWithCard } from '@app/@types';
import { safeAllSettled } from '@app/common/utils';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Deck } from '@prisma/client';
import { PrismaService } from '@prisma/prisma.service';
import { UpdateFSRSCardsParamsDto, UpdateParamsDto } from './dto';

@Injectable()
export class FsrsService {
  private readonly logger = new Logger(FsrsService.name);

  constructor(private readonly prismaService: PrismaService) {}

  public async getGameParams(deckId: string, userId: string) {
    this.logger.log(`Fetching game params for deck: ${deckId} user: ${userId}`);
    const deck = await this.prismaService.deck.findFirst({
      where: {
        id: deckId,
      },
      select: {
        deckCategoryId: true,
        deckSession: {
          select: {
            cardsPerSession: true,
            isShortTerm: true,
          },
        },
        userId: true,
      },
    });

    await this.isUserDeck(deck, userId);

    const weights = await this.prismaService.fSRSWeights.findFirst({
      where: {
        categoryId: deck.deckCategoryId,
      },
      select: {
        w: true,
      },
    });

    return {
      ...weights,
      ...deck.deckSession,
    };
    //cardService
  }

  public async getGameCards(deckId: string, userId: string) {
    this.logger.log(`Fetching game cards for deck: ${deckId} user: ${userId}`);
    const deck = await this.prismaService.deck.findFirst({
      where: {
        id: deckId,
      },
      select: {
        deckSession: {
          select: {
            cardsPerSession: true,
            isShortTerm: true,
          },
        },
        userId: true,
        cardCount: true,
      },
    });

    await this.isUserDeck(deck, userId);
    const now = new Date();

    let cards: TFSRSCardWithCard[];

    if (deck.deckSession.isShortTerm) {
      cards = await this.prismaService.fSRSCard.findMany({
        where: {
          card: {
            deckId,
          },
          due: {
            lte: now,
          },
        },
        orderBy: [{ difficulty: 'desc' }, { stability: 'asc' }, { due: 'asc' }],
        take: deck.deckSession.cardsPerSession,
        include: {
          card: true,
        },
      });
    } else {
      cards = await this.prismaService.fSRSCard.findMany({
        where: {
          card: {
            deckId,
          },
        },
        orderBy: [{ difficulty: 'desc' }, { stability: 'asc' }, { due: 'asc' }],
        take: deck.deckSession.cardsPerSession,
        include: {
          card: true,
        },
      });
    }
    this.logger.log(`Found ${cards.length} cards for game session`);

    const formattedCards = cards.map(
      ({
        card: {
          plainAnswer,
          plainQuestion,
          createdAt,
          updatedAt,
          ...cardSpread
        },
        cardId,

        ...val
      }) => ({
        ...cardSpread,
        fsrsCard: { ...val },
      }),
    );

    return formattedCards;
  }

  public async updateFSRSCardsParams(dto: UpdateParamsDto, userId: string) {
    this.logger.log(`Updating FSRS params for deck: ${dto.deckId}`);
    this.logger.debug(`Session time: ${dto.sessionTimeMs}ms`);

    const deck = await this.prismaService.deck.findFirst({
      where: {
        id: dto.deckId,
      },
      select: {
        id: true,
        userId: true,
      },
    });
    await this.isUserDeck(deck, userId);

    const cardIds = dto.cards.map((c) => c.cardId);

    const validCardsCount = await this.prismaService.card.count({
      where: {
        id: { in: cardIds },
        deckId: dto.deckId,
      },
    });

    if (validCardsCount !== cardIds.length) {
      this.logger.warn(
        `Update failed: Some cards do not belong to deck ${dto.deckId}`,
      );
      throw new ForbiddenException('Some cards not from this deck');
    }

    await this.updateValues(dto.cards);
    //Event-driven action
    const masteredCount = await this.prismaService.fSRSCard.count({
      where: {
        card: { deckId: dto.deckId },
        state: 3,
        stability: { gte: 21 },
      },
    });

    await this.prismaService.deckSession.update({
      where: {
        deckId: dto.deckId,
      },
      data: {
        totalTime: {
          increment: dto.sessionTimeMs,
        },
        masteredCardsCount: masteredCount,
      },
    });
    this.logger.log(`FSRS params updated successfully`);
    return;
  }

  private async isUserDeck(deck: Partial<Deck>, userId: string) {
    if (deck.userId !== userId) {
      this.logger.warn(
        `Access denied: User ${userId} tried to access deck belonging to ${deck.userId}`,
      );
      //TODO: in future with accessRights gonna be solved
      throw new BadRequestException('');
    }
  }

  private async updateValues(dto: UpdateFSRSCardsParamsDto[]) {
    this.logger.log(`Updating values for ${dto.length} cards`);
    const updatePromises = dto.map(({ cardId, card }) =>
      this.prismaService.fSRSCard.update({
        where: { cardId: cardId },
        data: { ...card },
      }),
    );

    const logPromises = dto.map(({ card, log }) =>
      this.prismaService.fSRSCardLog.create({
        data: {
          fsrsCardId: card.id,
          ...log,
        },
      }),
    );

    await safeAllSettled(
      [...updatePromises, ...logPromises] as any,
      this.logger,
    );
  }
}
