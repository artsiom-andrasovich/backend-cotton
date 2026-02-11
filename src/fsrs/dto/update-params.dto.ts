import { Type } from 'class-transformer';
import { IsDefined, IsNumber, IsUUID, ValidateNested } from 'class-validator';
import { UpdateFSRSCardsParamsDto } from './update-fsrs-cards-params.dto';

export class UpdateParamsDto {
  @IsUUID()
  deckId: string;

  @IsDefined()
  @ValidateNested({ each: true })
  @Type(() => UpdateFSRSCardsParamsDto)
  cards: UpdateFSRSCardsParamsDto[];

  @IsNumber()
  sessionTimeMs: number;
}
