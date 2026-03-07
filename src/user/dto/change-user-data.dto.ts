import { regexPatterns } from '@app/common/constants';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ChangeUserDataDto {
  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'Username must be at least 3 characters long' })
  @Matches(regexPatterns.username, {
    message:
      'The string must contain only Latin letters and up to 5 underscores',
  })
  @MaxLength(20, { message: 'Username cannot be longer than 20 characters' })
  username?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}
