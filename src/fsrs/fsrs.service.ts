import { TFSRSCardWithCard } from '@app/@types';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Deck } from '@prisma/client';
import { PrismaService } from '@prisma/prisma.service';
import { UpdateFSRSCardsParamsDto, UpdateParamsDto } from './dto';

@Injectable()
export class FsrsService {
  constructor(private readonly prismaService: PrismaService) {}

  public async getGameParams(deckId: string, userId: string) {
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
    console.log(cards);

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
    console.log('sessionTimeMs');
    console.log(dto.sessionTimeMs);
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
    console.log('ok');
    const cardIds = dto.cards.map((c) => c.cardId);

    const validCardsCount = await this.prismaService.card.count({
      where: {
        id: { in: cardIds },
        deckId: dto.deckId,
      },
    });

    if (validCardsCount !== cardIds.length)
      throw new ForbiddenException('Some cards not from this deck');

    await this.updateValues(dto.cards);
    await this.prismaService.deckSession.update({
      where: {
        deckId: dto.deckId,
      },
      data: {
        totalTime: {
          increment: dto.sessionTimeMs,
        },
      },
    });
    return;
  }

  private async isUserDeck(deck: Partial<Deck>, userId: string) {
    if (deck.userId !== userId) {
      //TODO: in future with accessRights gonna be solved
      throw new BadRequestException('');
    }
  }

  private async updateValues(dto: UpdateFSRSCardsParamsDto[]) {
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

    await Promise.all([...updatePromises, ...logPromises]);
  }
}
