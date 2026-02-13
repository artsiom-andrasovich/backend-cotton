import { TDeckWithSessionAndCategory } from '@app/@types';
import { convertSecondsToReadableFormat } from '@app/common/utils';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@prisma/prisma.service';
import { format, formatDistanceToNow } from 'date-fns';
import { DeckDto, UpdateDeckDto } from './dto';

@Injectable()
export class DeckService {
  private readonly logger = new Logger(DeckService.name);

  constructor(private readonly prismaService: PrismaService) {}

  public async createDeck(userId: string, dto: DeckDto) {
    this.logger.log(`Creating deck: ${dto.name} for user: ${userId}`);
    const category = await this.prismaService.deckCategory.upsert({
      where: {
        userId_name: {
          name: dto.category.name,
          userId,
        },
      },
      create: {
        userId,
        name: dto.category.name,
        color: dto.category.color,
        icon: dto.category.icon,
      },
      update: {
        name: dto.category.name,
        color: dto.category.color,
        icon: dto.category.icon,
      },
    });
    const deck = await this.prismaService.deck.create({
      data: {
        name: dto.name,
        description: dto.description,
        userId,
        deckCategoryId: category.id,
        deckSession: { create: {} },
      },
      include: {
        deckCategory: {
          select: {
            name: true,
            color: true,
            icon: true,
          },
        },
        deckSession: {
          select: {
            mastery: true,
            totalTime: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });
    if (!deck) {
      this.logger.error(`Failed to create deck: ${dto.name}`);
      throw new BadRequestException('Something went wrong');
    }

    this.logger.log(`Deck created successfully: ${deck.id}`);
    return deck.id;
  }

  public async getDeckById(userId: string, deckId: string) {
    this.logger.log(`Fetching deck: ${deckId} for user: ${userId}`);
    const deck = await this.prismaService.deck.findFirst({
      where: {
        userId,
        id: deckId,
      },
      include: {
        deckCategory: {
          select: { id: true, name: true, color: true, icon: true },
        },
        deckSession: {
          select: {
            mastery: true,
            totalTime: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!deck) {
      this.logger.warn(`Deck not found: ${deckId} for user: ${userId}`);
      throw new BadRequestException("The deck doesn't exist");
    }
    const res = {
      ...this.deckRes(deck),
      createdAt: format(deck.createdAt, 'dd.MM.yyyy'),
    };
    return res;
  }

  public deckRes(deck: TDeckWithSessionAndCategory) {
    const { id, name, description, cardCount } = deck;
    const { mastery, totalTime, updatedAt } = deck.deckSession;

    return {
      id,
      name,
      description,
      cardCount,
      category: {
        name: deck.deckCategory.name,
        color: deck.deckCategory.color,
        icon: deck.deckCategory.icon,
      },
      mastery,
      totalTime: convertSecondsToReadableFormat(totalTime),
      lastStudied: this.lastStudied(updatedAt, totalTime),
    };
  }

  private lastStudied(updatedAt: Date, totalTime: number) {
    if (!totalTime) return 'Time to start learning!';
    return `${formatDistanceToNow(updatedAt, {
      addSuffix: true,
    })}`;
  }

  public async updateDeck(dto: UpdateDeckDto, userId: string) {
    this.logger.log(`Updating deck: ${dto.deckId} for user: ${userId}`);
    const deck = await this.prismaService.deck
      .update({
        where: {
          userId,
          id: dto.deckId,
        },
        data: {
          name: dto.name,
          description: dto.description,
        },
        include: {
          deckCategory: {
            select: {
              name: true,
              color: true,
              icon: true,
            },
          },
          deckSession: {
            select: {
              mastery: true,
              totalTime: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
      })
      .catch((err) => {
        this.logger.warn(
          `Update failed: Deck not found or access denied: ${dto.deckId}`,
        );
        throw new BadRequestException('No such user with this deck');
      });

    if (!deck) {
      this.logger.warn(
        `Update failed: Deck not found after update attempt: ${dto.deckId}`,
      );
      throw new BadRequestException('No such user with this deck');
    }
    if (deck.deckCategory !== dto.category) {
      const newCategory = await this.prismaService.deckCategory.upsert({
        where: {
          userId_name: {
            name: dto.category.name,
            userId,
          },
        },
        create: {
          name: dto.category.name,
          color: dto.category.color,
          icon: dto.category.icon,
          userId,
        },
        update: {
          name: dto.category.name,
          color: dto.category.color,
          icon: dto.category.icon,
        },
      });

      await this.prismaService.deck.update({
        where: { id: deck.id },
        data: { deckCategoryId: newCategory.id },
      });
      deck.deckCategory = dto.category;
    }
    this.logger.log(`Deck updated successfully: ${deck.id}`);
    return this.deckRes(deck);
  }

  public async deleteDeck(deckId: string, userId: string) {
    this.logger.log(`Deleting deck: ${deckId} for user: ${userId}`);
    const deck = await this.prismaService.deck
      .delete({
        where: {
          userId,
          id: deckId,
        },
      })
      .catch((err) => {
        this.logger.warn(
          `Delete failed: Deck not found or access denied: ${deckId}`,
        );
        throw new BadRequestException('No such user with this deck');
      });
    if (!deck) {
      this.logger.warn(
        `Delete failed: Deck not found after delete attempt: ${deckId}`,
      );
      throw new BadRequestException('No such user with this deck');
    }
    this.logger.log(`Deck deleted successfully: ${deckId}`);
    return;
  }
}
