import { generateExpTime, generateSixDigitCode } from '@app/common/utils';
import { MailService } from '@mail/mail.service';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Provider, Token, User } from '@prisma/client';
import { PrismaService } from '@prisma/prisma.service';
import { UserService } from '@user/user.service';
import { compareSync } from 'bcrypt';
import { add, isBefore } from 'date-fns';
import { Response } from 'express';
import { v4 } from 'uuid';
import { ActivateAccountDto, SignInDto, SignUpDto } from './dto';
import { Tokens } from './interfaces';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
  ) {}

  public async singUp(dto: SignUpDto) {
    this.logger.log(`Attempting to sign up user with email: ${dto.email}`);
    const user = await this.prismaService.user.findFirst({
      where: { email: dto.email },
    });

    if (user) {
      this.logger.warn(
        `Sign up failed: User with email ${dto.email} already exists`,
      );
      throw new BadRequestException('Cannot sign up user with this data');
    }
    const newUser = await this.userService.save(dto, {});
    const activationCode = await this.prismaService.activationCode.findUnique({
      where: { userId: newUser.id },
    });
    if (activationCode) {
      await this.mailService.sendActivationMail(
        newUser.email,
        activationCode.code,
      );
    }
    this.logger.log(`User signed up successfully: ${newUser.id}`);
    return newUser;
  }

  public async signIn(dto: SignInDto, agent: string, res: Response) {
    this.logger.log(`Attempting to sign in user: ${dto.email}`);
    const user = await this.userService.findOne(dto.email);
    if (!user) {
      this.logger.warn(`Sign in failed: User not found for email ${dto.email}`);
      throw new UnauthorizedException('Invalid email or password');
    }
    if (user.provider && !user.password) {
      this.logger.warn(
        `Sign in failed: User ${dto.email} must use ${user.provider} provider`,
      );
      throw new BadRequestException(
        `Please use ${user.provider.toLowerCase()} to login`,
      );
    }

    if (!user.password || !compareSync(dto.password, user.password)) {
      this.logger.warn(`Sign in failed: Invalid password for ${dto.email}`);
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isActivated) {
      this.logger.warn(
        `Sign in failed: Account not activated for ${dto.email}`,
      );
      const activationCode = await this.prismaService.activationCode.findUnique(
        {
          where: { userId: user.id },
        },
      );

      if (activationCode) {
        await this.mailService.sendActivationMail(
          user.email,
          activationCode.code,
        );
      }
      throw new UnauthorizedException({ id: user.id, email: user.email });
    }

    this.logger.log(`User signed in successfully: ${user.id}`);
    return this.generateTokens(user, agent);
  }

  public async refreshTokens(
    refreshToken: string,
    agent: string,
  ): Promise<Tokens> {
    this.logger.log(`Attempting to refresh tokens`);
    const token = await this.prismaService.token.findUnique({
      where: { token: refreshToken },
    });
    if (!token) {
      this.logger.warn(`Refresh token not found`);
      throw new UnauthorizedException();
    }
    await this.prismaService.token
      .delete({ where: { token: refreshToken } })
      .catch((err) => {
        this.logger.error(`Failed to delete refresh token: ${err.message}`);
        throw new UnauthorizedException();
      });
    if (new Date(token.exp) < new Date()) {
      this.logger.warn(`Refresh token expired`);
      throw new UnauthorizedException();
    }
    const user = await this.userService.findOne(token.userId);
    this.logger.log(`Tokens refreshed successfully for user: ${user.id}`);
    return this.generateTokens(user, agent);
  }

  public async deleteRefreshToken(token: string) {
    this.logger.log(`Deleting refresh token`);
    return this.prismaService.token.deleteMany({ where: { token } });
  }

  public async getActivationCode(email: string) {
    this.logger.log(`Requesting activation code for: ${email}`);
    const user = await this.checkUserActivationCode(email);
    await this.mailService.sendActivationMail(email, user.activationCode.code);
    return { email, id: user.id };
  }

  public async activateAccount(dto: ActivateAccountDto) {
    this.logger.log(
      `Attempting to activate account for user ID: ${dto.userId}`,
    );
    const user = await this.checkUserActivationCode(dto.userId);
    if (!user.activationCode.code) await this.upsertUserActivationCode(user);
    if (user.activationCode.code !== Number(dto.code)) {
      this.logger.warn(
        `Activation failed: Invalid code for user ${dto.userId}`,
      );
      throw new BadRequestException('Invalid code');
    }

    await Promise.all([
      this.prismaService.user.update({
        where: { id: user.id },
        data: {
          isActivated: true,
        },
      }),
      this.prismaService.activationCode.delete({ where: { userId: user.id } }),
    ]);
    this.logger.log(`Account activated successfully for user: ${user.id}`);
  }

  private async upsertUserActivationCode(user: Partial<User>) {
    this.logger.log(`Upserting activation code for user: ${user.id}`);
    const { code } = await this.prismaService.activationCode
      .upsert({
        where: {
          userId: user.id,
        },
        create: {
          code: generateSixDigitCode(),
          userId: user.id,
          expiresAt: generateExpTime('1d'),
        },
        update: {
          code: generateSixDigitCode(),
          expiresAt: generateExpTime('1d'),
        },
      })
      .catch((error) => {
        this.logger.error(`Failed to upsert activation code: ${error.message}`);
        throw new InternalServerErrorException('Something went wrong');
      });
    await this.mailService.sendActivationMail(user.email, code);
    throw new BadRequestException(
      'Activation code has expired. Please check email and try again',
    );
  }

  private async checkUserActivationCode(emailOrId: string) {
    const user = await this.prismaService.user.findFirst({
      where: {
        OR: [{ email: emailOrId }, { id: emailOrId }],
      },
      select: {
        activationCode: true,
        id: true,
        email: true,
        isActivated: true,
      },
    });

    if (user?.isActivated) {
      this.logger.warn(
        `Check activation code failed: User ${emailOrId} already activated`,
      );
      throw new BadRequestException('You have already activated your account');
    }
    if (!user) {
      this.logger.warn(
        `Check activation code failed: User ${emailOrId} not found`,
      );
      throw new BadRequestException(
        'No such user or you have already activated your account',
      );
    }
    if (!isBefore(new Date(), user.activationCode.expiresAt))
      await this.upsertUserActivationCode(user);
    return user;
  }

  private async generateTokens(user: User, agent: string): Promise<Tokens> {
    const accessToken =
      'Bearer ' +
      this.jwtService.sign({
        id: user.id,
        name: user.name,
        isActivated: user.isActivated,
      });
    const refreshToken = await this.getRefreshToken(user.id, agent);
    return { accessToken, refreshToken };
  }

  private async getRefreshToken(userId: string, agent: string): Promise<Token> {
    const _token = await this.prismaService.token.findFirst({
      where: { userId, userAgent: agent },
    });
    const token = _token?.token ?? '';
    return this.prismaService.token.upsert({
      where: { token },
      update: {
        token: v4(),
        exp: add(new Date(), { months: 1 }),
      },
      create: {
        token: v4(),
        exp: add(new Date(), { months: 1 }),
        userId,
        userAgent: agent,
      },
    });
  }

  public async googleAuth(
    email: string,
    agent: string,
    email_verified: string,
    GoogleUser: any,
  ) {
    this.logger.log(`Attempting Google Auth for: ${email}`);
    const userExist = await this.userService.findOne(email);
    if (userExist) {
      this.logger.log(
        `Google Auth: User exists, generating tokens for ${userExist.id}`,
      );
      return this.generateTokens(userExist, agent);
    }
    //generate username
    //TODO:
    const { firstName, lastName, picture } = GoogleUser;
    const user = await this.userService.save(
      {
        email,
        provider: Provider.GOOGLE,
        isActivated: Boolean(email_verified),
      },
      {
        firstName,
        lastName,
        avatarPath: picture,
      },
    );

    if (!user) {
      this.logger.error(`Google Auth failed to create user for ${email}`);
      throw new HttpException(
        `Fail attempt to create user ${email}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    this.logger.log(`Google Auth: User created successfully ${user.id}`);
    return this.generateTokens(user, agent);
  }
}
