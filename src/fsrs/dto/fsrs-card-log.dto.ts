import { Transform } from 'class-transformer';
import { IsDate, IsEnum, IsNumber } from 'class-validator';
import { Rating, State } from 'ts-fsrs';
export class FSRSCardLog {
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
  last_elapsed_days: number;

  @IsNumber()
  scheduled_days: number;

  @IsNumber()
  learning_steps: number;

  @Transform(({ value }) => new Date(value))
  @IsDate()
  review: Date;

  @IsEnum(Rating)
  rating: Rating;

  @IsEnum(State)
  state: State;
}
