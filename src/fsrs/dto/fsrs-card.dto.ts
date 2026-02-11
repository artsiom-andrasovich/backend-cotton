import { Transform } from 'class-transformer';
import { IsDate, IsNumber, IsUUID } from 'class-validator';

export class FSRSCardDto {
  @IsUUID()
  id: string;

  @Transform(({ value }) => new Date(value))
  @IsDate()
  due: Date;

  @IsNumber()
  stability: number;

  @IsNumber()
  difficulty: number;

  @IsNumber()
  elapsed_days: number;

  @IsNumber()
  scheduled_days: number;

  @IsNumber()
  learning_steps: number;

  @IsNumber()
  reps: number;

  @IsNumber()
  lapses: number;

  @IsNumber()
  state: number;

  @Transform(({ value }) => new Date(value))
  @IsDate()
  last_review: Date;
}
