import { IsPasswordsMatchingConstraint } from '@app/common/decorators';
import {
  IsOptional,
  IsString,
  IsStrongPassword,
  Length,
  MaxLength,
  MinLength,
  Validate,
} from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @IsOptional()
  @Length(0, 50)
  oldPassword: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @MaxLength(50, { message: 'Password cannot be longer than 50 characters' })
  @IsStrongPassword()
  password: string;

  @MinLength(8, {
    message: 'Password repeat must be at least 8 characters long',
  })
  @IsString()
  @Validate(IsPasswordsMatchingConstraint, {
    message: 'Passwords do not match',
  })
  passwordRepeat: string;
}
