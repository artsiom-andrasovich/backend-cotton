import {
  convertToSecondsUtil,
  generateExpTime,
  generateSixDigitCode,
  hashPassword,
} from '@app/common/utils';
import { JwtPayload } from '@auth/interfaces';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { User } from '@prisma/client';
import { PrismaService } from '@prisma/prisma.service';
import { Cache } from 'cache-manager';
import { ChangeUserDataDto } from './dto';

type resetCacheArgs = string[] | string;

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly prismaService: PrismaService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly configService: ConfigService,
  ) {}

  public async save(user: Partial<User>): Promise<User> {
    this.logger.log(
      `Saving user: ${user.email} (provider: ${user.provider || 'email'})`,
    );
    if (user.isActivated) {
      const newUser = await this.prismaService.user.create({
        data: {
          email: user.email.toLowerCase(),
          name: user.name,
          password: null,
          provider: user?.provider,
          isActivated: user.isActivated,
        },
      });
      this.logger.log(`User created successfully: ${newUser.id}`);
      return newUser;
    }
    const newUser = await this.prismaService.user.create({
      data: {
        email: user.email.toLowerCase(),
        name: user.name,
        password: hashPassword(user.password),
        activationCode: {
          create: {
            code: generateSixDigitCode(),
            expiresAt: generateExpTime('1d'),
          },
        },
      },
    });
    this.logger.log(
      `User created successfully (pending activation): ${newUser.id}`,
    );
    return newUser;
  }

  public async findOne(idOrEmail: string, isReset = false) {
    // Determine context for logging (don't log sensitive searches if any)
    // Here idOrEmail is likely a User ID or Email, which is fine to log contextually
    if (isReset) {
      this.logger.debug(`Resetting cache before findOne for: ${idOrEmail}`);
      await this.resetCache(idOrEmail);
    }

    const cachedUser = await this.cacheManager.get<User>(idOrEmail);
    if (cachedUser) {
      // this.logger.debug(`Cache hit for user: ${idOrEmail}`); // Optional: Too spammy?
      return cachedUser;
    }

    this.logger.debug(`Cache miss for user: ${idOrEmail}, fetching from DB`);
    const user = await this.prismaService.user.findFirst({
      where: { OR: [{ id: idOrEmail }, { email: idOrEmail.toLowerCase() }] },
    });
    if (!user) {
      this.logger.warn(`User not found: ${idOrEmail}`);
      return null;
    }
    await this.cacheManager.set(
      idOrEmail,
      user,
      convertToSecondsUtil(this.configService.get('JWT_EXP')),
    );
    return user;
  }

  //other

  public async changeUserData(
    dto: ChangeUserDataDto,
    userId: string,
  ): Promise<User> {
    this.logger.log(`Updating user data: ${userId}`);
    const user = await this.prismaService.user.update({
      where: {
        id: userId,
      },
      data: {
        ...dto,
      },
    });
    await this.resetCache([userId, user.email]);
    this.logger.log(`User data updated and cache reset for: ${userId}`);
    return user;
  }

  public async delete(id: string, user: JwtPayload) {
    this.logger.log(`Attempting to delete user: ${id} by user: ${user.id}`);
    if (id !== user.id) {
      this.logger.warn(
        `Delete failed: Permission denied for user ${user.id} targeting ${id}`,
      );
      throw new ForbiddenException(
        'You do not have sufficient permissions to delete this user',
      );
    }
    const _user = await this.prismaService.user.delete({ where: { id } });
    await this.resetCache([_user.email, id]);
    this.logger.log(`User deleted successfully: ${id}`);
    return _user.id;
  }

  private async resetCache(args: resetCacheArgs) {
    this.logger.debug(`Resetting cache keys: ${JSON.stringify(args)}`);
    if (typeof args === 'string') await this.cacheManager.del(args);
    else {
      await Promise.all(args.map((key) => this.cacheManager.del(key)));
    }
  }
}
