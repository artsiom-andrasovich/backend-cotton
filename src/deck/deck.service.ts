import { TDeckWithSessionAndCategory } from '@app/@types';
import { convertSecondsToReadableFormat } from '@app/common/utils';
import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@prisma/prisma.service';
import { format, formatDistanceToNow } from 'date-fns';
import { DeckDto, UpdateDeckDto } from './dto';

@Injectable()
export class DeckService {
  constructor(private readonly prismaService: PrismaService) {}

  public async createDeck(userId: string, dto: DeckDto) {
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
    if (!deck) throw new BadRequestException('Something went wrong');

    return deck.id;
  }

  public async getDeckById(userId: string, deckId: string) {
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

    if (!deck) throw new BadRequestException("The deck doesn't exist");
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
        throw new BadRequestException('No such user with this deck');
      });

    if (!deck) throw new BadRequestException('No such user with this deck');
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
    return this.deckRes(deck);
  }

  public async deleteDeck(deckId: string, userId: string) {
    const deck = await this.prismaService.deck
      .delete({
        where: {
          userId,
          id: deckId,
        },
      })
      .catch((err) => {
        throw new BadRequestException('No such user with this deck');
      });
    if (!deck) throw new BadRequestException('No such user with this deck');
    return;
  }
}
