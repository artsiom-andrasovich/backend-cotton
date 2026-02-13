import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Card } from '@prisma/client';
import { PrismaService } from '@prisma/prisma.service';
import { decode } from 'html-entities';
import { CreateCardDto, DeleteCardsDto, UpdateCardDto } from './dto';
import { PrismaCardPaginationService } from './prisma-card.pagination.service';
import { cardWithoutPlain } from './responses';
import { TCardSearchParams } from './types';

@Injectable()
export class CardService {
  private readonly logger = new Logger(CardService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly prismaCardPaginationService: PrismaCardPaginationService,
  ) {}

  public async createCard(dto: CreateCardDto, userId: string) {
    this.logger.log(
      `Creating new card for deck: ${dto.deckId} by user: ${userId}`,
    );
    const { plainAnswer, plainQuestion } = this.plainText({
      answer: dto.answer,
      question: dto.question,
    });

    await this.isUserDeck(userId, dto.deckId);
    const [card] = await Promise.all([
      this.prismaService.card.create({
        data: {
          plainAnswer,
          plainQuestion,
          answer: dto.answer,
          question: dto.question,
          deckId: dto.deckId,
          fsrsCard: { create: { ...dto.fsrsCard } },
        },
      }),
      this.prismaService.deck.update({
        where: { id: dto.deckId },
        data: {
          cardCount: { increment: 1 },
        },
      }),
    ]);
    this.logger.log(`Card created successfully: ${card.id}`);
    return cardWithoutPlain(card);
  }

  public async getCardById(deckId: string, cardId: string, userId: string) {
    this.logger.log(`Fetching card: ${cardId} from deck: ${deckId}`);
    await this.isUserDeck(userId, deckId);
    const card = await this.prismaService.card.findFirst({
      where: {
        deckId,
        id: cardId,
      },
    });
    if (!card) {
      this.logger.warn(`Card not found: ${cardId}`);
      throw new BadRequestException("This card doesn't exits");
    }
    return cardWithoutPlain(card);
  }

  public async updateCard(dto: UpdateCardDto, userId: string) {
    this.logger.log(`Updating card: ${dto.cardId}`);
    await this.isUserDeck(userId, dto.deckId);
    const { plainAnswer, plainQuestion } = this.plainText({
      answer: dto.answer,
      question: dto.question,
    });
    const updatedCard = await this.prismaService.card.update({
      where: {
        id: dto.cardId,
      },
      data: {
        plainQuestion,
        plainAnswer,
        answer: dto.answer,
        question: dto.question,
      },
    });
    if (!updatedCard) {
      this.logger.warn(`Update failed: Card not found: ${dto.cardId}`);
      throw new BadRequestException('No such card with this id');
    }
    this.logger.log(`Card updated successfully: ${updatedCard.id}`);
    return cardWithoutPlain(updatedCard);
  }

  public async deleteCardsById(dto: DeleteCardsDto, userId: string) {
    this.logger.log(
      `Deleting ${dto.deleteCardsId.length} cards from deck: ${dto.deckId}`,
    );
    await this.isUserDeck(userId, dto.deckId);

    await Promise.all([
      this.prismaService.card.deleteMany({
        where: {
          id: { in: dto.deleteCardsId },
        },
      }),
      this.prismaService.deck.update({
        where: { id: dto.deckId },
        data: {
          cardCount: { decrement: dto.deleteCardsId.length },
        },
      }),
    ]);
    this.logger.log(`Cards deleted successfully`);
  }

  private async isUserDeck(userId: string, deckId: string) {
    const isUserDeck = await this.prismaService.deck.findFirst({
      where: {
        userId,
        id: deckId,
      },
    });
    if (!isUserDeck) {
      this.logger.warn(
        `Deck access denied or not found: ${deckId} for user ${userId}`,
      );
      throw new BadRequestException("The deck doesn't exist");
    }
  }

  private plainText({ answer, question }: Partial<Card>) {
    let plainAnswer = answer.replace(/<[^>]+>/g, '');
    let plainQuestion = question.replace(/<[^>]+>/g, '');

    plainAnswer = plainAnswer.replace(/\s+/g, ' ').trim();
    plainQuestion = plainQuestion.replace(/\s+/g, ' ').trim();

    return {
      plainAnswer: decode(plainAnswer),
      plainQuestion: decode(plainQuestion),
    };
  }

  public async listCards(
    userId: string,
    deckId: string,
    params: TCardSearchParams,
  ) {
    this.logger.log(
      `Listing cards for deck: ${deckId} (cursor: ${params.cursor || 'start'})`,
    );
    await this.isUserDeck(userId, deckId);

    return this.prismaCardPaginationService.getCardsByCursor(deckId, params);
  }
}
