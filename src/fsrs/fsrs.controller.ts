import { CurrentUser } from '@app/common/decorators';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';
import { UpdateParamsDto } from './dto';
import { FsrsService } from './fsrs.service';

@Controller('fsrs')
export class FsrsController {
  constructor(private readonly fsrsService: FsrsService) {}

  @Get('game-params/:deckId')
  public async getGameParams(
    @CurrentUser('id') userId: string,
    @Param('deckId', ParseUUIDPipe) deckId: string,
  ) {
    return this.fsrsService.getGameParams(deckId, userId);
  }

  @Get('game-cards/:deckId')
  public async getGameCards(
    @Param('deckId') deckId: string,
    @CurrentUser('id') userId: string,
  ) { 
    return this.fsrsService.getGameCards(deckId, userId);
  }

  @Patch('update-fsrs-cards-params')
  public async updateFSRSCardsParams(
    @Body() dto: UpdateParamsDto,
    @CurrentUser('id') userId: string,
  ) {
    console.log('ok');
    return this.fsrsService.updateFSRSCardsParams(dto, userId);
  }
}
