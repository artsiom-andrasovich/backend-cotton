import { UserWithResetPasswordCode } from '@app/@types';
import { Public, UserAgent } from '@app/common/decorators';
import { ThrottlerGuard } from '@app/common/guards';
import { maskEmail } from '@app/common/utils';
import { validateIsUsernameOrEmail } from '@app/common/validators';
import { JwtPayload } from '@auth/interfaces';
import { MailService } from '@mail/mail.service';
import {
  BadRequestException,
  Body,
  ClassSerializerInterceptor,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { plainToClass } from 'class-transformer';
import { Response } from 'express';
import { CurrentUser } from './../../libs/common/src/decorators/current-user.decorator';
import {
  IsValidResetPasswordCode as IsValidCodeDto,
  ChangePasswordByCodeDto as ResetPasswordByCodeDto,
  ChangePasswordDto as UpdatePasswordDto,
  ChangeUserDataDto as UpdateUserDto,
} from './dto';
import { ResetPasswordService } from './reset-password.service';
import { UserResponse } from './responses';
import { UserService } from './user.service';

@UsePipes(new ValidationPipe())
@Controller('user')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly resetPasswordService: ResetPasswordService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  @Delete(':id')
  public async deleteUser(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.userService.delete(id, user);
  }

  // NOTE: IsActivatedGuard removed as per user instruction "doesnt use it"
  @UseInterceptors(ClassSerializerInterceptor)
  @UsePipes(new ValidationPipe())
  @Patch('change-user-data')
  public async changeUserData(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateUserDto,
  ) {
    const _user = await this.userService.changeUserData(dto, userId);
    return plainToClass(UserResponse, _user);
  }

  @UsePipes(new ValidationPipe())
  @Patch('change-password')
  public async changePassword(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdatePasswordDto,
    @UserAgent() agent: string,
    @Res() res: Response,
  ) {
    await this.resetPasswordService.changePassword(dto, user.id, agent);
    return res.status(201).json('password successfully changed');
  }
  //all requests below are public

  @Public()
  @Get(':ieu')
  public async findOneUser(@Param('ieu') ieu: string) {
    return this.userService.findOne(ieu);
  }

  @Public()
  @Get('get-reset-password-code/:param')
  public async getResetPasswordCode(
    @Param('param') usernameOrEmail: string,
    @Res() res: Response,
  ) {
    validateIsUsernameOrEmail(usernameOrEmail);
    const user = await this.resetPasswordService.generateResetPasswordCode(
      usernameOrEmail,
      res,
    );
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    //@ts-expect-error
    //FIXME: typescript
    if (!user || !user?.id) return;

    const _user = user as UserWithResetPasswordCode;
    // const url = `${this.configService.get('CLIENT_URL')}/reset-password-by-code?userId=${_user.id}&code=${_user.resetPasswordCode.code}`;
    // await this.mailService.sendResetPasswordLink(_user, url);
    await this.mailService.sendResetPasswordCodeEmail(
      _user.email,
      _user.resetPasswordCode.code,
    );

    if (usernameOrEmail === _user.email)
      res.status(201).json({ usernameOrEmail, email: _user.email });
    else
      res.status(201).json({ usernameOrEmail, email: maskEmail(_user.email) });
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60 * 2000 } })
  @Post('reset-password-by-code/is-valid')
  public async accessToChangePasswordByCode(
    @Body() dto: IsValidCodeDto,
    @Res() res: Response,
  ) {
    if (String(dto.code).length !== 6)
      throw new BadRequestException('Code must include 6 digits');
    validateIsUsernameOrEmail(dto.usernameOrEmail);

    const isValid = await this.resetPasswordService.isValid(
      { code: String(dto.code), usernameOrEmail: dto.usernameOrEmail },
      res,
    );
    res.status(201).json(isValid);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60 * 3000 } })
  @Patch('reset-password-by-code')
  public async changePasswordByCode(
    @Body() dto: ResetPasswordByCodeDto,
    @Res() res: Response,
  ) {
    await this.resetPasswordService.changePasswordByCode(dto, res);
    res.status(201).json({});
  }
}
