import { Type } from 'class-transformer';
import { IsDefined, IsUUID, ValidateNested } from 'class-validator';
import { FSRSCardLog } from './fsrs-card-log.dto';
import { FSRSCardDto } from './fsrs-card.dto';

export class UpdateFSRSCardsParamsDto {
  @IsUUID()
  cardId: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => FSRSCardDto)
  card: FSRSCardDto;

  @IsDefined()
  @ValidateNested()
  @Type(() => FSRSCardLog)
  log: FSRSCardLog;
}
